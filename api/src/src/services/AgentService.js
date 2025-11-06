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
				model, chat_model, provider, deepgram_model, deepgram_voice, deepgram_language,
				temperature, max_tokens, vad_threshold, 
				silence_duration_ms, greeting, kb_id, conversation_strategy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                agentId,
				tenantId,
				agentData.name,
				agentData.type,
				agentData.instructions,
				agentData.voice || 'shimmer',
				agentData.language || 'ur',
				agentData.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
				agentData.chat_model || 'gpt-4o-mini',  // ADDED: chat_model in correct position
				agentData.provider || 'openai',
				agentData.deepgram_model || null,
				agentData.deepgram_voice || null,
				agentData.deepgram_language || 'en',
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
			`SELECT 
			  a.*,
			  kb.has_documents,
			  kb.has_products,
			  kb.document_count,
			  kb.product_count
			 FROM yovo_tbl_aiva_agents a
			 LEFT JOIN yovo_tbl_aiva_knowledge_bases kb ON a.kb_id = kb.id
			 WHERE a.id = ?`,
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
        
		agent.kb_metadata = {
			has_documents: !!agent.has_documents,
			has_products: !!agent.has_products,
			document_count: agent.document_count || 0,
			product_count: agent.product_count || 0
		};

        // Cache it
        await redisClient.setEx(
            `agent:${agentId}`, 
            300, // 5 minutes
            JSON.stringify(agent)
        );
        
        return agent;
    }
	
	async getAgentForPublicChat(agentId) {
        // Try cache first
        const cached = await redisClient.get(`agent:${agentId}`);
        if (cached) {
            return JSON.parse(cached);
        }
        
        const [agents] = await db.query(
			`SELECT 
			  a.*,
			  kb.has_documents,
			  kb.has_products,
			  kb.document_count,
			  kb.product_count
			 FROM yovo_tbl_aiva_agents a
			 LEFT JOIN yovo_tbl_aiva_knowledge_bases kb ON a.kb_id = kb.id
			 WHERE a.id = ? OR a.chat_page_slug = ?`,
			[agentId, agentId]
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
        
		agent.kb_metadata = {
			has_documents: !!agent.has_documents,
			has_products: !!agent.has_products,
			document_count: agent.document_count || 0,
			product_count: agent.product_count || 0
		};

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
	  const { 
		enable_chat_integration, 
		chat_page_enabled, 
		chat_page_slug,
		widget_config 
	  } = settings;

	  // Get current agent
	  const agent = await this.getAgent(agentId);
	  
	  if (!agent) {
		throw new Error('Agent not found');
	  }

	  // Generate slug if public page enabled but no custom slug provided
	  let finalSlug = chat_page_slug;
	  if (chat_page_enabled && !finalSlug) {
		// Auto-generate slug from agent name
		finalSlug = agent.name
		  .toLowerCase()
		  .replace(/[^a-z0-9]+/g, '-')
		  .replace(/^-+|-+$/g, '')
		  .substring(0, 50);
		
		// Ensure uniqueness
		const [existing] = await db.query(
		  'SELECT id FROM yovo_tbl_aiva_agents WHERE chat_page_slug = ? AND id != ?',
		  [finalSlug, agentId]
		);
		
		if (existing.length > 0) {
		  // Add random suffix
		  finalSlug = `${finalSlug}-${Math.random().toString(36).substring(2, 8)}`;
		}
	  }

	  // If public page disabled, clear the slug
	  if (!chat_page_enabled) {
		finalSlug = null;
	  }

	  // Validate slug if provided
	  if (finalSlug) {
		// Check slug format
		if (!/^[a-z0-9-]+$/.test(finalSlug)) {
		  throw new Error('Slug can only contain lowercase letters, numbers, and hyphens');
		}

		// Check slug uniqueness
		const [existing] = await db.query(
		  'SELECT id FROM yovo_tbl_aiva_agents WHERE chat_page_slug = ? AND id != ?',
		  [finalSlug, agentId]
		);

		if (existing.length > 0) {
		  throw new Error('This slug is already taken. Please choose another.');
		}
	  }

	  // Update agent
	  await db.query(
		`UPDATE yovo_tbl_aiva_agents 
		 SET enable_chat_integration = ?,
			 chat_page_enabled = ?,
			 chat_page_slug = ?,
			 widget_config = ?
		 WHERE id = ?`,
		[
		  enable_chat_integration ? 1 : 0,
		  chat_page_enabled ? 1 : 0,
		  finalSlug,
		  widget_config ? JSON.stringify(widget_config) : null,
		  agentId
		]
	  );

	  // Return updated config
	  return this.getChatIntegration(agentId);
	}

	/**
	 * Get chat integration settings
	 */
	async getChatIntegration(agentId) {
	  const [agents] = await db.query(
		`SELECT 
		  enable_chat_integration,
		  chat_page_enabled,
		  chat_page_slug,
		  widget_config
		 FROM yovo_tbl_aiva_agents 
		 WHERE id = ?`,
		[agentId]
	  );

	  if (agents.length === 0) {
		throw new Error('Agent not found');
	  }

	  const agent = agents[0];

	  return {
		enable_chat_integration: !!agent.enable_chat_integration,
		chat_page_enabled: !!agent.chat_page_enabled,
		chat_page_slug: agent.chat_page_slug,
		widget_config: agent.widget_config ? agent.widget_config : {
		  primary_color: '#6366f1',
		  position: 'bottom-right'
		}
	  };
	}

	/**
	 * Get agent by custom slug
	 */
	async getAgentBySlug(slug) {
	  const [agents] = await db.query(
		`SELECT 
		  id, 
		  tenant_id,
		  name, 
		  greeting, 
		  widget_config, 
		  chat_page_enabled
		 FROM yovo_tbl_aiva_agents 
		 WHERE chat_page_slug = ? AND chat_page_enabled = 1`,
		[slug]
	  );

	  if (agents.length === 0) {
		return null;
	  }

	  const agent = agents[0];
	  
	  return {
		...agent,
		widget_config: agent.widget_config ? agent.widget_config : null
	  };
	}

	/**
	 * Generate widget embed code
	 */
	generateWidgetCode(agentId, config = {}) {
	  // Don't hardcode domain - let widget auto-detect or allow override
	  const widgetUrl = process.env.WIDGET_URL || 'https://aidev.contegris.com/aiva/widget.js';
	  
	  // Generate code with optional API URL override
	  const apiUrlLine = config.custom_api_url 
		? `    apiUrl: '${config.custom_api_url}',  // Custom API endpoint\n`
		: '    // apiUrl will auto-detect from widget source\n';
	  
	  return `<!-- AIVA Chat Widget -->
	<script>
	  (function(w,d,s,o,f,js,fjs){
		w['AIVAWidget']=o;w[o] = w[o] || function () { (w[o].q = w[o].q || []).push(arguments) };
		js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
		js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
	  }(window, document, 'script', 'aiva', '${widgetUrl}'));
	  aiva('init', {
		agentId: '${agentId}',
	${apiUrlLine}    primaryColor: '${config.primary_color || '#6366f1'}',
		position: '${config.position || 'bottom-right'}'
	  });
	</script>`;
	}

	/**
	 * Generate standalone chat page URL
	 */
	generateChatPageUrl(agentId, slug) {
	  const baseUrl = process.env.CHAT_PAGE_URL || process.env.API_BASE_URL || 'https://yourdomain.com';
	  return `${baseUrl}/aiva/chat/${slug || agentId}`;
	}
}

module.exports = new AgentService();