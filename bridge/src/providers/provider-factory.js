/**
 * Provider Factory
 * Creates appropriate provider instance based on agent configuration
 */

const OpenAIProvider = require('./openai-provider');
const DeepgramProvider = require('./deepgram-provider');
const logger = require('../utils/logger');

class ProviderFactory {
    /**
     * Create provider instance
     * @param {Object} agentConfig - Agent configuration from API
     * @param {Object} sessionConfig - Session-specific config
     * @returns {BaseProvider}
     */
    /**
	 * Provider Factory Update
	 * 
	 * File: bridge/src/providers/provider-factory.js
	 * Replace the entire 'deepgram' case in the createProvider method
	 * (around line 30-40)
	 */

	static createProvider(agentConfig, sessionConfig = {}) {
		const provider = agentConfig.provider || 'openai';
		
		logger.info(`Creating provider: ${provider} for agent: ${agentConfig.agentId}`);
		
		switch (provider.toLowerCase()) {
			case 'openai':
				return new OpenAIProvider({
					apiKey: process.env.OPENAI_API_KEY,
					model: agentConfig.model,
					voice: agentConfig.voice,
					temperature: agentConfig.temperature,
					maxTokens: agentConfig.max_tokens,
					vadThreshold: agentConfig.vad_threshold,
					silenceDuration: agentConfig.silence_duration_ms,
					language: agentConfig.language,
					...sessionConfig
				});
				
			case 'deepgram':
				// UPDATED: Pass agent configuration for Deepgram Agent API
				return new DeepgramProvider({
					apiKey: process.env.DEEPGRAM_API_KEY,
					// STT model for listen
					model: agentConfig.deepgram_model || 'nova-2',
					// TTS voice for speak
					voice: agentConfig.deepgram_voice || 'aura-asteria-en',
					// Language
					language: agentConfig.deepgram_language || 'en',
					// IMPORTANT: Pass full agent config for Agent API configuration
					instructions: agentConfig.instructions,
					functions: agentConfig.functions || [],
					greeting: agentConfig.greeting,
					temperature: agentConfig.temperature || 0.6,
					// Session config
					...sessionConfig
				});
				
			default:
				logger.error(`Unknown provider: ${provider}, defaulting to OpenAI`);
				return new OpenAIProvider({
					apiKey: process.env.OPENAI_API_KEY,
					...sessionConfig
				});
		}
	}
    
    /**
     * Validate provider configuration
     * @param {string} provider
     * @param {Object} config
     * @returns {Object} - { valid: boolean, errors: string[] }
     */
    static validateProviderConfig(provider, config) {
        const errors = [];
        
        switch (provider.toLowerCase()) {
            case 'openai':
                if (!config.model) errors.push('OpenAI model is required');
                if (!config.voice) errors.push('OpenAI voice is required');
                if (!process.env.OPENAI_API_KEY) errors.push('OPENAI_API_KEY not configured');
                break;
                
            case 'deepgram':
                if (!config.deepgram_model) errors.push('Deepgram model is required');
                if (!process.env.DEEPGRAM_API_KEY) errors.push('DEEPGRAM_API_KEY not configured');
                break;
                
            default:
                errors.push(`Unknown provider: ${provider}`);
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}

module.exports = ProviderFactory;