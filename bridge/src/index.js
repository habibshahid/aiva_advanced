/**
 * Main Application Entry Point
 * Asterisk to OpenAI Realtime API Bridge with Official SDK
 */

require('dotenv').config();

const RtpUdpServer = require('./audio/rtp-server');
const SessionManager = require('./openai/session-manager');
const FunctionExecutor = require('./functions/function-executor');
const FunctionRegistry = require('./functions/function-registry');
const ConnectionManager = require('./bridge/connection-manager');
const MonitorServer = require('./monitoring/monitor-server');
const RedisClient = require('./utils/redis-client');
const AgentLoader = require('./config/agent-loader');
const openaiConfig = require('./config/openai-config');
const logger = require('./utils/logger');

const DynamicAgentLoader = require('./integration/dynamic-loader');
const CreditManager = require('./integration/credit-manager');
const CallLogger = require('./integration/call-logger');

class AsteriskOpenAIBridge {
    constructor() {
        this.config = {
            rtpHost: process.env.RTP_HOST || '127.0.0.1:9999',
            monitorPort: parseInt(process.env.MONITOR_PORT || '3001'),
            debug: process.env.DEBUG === 'true',
            ...openaiConfig,
			managementApiUrl: process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api',
            managementApiKey: process.env.MANAGEMENT_API_KEY,
            dynamicMode: process.env.DYNAMIC_MODE === 'true'
        };
        
        // Validate API key
        if (!this.config.apiKey) {
            throw new Error('OPENAI_API_KEY is required');
        }
        
        logger.info('Initializing Asterisk-OpenAI Bridge...');
        logger.info(`Mode: ${this.config.dynamicMode ? 'DYNAMIC' : 'STATIC'}`);
        logger.info(`Configuration:`, {
            rtpHost: this.config.rtpHost,
            model: this.config.model,
            voice: this.config.voice,
            agentType: this.config.agentType
        });
    }
    
    async initialize() {
        try {
            // Initialize Redis
            logger.info('Connecting to Redis...');
            this.redisClient = new RedisClient({});
            await this.redisClient.connect();
            
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
            } else {
                // Fallback to static loading
                logger.info('Using static agent configuration...');
                const AgentLoader = require('./config/agent-loader');
                this.agentLoader = new AgentLoader();
                this.agentConfig = this.agentLoader.loadAgent(this.config.agentType);
            }
			 
            // Initialize function executor and registry
            logger.info('Initializing function system...');
            this.functionExecutor = new FunctionExecutor();
            this.functionRegistry = new FunctionRegistry();
            this.functionRegistry.registerAll(
                this.functionExecutor, 
                this.redisClient.getClient()
            );
            
            // Initialize session manager
            logger.info('Initializing session manager...');
            this.sessionManager = new SessionManager(
                this.config.apiKey,
                this.config.profitMargin
            );
            
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
                this.sessionManager,
                this.functionExecutor
            );
            
            // Initialize monitor server
            logger.info('Initializing monitor server...');
            this.monitorServer = new MonitorServer(this.config.monitorPort);
            await this.monitorServer.start();
            
            // Set up event handlers
            this.setupEventHandlers();
            
            // Start cleanup intervals
            this.startCleanupIntervals();
            
            logger.info('='.repeat(60));
            logger.info('Asterisk-OpenAI Bridge initialized successfully!');
            logger.info(`Mode: ${this.config.dynamicMode ? 'DYNAMIC' : 'STATIC'}`);
            logger.info(`RTP Server: ${this.config.rtpHost}`);
            logger.info(`Monitor: http://localhost:${this.config.monitorPort}/`);
            if (this.config.dynamicMode) {
                logger.info(`Management API: ${this.config.managementApiUrl}`);
            } else {
                logger.info(`Agent: ${this.agentConfig.name}`);
            }
            logger.info(`Model: ${this.config.model}`);
            logger.info('='.repeat(60));
            
        } catch (error) {
            logger.error('Failed to initialize bridge:', error);
            throw error;
        }
    }
    
    setupEventHandlers() {
        // RTP Server Events
        this.rtpServer.on('client', async (client) => {
            const clientKey = `${client.address}:${client.port}`;
            logger.info(`New RTP client: ${clientKey}`);
            
			try {
                // Get session info from Redis
                const redisKey = `transcriptionPort:${client.port}`;
                const callInfo = await this.redisClient.hGetAll(redisKey);
                
                const sessionId = callInfo?.sessionId || this.generateFallbackSessionId();
                const callerNumber = callInfo?.callerId || 'unknown';
                
                logger.info(`Session ID: ${sessionId}, Caller: ${callerNumber}`);
                
                // NEW: Determine tenant ID (you need to implement this based on your routing)
                const tenantId = await this.resolveTenantId(callerNumber, callInfo);
                
                // NEW: Check credits in dynamic mode
                if (this.config.dynamicMode && this.creditManager) {
                    const creditCheck = await this.creditManager.checkCredits(tenantId);
                    
                    if (!creditCheck.allowed) {
                        logger.warn(`Call rejected: Insufficient credits for tenant ${tenantId}`);
                        // TODO: Play "insufficient credits" message to caller
                        return;
                    }
                }
                
                // NEW: Load agent dynamically
                let agentConfig;
                if (this.config.dynamicMode) {
                    agentConfig = await this.agentLoader.getAgent(tenantId, 'sales');
                } else {
                    agentConfig = this.agentConfig;
                }
                
                // Create connection
                const connection = await this.connectionManager.createConnection(
                    clientKey,
                    client,
                    {
                        sessionId: sessionId,
                        model: agentConfig.config?.model || this.config.model,
                        voice: agentConfig.config?.voice || this.config.voice,
                        temperature: agentConfig.config?.temperature || this.config.temperature,
                        maxResponseTokens: agentConfig.config?.maxTokens || this.config.maxResponseTokens,
                        instructions: agentConfig.instructions,
                        callerId: callerNumber,
                        asteriskPort: client.port,
                        tenantId: tenantId,
                        agentId: agentConfig.id
                    }
                );
                
                // NEW: Create call log
                if (this.config.dynamicMode && this.callLogger) {
                    connection.callLogId = await this.callLogger.createCallLog(
                        sessionId,
                        tenantId,
                        agentConfig.id,
                        callerNumber,
                        client.port
                    );
                }
                
                // Configure session
                const tools = agentConfig.tools || [];
                await this.sessionManager.configureSession(
                    connection.sessionId,
                    agentConfig.instructions,
                    tools
                );
                
                // Add to monitor
                this.monitorServer.addConnection(clientKey, {
                    sessionId: sessionId,
                    rtpInfo: connection.session.rtpInfo,
                    callerId: connection.session.callerId,
                    agentName: agentConfig.name,
                    tenantId: tenantId
                });
                
                // Trigger initial greeting
                setTimeout(() => {
                    connection.session.client.createResponse();
                }, 500);
                
            } catch (error) {
                logger.error(`Error creating connection for ${clientKey}:`, error);
            }
			
            /*try {
                // Get caller info from Redis if available
                const callerInfo = await this.redisClient.hGetAll(`transcriptionPort:${client.port}`);
                
                // Create connection
                const connection = await this.connectionManager.createConnection(
                    clientKey,
                    client,
                    {
                        model: this.config.model,
                        voice: this.config.voice,
                        temperature: this.config.temperature,
                        maxResponseTokens: this.config.maxResponseTokens,
                        instructions: this.agentConfig.instructions,
                        callerId: callerInfo?.callerId || 'unknown'
                    }
                );
                
                // Configure session
                const tools = this.functionRegistry.getOpenAIFunctions();
				console.log('[TOOLS-REGISTERED]', JSON.stringify(tools, null, 2));

                await this.sessionManager.configureSession(
                    connection.sessionId,
                    this.agentConfig.instructions,
                    tools
                );
                
                // Add to monitor
                this.monitorServer.addConnection(clientKey, {
                    rtpInfo: connection.session.rtpInfo,
                    callerId: connection.session.callerId,
                    agentName: this.agentConfig.name
                });
                
                // Trigger initial greeting after configuration
                setTimeout(() => {
                    connection.session.client.createResponse();
                }, 500);
                
            } catch (error) {
                logger.error(`Error creating connection for ${clientKey}:`, error);
            }*/
        });
        
        this.rtpServer.on('audio', async (data) => {
            await this.connectionManager.handleRTPAudio(data.client, data.buffer);
        });
        
        this.rtpServer.on('clientDisconnected', (client) => {
            const clientKey = `${client.address}:${client.port}`;
            logger.info(`RTP client disconnected: ${clientKey}`);
            //this.connectionManager.closeConnection(clientKey);
			
			// Force immediate cleanup
			this.connectionManager.forceEndSession(clientKey).catch(err => {
				logger.error(`Error force ending session: ${err}`);
			});
        });
        
        // Connection Manager Events
        this.connectionManager.on('userSpeechStarted', (connection) => {
            this.monitorServer.updateConnection(connection.clientKey, {
                userSpeaking: true
            });
        });
        
        this.connectionManager.on('userSpeechStopped', (connection) => {
            this.monitorServer.updateConnection(connection.clientKey, {
                userSpeaking: false
            });
        });
        
        this.connectionManager.on('agentSpeechStarted', (connection) => {
            this.monitorServer.updateConnection(connection.clientKey, {
                agentSpeaking: true
            });
        });
        
        this.connectionManager.on('agentSpeechStopped', (connection) => {
            this.monitorServer.updateConnection(connection.clientKey, {
                agentSpeaking: false
            });
        });
        
        this.connectionManager.on('transcript', ({ connection, speaker, text }) => {
            logger.info(`[${speaker.toUpperCase()}] ${text}`);
            this.monitorServer.broadcastTranscript(connection.clientKey, speaker, text);
        });
        
        this.connectionManager.on('costUpdate', ({ connection, cost }) => {
            logger.debug(`Cost update for ${connection.clientKey}: ${cost.formatted.finalCost}`);
            this.monitorServer.broadcastCostUpdate(connection.clientKey, cost);
        });
        
        this.connectionManager.on('functionCall', ({ connection, functionName, callId, args }) => {
            logger.info(`Function call: ${functionName}`, { args });
            this.monitorServer.broadcastFunctionCall(connection.clientKey, functionName, args);
        });
        
        this.connectionManager.on('functionResponse', ({ connection, functionName, result }) => {
            logger.info(`Function response: ${functionName}`, { success: result.success });
            this.monitorServer.broadcastFunctionResponse(connection.clientKey, functionName, result);
        });
        
        this.connectionManager.on('connectionClosed', async ({ clientKey, finalCost }) => {
			logger.info(`Connection closed: ${clientKey}`);
			
			if (finalCost && finalCost.cost) {
				const cost = finalCost.cost;
				
				// Log summary
				logger.info(`Final Cost: ${cost.formatted.finalCost} (Base: ${cost.formatted.baseCost} + Profit: ${cost.formatted.profitAmount})`);
				
				// Log detailed breakdown
				console.log('\n' + '='.repeat(60));
				console.log('CALL COST BREAKDOWN');
				console.log('='.repeat(60));
				console.log(`Duration: ${cost.duration.formatted}`);
				console.log(`Session ID: ${finalCost.sessionId}`);
				console.log('');
				console.log('AUDIO COSTS:');
				console.log(`  Input:  ${cost.audio.input.formatted} @ $${(cost.audio.input.costPerSecond * 60).toFixed(3)}/min → ${cost.formatted.audioCost.split('$')[0]}$${cost.audio.input.cost.toFixed(4)}`);
				console.log(`  Output: ${cost.audio.output.formatted} @ $${(cost.audio.output.costPerSecond * 60).toFixed(3)}/min → $${cost.audio.output.cost.toFixed(4)}`);
				console.log(`  Total Audio: ${cost.breakdown.audioCost} (${cost.breakdown.audioPercentage})`);
				console.log('');
				console.log('TEXT COSTS:');
				console.log(`  Input:  ${cost.text.input.tokens} tokens → $${cost.text.input.cost.toFixed(6)}`);
				console.log(`  Output: ${cost.text.output.tokens} tokens → $${cost.text.output.cost.toFixed(6)}`);
				console.log(`  Cached: ${cost.text.cached.tokens} tokens → $${cost.text.cached.cost.toFixed(6)}`);
				console.log(`  Total Text: ${cost.breakdown.textCost} (${cost.breakdown.textPercentage})`);
				console.log('');
				console.log('FINAL COST:');
				console.log(`  Base Cost:     ${cost.formatted.baseCost}`);
				console.log(`  Profit (${cost.costs.profitMargin}):  ${cost.formatted.profitAmount}`);
				console.log(`  Total Cost:    ${cost.formatted.finalCost}`);
				console.log(`  Cost per min:  ${cost.formatted.costPerMinute}`);
				console.log(`  Cost per hour: ${cost.formatted.costPerHour}`);
				console.log('='.repeat(60) + '\n');
				
				const connection = this.connectionManager.getConnection(clientKey);
                if (connection && this.config.dynamicMode) {
                    // Update call log
                    if (this.callLogger) {
                        await this.callLogger.updateCallLog(finalCost.sessionId, {
                            end_time: new Date(),
                            duration_seconds: Math.floor(parseFloat(cost.duration.seconds)),
                            audio_input_seconds: cost.audio.input.seconds,
                            audio_output_seconds: cost.audio.output.seconds,
                            text_input_tokens: cost.text.input.tokens,
                            text_output_tokens: cost.text.output.tokens,
                            cached_tokens: cost.text.cached.tokens,
                            base_cost: cost.costs.baseCost,
                            profit_amount: cost.costs.profitAmount,
                            final_cost: parseFloat(cost.costs.finalCost),
                            status: 'completed'
                        });
                    }
                    
                    // Deduct credits
                    if (this.creditManager && connection.session.config.tenantId) {
                        await this.creditManager.deductCredits(
                            connection.session.config.tenantId,
                            parseFloat(cost.costs.finalCost),
                            connection.callLogId
                        );
                    }
                }
                
                // Clean up Redis
                if (connection && connection.session.config.asteriskPort) {
                    const redisKey = `transcriptionPort:${connection.session.config.asteriskPort}`;
                    await this.redisClient.del(redisKey);
                }
				
			}
			
			this.monitorServer.removeConnection(clientKey);
		});
        
        this.connectionManager.on('error', ({ connection, error }) => {
            logger.error(`Connection error for ${connection.clientKey}:`, error);
        });
    }
    
	/**
     * Resolve tenant ID from caller information
     * Override this method to implement your tenant routing logic
     */
    async resolveTenantId(callerNumber, callInfo) {
        // Option 1: DID mapping (query API)
        // Option 2: Caller number mapping
        // Option 3: Redis lookup
        // Option 4: Default tenant
        
        // For now, return a default tenant ID
        // You'll need to implement proper routing
        return process.env.DEFAULT_TENANT_ID || 'default-tenant';
    }
	
    startCleanupIntervals() {
        // Cleanup stale connections every 30 seconds
        setInterval(() => {
            const cleaned = this.connectionManager.cleanupStaleConnections(
                this.config.sessionTimeout
            );
            if (cleaned > 0) {
                logger.info(`Cleaned up ${cleaned} stale connections`);
            }
        }, 30000);
        
        // Cleanup stale sessions every 30 seconds
        setInterval(() => {
            const cleaned = this.sessionManager.cleanupStaleSessions(
                this.config.sessionTimeout
            );
            if (cleaned > 0) {
                logger.info(`Cleaned up ${cleaned} stale sessions`);
            }
        }, 30000);
    }
    
	generateFallbackSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `fallback_${timestamp}_${random}`;
    }
	
    async shutdown() {
        logger.info('Shutting down bridge...');
        
        try {
            // Close all connections
            const connections = this.connectionManager.getActiveConnections();
            for (const connection of connections) {
                await this.connectionManager.closeConnection(connection.clientKey);
            }
            
            // Close RTP server
            if (this.rtpServer) {
                this.rtpServer.close();
            }
            
            // Disconnect Redis
            if (this.redisClient) {
                await this.redisClient.disconnect();
            }
            
            logger.info('Shutdown complete');
            
        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
    }
}

// Main execution
async function main() {
    const bridge = new AsteriskOpenAIBridge();
    
    try {
        await bridge.initialize();
        
        // Handle graceful shutdown
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

// Start the application
main();