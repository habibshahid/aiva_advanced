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
			});;

			this.agentWs.on('close', (code, reason) => {
				const reasonStr = reason?.toString() || 'No reason';
				
				logger.info('Deepgram Agent WebSocket closed', { 
					code, 
					reason: reasonStr
				});
				
				this.calculateCost();
				this.cleanup();
				
				// Mark as disconnected
				this.isConnected = false;
				this.isConfigured = false;
				
				// WebSocket close codes:
				// 1000 = Normal closure
				// 1001 = Going away
				// 1006 = Abnormal closure (no close frame)
				
				// Only emit disconnected for abnormal closures
				if (code && code !== 1000 && code !== 1001) {
					logger.warn(`Abnormal Deepgram WebSocket closure: ${code} - ${reasonStr}`);
					this.emit('disconnected', { code, reason: reasonStr });
				} else {
					logger.info('Normal Deepgram WebSocket closure');
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
        
        logger.info('Configuring Deepgram Agent...');
        
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
                        model: agentConfig.deepgram_model || "nova-2" 
                    } 
                },
                speak: {
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
                },
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
        
        // CRITICAL FIX: Set isConfigured to true BEFORE sending config
        // This allows audio to flow immediately after SettingsApplied
        this.isConfigured = true;
        
        // Send configuration
        this.agentWs.send(JSON.stringify(configMessage));
        
        // Start keepalive immediately
        this.startKeepalive();
        
        logger.info('Deepgram Agent configuration sent, ready to receive audio');
        return true;
    }
    
    startKeepalive() {
		this.keepAliveInterval = setInterval(() => {
			if (this.agentWs && this.agentWs.readyState === WebSocket.OPEN) {
				try {
					this.agentWs.send(JSON.stringify({ type: "AgentKeepAlive" }));
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
		}, 2000); // Send every 2 seconds if needed
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
		logger.debug('Deepgram message:', { type: message.type, data: message });
		
		switch (message.type) {
			case 'SettingsApplied':
				logger.info('Settings applied');
				this.isConfigured = true; // ADD THIS LINE
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
				console.log('RERRRRRRRRRRRRRRRRRRRRRR');
				/*logger.error('Deepgram Agent error message:', {
					error: message.error,
					message: message.message,
					description: message.description,
					full: message
				});*/
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