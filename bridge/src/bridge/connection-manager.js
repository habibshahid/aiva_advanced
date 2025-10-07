/**
 * Connection Manager - Manages RTP <-> Provider connections
 * UPDATED to support multiple providers via factory pattern
 */

const EventEmitter = require('events');
const AudioConverter = require('../audio/audio-converter');
const AudioQueue = require('../audio/audio-queue');
const ProviderFactory = require('../providers/provider-factory');
const logger = require('../utils/logger');

class ConnectionManager extends EventEmitter {
    constructor(rtpServer, functionExecutor, profitMargin) {
        super();
        
		this.rtpServer = rtpServer;
		this.functionExecutor = functionExecutor;
		this.profitMargin = profitMargin;
		
		this.connections = new Map();
        
        // Audio buffering config
        this.audioBufferSize = parseInt(process.env.AUDIO_BUFFER_SIZE || '960', 10);
        this.audioBufferInterval = parseInt(process.env.AUDIO_BUFFER_INTERVAL || '100', 10);
    }
    
	getConnection(clientKey) {
		return this.connections.get(clientKey);
	}

	getActiveConnections() {
		return Array.from(this.connections.values());
	}

	cleanupStaleConnections(timeoutMs = 300000) {
		const now = Date.now();
		const staleConnections = [];
		
		for (const [clientKey, connection] of this.connections.entries()) {
			const lastActivity = connection.lastActivity || connection.startTime;
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
     * Create a new connection between RTP client and Provider (OpenAI or Deepgram)
     * UPDATED: Now uses provider factory
     */
    async createConnection(clientKey, rtpClient, config = {}) {
		try {
			logger.info(`Creating connection for ${clientKey} with provider: ${config.provider || 'openai'}`);
			
			const sessionId = config.sessionId || clientKey;
			
			// Validate provider config
			const validation = ProviderFactory.validateProviderConfig(
				config.provider || 'openai',
				config
			);
			
			if (!validation.valid) {
				throw new Error(`Provider validation failed: ${validation.errors.join(', ')}`);
			}
			
			// Create provider instance using factory
			const provider = ProviderFactory.createProvider(config, {
				sessionId: sessionId,
				clientKey: clientKey
			});
			
			// Connect to provider
			await provider.connect();
			
			// Configure session with agent settings
			await provider.configureSession({
				sessionId: sessionId,
				instructions: config.instructions || '',
				greeting: config.greeting || null,
				functions: config.functions || [],
				language: config.language || 'en'
			});
			
			// Create audio queue
			const audioQueue = new AudioQueue(this.rtpServer, clientKey);
			
			// Create connection object
			const connection = {
				clientKey: clientKey,
				sessionId: sessionId,
				provider: provider,
				providerName: provider.getProviderName(),
				audioQueue: audioQueue,
				audioBuffer: Buffer.alloc(0),
				lastAudioSent: Date.now(),
				isReceivingAudio: false,
				baseInstructions: config.instructions || '',
				agentId: config.agentId,
				tenantId: config.tenantId,
				callerId: config.callerId,
				asteriskPort: config.asteriskPort,
				startTime: Date.now(),  // ADD THIS LINE
				// Store client for backward compatibility
				session: {
					client: provider.client,
					callerId: config.callerId
				},
				audioInterrupted: false,
				isPlayingAudio: false,
				userSpeaking: false
			};
			
			this.connections.set(clientKey, connection);
			
			// Set up provider event handlers
			this.setupProviderHandlers(connection);
			
			logger.info(`Connection created: ${clientKey} using ${connection.providerName} provider`);
			this.emit('connectionCreated', connection);
			
			return connection;
			
		} catch (error) {
			logger.error(`Failed to create connection for ${clientKey}:`, error);
			throw error;
		}
	}
    
	formatDuration(seconds) {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		
		if (hours > 0) {
			return `${hours}h ${minutes}m ${secs}s`;
		} else if (minutes > 0) {
			return `${minutes}m ${secs}s`;
		} else {
			return `${secs}s`;
		}
	}

	async closeConnection(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) {
			return;
		}
		
		try {
			logger.info(`Closing connection for ${clientKey} (${connection.providerName})`);
			
			const connectionData = {
				sessionId: connection.sessionId,
				tenantId: connection.tenantId,
				agentId: connection.agentId,
				callLogId: connection.callLogId,
				callerId: connection.callerId,
				asteriskPort: connection.asteriskPort,
				provider: connection.providerName
			};
			
			// Calculate duration
			const duration = Math.floor((Date.now() - connection.startTime) / 1000);
			
			// Get cost metrics from provider
			let finalCost = null;
			try {
				if (connection.provider && typeof connection.provider.getCostMetrics === 'function') {
					const costMetrics = connection.provider.getCostMetrics();
					
					// Calculate costs with profit margin
					const baseCost = costMetrics.base_cost;
					const profitAmount = baseCost * this.profitMargin;
					const finalCostAmount = baseCost + profitAmount;
					
					// Format cost data for compatibility
					finalCost = {
						sessionId: connection.sessionId,
						cost: {
							duration: {
								seconds: duration,
								formatted: this.formatDuration(duration)
							},
							audio: {
								input: {
									seconds: costMetrics.input_audio_seconds || 0,
									cost: (costMetrics.breakdown?.input_audio || 0).toFixed(6)
								},
								output: {
									seconds: costMetrics.output_audio_seconds || 0,
									cost: (costMetrics.breakdown?.output_audio || 0).toFixed(6)
								}
							},
							text: {
								input: {
									tokens: costMetrics.input_tokens || 0,
									cost: (costMetrics.breakdown?.input_tokens || 0).toFixed(6)
								},
								output: {
									tokens: costMetrics.output_tokens || 0,
									cost: (costMetrics.breakdown?.output_tokens || 0).toFixed(6)
								},
								cached: {
									tokens: costMetrics.cached_tokens || 0,
									cost: '0.000000'
								}
							},
							costs: {
								baseCost: baseCost.toFixed(6),
								profitAmount: profitAmount.toFixed(6),
								finalCost: finalCostAmount.toFixed(6)
							},
							formatted: {
								finalCost: '$' + finalCostAmount.toFixed(4)
							}
						}
					};
					
					connectionData.metrics = costMetrics;
				}
			} catch (costError) {
				logger.error('Error getting cost metrics:', costError);
			}
			
			// Clean up audio queue
			if (connection.audioQueue && typeof connection.audioQueue.destroy === 'function') {
				connection.audioQueue.destroy();
			}
			
			// Disconnect provider
			if (connection.provider && typeof connection.provider.disconnect === 'function') {
				await connection.provider.disconnect();
			}
			
			// Remove connection
			this.connections.delete(clientKey);
			
			// Emit connection closed event
			this.emit('connectionClosed', {
				clientKey: clientKey,
				finalCost: finalCost,
				connectionData: connectionData
			});
			
			logger.info(`Connection closed: ${clientKey}`);
			
		} catch (error) {
			logger.error(`Error closing connection ${clientKey}:`, error);
			this.connections.delete(clientKey);
		}
	}

    /**
	 * Set up provider event handlers
	 * UPDATED: Works with any provider (OpenAI or Deepgram)
	 */
	/*setupProviderHandlers(connection) {
		const provider = connection.provider;
		const sessionId = connection.sessionId;
		const clientKey = connection.clientKey;
		
		// Speech detection
		provider.on('speech.started', () => {
			this.emit('userSpeechStarted', connection);
			connection.audioQueue.clear();
		});
		
		provider.on('speech.stopped', () => {
			this.emit('userSpeechStopped', connection);
		});
		
		// Audio output - FIXED TO HANDLE BOTH OPENAI AND DEEPGRAM
		provider.on('audio.delta', (event) => {
			if (!connection.isReceivingAudio) {
				connection.isReceivingAudio = true;
				
				// For Deepgram, also set isPlayingAudio to block STT
				if (connection.providerName === 'deepgram') {
					connection.isPlayingAudio = true;
				}
				
				this.emit('agentSpeechStarted', connection);
			}
			
			// Handle different event structures...
			let audioData;
			if (event && event.delta) {
				audioData = event.delta;
			} else if (typeof event === 'string') {
				audioData = event;
			} else if (Buffer.isBuffer(event)) {
				audioData = event;
			} else {
				console.error('[AUDIO-DELTA] Unknown event structure:', typeof event);
				return;
			}
			
			this.handleProviderAudio(connection, audioData);
		});

		provider.on('audio.done', () => {
			if (connection.isReceivingAudio) {
				connection.isReceivingAudio = false;
				
				// For Deepgram, reset isPlayingAudio to allow STT again
				if (connection.providerName === 'deepgram') {
					connection.isPlayingAudio = false;
				}
				
				this.emit('agentSpeechStopped', connection);
			}
		});
		
		// Transcripts
		provider.on('transcript.user', (event) => {
			this.emit('transcript', {
				connection: connection,
				speaker: 'user',
				text: event.transcript || event.text
			});
		});
		
		provider.on('transcript.agent', (event) => {
			this.emit('transcript', {
				connection: connection,
				speaker: 'agent',
				text: event.transcript || event.text
			});
		});
		
		// Token usage / cost updates
		provider.on('response.done', (event) => {
			// Get cost from provider
			if (connection.provider && typeof connection.provider.getCostMetrics === 'function') {
				const cost = connection.provider.getCostMetrics();
				this.emit('costUpdate', {
					connection: connection,
					cost: cost
				});
			}
		});
		
		// Function calls
		provider.on('function.call', async (event) => {
			logger.info(`Function call from ${connection.providerName}:`, event.name);
			await this.handleFunctionCall(connection, event);
		});
		
		// Errors
		provider.on('error', (error) => {
			logger.error(`Provider error for ${connection.clientKey}:`, error);
			this.emit('error', { connection, error });
		});
		
		// ========================================
		// DEEPGRAM-SPECIFIC EVENT HANDLERS
		// ========================================
		if (connection.providerName === 'deepgram') {
			logger.info(`Setting up Deepgram-specific event handlers for ${clientKey}`);
			
			// User started speaking (for interruption handling)
			provider.on('user_started_speaking', () => {
				logger.info(`[DEEPGRAM-EVENT] User started speaking: ${clientKey}`);
				this.handleUserInterruption(clientKey);
			});
			
			// Agent started speaking (reset interruption state)
			provider.on('agent_started_speaking', () => {
				logger.info(`[DEEPGRAM-EVENT] Agent started speaking: ${clientKey}`);
				this.handleAgentStartedSpeaking(clientKey);
			});
			
			// Agent finished speaking
			provider.on('agent_audio_done', () => {
				logger.info(`[DEEPGRAM-EVENT] Agent audio done: ${clientKey}`);
				this.handleAgentAudioDone(clientKey);
			});
		}
	}*/
	
	setupProviderHandlers(connection) {
		const provider = connection.provider;
		const sessionId = connection.sessionId;
		
		// Speech detection
		provider.on('speech.started', () => {
			logger.info('User started speaking');
			this.emit('userSpeechStarted', connection);
			// Don't clear audio queue here - this is for user speech detection
		});
		
		provider.on('speech.stopped', () => {
			this.emit('userSpeechStopped', connection);
		});
		
		// Audio output
		provider.on('audio.delta', (event) => {
			if (!connection.isReceivingAudio) {
				connection.isReceivingAudio = true;
				this.emit('agentSpeechStarted', connection);
				// Clear outbound audio queue when agent starts speaking
				connection.audioQueue.clear();
			}
			
			this.handleProviderAudio(connection, event.delta);
		});
		
		provider.on('audio.done', () => {
			if (connection.isReceivingAudio) {
				connection.isReceivingAudio = false;
				this.emit('agentSpeechStopped', connection);
			}
		});
		
		// Transcripts
		provider.on('transcript.user', (event) => {
			this.emit('transcript', {
				connection: connection,
				speaker: 'user',
				text: event.transcript
			});
		});
		
		provider.on('transcript.agent', (event) => {
			this.emit('transcript', {
				connection: connection,
				speaker: 'agent',
				text: event.transcript
			});
		});
		
		// Token usage / cost updates
		provider.on('response.done', (event) => {
			// Get cost from provider
			if (connection.provider && typeof connection.provider.getCostMetrics === 'function') {
				const cost = connection.provider.getCostMetrics();
				this.emit('costUpdate', {
					connection: connection,
					cost: cost
				});
			}
		});
		
		// Function calls
		provider.on('function.call', async (event) => {
			logger.info(`Function call from ${connection.providerName}:`, event.name);
			await this.handleFunctionCall(connection, event);
		});
		
		// Errors - IMPROVED ERROR HANDLING
		provider.on('error', (error) => {
			console.log('#################')
			//logger.error(`Provider error for ${connection.clientKey}:`, error);  // THIS LINE logs "undefined"
			//this.emit('error', { connection, error });  // THIS LINE logs "Provider error for..."
		});
	}
	
	
    
    /**
     * Handle incoming RTP audio
     * UPDATED: Provider-aware audio handling
     */
    /*async handleRTPAudio(clientKey, audioData) {
		this.updateConnectionActivity(clientKey);
		
		const connection = this.connections.get(clientKey);

		if (!connection) {
			//console.log('[AUDIO] No connection found for', clientKey);
			return;
		}
		
		// Temporarily skip the connection check
		//console.log('[AUDIO] Received', audioData.length, 'bytes');
		
		// Convert µ-law to PCM16
		const pcmBuffer = AudioConverter.convertUlawToPCM16(audioData);
		
		// Resample from 8kHz to 24kHz
		const resampledBuffer = AudioConverter.resample8to24(pcmBuffer);
		
		// Add to buffer
		connection.audioBuffer = Buffer.concat([connection.audioBuffer, resampledBuffer]);
		
		// Send when buffer is full or timeout
		const now = Date.now();
		if (connection.audioBuffer.length >= this.audioBufferSize || 
			(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= this.audioBufferInterval)) {
			
			//console.log('[AUDIO] Sending to provider:', connection.audioBuffer.length, 'bytes');
			
			try {
				await connection.provider.sendAudio(connection.audioBuffer);
				//console.log('[AUDIO] Successfully sent');
			} catch (error) {
				//console.error('[AUDIO] Send failed:', error.message);
			}
			
			connection.audioBuffer = Buffer.alloc(0);
			connection.lastAudioSent = now;
		}
	}*/
	
	/**
	 * DEBUG PATCH - Add to connection-manager.js
	 * This will show us exactly where audio is getting stuck
	 * 
	 * Add these logs to the handleRTPAudio method
	 */

	// File: bridge/src/bridge/connection-manager.js
	// Location: handleRTPAudio method (around line 90)

	async handleRTPAudio(clientKey, audioData) {
		this.updateConnectionActivity(clientKey);
		
		// DEBUG: Log incoming audio
		console.log(`[DEBUG-IN] Received ${audioData.length} bytes for ${clientKey}`);
		
		const connection = this.connections.get(clientKey);
		if (!connection || !connection.provider) {
			console.log(`[DEBUG-IN] NO CONNECTION or PROVIDER for ${clientKey}`);
			return;
		}
		
		console.log(`[DEBUG-IN] Provider: ${connection.providerName}, Connected: ${connection.provider.isConnected}`);
		
		if (connection.providerName === 'deepgram') {
			// Buffer µ-law audio
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioData]);
			
			console.log(`[DEBUG-IN] Buffer size: ${connection.audioBuffer.length}`);
			
			const now = Date.now();
			const targetBufferSize = 640;
			const bufferInterval = 100;
			
			if (connection.audioBuffer.length >= targetBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= bufferInterval)) {
				
				console.log(`[DEBUG-IN] SENDING ${connection.audioBuffer.length} bytes to Deepgram`);
				
				try {
					const sent = await connection.provider.sendAudio(connection.audioBuffer);
					console.log(`[DEBUG-IN] Send result: ${sent}`);
					
					if (sent) {
						connection.audioBuffer = Buffer.alloc(0);
						connection.lastAudioSent = now;
					} else {
						console.log(`[DEBUG-IN] SEND FAILED - WebSocket state:`, connection.provider.agentWs?.readyState);
					}
				} catch (error) {
					console.log(`[DEBUG-IN] SEND ERROR:`, error.message);
					connection.audioBuffer = Buffer.alloc(0);
					connection.lastAudioSent = now;
				}
			} else {
				console.log(`[DEBUG-IN] Buffering... (need ${targetBufferSize - connection.audioBuffer.length} more bytes)`);
			}
			
		} else if (connection.providerName === 'openai') {
			// OpenAI path
			console.log(`[DEBUG-IN] OpenAI provider - converting audio`);
			const pcmBuffer = AudioConverter.convertUlawToPCM16(audioData);
			const resampledBuffer = AudioConverter.resample8to24(pcmBuffer);
			
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, resampledBuffer]);
			
			const now = Date.now();
			if (connection.audioBuffer.length >= this.audioBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= this.audioBufferInterval)) {
				
				try {
					await connection.provider.sendAudio(connection.audioBuffer);
					connection.audioBuffer = Buffer.alloc(0);
					connection.lastAudioSent = now;
				} catch (error) {
					console.log(`[DEBUG-IN] OpenAI send error:`, error.message);
					connection.audioBuffer = Buffer.alloc(0);
					connection.lastAudioSent = now;
				}
			}
		}
	}
    
    /**
	 * Handle provider audio output
	 * UPDATED: Provider-specific resampling with better error handling
	 */
	handleProviderAudio(connection, audioData) {
		this.updateConnectionActivity(connection.clientKey);
		
		try {
			// Validate audio data
			if (!audioData) {
				console.error('[AUDIO-OUT] Received undefined audio data');
				return;
			}
			
			// Decode base64 if needed
			let pcmBuffer;
			if (typeof audioData === 'string') {
				pcmBuffer = Buffer.from(audioData, 'base64');
			} else if (Buffer.isBuffer(audioData)) {
				pcmBuffer = audioData;
			} else {
				console.error('[AUDIO-OUT] Unknown audio data type:', typeof audioData);
				return;
			}
			
			// Validate buffer
			if (!pcmBuffer || pcmBuffer.length === 0) {
				console.error('[AUDIO-OUT] Empty audio buffer');
				return;
			}
			
			console.log(`[AUDIO-OUT] Received PCM16 24kHz: ${pcmBuffer.length} bytes`);
			
			// Ensure even length
			if (pcmBuffer.length % 2 !== 0) {
				pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from([0])]);
			}
			
			// USE SIMPLE RESAMPLER FOR BOTH (it's faster)
			const downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
			
			console.log(`[AUDIO-OUT] Resampled to PCM16 8kHz: ${downsampledBuffer.length} bytes`);
			
			// Convert to µ-law for Asterisk
			const ulawBuffer = AudioConverter.convertPCM16ToUlaw(downsampledBuffer);
			
			console.log(`[AUDIO-OUT] Converted to µ-law: ${ulawBuffer.length} bytes`);
			
			// Check if audio is interrupted (Deepgram only)
			if (connection.providerName === 'deepgram' && connection.audioInterrupted) {
				console.log(`[AUDIO-OUT] Audio interrupted for ${connection.clientKey}, discarding buffer`);
				return;
			}
			
			// Add to audio queue for RTP transmission
			connection.audioQueue.addAudio(ulawBuffer);
			
		} catch (error) {
			logger.error('Error processing provider audio:', error);
			console.error('[AUDIO-OUT] Stack trace:', error.stack);
		}
	}
    
	/**
	 * Handle user interruption - Deepgram only
	 * Prevents audio packet conflicts during user speech
	 */
	handleUserInterruption(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) return;
		
		// Only handle for Deepgram (OpenAI has native VAD)
		if (connection.providerName !== 'deepgram') {
			return;
		}
		
		console.log(`[INTERRUPTION] User interrupted for ${clientKey} - stopping TTS and clearing queue`);
		
		// Mark audio as interrupted
		connection.audioInterrupted = true;
		connection.isPlayingAudio = false;
		connection.userSpeaking = true;
		
		// CRITICAL: Stop Deepgram TTS from generating more audio
		if (connection.provider && typeof connection.provider.stopSpeaking === 'function') {
			connection.provider.stopSpeaking();
		}
		
		// Clear the audio queue immediately
		connection.audioQueue.clear();
		
		this.emit('userInterruption', { connection });
	}

	/**
	* Reset interruption state when agent starts speaking - Deepgram only
	 */
	handleAgentStartedSpeaking(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) return;
		
		// Only handle for Deepgram
		if (connection.providerName !== 'deepgram') {
			return;
		}
		
		console.log(`[AGENT-SPEAKING] Agent started for ${clientKey} - blocking STT input`);
		
		// CRITICAL: Set this BEFORE audio starts playing
		connection.audioInterrupted = false;
		connection.isPlayingAudio = true;  // Block STT input
		connection.userSpeaking = false;
		
		this.emit('agentStartedSpeaking', { connection });
	}

	/**
	 * Handle agent finished speaking - Deepgram only
	 */
	handleAgentAudioDone(clientKey) {
		const connection = this.connections.get(clientKey);
		if (!connection) return;
		
		// Only handle for Deepgram
		if (connection.providerName !== 'deepgram') {
			return;
		}
		
		console.log(`[AGENT-DONE] Agent finished for ${clientKey}`);
		
		// Mark audio as not playing (but don't reset interruption state)
		connection.isPlayingAudio = false;
		
		this.emit('agentAudioDone', { connection });
	}

    /**
     * Handle function calls
     * UNCHANGED: Works with any provider
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
            
            this.functionExecutor.execute(functionName, args, {
                sessionId: connection.sessionId,
                clientKey: connection.clientKey,
                callerId: connection.callerId
            }).then(result => {
                logger.info(`Async function ${functionName} completed:`, result);
            }).catch(error => {
                logger.error(`Async function ${functionName} failed:`, error);
            });
            
            // Respond immediately
            await connection.provider.sendFunctionResponse(callId, {
                status: 'processing',
                message: 'Request received and being processed'
            });
            
        } else {
            // SYNC: Wait for execution
            try {
                const result = await this.functionExecutor.execute(functionName, args, {
                    sessionId: connection.sessionId,
                    clientKey: connection.clientKey,
                    callerId: connection.callerId
                });
                
                logger.info(`Function ${functionName} result:`, result);
                
                await connection.provider.sendFunctionResponse(callId, result);
                
                this.emit('functionResponse', {
                    connection: connection,
                    functionName: functionName,
                    callId: callId,
                    result: result
                });
                
            } catch (error) {
                logger.error(`Function ${functionName} error:`, error);
                
                await connection.provider.sendFunctionResponse(callId, {
                    error: true,
                    message: error.message
                });
            }
        }
    }
    
    updateConnectionActivity(clientKey) {
		const connection = this.connections.get(clientKey);
		if (connection) {
			connection.lastActivity = Date.now();
		}
	}
}

module.exports = ConnectionManager;