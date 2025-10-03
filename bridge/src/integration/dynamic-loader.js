/**
 * Dynamic Agent Loader - Loads agents from API/Database
 * This replaces static agent file loading
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
     * Get agent configuration by tenant ID and type
     */
    async getAgent(tenantId, agentType = 'sales') {
        const cacheKey = `${tenantId}:${agentType}`;
        
        // Check cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            logger.debug(`Using cached agent: ${cacheKey}`);
            return cached.data;
        }
        
        try {
            const response = await axios.get(
                `${this.apiUrl}/agents`,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    params: {
                        type: agentType,
                        is_active: true
                    },
                    timeout: 5000
                }
            );
            
            const agents = response.data.agents;
            
            if (agents.length === 0) {
                logger.warn(`No active agent found for tenant ${tenantId}, type ${agentType}`);
                return this.getFallbackAgent(agentType);
            }
            
            // Get the first active agent
            const agent = agents[0];
            
            // Format for bridge
            const formattedAgent = this.formatAgentForBridge(agent);
            
            // Cache it
            this.cache.set(cacheKey, {
                data: formattedAgent,
                timestamp: Date.now()
            });
            
            logger.info(`Loaded dynamic agent: ${agent.name} (${agent.id})`);
            
            return formattedAgent;
            
        } catch (error) {
            logger.error(`Failed to load agent from API: ${error.message}`);
            return this.getFallbackAgent(agentType);
        }
    }
    
    /**
     * Format agent data for bridge compatibility
     */
    formatAgentForBridge(agent) {
        return {
            id: agent.id,
            name: agent.name,
            type: agent.type,
            greeting: agent.greeting || `Hello! This is ${agent.name}. How can I help you?`,
            instructions: agent.instructions,
            tools: this.formatFunctions(agent.functions || []),
            config: {
                voice: agent.voice,
                language: agent.language,
                model: agent.model,
                temperature: parseFloat(agent.temperature),
                maxTokens: agent.max_tokens,
                vadThreshold: parseFloat(agent.vad_threshold),
                silenceDurationMs: agent.silence_duration_ms
            }
        };
    }
    
    /**
     * Format functions for OpenAI
     */
    formatFunctions(functions) {
        return functions.map(func => ({
            type: "function",
            name: func.name,
            description: func.description,
            parameters: func.parameters,
            execution_mode: func.execution_mode,
            handler_type: func.handler_type,
            api_endpoint: func.api_endpoint,
            api_method: func.api_method,
            api_headers: func.api_headers,
            timeout_ms: func.timeout_ms,
            retries: func.retries
        }));
    }
    
    /**
     * Fallback agent if API is unavailable
     */
    getFallbackAgent(type) {
        logger.warn(`Using fallback agent for type: ${type}`);
        
        // Load from static file as fallback
        const AgentLoader = require('../config/agent-loader');
        const staticLoader = new AgentLoader();
        const staticAgent = staticLoader.loadAgent(type);
        
        return {
            ...staticAgent,
            id: 'fallback',
            config: {
                voice: 'shimmer',
                language: 'ur',
                model: 'gpt-4o-mini-realtime-preview-2024-12-17',
                temperature: 0.6,
                maxTokens: 4096,
                vadThreshold: 0.5,
                silenceDurationMs: 500
            }
        };
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        logger.info('Agent cache cleared');
    }
}

module.exports = DynamicAgentLoader;