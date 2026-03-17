const express = require('express');
const router = express.Router();
const voiceAgentController = require('../controllers/voiceAgentController');

// Voice Agent Routes
router.get('/settings/agents', voiceAgentController.getAllAgents);
router.get('/settings/agents/search', voiceAgentController.searchAgents);
router.get('/settings/agents/:agentId', voiceAgentController.getAgentById);
router.post('/settings/agents', voiceAgentController.createAgent);
router.put('/settings/agents/:agentId', voiceAgentController.updateAgent);
router.delete('/settings/agents/:agentId', voiceAgentController.deleteAgent);

// Voice Routes
router.get('/settings/voices', voiceAgentController.getAllVoices);
router.get('/settings/voices/search', voiceAgentController.searchVoices);
router.get('/settings/voices/provider/:provider', voiceAgentController.getVoicesByProvider);
router.get('/settings/voices/:voiceId', voiceAgentController.getVoiceById);
router.post('/settings/voices', voiceAgentController.createVoice);
router.put('/settings/voices/:voiceId', voiceAgentController.updateVoice);
router.delete('/settings/voices/:voiceId', voiceAgentController.deleteVoice);

// Relationship Routes
router.get('/settings/voices/:voiceId/agents', voiceAgentController.getAgentsByVoiceId);

module.exports = router;
