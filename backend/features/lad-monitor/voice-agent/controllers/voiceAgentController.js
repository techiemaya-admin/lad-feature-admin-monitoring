const voiceAgentService = require('../services/voiceAgentService');
const logger = require('../../../core/utils/logger');

/**
 * Voice Agent Controller
 */
const voiceAgentController = {
    // Agent handlers
    async getAllAgents(req, res) {
        try {
            const schema = req.schema;
            const agents = await voiceAgentService.getAllAgents(schema);
            res.json(agents);
        } catch (error) {
            logger.error('Error getting all agents', { error: error.message });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getAgentById(req, res) {
        try {
            const { agentId } = req.params;
            const schema = req.schema;
            const agent = await voiceAgentService.getAgentById(schema, agentId);
            if (!agent) return res.status(404).json({ error: 'Agent not found' });
            res.json(agent);
        } catch (error) {
            logger.error('Error getting agent by ID', { error: error.message, agentId: req.params.agentId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async createAgent(req, res) {
        try {
            const schema = req.schema;
            const agentData = req.body;
            const newAgent = await voiceAgentService.createAgent(schema, agentData);
            res.status(201).json(newAgent);
        } catch (error) {
            logger.error('Error creating agent', { error: error.message });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async updateAgent(req, res) {
        try {
            const { agentId } = req.params;
            const schema = req.schema;
            const agentData = req.body;
            const updatedAgent = await voiceAgentService.updateAgent(schema, agentId, agentData);
            res.json(updatedAgent);
        } catch (error) {
            logger.error('Error updating agent', { error: error.message, agentId: req.params.agentId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async deleteAgent(req, res) {
        try {
            const { agentId } = req.params;
            const schema = req.schema;
            await voiceAgentService.deleteAgent(schema, agentId);
            res.status(204).end();
        } catch (error) {
            logger.error('Error deleting agent', { error: error.message, agentId: req.params.agentId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async searchAgents(req, res) {
        try {
            const { q } = req.query;
            const schema = req.schema;
            const agents = await voiceAgentService.searchAgents(schema, q);
            res.json(agents);
        } catch (error) {
            logger.error('Error searching agents', { error: error.message, query: req.query.q });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    // Voice handlers
    async getAllVoices(req, res) {
        try {
            const schema = req.schema;
            const voices = await voiceAgentService.getAllVoices(schema);
            res.json(voices);
        } catch (error) {
            logger.error('Error getting all voices', { error: error.message });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getVoiceById(req, res) {
        try {
            const { voiceId } = req.params;
            const schema = req.schema;
            const voice = await voiceAgentService.getVoiceById(schema, voiceId);
            if (!voice) return res.status(404).json({ error: 'Voice not found' });
            res.json(voice);
        } catch (error) {
            logger.error('Error getting voice by ID', { error: error.message, voiceId: req.params.voiceId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async createVoice(req, res) {
        try {
            const schema = req.schema;
            const voiceData = req.body;
            const newVoice = await voiceAgentService.createVoice(schema, voiceData);
            res.status(201).json(newVoice);
        } catch (error) {
            logger.error('Error creating voice', { error: error.message });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async updateVoice(req, res) {
        try {
            const { voiceId } = req.params;
            const schema = req.schema;
            const voiceData = req.body;
            const updatedVoice = await voiceAgentService.updateVoice(schema, voiceId, voiceData);
            res.json(updatedVoice);
        } catch (error) {
            logger.error('Error updating voice', { error: error.message, voiceId: req.params.voiceId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async deleteVoice(req, res) {
        try {
            const { voiceId } = req.params;
            const schema = req.schema;
            await voiceAgentService.deleteVoice(schema, voiceId);
            res.status(204).end();
        } catch (error) {
            logger.error('Error deleting voice', { error: error.message, voiceId: req.params.voiceId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getVoicesByProvider(req, res) {
        try {
            const { provider } = req.params;
            const schema = req.schema;
            const voices = await voiceAgentService.getVoicesByProvider(schema, provider);
            res.json(voices);
        } catch (error) {
            logger.error('Error getting voices by provider', { error: error.message, provider: req.params.provider });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async searchVoices(req, res) {
        try {
            const { q } = req.query;
            const schema = req.schema;
            const voices = await voiceAgentService.searchVoices(schema, q);
            res.json(voices);
        } catch (error) {
            logger.error('Error searching voices', { error: error.message, query: req.query.q });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    },

    async getAgentsByVoiceId(req, res) {
        try {
            const { voiceId } = req.params;
            const schema = req.schema;
            const agents = await voiceAgentService.getAgentsByVoiceId(schema, voiceId);
            res.json(agents);
        } catch (error) {
            logger.error('Error getting agents by voice ID', { error: error.message, voiceId: req.params.voiceId });
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
};

module.exports = voiceAgentController;
