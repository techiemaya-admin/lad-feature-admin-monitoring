const { createBaseRepository } = require('../../../shared/database/baseRepository');
const { queryTable, insertRow, updateRow, deleteRow } = require('../../../shared/database/baseRepository'); // Adjust based on actual baseRepository implementation

/**
 * Voice Agent Service
 */
const voiceAgentService = {
    // Agent Methods
    async getAllAgents(schema) {
        const repo = createBaseRepository(schema);
        // Assuming there is a 'voice_agents' table
        return repo.safeQuery(`SELECT * FROM "${schema}"."voice_agents" ORDER BY created_at DESC`);
    },

    async getAgentById(schema, agentId) {
        const repo = createBaseRepository(schema);
        const rows = await repo.safeQuery(`SELECT * FROM "${schema}"."voice_agents" WHERE id = $1`, [agentId]);
        return rows[0] || null;
    },

    async createAgent(schema, agentData) {
        const repo = createBaseRepository(schema);
        // Simplified insert - adjust column names as per DB schema
        const data = {
            name: agentData.name,
            description: agentData.description,
            voice_id: agentData.voiceId,
            settings: JSON.stringify(agentData.settings || {}),
            created_at: new Date(),
            updated_at: new Date()
        };
        const columns = Object.keys(data).map(c => `"${c}"`).join(', ');
        const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(data);
        
        const sql = `INSERT INTO "${schema}"."voice_agents" (${columns}) VALUES (${placeholders}) RETURNING *`;
        const rows = await repo.safeQuery(sql, values);
        return rows[0];
    },

    async updateAgent(schema, agentId, agentData) {
        const repo = createBaseRepository(schema);
        const data = {
            name: agentData.name,
            description: agentData.description,
            settings: JSON.stringify(agentData.settings || {}),
            updated_at: new Date()
        };
        
        const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const values = [...Object.values(data), agentId];
        
        const sql = `UPDATE "${schema}"."voice_agents" SET ${setClause} WHERE id = $${values.length} RETURNING *`;
        const rows = await repo.safeQuery(sql, values);
        return rows[0];
    },

    async deleteAgent(schema, agentId) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`DELETE FROM "${schema}"."voice_agents" WHERE id = $1`, [agentId]);
    },

    async searchAgents(schema, query) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`SELECT * FROM "${schema}"."voice_agents" WHERE name ILIKE $1 OR description ILIKE $1`, [`%${query}%`]);
    },

    // Voice Methods
    async getAllVoices(schema) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`SELECT * FROM "${schema}"."voices" ORDER BY name ASC`);
    },

    async getVoiceById(schema, voiceId) {
        const repo = createBaseRepository(schema);
        const rows = await repo.safeQuery(`SELECT * FROM "${schema}"."voices" WHERE id = $1`, [voiceId]);
        return rows[0] || null;
    },

    async createVoice(schema, voiceData) {
        const repo = createBaseRepository(schema);
        const data = {
            name: voiceData.name,
            provider: voiceData.provider,
            model: voiceData.model,
            language: voiceData.language,
            gender: voiceData.gender,
            description: voiceData.description,
            settings: JSON.stringify(voiceData.settings || {}),
            created_at: new Date(),
            updated_at: new Date()
        };
        const columns = Object.keys(data).map(c => `"${c}"`).join(', ');
        const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
        const values = Object.values(data);
        
        const sql = `INSERT INTO "${schema}"."voices" (${columns}) VALUES (${placeholders}) RETURNING *`;
        const rows = await repo.safeQuery(sql, values);
        return rows[0];
    },

    async updateVoice(schema, voiceId, voiceData) {
        const repo = createBaseRepository(schema);
        const data = {
            name: voiceData.name,
            description: voiceData.description,
            settings: JSON.stringify(voiceData.settings || {}),
            updated_at: new Date()
        };
        
        const setClause = Object.keys(data).map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        const values = [...Object.values(data), voiceId];
        
        const sql = `UPDATE "${schema}"."voices" SET ${setClause} WHERE id = $${values.length} RETURNING *`;
        const rows = await repo.safeQuery(sql, values);
        return rows[0];
    },

    async deleteVoice(schema, voiceId) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`DELETE FROM "${schema}"."voices" WHERE id = $1`, [voiceId]);
    },

    async getVoicesByProvider(schema, provider) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`SELECT * FROM "${schema}"."voices" WHERE provider = $1`, [provider]);
    },

    async searchVoices(schema, query) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`SELECT * FROM "${schema}"."voices" WHERE name ILIKE $1 OR description ILIKE $1`, [`%${query}%`]);
    },

    async getAgentsByVoiceId(schema, voiceId) {
        const repo = createBaseRepository(schema);
        return repo.safeQuery(`SELECT * FROM "${schema}"."voice_agents" WHERE voice_id = $1`, [voiceId]);
    }
};

module.exports = voiceAgentService;
