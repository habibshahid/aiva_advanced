const db = require('../config/database');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

class AgentService {
    // Create agent
    async createAgent(tenantId, agentData) {
        const agentId = uuidv4();
        
        const [result] = await db.query(
            `INSERT INTO yovo_tbl_aiva_agents (
                id, tenant_id, name, type, instructions, voice, language, 
                model, temperature, max_tokens, vad_threshold, 
                silence_duration_ms, greeting
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                agentId,
                tenantId,
                agentData.name,
                agentData.type,
                agentData.instructions,
                agentData.voice || 'shimmer',
                agentData.language || 'ur',
                agentData.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
                agentData.temperature || 0.6,
                agentData.max_tokens || 4096,
                agentData.vad_threshold || 0.5,
                agentData.silence_duration_ms || 500,
                agentData.greeting || null
            ]
        );
        
        // Cache in Redis
        await this.cacheAgent(agentId);
        
        return this.getAgent(agentId);
    }
    
    // Get agent
    async getAgent(agentId) {
        // Try cache first
        const cached = await redisClient.get(`agent:${agentId}`);
        if (cached) {
            return JSON.parse(cached);
        }
        
        const [agents] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_agents WHERE id = ?',
            [agentId]
        );
        
        if (agents.length === 0) {
            return null;
        }
        
        const agent = agents[0];
        
        // Get functions
        const [functions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_functions WHERE agent_id = ? AND is_active = TRUE',
            [agentId]
        );
        
        agent.functions = functions.map(f => ({
            ...f,
            parameters: JSON.parse(f.parameters),
            api_headers: f.api_headers ? JSON.parse(f.api_headers) : null
        }));
        
        // Cache it
        await redisClient.setEx(
            `agent:${agentId}`, 
            300, // 5 minutes
            JSON.stringify(agent)
        );
        
        return agent;
    }
    
    // Get agent by tenant and type (for call routing)
    async getActiveAgentByType(tenantId, type) {
        const [agents] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_agents WHERE tenant_id = ? AND type = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
            [tenantId, type]
        );
        
        if (agents.length === 0) {
            return null;
        }
        
        return this.getAgent(agents[0].id);
    }
    
    // List agents
    async listAgents(tenantId, filters = {}) {
        let query = 'SELECT * FROM yovo_tbl_aiva_agents WHERE tenant_id = ?';
        const params = [tenantId];
        
        if (filters.type) {
            query += ' AND type = ?';
            params.push(filters.type);
        }
        
        if (filters.is_active !== undefined) {
            query += ' AND is_active = ?';
			if (filters.is_active){
				params.push(1);
			}
			else{
				params.push(0);
			}
        }
        
        query += ' ORDER BY created_at DESC';
        const [agents] = await db.query(query, params);
        
        return agents;
    }
    
    // Update agent
    async updateAgent(agentId, updates) {
        const fields = [];
        const values = [];
        
        const allowedFields = [
            'name', 'instructions', 'voice', 'language', 'model',
            'temperature', 'max_tokens', 'vad_threshold', 
            'silence_duration_ms', 'greeting', 'is_active'
        ];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                values.push(updates[field]);
            }
        }
        
        if (fields.length === 0) {
            return this.getAgent(agentId);
        }
        
        values.push(agentId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_agents SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        // Invalidate cache
        await redisClient.del(`agent:${agentId}`);
        
        return this.getAgent(agentId);
    }
    
    // Delete agent
    async deleteAgent(agentId) {
        await db.query('DELETE FROM yovo_tbl_aiva_agents WHERE id = ?', [agentId]);
        await redisClient.del(`agent:${agentId}`);
    }
    
    // Cache agent
    async cacheAgent(agentId) {
        const agent = await this.getAgent(agentId);
        if (agent) {
            await redisClient.setEx(
                `agent:${agentId}`,
                300,
                JSON.stringify(agent)
            );
        }
    }
}

module.exports = new AgentService();