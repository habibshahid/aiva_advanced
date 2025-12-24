/**
 * OpenAI Realtime Client - Direct WebSocket Implementation
 * Since there's no official SDK, we use WebSockets directly
 */

const WebSocket = require('ws');
const https = require('https');
const EventEmitter = require('events');
const logger = require('../utils/logger');

class OpenAIRealtimeClient extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.apiKey = options.apiKey || options.apiKey || process.env.OPENAI_API_KEY;
        this.options = {
            model: options.model || 'gpt-4o-mini-realtime-preview-2024-12-17',
            voice: options.voice || 'shimmer',
            temperature: options.temperature || 0.6,
            maxResponseTokens: options.maxResponseTokens || 200,
            ...options
        };
        
        this.ws = null;
        this.isConnected = false;
        this.sessionId = null;
        this.ephemeralKey = null;
    }
    
    /**
     * Get ephemeral key from OpenAI
     */
    async getEphemeralKey() {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: this.options.model,
                voice: this.options.voice
            });
            
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/realtime/sessions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            throw new Error(`Failed to get ephemeral key: ${res.statusCode} - ${data}`);
                        }
                        
                        const jsonData = JSON.parse(data);
                        if (!jsonData.client_secret || !jsonData.client_secret.value) {
                            throw new Error('No client_secret in response');
                        }
                        
                        resolve(jsonData.client_secret.value);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    /**
     * Connect to OpenAI Realtime API
     */
    async connect() {
        try {
            logger.info('Getting ephemeral key from OpenAI...');
            this.ephemeralKey = await this.getEphemeralKey();
            
            logger.info('Connecting to OpenAI Realtime API...');
            const wsUrl = `wss://api.openai.com/v1/realtime?model=${this.options.model}`;
            
            this.ws = new WebSocket(wsUrl, {
                headers: {
                    'Authorization': `Bearer ${this.ephemeralKey}`,
                    'OpenAI-Beta': 'realtime=v1'
                }
            });
            
            this.setupEventListeners();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);
                
                this.ws.once('open', () => {
                    clearTimeout(timeout);
                    this.isConnected = true;
                    logger.info('Connected to OpenAI Realtime API');
                    this.emit('connected');
                    resolve(true);
                });
                
                this.ws.once('error', (error) => {
                    clearTimeout(timeout);
                    reject(error);
                });
            });
            
        } catch (error) {
            logger.error('Failed to connect to OpenAI:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Set up event listeners for WebSocket
     */
    setupEventListeners() {
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (error) {
                logger.error('Error parsing message:', error);
            }
        });
        
        this.ws.on('close', (code, reason) => {
			this.isConnected = false;
			this.sessionId = null;
			logger.info(`Disconnected from OpenAI - Code: ${code}, Reason: ${reason || 'No reason provided'}`);
			this.emit('disconnected', { code, reason });
		})
        
        this.ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            this.emit('error', error);
        });
    }
    
    /**
     * Handle incoming messages
     */
    handleMessage(message) {
		//console.log(`[OPENAI-MESSAGE] Type: ${message.type}`);
		
        switch (message.type) {
            case 'session.created':
                this.sessionId = message.session.id;
                logger.info(`OpenAI session created: ${this.sessionId}`);
                this.emit('session.created', message);
                break;
                
            case 'session.updated':
                logger.debug('Session updated');
                this.emit('session.updated', message);
                break;
                
            case 'input_audio_buffer.speech_started':
                this.emit('speech.started', message);
                break;
                
            case 'input_audio_buffer.speech_stopped':
                this.emit('speech.stopped', message);
                break;
                
            case 'response.audio.delta':
                this.emit('audio.delta', message);
                break;
                
            case 'response.audio.done':
                this.emit('audio.done', message);
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                this.emit('transcript.user', message);
                break;
                
            case 'response.audio_transcript.delta':
                this.emit('transcript.agent.delta', message);
                break;
                
            case 'response.audio_transcript.done':
                this.emit('transcript.agent', message);
                break;
                
            case 'response.created':
                this.emit('response.created', message);
                break;
                
            case 'response.done':
                this.emit('response.done', message);
                break;
                
            case 'response.function_call_arguments.done':
				console.log('[FUNCTION-CALL] Received from OpenAI:', JSON.stringify(message, null, 2));
                this.emit('function.call', message);
                break;
                
            case 'error':
                logger.error('OpenAI error:', JSON.stringify(message.error || message, null, 2));
				this.emit('error', message.error || message);
                break;
                
            default:
                // Ignore other message types
                break;
        }
    }
    
    /**
     * Configure session with instructions and tools
     */
    async configureSession(instructions, tools = [], language = 'ur') {
        if (!this.isConnected || !this.ws) {
            throw new Error('Not connected to OpenAI');
        }
		
		console.log('[SESSION-CONFIG] Tools being sent:', tools.length);
		console.log('[SESSION-CONFIG] Tool names:', tools.map(t => t.name));
    
        try {
            const config = {
                type: 'session.update',
                session: {
                    modalities: ['text', 'audio'],
                    instructions: instructions,
                    voice: this.options.voice,
                    input_audio_format: 'pcm16',
                    output_audio_format: 'pcm16',
                    input_audio_transcription: {
                        model: 'whisper-1',
						language: language
                    },
                    turn_detection: {
                        type: 'server_vad',
                        threshold: parseFloat(process.env.VAD_THRESHOLD || '0.5'),
                        prefix_padding_ms: 300,
                        silence_duration_ms: parseInt(process.env.SILENCE_DURATION_MS || '500'),
                        create_response: true
                    },
                    tools: tools,
                    max_response_output_tokens: this.options.maxResponseTokens,
                    temperature: this.options.temperature
                }
            };
            
			//console.log('[SESSION-CONFIG] Full config:', JSON.stringify(config, null, 2));
			
            this.ws.send(JSON.stringify(config));
            logger.info('Session configured successfully');
            return true;
            
        } catch (error) {
            logger.error('Failed to configure session:', error);
            throw error;
        }
    }
    
    /**
     * Send audio to OpenAI
     */
    async sendAudio(audioData) {
        if (!this.isConnected || !this.ws) {
            logger.warn('Cannot send audio: not connected');
            return false;
        }
        
        try {
            const base64Audio = Buffer.isBuffer(audioData) 
                ? audioData.toString('base64')
                : audioData;
            
            this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64Audio
            }));
            
            return true;
            
        } catch (error) {
            logger.error('Error sending audio:', error);
            return false;
        }
    }
    
    /**
     * Send function response
     */
    async sendFunctionResponse(callId, output) {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(output)
                }
            }));
            
            logger.debug(`Function response sent for call: ${callId}`);
            return true;
            
        } catch (error) {
            logger.error('Error sending function response:', error);
            return false;
        }
    }
    
    /**
     * Trigger response generation
     */
    async createResponse() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'response.create'
            }));
            return true;
        } catch (error) {
            logger.error('Error creating response:', error);
            return false;
        }
    }
    
    /**
     * Cancel current response
     */
    async cancelResponse() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'response.cancel'
            }));
            logger.debug('Response cancelled');
            return true;
        } catch (error) {
            logger.error('Error cancelling response:', error);
            return false;
        }
    }
    
    /**
     * Clear input audio buffer
     */
    async clearInputBuffer() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'input_audio_buffer.clear'
            }));
            logger.debug('Input buffer cleared');
            return true;
        } catch (error) {
            logger.error('Error clearing buffer:', error);
            return false;
        }
    }
    
    /**
     * Update session instructions dynamically
     */
    async updateInstructions(newInstructions) {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'session.update',
                session: {
                    instructions: newInstructions
                }
            }));
            
            logger.info('Instructions updated');
            return true;
            
        } catch (error) {
            logger.error('Error updating instructions:', error);
            return false;
        }
    }
    
    /**
     * Disconnect from OpenAI
     */
    async disconnect() {
        if (this.ws && this.isConnected) {
            try {
                this.ws.close();
                this.isConnected = false;
                this.sessionId = null;
                logger.info('Disconnected from OpenAI');
            } catch (error) {
                logger.error('Error disconnecting:', error);
            }
        }
    }
    
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            sessionId: this.sessionId,
            model: this.options.model
        };
    }
}

module.exports = OpenAIRealtimeClient;