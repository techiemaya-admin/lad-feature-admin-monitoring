const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Route prefix: /api/dashboard
router.get('/stats', dashboardController.getStats);
router.get('/trends', dashboardController.getTrends);
router.get('/system-health', dashboardController.getSystemHealth);

module.exports = router;
