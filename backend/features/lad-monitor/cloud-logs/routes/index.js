const express = require('express');
const router = express.Router();
const cloudLogsController = require('../controllers/cloudLogsController');

// Route prefix: /api/cloud-logs
router.get('/', cloudLogsController.getLogs);

module.exports = router;
