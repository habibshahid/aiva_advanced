/**
 * Deepgram Provider - Using Deepgram Agent API V1
 * Based on working bridge-deepgram.js implementation
 */

const BaseProvider = require('./base-provider');
const WebSocket = require('ws');
const logger = require('../utils/logger');

class DeepgramProvider extends BaseProvider {
    constructor(config) {
        super(config);
        
        this.agentWs = null;
		this.sessionId = null;
		this.isConfigured = false;
		this.keepAliveInterval = null;
		this.comfortNoiseInterval = null; // ADD THIS
		this.lastAudioSent = 0; // ADD THIS
        
        // Audio metrics for cost calculation
        this.audioMetrics = {
            stt_minutes: 0,
            tts_minutes: 0,
            start_time: null
        };
        
        // Agent configuration
        this.agentConfig = null;
    }
    
    async connect() {
        try {
            // Connect to Deepgram Agent API (V1)
            await this.connectAgentAPI();
            
            this.isConnected = true;
            logger.info('Deepgram Agent API connected');
            
            return true;
            
        } catch (error) {
            logger.error('Failed to connect Deepgram Agent:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    async connectAgentAPI() {
        // Deepgram Agent API V1 endpoint
        const wsUrl = 'wss://agent.deepgram.com/v1/agent/converse';
        
        this.agentWs = new WebSocket(wsUrl, {
            headers: {
                'Authorization': `token ${this.config.apiKey}`
            }
        });
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Agent API connection timeout'));
            }, 10000);
            
            this.agentWs.on('open', () => {
                clearTimeout(timeout);
                logger.info('Deepgram Agent WebSocket opened');
                this.audioMetrics.start_time = Date.now();
                resolve();
            });
            
            this.agentWs.on('message', (data) => {
                this.handleAgentMessage(data);
            });
            
            this.agentWs.on('error', (error) => {
				// CRITICAL FIX: WebSocket 'error' events are often spurious in Deepgram
				// They fire during normal operation and don't indicate real problems
				// Only log and investigate, but DON'T emit or crash the connection
				
				if (error) {
					logger.debug('Deepgram WebSocket error event (likely spurious):', {
						message: error?.message || 'No message',
						code: error?.code || 'No code',
						type: typeof error
					});
				} else {
					logger.debug('Deepgram WebSocket error event with undefined error (spurious)');
				}
				
				// DO NOT EMIT - These are normal during Deepgram operation
				// DO NOT close connection - It's still working fine
			});

			this.agentWs.on('close', (code, reason) => {
				const reasonStr = reason?.toString() || 'No reason';
				
				logger.info('Deepgram Agent WebSocket closed', { 
					code, 
					reason: reasonStr
				});
				
				// DON'T cleanup or mark as disconnected immediately
				// Let the connection manager decide what to do
				
				// Only handle truly abnormal closures
				if (code && code !== 1000 && code !== 1001 && code !== 1006) {
					logger.warn(`Abnormal Deepgram WebSocket closure: ${code} - ${reasonStr}`);
					
					// Only NOW mark as disconnected for real errors
					this.calculateCost();
					this.cleanup();
					this.isConnected = false;
					this.isConfigured = false;
					
					//this.emit('disconnected', { code, reason: reasonStr });
				} else {
					logger.info('Normal Deepgram WebSocket closure - maintaining connection state');
					// DO NOT set isConnected = false or isConfigured = false
				}
			});
        });
    }
    
    async configureSession(agentConfig) {
		if (!this.isConnected) {
			throw new Error('Provider not connected');
		}
		
		this.agentConfig = agentConfig;
		this.sessionId = agentConfig.sessionId || `dg_${Date.now()}`;
		
		logger.info('Configuring Deepgram Agent...', agentConfig);
		
		const voice = this.config.voice || agentConfig.deepgram_voice || 'shimmer';
		const language = this.config.language || agentConfig.deepgram_language || agentConfig.language || 'en';
		const sttModel = this.config.model || agentConfig.deepgram_model || 'nova-2';
		
		logger.info(`Configuring Deepgram with voice: ${voice}, language: ${language}, STT model: ${sttModel}`);
		
		// Determine TTS provider based on voice selection
		const isOpenAIVoice = [
			'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 
			'shimmer', 'verse', 'marin', 'cedar'
		].includes(voice);
		
		const isDeepgramVoice = voice.startsWith('aura-');

		let speakConfig;
		
		if (isOpenAIVoice) {
			// Use OpenAI TTS
			logger.info(`Using OpenAI TTS with voice: ${voice}`);
			speakConfig = {
				provider: {
					type: "open_ai",
					model: "gpt-4o-mini-tts",
					voice: voice
				},
				endpoint: {
					url: "https://api.openai.com/v1/audio/speech",
					headers: {
						authorization: `Bearer ${process.env.OPENAI_API_KEY}`
					}
				}
			};
		} else if (isDeepgramVoice) {
			// Use Deepgram Aura TTS
			logger.info(`Using Deepgram Aura TTS with voice: ${voice}`);
			speakConfig = {
				provider: {
					type: "deepgram",
					model: voice
				}
			};
		} else {
			// Default to OpenAI with shimmer
			logger.warn(`Unknown voice: ${voice}, defaulting to OpenAI shimmer`);
			speakConfig = {
				provider: {
					type: "open_ai",
					model: "gpt-4o-mini-tts",
					voice: "shimmer"
				},
				endpoint: {
					url: "https://api.openai.com/v1/audio/speech",
					headers: {
						authorization: `Bearer ${process.env.OPENAI_API_KEY}`
					}
				}
			};
		}		
		
		// Create the V1 configuration message (matching working implementation)
		const configMessage = {
			type: "Settings",
			audio: {
				input: {
					encoding: "mulaw",
					sample_rate: 8000,
				},
				output: {
					encoding: "linear16",
					sample_rate: 24000,
					container: "none",
				},
			},
			agent: {
				listen: { 
					provider: { 
						type: "deepgram", 
						model: sttModel
					} 
				},
				speak: speakConfig,
				greeting: agentConfig.greeting || null,
				think: {
					provider: {
						type: "open_ai",
						model: "gpt-4o-mini",
					},
					prompt: agentConfig.instructions,
					functions: agentConfig.functions || []
				},
			},
		};
		
		// CRITICAL: Wait for SettingsApplied before returning
		// This matches the working server-deepgram.js implementation
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				logger.error('Timeout waiting for SettingsApplied');
				reject(new Error('Timeout waiting for Deepgram Agent configuration'));
			}, 10000);
			
			// Set up one-time listener for SettingsApplied
			const handleSettingsApplied = (data) => {
				try {
					// Check if this is binary data or JSON
					if (Buffer.isBuffer(data)) {
						if (data.length > 0 && data[0] === 123) { // '{' character
							data = data.toString();
						} else {
							return; // Binary audio, ignore
						}
					}
					
					const message = typeof data === 'string' ? JSON.parse(data) : data;
					
					if (message.type === 'SettingsApplied') {
						clearTimeout(timeout);
						
						// NOW set isConfigured to true
						this.isConfigured = true;
						
						// Remove this one-time listener
						this.agentWs.removeListener('message', handleSettingsApplied);
						
						// Start keepalive AFTER configuration is confirmed
						this.startKeepalive();
						
						// Emit ready event for connection manager
						this.emit('agent.ready', {
							sessionId: this.sessionId,
							agentName: this.agentConfig?.name || 'Voice Agent'
						});
						
						resolve(true);
					} else if (message.type === 'Error') {
						clearTimeout(timeout);
						logger.error('Error configuring Deepgram Agent:', message);
						this.agentWs.removeListener('message', handleSettingsApplied);
						reject(new Error(message.error || 'Unknown error configuring agent'));
					}
				} catch (error) {
					// Don't reject on parse errors, might be unrelated messages
					logger.debug('Error in settings handler:', error);
				}
			};
			
			// Add the listener
			this.agentWs.on('message', handleSettingsApplied);
			
			// Send configuration message
			this.agentWs.send(JSON.stringify(configMessage));
			
			logger.info('Deepgram Agent configuration sent, waiting for confirmation...');
		});
	}
    
    startKeepalive() {
		this.keepAliveInterval = setInterval(() => {
			if (this.agentWs && this.agentWs.readyState === WebSocket.OPEN) {
				try {
					console.log('SENDING KEEPALIVE');
					//this.agentWs.send(JSON.stringify({ type: "AgentKeepAlive" }));
				} catch (err) {
					logger.error('Error sending keepalive:', err);
				}
			}
		}, 5000);
		
		// ALSO start sending comfort noise to prevent timeout
		this.startComfortNoise();
	}

	/**
	 * Send comfort noise to keep Deepgram connection alive
	 * Deepgram requires audio data, not just KeepAlive messages
	 */
	startComfortNoise() {
		// Create a buffer of µ-law silence (0xFF is silence in µ-law)
		const silenceBuffer = Buffer.alloc(160, 0xFF);
		
		this.comfortNoiseInterval = setInterval(() => {
			if (this.agentWs && this.agentWs.readyState === WebSocket.OPEN) {
				// Only send comfort noise if we haven't sent real audio recently
				const timeSinceLastAudio = Date.now() - (this.lastAudioSent || 0);
				
				// If no audio sent in last 2 seconds, send silence
				if (timeSinceLastAudio > 2000) {
					try {
						this.agentWs.send(silenceBuffer);
						logger.debug('[DEEPGRAM] Sent comfort noise to prevent timeout');
					} catch (err) {
						logger.error('Error sending comfort noise:', err);
					}
				}
			}
		}, 500); // Send every 2 seconds if needed
	}
    
    async sendAudio(audioData) {
		if (!this.isConnected) {
			console.log('[DEEPGRAM] Not connected, cannot send audio');
			return false;
		}
		
		if (!this.agentWs) {
			console.log('[DEEPGRAM] No WebSocket, cannot send audio');
			return false;
		}
		
		const wsState = this.agentWs.readyState;
		if (wsState !== 1) { // 1 = OPEN
			console.log(`[DEEPGRAM] WebSocket not open (state: ${wsState}), cannot send audio`);
			return false;
		}
		
		try {
			// Send raw µ-law audio directly
			this.agentWs.send(audioData);
			
			// ADD THIS: Track when we sent audio
			this.lastAudioSent = Date.now();
			
			// Log periodically to confirm audio is flowing
			if (!this.audioSendCount) this.audioSendCount = 0;
			this.audioSendCount++;
			
			if (this.audioSendCount % 50 === 0) {
				console.log(`[DEEPGRAM] ✓ Sent ${this.audioSendCount} audio packets`);
			}
			
			return true;
			
		} catch (error) {
			logger.error('[DEEPGRAM] Error sending audio:', error.message);
			return false;
		}
	}
    
	stopSpeaking() {
		if (!this.agentWs || this.agentWs.readyState !== WebSocket.OPEN) {
			return false;
		}
		
		try {
			// Send stop message to Deepgram
			this.agentWs.send(JSON.stringify({
				type: 'StopSpeaking'
			}));
			
			logger.info('Sent StopSpeaking command to Deepgram');
			return true;
			
		} catch (error) {
			logger.error('Error stopping speech:', error);
			return false;
		}
	}
	
    handleAgentMessage(data) {
        try {
            // Check if this is binary audio data or JSON
            if (Buffer.isBuffer(data)) {
                // Check if it might be JSON (starts with '{')
                if (data.length > 0 && data[0] === 123) { // 123 is '{'
                    const jsonStr = data.toString();
                    try {
                        const message = JSON.parse(jsonStr);
                        this.handleJsonMessage(message);
                        return;
                    } catch (e) {
                        // Not JSON, treat as audio
                    }
                }
                
                // Binary audio data - emit as base64
                this.emit('audio.delta', {
                    delta: data.toString('base64')
                });
            } 
            else if (data instanceof ArrayBuffer) {
                const audioBuffer = Buffer.from(data);
                this.emit('audio.delta', {
                    delta: audioBuffer.toString('base64')
                });
            }
            else if (typeof data === 'string') {
                try {
                    const message = JSON.parse(data);
                    this.handleJsonMessage(message);
                } catch (error) {
                    logger.error('Error parsing JSON message:', error);
                }
            }
            
        } catch (error) {
            logger.error('Error handling Agent message:', error);
        }
    }
    
    handleJsonMessage(message) {
		// Log all messages for debugging
		//logger.info('Deepgram message:', { type: message.type, data: message });
		
		switch (message.type) {
			case 'SettingsApplied':
				logger.info('Deepgram agent settings applied successfully');
				this.isConfigured = true;
				
				// Emit ready event to notify connection manager
				this.emit('agent.ready', {
					sessionId: this.sessionId,
					agentName: this.agentConfig?.name || 'Voice Agent',						
					status: 'ready',
					type: 'status'
				});
				break;
				
			case 'UserStartedSpeaking':
				// CHANGE FROM: this.emit('speech.started');
				// TO:
				this.emit('user_started_speaking'); // ✓ CORRECT
				logger.info('User started speaking - emitting interruption event');
				break;
				
			case 'AgentStartedSpeaking':
				// CHANGE FROM: this.emit('audio.started');
				// TO:
				this.emit('agent_started_speaking'); // ✓ CORRECT
				logger.info('Agent started speaking');
				break;
				
			case 'AgentAudioDone':
				// CHANGE FROM: this.emit('audio.done');
				// TO:
				this.emit('agent_audio_done'); // ✓ CORRECT
				logger.info('Agent audio done');
				break;
				
			case 'ConversationText':
				if (message.role === 'user') {
					this.emit('transcript.user', {
						transcript: message.content || message.text
					});
				} else if (message.role === 'assistant' || message.speaker === 'agent') {
					this.emit('transcript.agent', {
						transcript: message.content || message.text
					});
				}
				break;
				
			case 'FunctionCallRequest':
				if (message.functions && message.functions.length > 0) {
					message.functions.forEach(func => {
						this.emit('function.call', {
							call_id: func.id,
							name: func.name,
							arguments: func.arguments
						});
					});
				}
				break;
				
			case 'Error':
				logger.error('Deepgram Agent error message:', {
					error: message.error,
					message: message.message,
					description: message.description,
					full: message
				});
				//this.emit('error', new Error(message.error || message.message || 'Unknown error'));
				break;
				
			default:
				logger.debug('Unhandled message type:', message.type);
		}
	}
    
    async sendFunctionResponse(callId, result) {
        if (!this.agentWs || this.agentWs.readyState !== WebSocket.OPEN) {
            logger.warn('Cannot send function response - not connected');
            return false;
        }
        
        try {
            const response = {
                type: 'FunctionCallResponse',
                id: callId,
                name: result.name || 'unknown',
                content: JSON.stringify(result)
            };
            
            this.agentWs.send(JSON.stringify(response));
            logger.info(`Function response sent for call: ${callId}`);
            return true;
            
        } catch (error) {
            logger.error('Error sending function response:', error);
            return false;
        }
    }
    
    cleanup() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
		
		if (this.comfortNoiseInterval) {
			clearInterval(this.comfortNoiseInterval);
			this.comfortNoiseInterval = null;
		}
    }
    
    async disconnect() {
        this.cleanup();
        
        if (this.agentWs) {
            try {
                if (this.agentWs.readyState === WebSocket.OPEN) {
                    this.agentWs.send(JSON.stringify({
                        type: 'EndSession'
                    }));
                }
                this.agentWs.close();
            } catch (error) {
                logger.error('Error closing Deepgram Agent connection:', error);
            }
            this.agentWs = null;
        }
        
        this.isConnected = false;
        this.isConfigured = false;
    }
    
    getProviderName() {
        return 'deepgram';
    }
    
    getCostMetrics() {
        // Calculate session duration
        const duration = this.audioMetrics.start_time 
            ? (Date.now() - this.audioMetrics.start_time) / 60000 
            : 0;
        
        // Deepgram Agent pricing (example rates)
        const agentCostPerMinute = 0.0195; // Approximate combined cost
        
        const baseCost = duration * agentCostPerMinute;
        
        return {
            provider: 'deepgram',
            session_minutes: duration,
            base_cost: baseCost,
            breakdown: {
                agent: baseCost
            },
            // For compatibility with existing cost tracking
            input_audio_seconds: duration * 60,
            output_audio_seconds: duration * 60,
            input_tokens: 0,
            output_tokens: 0,
            cached_tokens: 0
        };
    }
    
    calculateCost() {
        if (this.audioMetrics.start_time) {
            const duration = (Date.now() - this.audioMetrics.start_time) / 60000;
            this.audioMetrics.stt_minutes = duration;
            this.audioMetrics.tts_minutes = duration;
        }
    }
}

module.exports = DeepgramProvider;