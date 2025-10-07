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
        
        this.agentWs = null;  // Single WebSocket for Deepgram Agent API
        this.sessionId = null;
        this.isConfigured = false;
        this.keepAliveInterval = null;
        
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
                logger.error('Deepgram Agent WebSocket error:', error);
                logger.error('Error details:', {
                    message: error?.message || 'No message',
                    code: error?.code || 'No code',
                    type: typeof error,
                    stack: error?.stack || 'No stack'
                });
                // Don't emit error for connection errors during normal operation
                // These can be spurious and don't affect functionality
            });
            
            this.agentWs.on('close', () => {
                logger.info('Deepgram Agent disconnected');
                this.calculateCost();
                this.cleanup();
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
                break;
                
            case 'UserStartedSpeaking':
                this.emit('speech.started');
                break;
                
            case 'AgentStartedSpeaking':
                this.emit('audio.started');
                break;
                
            case 'AgentAudioDone':
                this.emit('audio.done');
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
                this.emit('error', new Error(message.error || message.message || 'Unknown error'));
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