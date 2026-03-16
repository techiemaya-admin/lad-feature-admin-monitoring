const express = require('express');
const router = express.Router();
const tenantController = require('../controllers/tenantController');

// The route prefix will likely be /api/tenants
router.get('/', tenantController.getTenants);
router.post('/', tenantController.createTenant);
router.get('/:tenantId/call-logs', tenantController.getTenantCallLogs);
router.get('/:tenantId/campaign-stats', tenantController.getTenantCampaignStats);
router.post('/invite', tenantController.inviteTenant);

module.exports = router;
