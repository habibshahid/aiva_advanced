const db = require('../config/database');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');

class FunctionService {
    // Create function
    async createFunction(agentId, functionData) {
        const functionId = uuidv4();
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_functions (
                id, agent_id, name, description, execution_mode,
                parameters, handler_type, api_endpoint, api_method,
                api_headers, timeout_ms, retries
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                functionId,
                agentId,
                functionData.name,
                functionData.description,
                functionData.execution_mode || 'sync',
                JSON.stringify(functionData.parameters),
                functionData.handler_type || 'inline',
                functionData.api_endpoint || null,
                functionData.api_method || 'POST',
                functionData.api_headers ? JSON.stringify(functionData.api_headers) : null,
                functionData.timeout_ms || 30000,
                functionData.retries || 2
            ]
        );
        
        // Invalidate agent cache
        const [agents] = await db.query('SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?', [agentId]);
        if (agents.length > 0) {
            await redisClient.del(`agent:${agentId}`);
        }
        
        return this.getFunction(functionId);
    }
    
    // Get function
    async getFunction(functionId) {
        const [functions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_functions WHERE id = ?',
            [functionId]
        );
        
        if (functions.length === 0) {
            return null;
        }
        
        const func = functions[0];
        
        return {
			...func,
			parameters: typeof func.parameters === 'string' ? JSON.parse(func.parameters) : func.parameters,
			api_headers: func.api_headers ? (typeof func.api_headers === 'string' ? JSON.parse(func.api_headers) : func.api_headers) : null,
			api_body: func.api_body ? (typeof func.api_body === 'string' ? JSON.parse(func.api_body) : func.api_body) : null
		};
    }
    
    // List functions for agent
    async listFunctions(agentId) {
        const [functions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_functions WHERE agent_id = ? ORDER BY created_at DESC',
            [agentId]
        );
        
        return functions.map(f => ({
			...f,
			parameters: typeof f.parameters === 'string' ? JSON.parse(f.parameters) : f.parameters,
			api_headers: f.api_headers ? (typeof f.api_headers === 'string' ? JSON.parse(f.api_headers) : f.api_headers) : null,
			api_body: f.api_body ? (typeof f.api_body === 'string' ? JSON.parse(f.api_body) : f.api_body) : null
		}));
    }
    
    // Update function
    async updateFunction(functionId, updates) {
        const fields = [];
        const values = [];
        
        const allowedFields = [
            'name', 'description', 'execution_mode', 'parameters',
            'handler_type', 'api_endpoint', 'api_method', 'api_headers',
            'timeout_ms', 'retries', 'is_active'
        ];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                if (field === 'parameters' || field === 'api_headers') {
                    fields.push(`${field} = ?`);
                    values.push(JSON.stringify(updates[field]));
                } else {
                    fields.push(`${field} = ?`);
                    values.push(updates[field]);
                }
            }
        }
        
        if (fields.length === 0) {
            return this.getFunction(functionId);
        }
        
        values.push(functionId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_functions SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        // Invalidate agent cache
        const [functions] = await db.query('SELECT agent_id FROM yovo_tbl_aiva_functions WHERE id = ?', [functionId]);
        if (functions.length > 0) {
            await redisClient.del(`agent:${functions[0].agent_id}`);
        }
        
        return this.getFunction(functionId);
    }
    
    // Delete function
    async deleteFunction(functionId) {
        // Get agent_id before deletion
        const [functions] = await db.query('SELECT agent_id FROM yovo_tbl_aiva_functions WHERE id = ?', [functionId]);
        
        await db.query('DELETE FROM functions WHERE id = ?', [functionId]);
        
        // Invalidate agent cache
        if (functions.length > 0) {
            await redisClient.del(`agent:${functions[0].agent_id}`);
        }
    }
}

module.exports = new FunctionService();