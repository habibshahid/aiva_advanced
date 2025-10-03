/**
 * Connection Manager - Manages RTP <-> OpenAI connections
 */

const EventEmitter = require('events');
const AudioConverter = require('../audio/audio-converter');
const AudioQueue = require('../audio/audio-queue');
const logger = require('../utils/logger');

class ConnectionManager extends EventEmitter {
    constructor(rtpServer, sessionManager, functionExecutor) {
        super();
        
        this.rtpServer = rtpServer;
        this.sessionManager = sessionManager;
        this.functionExecutor = functionExecutor;
        
        this.connections = new Map();
        
        // Audio buffering config
        this.audioBufferSize = parseInt(process.env.AUDIO_BUFFER_SIZE || '960', 10);
        this.audioBufferInterval = parseInt(process.env.AUDIO_BUFFER_INTERVAL || '100', 10);
    }
    
    /**
     * Create a new connection between RTP client and OpenAI
     */
    async createConnection(clientKey, rtpClient, config = {}) {
        try {
            logger.info(`Creating connection for ${clientKey}`);
            
            // Create OpenAI session
            const session = await this.sessionManager.createSession(clientKey, {
                ...config,
                rtpInfo: {
                    clientKey: clientKey,
                    address: rtpClient.address,
                    port: rtpClient.port
                }
            });
            
            // Create audio queue
            const audioQueue = new AudioQueue(this.rtpServer, clientKey);
            
            // Create connection object
            const connection = {
                clientKey: clientKey,
                sessionId: session.id,
                session: session,
                audioQueue: audioQueue,
                audioBuffer: Buffer.alloc(0),
                lastAudioSent: 0,
                isReceivingAudio: false,
                baseInstructions: config.instructions || ''
            };
            
            this.connections.set(clientKey, connection);
            
            // Set up OpenAI event handlers
            this.setupOpenAIHandlers(connection);
            
            logger.info(`Connection created: ${clientKey}`);
            this.emit('connectionCreated', connection);
            
            return connection;
            
        } catch (error) {
            logger.error(`Failed to create connection for ${clientKey}:`, error);
            throw error;
        }
    }
    
    /**
     * Set up OpenAI client event handlers
     */
    setupOpenAIHandlers(connection) {
        const client = connection.session.client;
        const sessionId = connection.sessionId;
        
        // Speech detection
        client.on('speech.started', () => {
			this.sessionManager.startAudioInput(sessionId);
			
			// ADDED: Update activity timestamp
			const session = this.sessionManager.getSession(sessionId);
			if (session) session.lastActivity = Date.now();
			
			this.emit('userSpeechStarted', connection);
			connection.audioQueue.clear();
		});
		
		client.on('speech.stopped', () => {
			this.sessionManager.stopAudioInput(sessionId);
			
			// ADDED: Update activity timestamp
			const session = this.sessionManager.getSession(sessionId);
			if (session) session.lastActivity = Date.now();
			
			this.emit('userSpeechStopped', connection);
		});
		
		// Audio output
		client.on('audio.delta', (event) => {
			if (!connection.isReceivingAudio) {
				connection.isReceivingAudio = true;
				this.sessionManager.startAudioOutput(sessionId);
				
				// ADDED: Update activity timestamp
				const session = this.sessionManager.getSession(sessionId);
				if (session) session.lastActivity = Date.now();
				
				this.emit('agentSpeechStarted', connection);
			}
			
			// ADDED: Update on every audio chunk
			const session = this.sessionManager.getSession(sessionId);
			if (session) session.lastActivity = Date.now();
			
			this.handleOpenAIAudio(connection, event.delta);
		});
		
		client.on('audio.done', () => {
			if (connection.isReceivingAudio) {
				connection.isReceivingAudio = false;
				this.sessionManager.stopAudioOutput(sessionId);
				
				// ADDED: Update activity timestamp
				const session = this.sessionManager.getSession(sessionId);
				if (session) session.lastActivity = Date.now();
				
				this.emit('agentSpeechStopped', connection);
			}
		});
        
        // Transcripts
        client.on('transcript.user', (event) => {
            this.emit('transcript', {
                connection: connection,
                speaker: 'user',
                text: event.transcript
            });
        });
        
        client.on('transcript.agent', (event) => {
            this.emit('transcript', {
                connection: connection,
                speaker: 'agent',
                text: event.transcript
            });
        });
        
        client.on('response.done', (event) => {
			// Update token usage
			if (event.response?.usage) {
				console.log('[TOKEN-USAGE]', JSON.stringify(event.response.usage, null, 2)); // ADD THIS
				
				this.sessionManager.updateTokenUsage(sessionId, event.response.usage);
				
				// Get and emit cost update
				const cost = this.sessionManager.getCurrentCost(sessionId);
				
				//console.log('[COST-UPDATE]', JSON.stringify(cost, null, 2)); // ADD THIS
				
				this.emit('costUpdate', {
					connection: connection,
					cost: cost
				});
			} else {
				console.log('[TOKEN-USAGE] No usage data in response.done'); // ADD THIS
			}
		});
        
        // Function calls
        client.on('function.call', async (event) => {
			console.log('[FUNCTION-CALL-EVENT] Received:', JSON.stringify(event, null, 2));
            await this.handleFunctionCall(connection, event);
        });
        
        // Errors
        client.on('error', (error) => {
            logger.error(`OpenAI error for ${connection.clientKey}:`, error);
            this.emit('error', { connection, error });
        });
    }
    
    /**
     * Handle incoming RTP audio
     */
    async handleRTPAudio(clientKey, audioData) {
		this.updateConnectionActivity(clientKey); 
		
        const connection = this.connections.get(clientKey);
        if (!connection) {
            logger.warn(`No connection found for ${clientKey}`);
            return;
        }
        
		const session = this.sessionManager.getSession(connection.sessionId);
		if (session) session.lastActivity = Date.now();
	
        const client = connection.session.client;
        if (!client.isConnected) {
            return;
        }
        
        // Convert µ-law to PCM16
        const pcmBuffer = AudioConverter.convertUlawToPCM16(audioData);
        
        // Resample from 8kHz to 16kHz
        const resampledBuffer = AudioConverter.resample8to16(pcmBuffer);
        
        // Add to buffer
        connection.audioBuffer = Buffer.concat([connection.audioBuffer, resampledBuffer]);
        
        // Send when buffer is full or timeout
        const now = Date.now();
        if (connection.audioBuffer.length >= this.audioBufferSize || 
            (connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= this.audioBufferInterval)) {
            
            await client.sendAudio(connection.audioBuffer);
            
            connection.audioBuffer = Buffer.alloc(0);
            connection.lastAudioSent = now;
        }
    }
    
    /**
     * Handle OpenAI audio output
     */
    handleOpenAIAudio(connection, audioData) {
		this.updateConnectionActivity(connection.clientKey);
		
        try {
            // Decode base64
            let pcmBuffer;
            if (typeof audioData === 'string') {
                pcmBuffer = Buffer.from(audioData, 'base64');
            } else {
                pcmBuffer = audioData;
            }
            
            // Ensure even length
            if (pcmBuffer.length % 2 !== 0) {
                pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from([0])]);
            }
            
            // OpenAI sends 24kHz PCM16, convert to 8kHz
            const downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
            
            // Convert to µ-law for Asterisk
            const ulawBuffer = AudioConverter.convertPCM16ToUlaw(downsampledBuffer);
            
            // Add to audio queue for RTP transmission
            connection.audioQueue.addAudio(ulawBuffer);
            
        } catch (error) {
            logger.error('Error processing OpenAI audio:', error);
        }
    }
    
    /**
     * Handle function calls
     */
    async handleFunctionCall(connection, event) {
		const functionName = event.name;
		const callId = event.call_id;
		const args = JSON.parse(event.arguments);
		
		logger.info(`Function call: ${functionName}`, { args });
		
		this.emit('functionCall', {
			connection: connection,
			functionName: functionName,
			callId: callId,
			args: args
		});
		
		// Get function mode
		const functionMode = this.functionExecutor.getFunctionMode(functionName);
		
		if (functionMode === 'async') {
			// ASYNC: Execute in background, respond immediately
			logger.info(`Async function: ${functionName} - responding immediately`);
			
			// Execute in background (don't await)
			this.functionExecutor.execute(functionName, args, {
				sessionId: connection.sessionId,
				clientKey: connection.clientKey,
				callerId: connection.session.callerId
			}).then(result => {
				logger.info(`Async function completed: ${functionName}`, { success: result.success });
			}).catch(error => {
				logger.error(`Async function failed: ${functionName}`, error);
			});
			
			// Send immediate success response
			const quickResponse = {
				success: true,
				data: {
					status: 'processing',
					message: 'Request received and being processed'
				}
			};
			
			await connection.session.client.sendFunctionResponse(callId, quickResponse);
			
			// Trigger response immediately
			setTimeout(() => {
				connection.session.client.createResponse();
			}, 100);
			
		} else {
			// SYNC: Wait for function to complete
			logger.info(`Sync function: ${functionName} - waiting for result`);
			
			try {
				const result = await this.functionExecutor.execute(functionName, args, {
					sessionId: connection.sessionId,
					clientKey: connection.clientKey,
					callerId: connection.session.callerId
				});
				
				// Add result to context
				await this.sessionManager.addFunctionResultToContext(
					connection.sessionId,
					functionName,
					args,
					result,
					connection.baseInstructions
				);
				
				// Send response
				await connection.session.client.sendFunctionResponse(callId, result);
				
				// Trigger response generation
				setTimeout(() => {
					connection.session.client.createResponse();
				}, 100);
				
				this.emit('functionResponse', {
					connection: connection,
					functionName: functionName,
					callId: callId,
					result: result
				});
				
			} catch (error) {
				logger.error(`Sync function failed: ${functionName}`, error);
				
				await connection.session.client.sendFunctionResponse(callId, {
					success: false,
					error: error.message
				});
			}
		}
	}
    
    /**
     * Get connection by client key
     */
    getConnection(clientKey) {
        return this.connections.get(clientKey);
    }
    
    /**
     * Close connection
     */
    async closeConnection(clientKey) {
        const connection = this.connections.get(clientKey);
        if (!connection) {
            return;
        }
        
        try {
            logger.info(`Closing connection: ${clientKey}`);
            
            // Clean up audio queue
            connection.audioQueue.destroy();
            
            // End session
            const finalCost = await this.sessionManager.endSession(connection.sessionId);
            
            // Remove connection
            this.connections.delete(clientKey);
            
            this.emit('connectionClosed', {
                clientKey: clientKey,
                finalCost: finalCost
            });
            
            logger.info(`Connection closed: ${clientKey}`);
            
        } catch (error) {
            logger.error(`Error closing connection ${clientKey}:`, error);
        }
    }
    
    /**
     * Get all active connections
     */
    getActiveConnections() {
        return Array.from(this.connections.values());
    }
    
    /**
     * Cleanup stale connections
     */
    cleanupStaleConnections(timeoutMs = 300000) {
        const now = Date.now();
        const staleConnections = [];
        
        for (const [clientKey, connection] of this.connections.entries()) {
            const lastActivity = connection.session.lastActivity;
            if ((now - lastActivity) > timeoutMs) {
                staleConnections.push(clientKey);
            }
        }
        
        for (const clientKey of staleConnections) {
            logger.warn(`Cleaning up stale connection: ${clientKey}`);
            this.closeConnection(clientKey);
        }
        
        return staleConnections.length;
    }
	
	/**
     * Force End connections
     */
	async forceEndSession(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) return;
		
		logger.info(`Force ending session: ${clientKey}`);
		
		// Stop audio immediately
		connection.audioQueue.clear();
		
		// End session without waiting
		await this.closeConnection(clientKey);
	}
	
	/**
	 * Update connection activity timestamp
	 */
	updateConnectionActivity(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) return;
		
		const session = this.sessionManager.getSession(connection.sessionId);
		if (session) {
			session.lastActivity = Date.now();
		}
	}
}

module.exports = ConnectionManager;