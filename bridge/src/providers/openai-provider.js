/**
 * OpenAI Provider
 * Wraps existing OpenAI Realtime API logic
 */

const BaseProvider = require('./base-provider');
const RealtimeClient = require('../openai/realtime-client');
const logger = require('../utils/logger');

class OpenAIProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.client = null;
        this.sessionId = null;
        this.tokenUsage = {
            input_tokens: 0,
            output_tokens: 0,
            input_audio_seconds: 0,
            output_audio_seconds: 0
        };
    }
    
    async connect() {
        try {
            this.client = new RealtimeClient({
                apiKey: this.config.apiKey,
                model: this.config.model,
                voice: this.config.voice,
                temperature: this.config.temperature,
                maxResponseTokens: this.config.maxTokens
            });
            
            await this.client.connect();
            this.isConnected = true;
            
            // Setup event forwarding
            this.setupEventForwarding();
            
            logger.info('OpenAI provider connected');
            return true;
            
        } catch (error) {
            logger.error('Failed to connect OpenAI provider:', error);
            this.isConnected = false;
            throw error;
        }
    }
    
    setupEventForwarding() {
        // Forward events from RealtimeClient
        this.client.on('speech.started', () => this.emit('speech.started'));
        this.client.on('speech.stopped', () => this.emit('speech.stopped'));
        this.client.on('audio.delta', (event) => this.emit('audio.delta', event));
        this.client.on('audio.done', () => this.emit('audio.done'));
        this.client.on('transcript.user', (event) => this.emit('transcript.user', event));
        this.client.on('transcript.agent', (event) => this.emit('transcript.agent', event));
        this.client.on('function.call', (event) => this.emit('function.call', event));
        this.client.on('response.done', (event) => {
            if (event.response?.usage) {
                this.updateTokenUsage(event.response.usage);
            }
            this.emit('response.done', event);
        });
        this.client.on('error', (error) => this.emit('error', error));
    }
    
    async configureSession(agentConfig) {
		if (!this.isConnected) {
			throw new Error('Provider not connected');
		}
		
		const tools = agentConfig.functions || [];
		await this.client.configureSession(
			agentConfig.instructions,
			tools,
			agentConfig.language
		);
		
		logger.info('OpenAI session configured');
		return true;
	}

    
    async sendAudio(audioData) {
		if (!this.isConnected || !this.client) {
			return false;
		}
		return await this.client.sendAudio(audioData);
	}
    
    async handleFunctionCall(functionName, args) {
        this.emit('function.call.internal', { functionName, args });
        return { handled: true };
    }
    
    async sendFunctionResponse(callId, result) {
        if (!this.isConnected) return false;
        await this.client.sendFunctionResponse(callId, result);
        await this.client.createResponse();
        return true;
    }
    
    async disconnect() {
        if (this.client) {
            await this.client.disconnect();
            this.isConnected = false;
        }
    }
    
    getProviderName() {
        return 'openai';
    }
    
    getCostMetrics() {
        const inputTokenCost = this.tokenUsage.input_tokens * 0.000005;
        const outputTokenCost = this.tokenUsage.output_tokens * 0.000020;
        const inputAudioCost = this.tokenUsage.input_audio_seconds * 0.0001;
        const outputAudioCost = this.tokenUsage.output_audio_seconds * 0.0002;
        
        const baseCost = inputTokenCost + outputTokenCost + inputAudioCost + outputAudioCost;
        
        return {
            provider: 'openai',
            input_tokens: this.tokenUsage.input_tokens,
            output_tokens: this.tokenUsage.output_tokens,
            input_audio_seconds: this.tokenUsage.input_audio_seconds,
            output_audio_seconds: this.tokenUsage.output_audio_seconds,
            base_cost: baseCost,
            breakdown: {
                input_tokens: inputTokenCost,
                output_tokens: outputTokenCost,
                input_audio: inputAudioCost,
                output_audio: outputAudioCost
            }
        };
    }
    
    updateTokenUsage(usage) {
        if (usage.input_tokens) this.tokenUsage.input_tokens += usage.input_tokens;
        if (usage.output_tokens) this.tokenUsage.output_tokens += usage.output_tokens;
        if (usage.input_audio_tokens) {
            this.tokenUsage.input_audio_seconds += usage.input_audio_tokens / 50;
        }
        if (usage.output_audio_tokens) {
            this.tokenUsage.output_audio_seconds += usage.output_audio_tokens / 50;
        }
    }
}

module.exports = OpenAIProvider;