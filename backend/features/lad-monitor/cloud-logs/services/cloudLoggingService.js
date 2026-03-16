/**
 * cloudLoggingService.js
 * Fetches Cloud Run logs from Google Cloud Logging API.
 * Uses log-reader-key.json (service account) OR Application Default Credentials.
 * NEVER expose credentials to the frontend — backend only.
 */
const { Logging } = require('@google-cloud/logging');
const logger = require('../../../../core/utils/logger');
const path = require('path');
const fs = require('fs');

// __dirname is native in CJS — no import.meta workaround needed


// Look for key file in project root or env-specified path
const KEY_FILE_PATHS = [
    process.env.GCP_KEY_FILE,
    path.join(__dirname, '../../log-reader-key.json'),
    path.join(__dirname, '../../gcp-key.json'),
].filter(Boolean);

function createLoggingClient() {
    const keyFilename = KEY_FILE_PATHS.find(p => {
        try { return fs.existsSync(p); } catch { return false; }
    });

    const projectId = process.env.GCP_PROJECT_ID;
    const isMockProject = projectId === 'your-gcp-project-id';

    if (keyFilename) {
        logger.info(`Cloud Logging: using key file ${path.basename(keyFilename)}`);
        return new Logging({ keyFilename, projectId: isMockProject ? undefined : projectId });
    }

    if (projectId && !isMockProject) {
        logger.info('Cloud Logging: using Application Default Credentials');
        return new Logging({ projectId });
    }

    return null;
}

/**
 * @param {object} options
 * @param {number}  options.limit       - max entries (default 50)
 * @param {string}  options.severity    - 'DEFAULT'|'INFO'|'WARNING'|'ERROR'|'CRITICAL'
 * @param {string}  options.serviceName - Cloud Run service name filter
 * @param {string}  options.pageToken   - for pagination
 * @param {string}  options.startTime   - ISO date string
 * @param {string}  options.endTime     - ISO date string
 * @returns {Promise<{ entries: object[], nextPageToken?: string }>}
 */
exports.getCloudRunLogs = async function ({
    limit = 50,
    severity = null,
    serviceName = null,
    pageToken = null,
    startTime = null,
    endTime = null,
} = {}) {
    const client = createLoggingClient();

    if (!client) {
        logger.warn('Cloud Logging: no credentials configured — returning empty');
        return { entries: [], nextPageToken: null, error: 'GCP credentials not configured' };
    }

    // Build filter
    const filters = ['resource.type="cloud_run_revision"'];
    if (severity) filters.push(`severity>="${severity.toUpperCase()}"`);
    if (serviceName) filters.push(`resource.labels.service_name="${serviceName}"`);
    if (startTime) filters.push(`timestamp>="${startTime}"`);
    if (endTime) filters.push(`timestamp<="${endTime}"`);

    const filter = filters.join(' AND ');

    try {
        const options = {
            pageSize: Math.min(limit, 200),
            filter,
            orderBy: 'timestamp desc',
        };
        if (pageToken) options.pageToken = pageToken;

        const [entries, , nextBatch] = await client.getEntries(options);
        const nextPageToken = nextBatch?.pageToken || null;

        const normalized = entries.map(entry => {
            const meta = entry.metadata || {};
            const resource = meta.resource || {};
            const labels = resource.labels || {};
            const httpReq = meta.httpRequest || null;

            // Extract the actual log message
            let message = '';
            const data = entry.data;
            if (typeof data === 'string') {
                message = data;
            } else if (data && typeof data === 'object') {
                message = data.message || data.msg || data.text || JSON.stringify(data);
            }

            return {
                id: meta.insertId || `${Date.now()}-${Math.random()}`,
                timestamp: meta.timestamp ? new Date(meta.timestamp).toISOString() : null,
                severity: (meta.severity || 'DEFAULT').toUpperCase(),
                message,
                service: labels.service_name || '',
                revision: labels.revision_name || '',
                location: labels.location || '',
                httpMethod: httpReq?.requestMethod || null,
                httpUrl: httpReq?.requestUrl || null,
                httpStatus: httpReq?.status || null,
                latencyMs: httpReq?.latency
                    ? (typeof httpReq.latency === 'string'
                        ? parseFloat(httpReq.latency.replace('s', '')) * 1000
                        : (typeof httpReq.latency === 'object'
                            ? ((httpReq.latency.seconds || 0) * 1000 + (httpReq.latency.nanos || 0) / 1e6)
                            : parseFloat(httpReq.latency) * 1000))
                    : null,
                rawData: typeof data === 'object' ? data : null,
            };
        });

        logger.info(`Cloud Logging: fetched ${normalized.length} entries`);
        return { entries: normalized, nextPageToken };
    } catch (err) {
        logger.error('Cloud Logging fetch error:', err.message);
        return { entries: [], nextPageToken: null, error: err.message };
    }
}

/**
 * Get available Cloud Run services in the project.
 */
exports.getCloudRunServices = async function () {
    const client = createLoggingClient();
    if (!client) return [];
    try {
        const [entries] = await client.getEntries({
            pageSize: 200,
            filter: 'resource.type="cloud_run_revision"',
            orderBy: 'timestamp desc',
        });
        const services = new Set(
            entries.map(e => e.metadata?.resource?.labels?.service_name).filter(Boolean)
        );
        return [...services];
    } catch (err) {
        logger.error('Cloud Logging services fetch error:', err.message);
        return [];
    }
}
