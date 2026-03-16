const express = require('express');
const router = express.Router();
const cloudLogsController = require('../controllers/cloudLogsController');

// Mounted at /api/cloud-logs
router.get('/config', cloudLogsController.getConfig);
router.get('/services', cloudLogsController.getServices);
router.get('/', cloudLogsController.getLogs);

module.exports = router;
