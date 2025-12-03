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
				isFirstAudioChunk: true,
				audioOutputBytes: 0,
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
				}
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
		
		 if (connection.isClosing) {
			logger.debug(`Connection ${clientKey} already closing, skipping duplicate`);
			return;
		}
		connection.isClosing = true;
		
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
    setupProviderHandlers(connection) {
        const provider = connection.provider;
        const sessionId = connection.sessionId;
        
		provider.on('agent.ready', (event) => {
			logger.info(`Agent ready for ${connection.clientKey}:`, event.agentName);
			this.emit('agentReady', {
				connection: connection,
				agentName: event.agentName,
				sessionId: event.sessionId,
				status: 'ready',
				type: 'status'
			});
		});

        // Speech detection
        provider.on('speech.started', () => {
            this.emit('userSpeechStarted', connection);
            connection.audioQueue.clear();
			connection.isReceivingAudio = false;
			//connection.isFirstAudioChunk = true;
			connection.audioOutputBytes = 0;
        });
        
        provider.on('speech.stopped', () => {
            this.emit('userSpeechStopped', connection);
        });
        
		provider.on('speech.cancelled', () => {
			connection.isReceivingAudio = false;
			connection.audioOutputBytes = 0;
			connection.audioQueue.clear();
			this.emit('agentSpeechStopped', connection);
		});

        // Audio output
        provider.on('audio.delta', (event) => {
			if (!connection.isReceivingAudio) {
				connection.isReceivingAudio = true;
				connection.isFirstAudioChunk = true;
				connection.audioOutputBytes = 0;  // Reset byte counter
				connection.audioQueue.clear();
				console.log(`[CONN-MGR] *** NEW SPEECH *** - Reset audioOutputBytes to 0`);
				this.emit('agentSpeechStarted', connection);
			}
			
			this.handleProviderAudio(connection, event.delta);
		});
        
        provider.on('audio.done', () => {
			if (connection.isReceivingAudio) {
				connection.isReceivingAudio = false;
				connection.isFirstAudioChunk = true;
				connection.audioOutputBytes = 0;  // Reset for next speech
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
        
        // Errors
        provider.on('error', (error) => {
            logger.error(`Provider error for ${connection.clientKey}:`, error);
            this.emit('error', { connection, error });
        });
    }
    
    /**
     * Handle incoming RTP audio
     * UPDATED: Provider-aware audio handling
     */
	
	/*async handleRTPAudio(clientKey, audioData) {
		this.updateConnectionActivity(clientKey);
		
		const connection = this.connections.get(clientKey);
		if (!connection || !connection.provider) {
			return;
		}
		
		if (connection.providerName === 'deepgram') {
			// Buffer µ-law audio exactly like your working bridge
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioData]);
			
			const now = Date.now();
			const targetBufferSize = 2048;  // Match your working bridge
			const bufferInterval = 500;     // Match your working bridge
			
			if (connection.audioBuffer.length >= targetBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= bufferInterval)) {
				
				// Send accumulated µ-law buffer
				await connection.provider.sendAudio(connection.audioBuffer);
				
				connection.audioBuffer = Buffer.alloc(0);
				connection.lastAudioSent = now;
			}
			
		} else if (connection.providerName === 'openai') {
			// OpenAI path (unchanged)
			const pcmBuffer = AudioConverter.convertUlawToPCM16(audioData);
			const resampledBuffer = AudioConverter.resample8to24(pcmBuffer);
			
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, resampledBuffer]);
			
			const now = Date.now();
			if (connection.audioBuffer.length >= this.audioBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= this.audioBufferInterval)) {
				
				await connection.provider.sendAudio(connection.audioBuffer);
				connection.audioBuffer = Buffer.alloc(0);
				connection.lastAudioSent = now;
			}
		}
	}*/
	
	async handleRTPAudio(clientKey, audioData) {
		this.updateConnectionActivity(clientKey);
		
		const connection = this.connections.get(clientKey);
		if (!connection || !connection.provider) {
			return;
		}
		
		if (connection.providerName === 'deepgram') {
			// Deepgram: Buffer µ-law audio
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioData]);
			
			const now = Date.now();
			const targetBufferSize = 2048;
			const bufferInterval = 500;
			
			if (connection.audioBuffer.length >= targetBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= bufferInterval)) {
				await connection.provider.sendAudio(connection.audioBuffer);
				connection.audioBuffer = Buffer.alloc(0);
				connection.lastAudioSent = now;
			}
			
		} else if (connection.providerName === 'custom') {
			// ============================================
			// NEW: Custom provider accepts mulaw directly
			// Soniox STT handles mulaw 8kHz natively
			// ============================================
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, audioData]);
			
			const now = Date.now();
			const targetBufferSize = 1600;  // 100ms of mulaw audio at 8kHz (8000 * 0.1 * 2 bytes)
			const bufferInterval = 100;     // Send at least every 100ms
			
			if (connection.audioBuffer.length >= targetBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= bufferInterval)) {
				
				// Send mulaw directly - no conversion needed!
				await connection.provider.sendAudio(connection.audioBuffer);
				
				connection.audioBuffer = Buffer.alloc(0);
				connection.lastAudioSent = now;
			}
			
		} else if (connection.providerName === 'openai') {
			// OpenAI: Convert µ-law to PCM16, resample 8kHz to 24kHz
			const pcmBuffer = AudioConverter.convertUlawToPCM16(audioData);
			const resampledBuffer = AudioConverter.resample8to24(pcmBuffer);
			
			connection.audioBuffer = Buffer.concat([connection.audioBuffer, resampledBuffer]);
			
			const now = Date.now();
			if (connection.audioBuffer.length >= this.audioBufferSize || 
				(connection.audioBuffer.length > 0 && now - connection.lastAudioSent >= this.audioBufferInterval)) {
				await connection.provider.sendAudio(connection.audioBuffer);
				connection.audioBuffer = Buffer.alloc(0);
				connection.lastAudioSent = now;
			}
		}
	}
    /**
     * Handle provider audio output
     * UPDATED: Provider-aware resampling
     */
    /*handleProviderAudio(connection, audioData) {
		this.updateConnectionActivity(connection.clientKey);
		
		try {
			// Decode base64
			let pcmBuffer;
			if (typeof audioData === 'string') {
				pcmBuffer = Buffer.from(audioData, 'base64');
			} else {
				pcmBuffer = audioData;
			}
			
			// ADD THIS LOG
			//console.log(`[AUDIO-OUT] Received PCM16 24kHz: ${pcmBuffer.length} bytes`);
			
			// Ensure even length
			if (pcmBuffer.length % 2 !== 0) {
				pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from([0])]);
			}
			
			// Resample based on provider output
			let downsampledBuffer;
			if (connection.providerName === 'openai') {
				downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
			} else if (connection.providerName === 'deepgram') {
				downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
			} else {
				downsampledBuffer = pcmBuffer;
			}
			
			// ADD THIS LOG
			//console.log(`[AUDIO-OUT] Resampled to PCM16 8kHz: ${downsampledBuffer.length} bytes`);
			
			// Convert to µ-law for Asterisk
			const ulawBuffer = AudioConverter.convertPCM16ToUlaw(downsampledBuffer);
			
			// ADD THIS LOG
			//console.log(`[AUDIO-OUT] Converted to µ-law: ${ulawBuffer.length} bytes`);
			
			// Add to audio queue for RTP transmission
			connection.audioQueue.addAudio(ulawBuffer);
			
		} catch (error) {
			logger.error('Error processing provider audio:', error);
		}
	}*/
	
	handleProviderAudio(connection, audioData) {
		this.updateConnectionActivity(connection.clientKey);
		
		try {
			// Decode base64
			let pcmBuffer;
			if (typeof audioData === 'string') {
				pcmBuffer = Buffer.from(audioData, 'base64');
			} else {
				pcmBuffer = audioData;
			}
			
			// Ensure even length for PCM16
			if (pcmBuffer.length % 2 !== 0) {
				pcmBuffer = Buffer.concat([pcmBuffer, Buffer.from([0])]);
			}
			
			// Resample based on provider output format
			let downsampledBuffer;
			
			if (connection.providerName === 'custom') {
				// ============================================
				// NEW: Custom provider audio handling
				// 
				// Uplift AI outputs MP3 22kHz - requires decoding
				// Azure TTS outputs PCM16 24kHz - same as OpenAI
				// 
				// For initial integration, use Azure TTS (PCM16 24kHz)
				// or convert MP3 to PCM in the custom provider before emitting
				// ============================================
				
				// Assuming PCM16 24kHz output (from Azure TTS or decoded MP3)
				downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
				
			} else if (connection.providerName === 'openai') {
				// OpenAI outputs PCM16 24kHz
				downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
				
			} else if (connection.providerName === 'deepgram') {
				// Deepgram outputs PCM16 24kHz
				downsampledBuffer = AudioConverter.resample24to8(pcmBuffer);
				
			} else {
				// Unknown provider - assume raw PCM16 8kHz
				downsampledBuffer = pcmBuffer;
			}
			
			const FADE_IN_BYTES = 800;  // 50ms at 8kHz (8000 samples/sec * 0.05 * 2 bytes)
			const startPosition = connection.audioOutputBytes || 0;

			if (startPosition < FADE_IN_BYTES) {
				const numSamples = downsampledBuffer.length / 2;
				let samplesModified = 0;
				
				for (let i = 0; i < numSamples; i++) {
					const bytePosition = startPosition + (i * 2);
					
					if (bytePosition < FADE_IN_BYTES) {
						// Exponential fade curve
						const fadeMultiplier = Math.pow(bytePosition / FADE_IN_BYTES, 2);
						const sample = downsampledBuffer.readInt16LE(i * 2);
						const fadedSample = Math.round(sample * fadeMultiplier);
						downsampledBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, fadedSample)), i * 2);
						samplesModified++;
					}
				}
				
				if (samplesModified > 0) {
					console.log(`[AUDIO-OUT] Fade-in: bytes ${startPosition}-${startPosition + downsampledBuffer.length}, modified ${samplesModified} samples`);
				}
			}

			// Update cumulative byte counter
			connection.audioOutputBytes = (connection.audioOutputBytes || 0) + downsampledBuffer.length;


			// Convert PCM16 to µ-law for Asterisk
			const ulawBuffer = AudioConverter.convertPCM16ToUlaw(downsampledBuffer);
			
			// Add to audio queue for RTP transmission
			connection.audioQueue.addAudio(ulawBuffer);
			
		} catch (error) {
			logger.error('Error processing provider audio:', error);
		}
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
					callerId: connection.callerId,
					asteriskPort: connection.asteriskPort,
					tenantId: connection.tenantId,
					agentId: connection.agentId
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