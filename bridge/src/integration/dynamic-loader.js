/**
 * Dynamic Agent Loader - Loads agents from Management API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class DynamicAgentLoader {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl || process.env.MANAGEMENT_API_URL || 'http://localhost:62001/api';
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
			
            if (!agent) {
                logger.warn(`Agent ${agentId} not found in API response`);
                console.log('API Response:', response.data);
                return null;
            }
            
            if (!agent.is_active) {
                logger.warn(`Agent ${agentId} exists but is inactive (is_active=${agent.is_active})`);
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
            console.log('API URL:', `${this.apiUrl}/agents/${agentId}`);
            console.log('API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');
            console.log('Error details:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            logger.error(`Failed to load agent ${agentId}: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Format agent data for bridge compatibility
     */
    formatAgentForBridge(agent) {
		// Format functions for OpenAI (only what OpenAI needs)
		const builtInTransferTool = {
			type: "function",
			name: "transfer_to_agent",
			description: "IMMEDIATELY transfer the call to a human agent queue when requested. DO NOT respond with speech first - call this function right away when customer asks for human agent, transfer, or live person. This is the ONLY correct action when transfer is requested.",
			parameters: {
				type: "object",
				properties: {
					queue: {
						type: "string",
						description: "The queue name to transfer to (e.g., sales, support, billing)"
					}
				},
				required: ["queue"]
			}
		};
		
		const builtInKBSearchTool = agent.kb_id ? {
			type: "function",
			name: "search_knowledge",
			description: "Search the knowledge base to find relevant information to answer customer questions. Use this when you need specific information about products, policies, procedures, or any other documented information. IMPORTANT: Before calling this function, ALWAYS first tell the caller something brief like 'Let me look that up for you, please hold on' or 'One moment while I check that information' - then call the function. This prepares them for a brief pause.",
			parameters: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description: "The search query. Be specific about what information you're looking for."
					},
					top_k: {
						type: "number",
						description: "Number of results to return (default: 3, max: 5)",
						default: 3
					}
				},
				required: ["query"]
			}
		} : null;
		
		const builtInOrderStatusTool = agent.kb_id ? {
			type: "function",
			name: "check_order_status",
			description: "Check the status of a customer's order using their order number, email, or phone number. Use this when a customer asks about their order status, tracking, delivery information, or wants to know where their order is. IMPORTANT: Before calling this function, tell the user 'Let me check your order status' or 'One moment while I look that up'.",
			parameters: {
				type: "object",
				properties: {
					order_number: {
						type: "string",
						description: "The order number or order ID (e.g., '#1234', '1234', 'ORD-1234')"
					},
					email: {
						type: "string",
						description: "Customer's email address used for the order"
					},
					phone: {
						type: "string",
						description: "Customer's phone number used for the order"
					}
				},
				required: []
			}
		} : null;
		
		const openAITools = [
			builtInTransferTool, // Always include transfer tool first
			...(agent.functions || [])
				.filter(f => f.is_active)
				.map(func => ({
					type: "function",
					name: func.name,
					description: func.description,
					parameters: func.parameters
				}))
		];
		
		if (builtInKBSearchTool) {
			openAITools.push(builtInKBSearchTool);
			logger.debug(`Added KB search tool for agent ${agent.id} (KB: ${agent.kb_id})`);
		}
		
		if (builtInOrderStatusTool) {
			openAITools.push(builtInOrderStatusTool);
			logger.debug(`Added order status tool for agent ${agent.id} (KB: ${agent.kb_id})`);
		}
		
		const builtInTransferFunction = {
			id: 'builtin_transfer_to_agent',
			agent_id: agent.id,
			name: 'transfer_to_agent',
			description: 'IMMEDIATELY transfer the call to a human agent queue when requested. DO NOT respond with speech first - call this function right away when customer asks for human agent, transfer, or live person. This is the ONLY correct action when transfer is requested.',
			execution_mode: 'sync',
			handler_type: 'inline',
			parameters: {
				type: "object",
				properties: {
					queue: {
						type: "string",
						description: "The queue name to transfer to"
					}
				},
				required: ["queue"]
			},
			is_active: true
		};
		
		const builtInOrderStatusFunction = agent.kb_id ? {
			id: 'builtin_check_order_status',
			agent_id: agent.id,
			name: 'check_order_status',
			description: 'Check order status via Shopify',
			handler_type: 'inline',
			execution_mode: 'sync',
			is_active: true,
			// Store kb_id for the handler
			kb_id: agent.kb_id
		} : null;
		
		let languageHints = agent.language_hints;
		
		if (typeof languageHints === 'string') {
			try {
				languageHints = JSON.parse(languageHints);
			} catch (e) {
				languageHints = ['ur', 'en'];
			}
		}
		
		// ===========================================================
		// INTENT-IVR PROVIDER HANDLING
		// ===========================================================
		const cacheKey = `agent:${agent.id}`;
		if (agent.provider === 'intent-ivr') {
			const config = {
				id: agent.id,
				agentId: agent.id,
				name: agent.name,
				type: agent.type,
				provider: 'intent-ivr',
				
				// IVR-specific settings
				tts_provider: agent.tts_provider || 'uplift',
				custom_voice: agent.custom_voice || 'v_meklc281',
				language_hints: languageHints || ['ur', 'en'],
				
				// Greeting
				greeting: agent.greeting,
				
				// KB for fallback
				kb_id: agent.kb_id,
				
				// Instructions
				instructions: agent.instructions,
				
				// Functions
				functions: [
					builtInTransferFunction,
					...(builtInOrderStatusFunction ? [builtInOrderStatusFunction] : []),
					...(agent.functions || [])
				],
				tools: openAITools,
				
				config: {
					language: agent.language || 'ur',
					silenceDurationMs: parseInt(agent.silence_duration_ms) || 700,
				},
				
				tenant_id: agent.tenant_id,
				tenantId: agent.tenant_id
			};
			
			// Cache
			this.cache.set(cacheKey, { config, timestamp: Date.now() });
			return config;
		}
		
		// ===========================================================
		// EXISTING PROVIDER HANDLING (openai, deepgram, custom)
		// ===========================================================
		const config = {
			id: agent.id,
			name: agent.name,
			type: agent.type,
			provider: agent.provider || 'openai',
			tts_provider: agent.tts_provider || 'uplift',
			custom_voice: agent.custom_voice || 'v_meklc281',
			language_hints: languageHints || ['ur', 'en'],
			llm_model: agent.llm_model || 'gpt-4o-mini',
			openai_tts_model: 'tts-1',
			uplift_output_format: 'MP3_22050_32',
			uplift_resample_16to8: true,
			greeting: agent.greeting || `Hello! This is ${agent.name}. How can I help you?`,
			instructions: agent.instructions,
			tools: openAITools,
			functions: [
				builtInTransferFunction,
				...(builtInOrderStatusFunction ? [builtInOrderStatusFunction] : []),
				...(agent.functions || [])
			],
			kb_id: agent.kb_id,
			config: {
				voice: agent.voice || 'shimmer',
				language: agent.language || 'en',
				model: agent.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
				temperature: parseFloat(agent.temperature) || 0.6,
				maxTokens: parseInt(agent.max_tokens) || 4096,
				vadThreshold: parseFloat(agent.vad_threshold) || 0.5,
				silenceDurationMs: parseInt(agent.silence_duration_ms) || 500,
				prefixPaddingMs: 300,
				deepgram_model: agent.deepgram_model,
				deepgram_voice: agent.deepgram_voice,
				deepgram_language: agent.deepgram_language
			},
			tenant_id: agent.tenant_id
		};
		
		// Cache
		this.cache.set(cacheKey, { config, timestamp: Date.now() });
		return config;
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