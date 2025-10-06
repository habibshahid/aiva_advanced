/**
 * Dynamic Agent Loader - Loads agents from Management API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class DynamicAgentLoader {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl || process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api';
        this.apiKey = apiKey || process.env.MANAGEMENT_API_KEY;
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutes
    }
    
    /**
     * Get agent by ID
     */
    async getAgentById(agentId) {
        const cacheKey = `agent:${agentId}`;
        
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            logger.debug(`Using cached agent: ${agentId}`);
            return cached.data;
        }
        
        try {
            logger.info(`Loading agent from API: ${agentId}`);
            
            const response = await axios.get(
                `${this.apiUrl}/agents/${agentId}`,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
            const agent = response.data.agent;
            
            if (!agent || !agent.is_active) {
                logger.warn(`Agent ${agentId} not found or inactive`);
                return null;
            }
            
            // Get functions for this agent
            const functionsResponse = await axios.get(
                `${this.apiUrl}/functions/agent/${agentId}`,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
            agent.functions = functionsResponse.data.functions || [];
            
            // Format for bridge
            const formattedAgent = this.formatAgentForBridge(agent);
            
            // Cache it
            this.cache.set(cacheKey, {
                data: formattedAgent,
                timestamp: Date.now()
            });
            
            logger.info(`Loaded agent: ${agent.name} with ${agent.functions.length} functions`);
            
            return formattedAgent;
            
        } catch (error) {
			console.log(`${this.apiUrl}/agents/${agentId}`, this.apiKey) 
            logger.error(`Failed to load agent ${agentId}:`, error.message);
            return null;
        }
    }
    
    /**
     * Format agent data for bridge compatibility
     */
    formatAgentForBridge(agent) {
		// Format functions for OpenAI (only what OpenAI needs)
		const openAITools = (agent.functions || [])
			.filter(f => f.is_active)
			.map(func => ({
				type: "function",
				name: func.name,
				description: func.description,
				parameters: func.parameters
			}));
		
		return {
			id: agent.id,
			name: agent.name,
			type: agent.type,
			provider: agent.provider || 'openai',  // ADD THIS
			greeting: agent.greeting || `Hello! This is ${agent.name}. How can I help you?`,
			instructions: agent.instructions,
			tools: openAITools,
			functions: agent.functions || [],
			config: {
				voice: agent.voice || 'shimmer',
				language: agent.language || 'en',
				model: agent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
				temperature: parseFloat(agent.temperature) || 0.6,
				maxTokens: parseInt(agent.max_tokens) || 4096,
				vadThreshold: parseFloat(agent.vad_threshold) || 0.5,
				silenceDurationMs: parseInt(agent.silence_duration_ms) || 500,
				prefixPaddingMs: 300,
				// ADD Deepgram fields
				deepgram_model: agent.deepgram_model,
				deepgram_voice: agent.deepgram_voice,
				deepgram_language: agent.deepgram_language
			},
			tenant_id: agent.tenant_id
		};
	}
    
    /**
     * Clear cache
     */
    clearCache(agentId = null) {
        if (agentId) {
            this.cache.delete(`agent:${agentId}`);
            logger.info(`Cleared cache for agent: ${agentId}`);
        } else {
            this.cache.clear();
            logger.info('Cleared all agent cache');
        }
    }
}

module.exports = DynamicAgentLoader;