/**
 * Pipecat Provider
 * 
 * Connects to external Pipecat Python service via WebSocket.
 * Pipecat is a Python framework for building voice AI pipelines.
 * 
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────────┐
 * │                      PipecatProvider                             │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  Asterisk RTP (mulaw) ──► WebSocket ──► Pipecat Python Service  │
 * │       ▲                                        │                 │
 * │       │                           ┌────────────┴────────────┐    │
 * │       │                           ▼                         ▼    │
 * │       │                    STT (Deepgram/      LLM (OpenAI/     │
 * │       │                     Whisper)           Anthropic)       │
 * │       │                           │                         │    │
 * │       │                           └────────────┬────────────┘    │
 * │       │                                        ▼                 │
 * │       │                                   TTS (ElevenLabs/       │
 * │       │                                    Cartesia/PlayHT)      │
 * │       │                                        │                 │
 * │       └──────────── Audio Output ◄─────────────┘                 │
 * └──────────────────────────────────────────────────────────────────┘
 */

const BaseProvider = require('./base-provider');
const WebSocket = require('ws');
const logger = require('../utils/logger');

class PipecatProvider extends BaseProvider {
    constructor(config) {
        super(config);
        
        this.ws = null;
        this.sessionId = null;
        this.isConfigured = false;
        this.agentConfig = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectDelay = 1000;
        this.pingInterval = null;
        this.pendingFunctionCalls = new Map();
        
        // Pipecat service endpoint
        this.serviceUrl = config.pipecatUrl || 
                          process.env.PIPECAT_SERVICE_URL || 
                          'ws://localhost:8765';
        
        // Audio format configuration
        this.inputFormat = config.inputFormat || 'mulaw_8000';  // From Asterisk
        this.outputFormat = config.outputFormat || 'pcm16_24000';  // From Pipecat
        
        // Cost tracking
        this.costMetrics = {
            stt_seconds: 0,
            tts_seconds: 0,
            tts_characters: 0,
            llm_tokens: { input: 0, output: 0 },
            start_time: null
        };
        
        // Provider-specific settings (passed to Pipecat service)
        this.pipecatConfig = {
            stt_provider: config.sttProvider || 'deepgram',
            llm_provider: config.llmProvider || 'openai',
            tts_provider: config.ttsProvider || 'cartesia',
            stt_model: config.sttModel || (config.sttProvider === 'soniox' ? 'stt-rt-preview' : 
                               config.sttProvider === 'deepgram' ? 'nova-2' : 
                               config.sttProvider === 'whisper' ? 'whisper-1' : 'nova-2'),
            llm_model: config.llmModel || 'gpt-4o-mini',
            tts_voice: config.ttsVoice || null,
            vad_enabled: config.vadEnabled !== false,
            vad_threshold: config.vadThreshold || 0.5,
            interruption_enabled: config.interruptionEnabled !== false,
            silence_timeout_ms: config.silenceTimeoutMs || 700,
            language: config.language || 'en'
        };
    }
    
    /**
     * Connect to Pipecat WebSocket service
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Pipecat connection timeout'));
            }, 15000);
            
            logger.info(`Connecting to Pipecat service: ${this.serviceUrl}`);
            
            this.ws = new WebSocket(this.serviceUrl, {
                headers: {
                    'X-Service-Key': process.env.PIPECAT_SERVICE_KEY || ''
                }
            });
            
            this.ws.on('open', () => {
                clearTimeout(timeout);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.costMetrics.start_time = Date.now();
                logger.info('Connected to Pipecat service');
                
                this.setupMessageHandlers();
                this.startPingInterval();
                
                resolve(true);
            });
            
            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                logger.error('Pipecat connection error:', error.message);
                this.emit('error', error);
                reject(error);
            });
            
            this.ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                this.stopPingInterval();
                this.isConnected = false;
                this.isConfigured = false;
                
                const reasonStr = reason?.toString() || 'Unknown';
                logger.info(`Pipecat disconnected: code=${code}, reason=${reasonStr}`);
                
                this.emit('disconnected', { code, reason: reasonStr });
                
                // Attempt reconnection for unexpected closes
                if (code !== 1000 && code !== 1001 && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.attemptReconnect();
                }
            });
        });
    }
    
    /**
     * Attempt to reconnect to Pipecat service
     */
    async attemptReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        logger.info(`Attempting Pipecat reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(async () => {
            try {
                await this.connect();
                
                // Re-configure session if we had one
                if (this.agentConfig) {
                    await this.configureSession(this.agentConfig);
                }
            } catch (error) {
                logger.error('Pipecat reconnect failed:', error.message);
            }
        }, delay);
    }
    
    /**
     * Set up WebSocket message handlers
     */
    setupMessageHandlers() {
        this.ws.on('message', (data) => {
            // Check if binary audio data
            if (Buffer.isBuffer(data) && !this.isJsonMessage(data)) {
                this.handleAudioData(data);
                return;
            }
            
            // Parse JSON message
            try {
                const message = typeof data === 'string' 
                    ? JSON.parse(data) 
                    : JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                // Might be binary audio
                if (Buffer.isBuffer(data)) {
                    this.handleAudioData(data);
                } else {
                    logger.error('Error parsing Pipecat message:', error.message);
                }
            }
        });
    }
    
    /**
     * Check if buffer contains JSON
     */
    isJsonMessage(buffer) {
        if (buffer.length === 0) return false;
        const firstByte = buffer[0];
        // JSON starts with { (123) or [ (91)
        return firstByte === 123 || firstByte === 91;
    }
    
    /**
     * Handle incoming audio data from Pipecat
     */
    handleAudioData(audioBuffer) {
        // Emit audio delta event for ConnectionManager
        this.emit('audio.delta', {
            delta: audioBuffer,
            format: 'mulaw_8000', //this.outputFormat
        });
    }
    
    /**
     * Handle incoming JSON messages from Pipecat
     */
    handleMessage(message) {
        const type = message.type;
        
        switch (type) {
            // Session lifecycle
            case 'session.ready':
                this.sessionId = message.session_id;
                this.isConfigured = true;
                logger.info(`Pipecat session ready: ${this.sessionId}`);
                this.emit('agent.ready', {
                    sessionId: this.sessionId,
                    agentName: this.agentConfig?.name || 'Pipecat Agent',
                    status: 'ready',
                    type: 'status'
                });
                break;
                
            case 'session.error':
                logger.error('Pipecat session error:', message.error);
                this.emit('error', new Error(message.error));
                break;
            
            // Speech detection
            case 'speech.started':
            case 'vad.started':
                this.emit('speech.started');
                break;
                
            case 'speech.stopped':
            case 'vad.stopped':
                this.emit('speech.stopped');
                break;
            
            // Transcription events
            case 'transcript.interim':
            case 'transcription.interim':
                // Optionally emit interim transcripts
                if (message.text) {
                    this.emit('transcript.interim', { transcript: message.text });
                }
                break;
                
            case 'transcript.user':
            case 'transcript.final':
            case 'transcription.final':
                if (message.text) {
                    logger.info(`[PIPECAT] User transcript: "${message.text}"`);
                    this.emit('transcript.user', { transcript: message.text });
                    
                    // Update STT metrics
                    if (message.duration) {
                        this.costMetrics.stt_seconds += message.duration;
                    }
                }
                break;
                
            case 'transcript.agent':
            case 'llm.response':
                if (message.text) {
                    logger.info(`[PIPECAT] Agent response: "${message.text.substring(0, 100)}..."`);
                    this.emit('transcript.agent', { transcript: message.text });
                }
                break;
            
            // Audio events
            case 'audio.chunk':
            case 'tts.audio':
                // Audio as base64 JSON
                if (message.audio) {
                    const audioBuffer = Buffer.from(message.audio, 'base64');
                    this.emit('audio.delta', {
                        delta: audioBuffer,
                        format: message.format || 'mulaw_8000' //message.format || this.outputFormat
                    });
                    
                    // Update TTS metrics
                    if (message.duration) {
                        this.costMetrics.tts_seconds += message.duration;
                    }
                    if (message.characters) {
                        this.costMetrics.tts_characters += message.characters;
                    }
                }
                break;
                
            case 'audio.done':
            case 'tts.done':
                this.emit('audio.done');
                break;
            
            // Function calling
            case 'function.call':
            case 'tool.call':
                logger.info(`[PIPECAT] Function call: ${message.name}`);
                this.handleFunctionCallMessage(message);
                break;
            
            // Interruption handling
            case 'user.interrupted':
            case 'interruption':
                logger.info('[PIPECAT] User interrupted');
                this.emit('speech.cancelled');
                this.emit('speech.started');
                break;
            
            // Metrics updates
            case 'metrics.update':
            case 'usage.update':
				// Periodic usage update from Python service
				if (message.usage) {
					this.costMetrics.stt_seconds = message.usage.audio_input_seconds || 0;
					this.costMetrics.tts_seconds = message.usage.audio_output_seconds || 0;
					this.costMetrics.llm_tokens.input = message.usage.input_tokens || 0;
					this.costMetrics.llm_tokens.output = message.usage.output_tokens || 0;
					
					logger.debug('[PIPECAT] Usage update:', message.usage);
					
					// Emit response.done to trigger cost calculation in connection-manager
					this.emit('response.done', {
						usage: message.usage
					});
				}
				break;

			case 'usage.final':
				// Final usage report on session end
				if (message.usage) {
					this.costMetrics.stt_seconds = message.usage.audio_input_seconds || 0;
					this.costMetrics.tts_seconds = message.usage.audio_output_seconds || 0;
					this.costMetrics.llm_tokens.input = message.usage.input_tokens || 0;
					this.costMetrics.llm_tokens.output = message.usage.output_tokens || 0;
					
					logger.info('[PIPECAT] Final usage:', {
						audio_in: message.usage.audio_input_seconds,
						audio_out: message.usage.audio_output_seconds,
						tokens_in: message.usage.input_tokens,
						tokens_out: message.usage.output_tokens
					});
					
					// Emit response.done with final usage
					this.emit('response.done', {
						usage: message.usage,
						final: true
					});
				}
				break;
            
            // Conversation events
            case 'conversation.ended':
                logger.info('[PIPECAT] Conversation ended:', message.reason);
                this.emit('conversation.ended', {
                    reason: message.reason,
                    metrics: this.getCostMetrics()
                });
                break;
				
            case 'agent.speaking.started':
				this.emit('audio.started');
				break;

			case 'agent.speaking.stopped':
				this.emit('audio.done');
				// Emit response.done to trigger cost calculation
				this.emit('response.done', {});
				break;
				
            // Pong response (keep-alive)
            case 'pong':
                // Connection is alive
                break;
            
            // Error handling
            case 'error':
                logger.error('Pipecat error:', message.error || message.message);
                this.emit('error', new Error(message.error || message.message || 'Unknown Pipecat error'));
                break;
                
            default:
                logger.debug(`[PIPECAT] Unhandled message type: ${type}`);
        }
    }
    
    /**
     * Handle function call from Pipecat
     */
    handleFunctionCallMessage(message) {
        const functionName = message.name || message.function_name;
        const callId = message.call_id || message.id || `pipecat_fn_${Date.now()}`;
        
        let args = {};
        try {
            if (typeof message.arguments === 'string') {
                args = JSON.parse(message.arguments);
            } else if (message.arguments) {
                args = message.arguments;
            } else if (message.params) {
                args = message.params;
            }
        } catch (e) {
            logger.warn('Could not parse function arguments:', e.message);
        }
        
        // Store pending call for response routing
        this.pendingFunctionCalls.set(callId, {
            name: functionName,
            timestamp: Date.now()
        });
        
        // Emit for FunctionExecutor handling in ConnectionManager
        this.emit('function.call', {
            call_id: callId,
            name: functionName,
            arguments: JSON.stringify(args)
        });
    }
    
    /**
     * Update cost/usage metrics
     */
    updateMetrics(message) {
        if (message.stt_seconds) {
            this.costMetrics.stt_seconds += message.stt_seconds;
        }
        if (message.tts_seconds) {
            this.costMetrics.tts_seconds += message.tts_seconds;
        }
        if (message.tts_characters) {
            this.costMetrics.tts_characters += message.tts_characters;
        }
        if (message.llm_tokens) {
            this.costMetrics.llm_tokens.input += message.llm_tokens.input || 0;
            this.costMetrics.llm_tokens.output += message.llm_tokens.output || 0;
        }
        if (message.input_tokens) {
            this.costMetrics.llm_tokens.input += message.input_tokens;
        }
        if (message.output_tokens) {
            this.costMetrics.llm_tokens.output += message.output_tokens;
        }
    }
    
    /**
     * Start ping interval for keep-alive
     */
    startPingInterval() {
        this.pingInterval = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (error) {
                    logger.warn('Failed to send ping:', error.message);
                }
            }
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Stop ping interval
     */
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    /**
     * Configure session with agent settings
     */
    async configureSession(agentConfig) {
        if (!this.isConnected) {
            throw new Error('Provider not connected');
        }
        
        this.agentConfig = agentConfig;
        this.sessionId = agentConfig.sessionId || `pipecat_${Date.now()}`;
        
        logger.info('Configuring Pipecat session:', {
            sessionId: this.sessionId,
            agentName: agentConfig.name,
            sttProvider: this.pipecatConfig.stt_provider,
            llmProvider: this.pipecatConfig.llm_provider,
            ttsProvider: this.pipecatConfig.tts_provider
        });
        
        // Build functions array for Pipecat
        const functions = (agentConfig.functions || []).map(f => ({
            name: f.name,
            description: f.description,
            parameters: typeof f.parameters === 'string' 
                ? JSON.parse(f.parameters) 
                : f.parameters
        }));
        
        // Determine voice based on agent config
        const voice = agentConfig.pipecat_voice || 
                      agentConfig.custom_voice || 
                      agentConfig.voice || 
                      this.pipecatConfig.tts_voice;
        
        // Send configuration to Pipecat service
        const configMessage = {
            type: 'session.configure',
            session_id: this.sessionId,
            config: {
                // Agent configuration
                instructions: agentConfig.instructions || 'You are a helpful voice assistant.',
                greeting: agentConfig.greeting || null,
                functions: functions,
                
                // Language settings
                language: agentConfig.language || this.pipecatConfig.language,
                language_hints: agentConfig.language_hints || [agentConfig.language || 'en'],
                
                // STT configuration
                stt_provider: agentConfig.pipecat_stt || this.pipecatConfig.stt_provider,
                stt_model: agentConfig.pipecat_stt_model || this.pipecatConfig.stt_model,
                
                // LLM configuration
                llm_provider: agentConfig.pipecat_llm || this.pipecatConfig.llm_provider,
                llm_model: agentConfig.pipecat_llm_model || this.pipecatConfig.llm_model,
                temperature: agentConfig.temperature || 0.7,
                max_tokens: agentConfig.max_tokens || 150,
                
                // TTS configuration
                tts_provider: agentConfig.pipecat_tts || this.pipecatConfig.tts_provider,
                tts_voice: voice,
                tts_speed: agentConfig.tts_speed || 1.0,
                
                // VAD configuration
                vad_enabled: this.pipecatConfig.vad_enabled,
                vad_threshold: agentConfig.vad_threshold || this.pipecatConfig.vad_threshold,
                silence_timeout_ms: agentConfig.silence_duration_ms || this.pipecatConfig.silence_timeout_ms,
                
                // Interruption handling
                interruption_enabled: this.pipecatConfig.interruption_enabled,
                
                // Audio format (Asterisk sends mulaw 8kHz)
                input_audio_format: this.inputFormat,
                output_audio_format: this.outputFormat,
                
                // Context/memory
                context: agentConfig.context || null,
                
                // Agent metadata
                agent_id: agentConfig.agentId || agentConfig.id,
                agent_name: agentConfig.name,
                tenant_id: agentConfig.tenantId
            }
        };
        
        this.ws.send(JSON.stringify(configMessage));
        
        logger.info('Pipecat session configuration sent');
        
        return true;
    }
    
    /**
     * Send audio to Pipecat service
     * @param {Buffer} audioData - µ-law audio from Asterisk (8kHz)
     */
    async sendAudio(audioData) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            // Send raw binary audio (µ-law from Asterisk)
            this.ws.send(audioData);
            return true;
        } catch (error) {
            logger.error('Error sending audio to Pipecat:', error.message);
            return false;
        }
    }
    
    /**
     * Send function call response back to Pipecat
     */
    async sendFunctionResponse(callId, result) {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.warn('Cannot send function response: not connected');
            return false;
        }
        
        try {
            // Clean up pending call
            const pendingCall = this.pendingFunctionCalls.get(callId);
            if (pendingCall) {
                this.pendingFunctionCalls.delete(callId);
            }
            
            const responseMessage = {
                type: 'function.response',
                call_id: callId,
                function_name: pendingCall?.name || null,
                result: result,
                success: !result.error
            };
            
            this.ws.send(JSON.stringify(responseMessage));
            
            logger.info(`[PIPECAT] Function response sent for: ${callId}`);
            return true;
        } catch (error) {
            logger.error('Error sending function response:', error.message);
            return false;
        }
    }
    
    /**
     * Cancel current response (e.g., on interruption)
     */
    async cancelResponse() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({ type: 'response.cancel' }));
            return true;
        } catch (error) {
            logger.error('Error cancelling response:', error.message);
            return false;
        }
    }
    
    /**
     * Send text message directly (bypass STT)
     */
    async sendText(text) {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'text.input',
                text: text
            }));
            return true;
        } catch (error) {
            logger.error('Error sending text:', error.message);
            return false;
        }
    }
    
    /**
     * Disconnect from Pipecat service
     */
    async disconnect() {
        logger.info('[PIPECAT] Disconnecting...');
        
        this.stopPingInterval();
        
        // Clear pending function calls
        this.pendingFunctionCalls.clear();
        
        if (this.ws) {
            try {
                // Send disconnect message
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'session.end' }));
                }
                this.ws.close(1000, 'Normal closure');
            } catch (error) {
                logger.warn('Error during disconnect:', error.message);
            }
            this.ws = null;
        }
        
        this.isConnected = false;
        this.isConfigured = false;
        this.sessionId = null;
        
        logger.info('[PIPECAT] Disconnected');
    }
    
    /**
     * Get provider name
     */
    getProviderName() {
        return 'pipecat';
    }
    
    /**
     * Get cost metrics
     */
    getCostMetrics() {
		const duration = this.costMetrics.start_time
			? (Date.now() - this.costMetrics.start_time) / 1000
			: 0;
		
		// Cost rates for Pipecat services (Soniox + OpenAI)
		// Soniox STT: ~$0.01/min
		// OpenAI LLM gpt-4o-mini: $0.15/1M input, $0.60/1M output
		// OpenAI TTS: ~$0.015/1K chars (~$0.015/min at ~150 words/min)
		
		const sttCost = (this.costMetrics.stt_seconds / 60) * 0.01;  // Soniox
		const llmInputCost = (this.costMetrics.llm_tokens.input / 1000000) * 0.15;
		const llmOutputCost = (this.costMetrics.llm_tokens.output / 1000000) * 0.60;
		const ttsCost = (this.costMetrics.tts_seconds / 60) * 0.015;  // OpenAI TTS
		
		const baseCost = sttCost + llmInputCost + llmOutputCost + ttsCost;
		
		return {
			provider: 'pipecat',
			duration_seconds: duration,
			input_audio_seconds: this.costMetrics.stt_seconds,
			output_audio_seconds: this.costMetrics.tts_seconds,
			input_tokens: this.costMetrics.llm_tokens.input,
			output_tokens: this.costMetrics.llm_tokens.output,
			cached_tokens: 0,
			breakdown: {
				stt: sttCost,
				llm_input: llmInputCost,
				llm_output: llmOutputCost,
				tts: ttsCost
			},
			base_cost: baseCost
		};
	}
    
    /**
     * Get cost rates based on configured providers
     */
    getCostRates() {
        // STT rates (per minute)
        const sttRates = {
            'deepgram': 0.0043,      // Nova-2
            'whisper': 0.006,        // OpenAI Whisper
            'assembly': 0.006,       // AssemblyAI
            'google': 0.006,         // Google Cloud STT
            'azure': 0.006           // Azure Speech
        };
        
        // LLM rates (per million tokens)
        const llmRates = {
            'openai': { input: 0.15, output: 0.60 },          // GPT-4o-mini
            'anthropic': { input: 3.00, output: 15.00 },      // Claude 3 Sonnet
            'groq': { input: 0.05, output: 0.05 },            // Llama 3
            'together': { input: 0.20, output: 0.20 }         // Various
        };
        
        // TTS rates
        const ttsRates = {
            'cartesia': { per_minute: 0.042 },                // Cartesia
            'elevenlabs': { per_1k_chars: 0.30 },             // ElevenLabs
            'playht': { per_minute: 0.03 },                   // PlayHT
            'deepgram': { per_minute: 0.015 },                // Deepgram Aura
            'openai': { per_minute: 0.015 },                  // OpenAI TTS
            'azure': { per_minute: 0.016 }                    // Azure TTS
        };
        
        const sttProvider = this.pipecatConfig.stt_provider;
        const llmProvider = this.pipecatConfig.llm_provider;
        const ttsProvider = this.pipecatConfig.tts_provider;
        
        return {
            stt_per_minute: sttRates[sttProvider] || 0.006,
            llm_input_per_million: (llmRates[llmProvider] || llmRates.openai).input,
            llm_output_per_million: (llmRates[llmProvider] || llmRates.openai).output,
            tts_per_minute: (ttsRates[ttsProvider] || ttsRates.cartesia).per_minute || 0.042,
            tts_per_1k_chars: (ttsRates[ttsProvider] || {}).per_1k_chars || 0
        };
    }
}

module.exports = PipecatProvider;
