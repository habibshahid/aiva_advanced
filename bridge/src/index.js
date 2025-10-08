/**
 * Asterisk-OpenAI Bridge - Dynamic Multi-Tenant Version
 * Loads agents and functions dynamically from management API
 */

require('dotenv').config();

const RtpUdpServer = require('./audio/rtp-server');
const SessionManager = require('./session/session-manager');
const FunctionExecutor = require('./functions/function-executor');
const ConnectionManager = require('./bridge/connection-manager');
const MonitorServer = require('./monitoring/monitor-server');
const RedisClient = require('./utils/redis-client');
//const openaiConfig = require('./config/openai-config');
const logger = require('./utils/logger');

// Dynamic loading components
const DynamicAgentLoader = require('./integration/dynamic-loader');
const CreditManager = require('./integration/credit-manager');
const CallLogger = require('./integration/call-logger');

class AsteriskOpenAIBridge {
    constructor() {
        this.config = {
            rtpHost: process.env.RTP_HOST || '127.0.0.1:9999',
			monitorPort: parseInt(process.env.MONITOR_PORT || '3001'),
			debug: process.env.DEBUG === 'true',
			
			// Provider API Keys
			openaiApiKey: process.env.OPENAI_API_KEY,
			deepgramApiKey: process.env.DEEPGRAM_API_KEY,
			
			// Default settings (for backward compatibility)
			model: process.env.OPENAI_MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17',
			voice: process.env.OPENAI_VOICE || 'shimmer',
			temperature: parseFloat(process.env.AI_TEMPERATURE || '0.6'),
			maxResponseTokens: parseInt(process.env.MAX_RESPONSE_OUTPUT_TOKENS || '4096'),
			profitMargin: parseFloat(process.env.PROFIT_MARGIN_PERCENT || '20') / 100,
			
			// Management API config
			managementApiUrl: process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api',
			managementApiKey: process.env.MANAGEMENT_API_KEY,
			dynamicMode: process.env.DYNAMIC_MODE !== 'false'
        };
        
        if (!this.config.openaiApiKey) {
            throw new Error('OPENAI_API_KEY is required');
        }
        
        if (this.config.dynamicMode && !this.config.managementApiKey) {
            throw new Error('MANAGEMENT_API_KEY is required when DYNAMIC_MODE is enabled');
        }
        
        logger.info('Initializing Asterisk-OpenAI Bridge (Dynamic Mode)...');
    }
    
    async initialize() {
        try {
            // Initialize Redis
            logger.info('Connecting to Redis...');
            this.redisClient = new RedisClient({});
            await this.redisClient.connect();
            
            // Initialize dynamic components
            if (this.config.dynamicMode) {
                logger.info('Initializing dynamic management integration...');
                
                this.agentLoader = new DynamicAgentLoader(
                    this.config.managementApiUrl,
                    this.config.managementApiKey
                );
                
                this.creditManager = new CreditManager(
                    this.config.managementApiUrl,
                    this.config.managementApiKey
                );
                
                this.callLogger = new CallLogger(
                    this.config.managementApiUrl,
                    this.config.managementApiKey
                );
            }
            
            // Initialize function executor
            logger.info('Initializing function executor...');
            this.functionExecutor = new FunctionExecutor();
            
			logger.info('Initializing transfer handler...');
			const TransferHandler = require('./functions/transfer-handler');
			this.transferHandler = new TransferHandler(this.redisClient);
			this.registerBuiltInFunctions();
			
            // Initialize session manager
            logger.info('Initializing session manager...');
            
            // Initialize RTP server
            logger.info('Initializing RTP server...');
            this.rtpServer = new RtpUdpServer(this.config.rtpHost, {
                swap16: false,
                debug: this.config.debug
            });
            
            // Initialize connection manager
            logger.info('Initializing connection manager...');
            this.connectionManager = new ConnectionManager(
                this.rtpServer,
                this.functionExecutor,
				this.config.profitMargin 
            );
            
            // Initialize monitor server
            logger.info('Initializing monitor server...');
            this.monitorServer = new MonitorServer(this.config.monitorPort);
            await this.monitorServer.start();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start cleanup intervals
            this.startCleanupIntervals();
            
			this.startHangupMonitor();
			
            logger.info('='.repeat(60));
            logger.info('Asterisk-OpenAI Bridge initialized successfully!');
            logger.info(`Mode: DYNAMIC (Multi-Tenant)`);
            logger.info(`RTP Server: ${this.config.rtpHost}`);
            logger.info(`Monitor: http://localhost:${this.config.monitorPort}/`);
            logger.info(`Management API: ${this.config.managementApiUrl}`);
            logger.info('='.repeat(60));
            
        } catch (error) {
            logger.error('Failed to initialize bridge:', error);
            throw error;
        }
    }
    
	startHangupMonitor() {
		setInterval(async () => {
			for (const [clientKey, connection] of this.connectionManager.connections.entries()) {
				const port = connection.asteriskPort;
				if (port) {
					const redisKey = `transcriptionPort:${port}`;
					const interactionData = await this.redisClient.hGetAll(redisKey);
					
					if (interactionData.hangup === 'true') {
						logger.info(`Asterisk hangup detected for ${clientKey}`);
						await this.connectionManager.closeConnection(clientKey);
						await this.redisClient.del(redisKey);
					}
				}
			}
		}, 500); // Check every 500ms
	}

    setupEventHandlers() {
        // RTP Server Events - New client connection
		this.rtpServer.on('client', async (client) => {
            const clientKey = `${client.address}:${client.port}`;
            logger.info(`New RTP client: ${clientKey}`);
            
			setTimeout(async () => {
				try {
                // Get session info from Redis (stored by Asterisk)
				
					const redisKey = `transcriptionPort:${client.port}`;
					const callInfo = await this.redisClient.hGetAll(redisKey);
					
					if (!callInfo || !callInfo.sessionId) {
						logger.error(`No session info found in Redis for port ${client.port}`);
						return;
					}
					
					const sessionId = callInfo.sessionId;
					const callerNumber = callInfo.callerId || 'unknown';
					const agentId = callInfo.agentId; // This is set by Asterisk
					
					logger.info(`Session: ${sessionId}, Caller: ${callerNumber}, Agent ID: ${agentId}`);
					
					if (!agentId) {
						logger.error(`No agent_id provided in Redis for session ${sessionId}`);
						return;
					}
					
					// Load agent configuration from database
					logger.info(`Loading agent: ${agentId}`);
					const agentConfig = await this.agentLoader.getAgentById(agentId);
					
					if (!agentConfig) {
						logger.error(`Failed to load agent ${agentId}`);
						return;
					}
					
					logger.info(`Loaded agent: ${agentConfig.name} (${agentConfig.id})`);
					
					// Get tenant ID from agent
					const tenantId = callInfo.tenantId || agentConfig.tenant_id;
					
					// Check credits
					if (this.creditManager) {
						const creditCheck = await this.creditManager.checkCredits(tenantId);
						
						if (!creditCheck.allowed) {
							logger.warn(`Call rejected: Insufficient credits for tenant ${tenantId}`);
							// TODO: Play "insufficient credits" message
							return;
						}
					}
					
					// Register functions for this agent
					await this.registerAgentFunctions(agentConfig.functions);

					// Use the pre-formatted OpenAI tools from agent config
					const tools = agentConfig.tools;
					
					logger.info(`Registered ${tools.length} functions for agent ${agentConfig.name}`);
					
					const customData = callInfo.customData ? JSON.parse(callInfo.customData) : {};
					// Build context string
					const contextString = `

					===== CALLER INFORMATION =====
					Caller ID: ${callerNumber}
					Caller Name: ${callInfo.callerName || 'Unknown'}
					Session ID: ${sessionId}
					Call Start Time: ${new Date().toISOString()}

					===== CUSTOM CONTEXT =====
					${Object.entries(customData).map(([key, value]) => `${key}: ${value}`).join('\n')}

					===== END OF CONTEXT =====

					`;

					// Prepend context to instructions
					const transferInstructions = `
CRITICAL TRANSFER INSTRUCTIONS:
When a customer requests to speak with a human agent:
1. IMMEDIATELY call the transfer_to_agent function - DO NOT speak first
2. DO NOT say "I'm transferring you" or any message before calling the function
3. After calling transfer_to_agent, the system will automatically handle the transfer message
4. NEVER just acknowledge the transfer request without calling the function

The queue names should be specified in your instructions above. Common queues are: sales, support, billing, general.

IMPORTANT: If someone says "transfer me", "speak to human", "talk to agent", or similar:
→ Call transfer_to_agent function FIRST
→ Do NOT generate a spoken response
→ Let the function handle the transfer message
`;
					const fullInstructions = contextString + agentConfig.instructions + "\n\nMOST CRITICAL: Never answer out of context. You are here to answer and carry out the conversations based on the instructions given. If the user asks anything out of context, Politely and apologetically decline and ask if they would like to be transferred to a human agent." + transferInstructions;

					// Create connection
					const connection = await this.connectionManager.createConnection(
						clientKey,
						client,
						{
							sessionId: sessionId,
							provider: agentConfig.provider || 'openai',
							model: agentConfig.config?.model || this.config.model,
							voice: agentConfig.config?.voice || this.config.voice,
							temperature: agentConfig.config?.temperature || this.config.temperature,
							maxResponseTokens: agentConfig.config?.maxTokens || this.config.maxResponseTokens,
							vadThreshold: agentConfig.config?.vadThreshold || 0.5,
							silenceDuration: agentConfig.config?.silenceDurationMs || 500,
							instructions: fullInstructions,
							callerId: callerNumber,
							language: agentConfig.config?.language || 'en',
							functions: tools,
							greeting: agentConfig.greeting,
							// Deepgram fields
							deepgram_model: agentConfig.config?.deepgram_model,
							deepgram_voice: agentConfig.config?.deepgram_voice,
							deepgram_language: agentConfig.config?.deepgram_language,
							// Metadata
							agentId: agentConfig.id,
							tenantId: tenantId,
							asteriskPort: client.port
						}
					);

					connection.tenantId = tenantId;
					connection.agentId = agentConfig.id;
					connection.baseInstructions = agentConfig.instructions;
					connection.asteriskPort = client.port;

					// Create call log
					if (this.callLogger) {
						connection.callLogId = await this.callLogger.createCallLog(
							sessionId,
							tenantId,
							agentConfig.id,
							callerNumber,
							client.port
						);
					}

					// Add to monitor
					this.monitorServer.addConnection(clientKey, {
						sessionId: sessionId,
						rtpInfo: {
							clientKey: clientKey,
							address: client.address,
							port: client.port
						},
						callerId: callerNumber,
						agentName: agentConfig.name,
						tenantId: tenantId
					});

					// Trigger initial greeting
					setTimeout(() => {
						try {
							if (connection.session && connection.session.client) {
								connection.session.client.createResponse();
							}
						} catch (error) {
							logger.error('Error triggering initial greeting:', error);
						}
					}, 500);
				} catch (error) {
					logger.error(`Error creating connection for ${clientKey}:`, error);
				}
			},700)
        });
        
		this.rtpServer.on('audio', async (data) => {
			const clientKey = `${data.rinfo.address}:${data.rinfo.port}`;
			//console.log(`[DEBUG-RTP] Received ${data.buffer.length} bytes from Asterisk for ${clientKey}`);
			await this.connectionManager.handleRTPAudio(clientKey, data.buffer);
		});

		this.rtpServer.on('clientDisconnected', async (clientKey) => {
			logger.info(`RTP client disconnected (Asterisk ended call): ${clientKey}`);
			
			try {
				const connection = this.connectionManager.getConnection(clientKey);
				
				if (connection) {
					logger.info(`Processing disconnect for session: ${connection.sessionId}`);
					
					// Close the connection - this will trigger 'connectionClosed' event
					await this.connectionManager.closeConnection(clientKey);
				} else {
					logger.warn(`No connection found for disconnected client: ${clientKey}`);
				}
			} catch (error) {
				logger.error(`Error handling client disconnect for ${clientKey}:`, error);
			}
		});
		
		this.connectionManager.on('transcript', ({ connection, speaker, text }) => {
			logger.info(`[${speaker.toUpperCase()}] ${text}`);
			
			// This line broadcasts to monitor
			this.monitorServer.broadcastTranscript(connection.clientKey, speaker, text);
		});

        // Connection Manager Events
        this.connectionManager.on('connectionClosed', async ({ clientKey, finalCost, connectionData }) => {
			logger.info(`Connection closed: ${clientKey}`);
			
			if (finalCost && finalCost.cost) {
				const cost = finalCost.cost;
				
				logger.info(`Final Cost: ${cost.formatted.finalCost} (Session: ${finalCost.sessionId})`);
				
				// Log detailed breakdown
				console.log('\n' + '='.repeat(60));
				console.log(`CALL COST BREAKDOWN - Session: ${finalCost.sessionId}`);
				console.log('='.repeat(60));
				console.log(`Duration: ${cost.duration.formatted}`);
				console.log(`Audio Input: ${cost.audio.input.seconds}s ($${cost.audio.input.cost})`);
				console.log(`Audio Output: ${cost.audio.output.seconds}s ($${cost.audio.output.cost})`);
				console.log(`Text Input: ${cost.text.input.tokens} tokens ($${cost.text.input.cost})`);
				console.log(`Text Output: ${cost.text.output.tokens} tokens ($${cost.text.output.cost})`);
				console.log(`Cached Tokens: ${cost.text.cached.tokens} tokens ($${cost.text.cached.cost})`);
				console.log(`Base Cost: $${cost.costs.baseCost}`);
				console.log(`Profit (${(this.config.profitMargin * 100).toFixed(0)}%): $${cost.costs.profitAmount}`);
				console.log(`Final Cost: $${cost.costs.finalCost}`);
				console.log('='.repeat(60) + '\n');
				
				if (connectionData) {
					const tenantId = connectionData.tenantId;
					const callLogId = connectionData.callLogId;
					
					console.log('[DB-UPDATE] Updating call log:', {
						sessionId: finalCost.sessionId,
						callLogId: callLogId,
						tenantId: tenantId,
						hasCallLogger: !!this.callLogger
					});
					
					// Update call log
					if (this.callLogger) {
						const updateData = {
							end_time: new Date(),
							duration_seconds: Math.floor(parseFloat(cost.duration.seconds)),
							audio_input_seconds: cost.audio.input.seconds,
							audio_output_seconds: cost.audio.output.seconds,
							base_cost: parseFloat(cost.costs.baseCost),
							profit_amount: parseFloat(cost.costs.profitAmount),
							final_cost: parseFloat(cost.costs.finalCost),
							status: 'completed'
						};
						
						// Add provider-specific data
						const provider = connectionData.provider || 'openai';
						if (provider === 'openai' || !provider) {
							updateData.text_input_tokens = cost.text.input.tokens;
							updateData.text_output_tokens = cost.text.output.tokens;
							updateData.cached_tokens = cost.text.cached.tokens;
						} else if (provider === 'deepgram') {
							// Get cost metrics from provider
							const providerCost = cost.provider_metrics || {};
							
							updateData.provider_audio_minutes = providerCost.session_minutes || 0;
							
							// Store provider metadata as JSON string
							updateData.provider_metadata = JSON.stringify({
								stt_minutes: providerCost.session_minutes || 0,
								tts_minutes: providerCost.session_minutes || 0,
								llm_calls: 0,
								model: connectionData.deepgram_model || 'nova-2',
								voice: connectionData.deepgram_voice || 'shimmer'
							});
						}
						
						await this.callLogger.updateCallLog(finalCost.sessionId, updateData);
					}
					
					// Deduct credits
					if (this.creditManager && tenantId) {
						await this.creditManager.deductCredits(
							tenantId,
							parseFloat(cost.costs.finalCost),
							callLogId
						);
					}
					
					// Clean up Redis
					if (connectionData.asteriskPort) {
						const redisKey = `transcriptionPort:${connectionData.asteriskPort}`;
						await this.redisClient.del(redisKey);
						logger.info(`Cleaned up Redis key: ${redisKey}`);
					}
				}
			} else {
				// Call ended but no cost data - log as failed
				if (connectionData && this.callLogger) {
					logger.warn(`Call ended without cost data for session: ${connectionData.sessionId}`);
					
					await this.callLogger.updateCallLog(connectionData.sessionId, {
						end_time: new Date(),
						status: 'failed'
					});
				}
			}
			
			this.monitorServer.removeConnection(clientKey);
		});
        
        this.connectionManager.on('error', ({ connection, error }) => {
			if (!error || !error.message) {
				// Suppress undefined/empty errors - these are usually spurious
				return;
			}
			
			const clientKey = connection?.clientKey || 'unknown';
			logger.error(`Connection error for ${clientKey}:`, error.message);
			
			// Handle critical errors
			if (error.message.includes('authentication') || 
				error.message.includes('quota exceeded') ||
				error.message.includes('rate limit')) {
				logger.error(`Critical error - closing connection: ${clientKey}`);
				if (connection && connection.clientKey) {
					this.connectionManager.closeConnection(connection.clientKey);
				}
			}
		});
        
        //this.sessionManager.on('conversationUpdated', ({ sessionId, item }) => {
            //this.monitorServer.updateConversation(sessionId, item);
        //});
    }
    
    /**
     * Register functions dynamically for a specific agent
     */
    async registerAgentFunctions(functions) {
		const tools = [];
		
		if (!functions || functions.length === 0) {
			logger.info('No functions to register');
			return tools;
		}
		
		for (const func of functions) {
			if (!func.is_active) {
				logger.debug(`Skipping inactive function: ${func.name}`);
				continue;
			}
			
			logger.info(`Registering function: ${func.name} (${func.handler_type})`);
			
			// Register handler in executor (for when OpenAI calls it)
			if (func.handler_type === 'api') {
				this.functionExecutor.registerApiFunction(func, {
					execution_mode: func.execution_mode,
					timeout_ms: func.timeout_ms,
					retries: func.retries
				});
			} else if (func.handler_type === 'inline') {
				// Handle built-in transfer function
				if (func.name === 'transfer_to_agent' || func.name === 'transfer_call') {
					this.functionExecutor.registerFunction(func.name, async (args, context) => {
						return await this.transferHandler.transferCall(args, context);
					});
					logger.info(`Registered transfer function: ${func.name}`);
				} else {
					// Placeholder for other inline functions
					this.functionExecutor.registerFunction(func.name, async (args) => {
						logger.warn(`Inline function ${func.name} called but no handler implemented`);
						return {
							success: false,
							message: `Function ${func.name} is configured as inline but has no implementation`
						};
					});
				}
			}
		}
		
		// Return tools from agent config (already formatted by dynamic loader)
		return tools;
	}
	
	/**
	 * Register built-in transfer function for all agents
	 */
	registerBuiltInFunctions() {
		logger.info('Registering built-in transfer_to_agent function...');
		
		// Always register the transfer function
		this.functionExecutor.registerFunction('transfer_to_agent', async (args, context) => {
			return await this.transferHandler.transferCall(args, context);
		});
		
		logger.info('Built-in transfer_to_agent function registered');
	}
    
    startCleanupIntervals() {
        // Clean up stale connections every 5 minutes
        setInterval(() => {
            logger.debug('Running connection cleanup...');
            this.connectionManager.cleanupStaleConnections();
        }, 5 * 60 * 1000);
        
        // Clear agent cache every 10 minutes
        if (this.agentLoader) {
            setInterval(() => {
                logger.debug('Clearing agent cache...');
                this.agentLoader.clearCache();
            }, 10 * 60 * 1000);
        }
    }
    
    async shutdown() {
        logger.info('Shutting down bridge...');
        
        await this.connectionManager.closeAll();
        await this.monitorServer.stop();
        await this.redisClient.disconnect();
        
        logger.info('Bridge shutdown complete');
    }
}

// Main execution
async function main() {
    const bridge = new AsteriskOpenAIBridge();
    
    try {
        await bridge.initialize();
        
        process.on('SIGINT', async () => {
            logger.info('Received SIGINT, shutting down...');
            await bridge.shutdown();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            logger.info('Received SIGTERM, shutting down...');
            await bridge.shutdown();
            process.exit(0);
        });
        
    } catch (error) {
        logger.error('Fatal error:', error);
        process.exit(1);
    }
}

main();