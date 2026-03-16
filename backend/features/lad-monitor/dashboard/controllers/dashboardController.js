/**
 * Dashboard controller - validate input, call service, return response.
 */
const dashboardService = require('../services/dashboardService.js');
const logger = require('../../../../core/utils/logger');

exports.getStats = async function (req, res) {
  try {
    const schema = req.schema;
    const { startDate, endDate } = req.query;
    const data = await dashboardService.getStats(schema, startDate, endDate);
    res.json(data);
  } catch (err) {
    logger.error('Dashboard stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
