const emailService = require('../services/emailService.js');
const tenantService = require('../services/tenantService.js');
const tenantRepo = require('../repositories/tenantRepository.js');
const logger = require('../../../../core/utils/logger');

exports.getTenants = async function (req, res) {
  try {
    const schema = req.schema;
    const { startDate, endDate } = req.query;
    logger.info(`Fetching tenants for range: ${startDate} to ${endDate} (schema: ${schema})`);
    const data = await tenantService.getTenants(schema, startDate, endDate);
    res.json(data);
  } catch (err) {
    logger.error('Tenants error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

exports.getTenantCallLogs = async function (req, res) {
  try {
    const schema = req.schema;
    const { tenantId } = req.params;
    const limit = parseInt(req.query.limit || '100', 10);
    logger.info(`Fetching call logs for tenant ${tenantId} in schema ${schema}`);
    const data = await tenantRepo.findCallLogsByTenant(schema, tenantId, limit);
    res.json(data);
  } catch (err) {
    logger.error('Tenant call logs error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

exports.getTenantCampaignStats = async function (req, res) {
  try {
    const schema = req.schema;
    const { tenantId } = req.params;
    const stats = await tenantRepo.getCampaignStats(schema, tenantId);
    res.json(stats);
  } catch (err) {
    logger.error('Tenant campaign stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

exports.inviteTenant = async function (req, res) {

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await emailService.sendTenantInvitation(email);
    res.status(200).json({ message: 'Invitation sent successfully', ...result });
  } catch (err) {
    logger.error('Invite error:', err.message);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
}

exports.createTenant = async function (req, res) {
  try {
    const schema = req.schema;
    const data = req.body;
    logger.info(`Controller: creating tenant ${data.name} for schema ${schema}`);
    const result = await tenantService.createTenant(schema, data);
    res.status(201).json(result);
  } catch (err) {
    logger.error('Create tenant error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
