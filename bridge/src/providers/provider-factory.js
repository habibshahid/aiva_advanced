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
                return new DeepgramProvider({
                    apiKey: process.env.DEEPGRAM_API_KEY,
                    model: agentConfig.deepgram_model || 'aura-asteria-en',
                    voice: agentConfig.deepgram_voice || 'default',
                    language: agentConfig.deepgram_language || 'en',
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