/**
 * cloudLogsController.js
 * Exposes Cloud Run logs via REST API.
 * Backend only — never returns GCP credentials to client.
 */
const cloudLogging = require('../services/cloudLoggingService.js');
const logger = require('../../../../core/utils/logger');

/**
 * GET /api/cloud-logs
 * Query params:
 *   limit       (default 50)
 *   severity    (INFO, WARNING, ERROR, CRITICAL)
 *   service     (Cloud Run service name)
 *   pageToken   (for pagination)
 *   startTime   (ISO string)
 *   endTime     (ISO string)
 */
exports.getLogs = async function (req, res) {
    try {
        const {
            limit = '50',
            severity = null,
            service = null,
            pageToken = null,
            startTime = null,
            endTime = null,
        } = req.query;

        const result = await cloudLogging.getCloudRunLogs({
            limit: Math.min(parseInt(limit, 10) || 50, 200),
            severity,
            serviceName: service,
            pageToken,
            startTime,
            endTime,
        });

        res.json(result);
    } catch (err) {
        logger.error('Cloud Logs controller error:', err.message);
        res.status(500).json({ entries: [], error: err.message });
    }
}

/**
 * GET /api/cloud-logs/services
 * Returns list of Cloud Run service names seen in logs.
 */
exports.getServices = async function (req, res) {
    try {
        const services = await cloudLogging.getCloudRunServices();
        res.json({ services });
    } catch (err) {
        logger.error('Cloud Logs services controller error:', err.message);
        res.status(500).json({ services: [], error: err.message });
    }
}

/**
 * GET /api/cloud-logs/config
 * Returns whether GCP credentials are configured (safe — no secrets exposed).
 */
exports.getConfig = async function (req, res) {
    const projectId = process.env.GCP_PROJECT_ID;
    const isMockProject = projectId === 'your-gcp-project-id';
    const hasProjectId = !!projectId && !isMockProject;
    const hasKeyFile = !!process.env.GCP_KEY_FILE;
    res.json({
        configured: hasProjectId,
        projectId: hasProjectId ? projectId : null,
        authMethod: hasKeyFile ? 'service-account-key' : (hasProjectId ? 'adc' : 'none'),
    });
}
