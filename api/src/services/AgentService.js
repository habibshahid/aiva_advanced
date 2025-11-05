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
				model, provider, deepgram_model, deepgram_voice, deepgram_language,
				temperature, max_tokens, vad_threshold, 
				silence_duration_ms, greeting, kb_id, conversation_strategy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                agentId,
				tenantId,
				agentData.name,
				agentData.type,
				agentData.instructions,
				agentData.voice || 'shimmer',
				agentData.language || 'ur',
				agentData.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
				agentData.chat_model || 'gpt-4o-mini',
				agentData.provider || 'openai',  // NEW
				agentData.deepgram_model || null,  // NEW
				agentData.deepgram_voice || null,  // NEW
				agentData.deepgram_language || 'en',  // NEW
				agentData.temperature || 0.6,
				agentData.max_tokens || 4096,
				agentData.vad_threshold || 0.5,
				agentData.silence_duration_ms || 500,
				agentData.greeting || null,
				agentData.kb_id || null,
				JSON.stringify(agentData.conversation_strategy) || null
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
			parameters: typeof f.parameters === 'string' ? JSON.parse(f.parameters) : f.parameters,
			api_headers: f.api_headers ? (typeof f.api_headers === 'string' ? JSON.parse(f.api_headers) : f.api_headers) : null,
			api_body: f.api_body ? (typeof f.api_body === 'string' ? JSON.parse(f.api_body) : f.api_body) : null
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
            'name', 'instructions', 'voice', 'language', 'model', 'chat_model',
			'provider', 'deepgram_model', 'deepgram_voice', 'deepgram_language',  // NEW
			'temperature', 'max_tokens', 'vad_threshold', 
			'silence_duration_ms', 'greeting', 'is_active', 'kb_id', 'conversation_strategy' 
        ];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
				if(field === 'conversation_strategy'){
					values.push(JSON.stringify(updates[field]));
				}
				else{
					values.push(updates[field]);
				}
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
	
	/**
	 * Update agent chat integration settings
	 */
	async updateChatIntegration(agentId, settings) {
	  const fields = [];
	  const values = [];

	  if (settings.enable_chat_integration !== undefined) {
		fields.push('enable_chat_integration = ?');
		values.push(settings.enable_chat_integration);
	  }

	  if (settings.widget_config) {
		fields.push('widget_config = ?');
		values.push(JSON.stringify(settings.widget_config));
	  }

	  if (settings.chat_page_enabled !== undefined) {
		fields.push('chat_page_enabled = ?');
		values.push(settings.chat_page_enabled);
	  }

	  if (settings.chat_page_slug) {
		fields.push('chat_page_slug = ?');
		values.push(settings.chat_page_slug);
	  }

	  if (fields.length === 0) return;

	  values.push(agentId);

	  await db.query(
		`UPDATE yovo_tbl_aiva_agents SET ${fields.join(', ')} WHERE id = ?`,
		values
	  );
	}

	/**
	 * Generate widget embed code
	 */
	generateWidgetCode(agentId, config = {}) {
	  const baseUrl = process.env.WIDGET_BASE_URL || process.env.API_BASE_URL || 'https://yourdomain.com';
	  
	  return `<!-- AIVA Chat Widget -->
	<script>
	  (function(w,d,s,o,f,js,fjs){
		w['AIVAWidget']=o;w[o] = w[o] || function () { (w[o].q = w[o].q || []).push(arguments) };
		js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
		js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
	  }(window, document, 'script', 'aiva', '${baseUrl}/widget.js'));
	  aiva('init', {
		agentId: '${agentId}',
		primaryColor: '${config.primary_color || '#6366f1'}',
		position: '${config.position || 'bottom-right'}'
	  });
	</script>`;
	}

	/**
	 * Generate standalone chat page URL
	 */
	generateChatPageUrl(agentId, slug) {
	  const baseUrl = process.env.CHAT_PAGE_URL || process.env.API_BASE_URL || 'https://yourdomain.com';
	  return `${baseUrl}/chat/${slug || agentId}`;
	}
}

module.exports = new AgentService();