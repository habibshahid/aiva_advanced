/**
 * Deepgram Provider
 * Integrates Deepgram STT + TTS with function calling support
 */

const BaseProvider = require('./base-provider');
const WebSocket = require('ws');
const logger = require('../utils/logger');

class DeepgramProvider extends BaseProvider {
    constructor(config) {
        super(config);
        
        this.sttWs = null;  // Speech-to-Text WebSocket
        this.ttsWs = null;  // Text-to-Speech WebSocket
        this.sessionId = null;
        
        // Conversation state
        this.conversationHistory = [];
        this.pendingFunctionCalls = new Map();
        
        // Audio metrics for cost calculation
        this.audioMetrics = {
            stt_minutes: 0,
            tts_minutes: 0,
            stt_start: null,
            tts_start: null
        };
        
        // Agent configuration
        this.agentConfig = null;
        
        // LLM for conversation logic (we'll use OpenAI for function calling)
        this.llmApiKey = process.env.OPENAI_API_KEY; // For intent detection
    }
    
    async connect() {
        try {
            // Connect to Deepgram STT
            await this.connectSTT();
            
            // Connect to Deepgram TTS
            await this.connectTTS();
            
            this.isConnected = true;
            logger.info('Deepgram provider connected (STT + TTS)');
            
            return true;
            
        } catch (error) {
            logger.error('Failed to connect Deepgram provider:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    async connectSTT() {
        const sttUrl = this.buildDeepgramSTTUrl();
        
        this.sttWs = new WebSocket(sttUrl, {
            headers: {
                'Authorization': `Token ${this.config.apiKey}`
            }
        });
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('STT connection timeout'));
            }, 10000);
            
            this.sttWs.on('open', () => {
                clearTimeout(timeout);
                logger.info('Deepgram STT connected');
                this.audioMetrics.stt_start = Date.now();
                resolve();
            });
            
            this.sttWs.on('message', (data) => {
                this.handleSTTMessage(data);
            });
            
            this.sttWs.on('error', (error) => {
                logger.error('Deepgram STT error:', error);
                this.emit('error', error);
            });
            
            this.sttWs.on('close', () => {
                logger.info('Deepgram STT disconnected');
                this.calculateSTTCost();
            });
        });
    }
    
    async connectTTS() {
        const ttsUrl = this.buildDeepgramTTSUrl();
        
        this.ttsWs = new WebSocket(ttsUrl, {
            headers: {
                'Authorization': `Token ${this.config.apiKey}`
            }
        });
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('TTS connection timeout'));
            }, 10000);
            
            this.ttsWs.on('open', () => {
                clearTimeout(timeout);
                logger.info('Deepgram TTS connected');
                this.audioMetrics.tts_start = Date.now();
                resolve();
            });
            
            this.ttsWs.on('message', (data) => {
                this.handleTTSMessage(data);
            });
            
            this.ttsWs.on('error', (error) => {
                logger.error('Deepgram TTS error:', error);
                this.emit('error', error);
            });
            
            this.ttsWs.on('close', () => {
                logger.info('Deepgram TTS disconnected');
                this.calculateTTSCost();
            });
        });
    }
    
    buildDeepgramSTTUrl() {
        const model = this.config.model || 'nova-2';
        const language = this.config.language || 'en';
        
        const params = new URLSearchParams({
            model: model,
            language: language,
            encoding: 'mulaw',
            sample_rate: '8000',
            channels: '1',
            interim_results: 'true',
            endpointing: '300',
            vad_events: 'true',
            punctuate: 'true'
        });
        
        return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    }
    
    buildDeepgramTTSUrl() {
        const model = this.config.voice || 'aura-asteria-en';
        
        const params = new URLSearchParams({
            model: model,
            encoding: 'linear16',
            sample_rate: '24000',
            container: 'none'
        });
        
        return `wss://api.deepgram.com/v1/speak?${params.toString()}`;
    }
    
    async configureSession(agentConfig) {
        if (!this.isConnected) {
            throw new Error('Provider not connected');
        }
        
        this.agentConfig = agentConfig;
        this.sessionId = agentConfig.sessionId || `dg_${Date.now()}`;
        
        // Initialize conversation with system instructions
        this.conversationHistory.push({
            role: 'system',
            content: agentConfig.instructions
        });
        
        // Send initial greeting if configured
        if (agentConfig.greeting) {
            await this.speak(agentConfig.greeting);
        }
        
        logger.info('Deepgram session configured');
        return true;
    }
    
	async sendAudio(audioData) {
		if (!this.isConnected || !this.sttWs || this.sttWs.readyState !== WebSocket.OPEN) {
			return false;
		}
		
		try {
			// Resample from 24kHz to 16kHz before sending to Deepgram
			//const AudioConverter = require('../audio/audio-converter');
			//const resampled = AudioConverter.resample24to16(audioData);
			
			this.sttWs.send(audioData);
			return true;
			
		} catch (error) {
			logger.error('Error sending audio to Deepgram:', error);
			return false;
		}
	}
    
    handleSTTMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Handle different message types
            if (message.type === 'Results') {
                const transcript = message.channel?.alternatives?.[0]?.transcript;
                
                if (!transcript) return;
                
                const isFinal = message.is_final;
                const speechFinal = message.speech_final;
                
                if (isFinal && speechFinal) {
                    // User finished speaking
                    logger.info(`User transcript (final): ${transcript}`);
                    
                    this.emit('transcript.user', {
                        transcript: transcript,
                        is_final: true
                    });
                    
                    // Add to conversation history
                    this.conversationHistory.push({
                        role: 'user',
                        content: transcript
                    });
                    
                    // Process the user input with LLM
                    this.processUserInput(transcript);
                    
                } else if (isFinal) {
                    // Interim final result
                    this.emit('transcript.user', {
                        transcript: transcript,
                        is_final: false
                    });
                }
            } else if (message.type === 'SpeechStarted') {
                this.emit('speech.started');
            } else if (message.type === 'UtteranceEnd') {
                this.emit('speech.stopped');
            }
            
        } catch (error) {
            logger.error('Error handling STT message:', error);
        }
    }
    
    async processUserInput(userText) {
        try {
            // Use OpenAI to process the conversation and detect function calls
            const response = await this.callLLM(userText);
            
            // Check if LLM wants to call a function
            if (response.function_call) {
                await this.handleLLMFunctionCall(response.function_call);
            } else {
                // Regular response - speak it
                await this.speak(response.content);
            }
            
        } catch (error) {
            logger.error('Error processing user input:', error);
            await this.speak('I apologize, I encountered an error processing your request.');
        }
    }
    
    async callLLM(userText) {
        // Call OpenAI Chat API for conversation logic
        const https = require('https');
        
        const messages = [...this.conversationHistory];
        
        const tools = (this.agentConfig.functions || []).map(func => ({
            type: 'function',
            function: {
                name: func.name,
                description: func.description,
                parameters: func.parameters
            }
        }));
        
        const requestBody = {
            model: 'gpt-4o-mini',
            messages: messages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: 0.7,
            max_tokens: 500
        };
        
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify(requestBody);
            
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.llmApiKey}`,
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
                        const result = JSON.parse(data);
                        const message = result.choices[0].message;
                        
                        // Add assistant response to history
                        this.conversationHistory.push({
                            role: 'assistant',
                            content: message.content || '',
                            tool_calls: message.tool_calls
                        });
                        
                        if (message.tool_calls && message.tool_calls.length > 0) {
                            // Function call detected
                            const toolCall = message.tool_calls[0];
                            resolve({
                                function_call: {
                                    id: toolCall.id,
                                    name: toolCall.function.name,
                                    arguments: toolCall.function.arguments
                                }
                            });
                        } else {
                            // Regular response
                            resolve({
                                content: message.content
                            });
                        }
                        
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
    
    async handleLLMFunctionCall(functionCall) {
        const { id, name, arguments: argsStr } = functionCall;
        const args = JSON.parse(argsStr);
        
        logger.info(`LLM requested function call: ${name}`, args);
        
        // Emit function call event (will be handled by FunctionExecutor)
        this.emit('function.call', {
            call_id: id,
            name: name,
            arguments: argsStr
        });
        
        // Store pending call
        this.pendingFunctionCalls.set(id, { name, args });
    }
    
    async sendFunctionResponse(callId, result) {
        if (!this.pendingFunctionCalls.has(callId)) {
            logger.warn(`No pending function call found for ID: ${callId}`);
            return false;
        }
        
        const functionCall = this.pendingFunctionCalls.get(callId);
        this.pendingFunctionCalls.delete(callId);
        
        // Add function result to conversation history
        this.conversationHistory.push({
            role: 'tool',
            tool_call_id: callId,
            content: JSON.stringify(result)
        });
        
        // Get LLM response with function result
        try {
            const response = await this.continueConversationAfterFunction();
            
            if (response.function_call) {
                // Another function call needed
                await this.handleLLMFunctionCall(response.function_call);
            } else {
                // Speak the final response
                await this.speak(response.content);
            }
            
            return true;
            
        } catch (error) {
            logger.error('Error processing function response:', error);
            await this.speak('I received the information but encountered an error processing it.');
            return false;
        }
    }
    
    async continueConversationAfterFunction() {
        // Similar to callLLM but continues the conversation with function results
        return await this.callLLM(''); // Empty input, just continue with history
    }
    
    async speak(text) {
        if (!text) return;
        
        logger.info(`Agent speaking: ${text}`);
        
        this.emit('transcript.agent', {
            transcript: text
        });
        
        // Send text to Deepgram TTS
        if (this.ttsWs && this.ttsWs.readyState === WebSocket.OPEN) {
            this.ttsWs.send(JSON.stringify({
                type: 'Speak',
                text: text
            }));
        }
    }
    
    handleTTSMessage(data) {
        try {
            // Check if this is binary audio data
            if (Buffer.isBuffer(data)) {
                // Audio data from Deepgram TTS
                this.emit('audio.delta', {
                    delta: data.toString('base64')
                });
                return;
            }
            
            // JSON message
            const message = JSON.parse(data.toString());
            
            if (message.type === 'SpeakStarted') {
                this.emit('audio.started');
            } else if (message.type === 'SpeakComplete') {
                this.emit('audio.done');
            } else if (message.type === 'Error') {
                logger.error('Deepgram TTS error:', message);
                this.emit('error', new Error(message.error));
            }
            
        } catch (error) {
            // If JSON parse fails, it's likely binary audio
            if (Buffer.isBuffer(data)) {
                this.emit('audio.delta', {
                    delta: data.toString('base64')
                });
            } else {
                logger.error('Error handling TTS message:', error);
            }
        }
    }
    
    async disconnect() {
        if (this.sttWs) {
            this.sttWs.close();
            this.sttWs = null;
        }
        
        if (this.ttsWs) {
            this.ttsWs.close();
            this.ttsWs = null;
        }
        
        this.isConnected = false;
    }
    
    getProviderName() {
        return 'deepgram';
    }
    
    getCostMetrics() {
        // Deepgram pricing (example rates)
        const sttCostPerMinute = 0.0043;  // STT
        const ttsCostPerMinute = 0.015;   // TTS (Aura models)
        
        const sttCost = this.audioMetrics.stt_minutes * sttCostPerMinute;
        const ttsCost = this.audioMetrics.tts_minutes * ttsCostPerMinute;
        
        // Add LLM costs (OpenAI calls for conversation logic)
        const llmCost = this.estimateLLMCost();
        
        const baseCost = sttCost + ttsCost + llmCost;
        
        return {
            provider: 'deepgram',
            stt_minutes: this.audioMetrics.stt_minutes,
            tts_minutes: this.audioMetrics.tts_minutes,
            llm_calls: this.conversationHistory.filter(m => m.role === 'assistant').length,
            base_cost: baseCost,
            breakdown: {
                stt: sttCost,
                tts: ttsCost,
                llm: llmCost
            }
        };
    }
    
    calculateSTTCost() {
        if (this.audioMetrics.stt_start) {
            const duration = Date.now() - this.audioMetrics.stt_start;
            this.audioMetrics.stt_minutes = duration / 60000;
        }
    }
    
    calculateTTSCost() {
        if (this.audioMetrics.tts_start) {
            const duration = Date.now() - this.audioMetrics.tts_start;
            this.audioMetrics.tts_minutes = duration / 60000;
        }
    }
    
    estimateLLMCost() {
        // Rough estimate based on conversation length
        const totalMessages = this.conversationHistory.length;
        const estimatedTokens = totalMessages * 200; // ~200 tokens per message
        
        // GPT-4o-mini pricing
        const costPerToken = 0.00000015; // $0.150 / 1M tokens
        
        return estimatedTokens * costPerToken;
    }
}

module.exports = DeepgramProvider;