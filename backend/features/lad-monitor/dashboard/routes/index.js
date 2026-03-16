const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Mounted at /api/dashboard
router.get('/stats', dashboardController.getStats);

module.exports = router;
