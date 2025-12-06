/**
 * Provider Factory - UPDATED
 * Creates appropriate provider instance based on agent configuration
 * 
 * Now supports: openai, deepgram, custom
 */

const OpenAIProvider = require('./openai-provider');
const DeepgramProvider = require('./deepgram-provider');
const CustomVoiceProvider = require('./custom/custom-voice-provider');
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
				const REALTIME_MODELS = [
					'gpt-4o-realtime-preview-2024-12-17',
					'gpt-4o-mini-realtime-preview-2024-12-17'
				];
				const requestedModel = agentConfig.model || process.env.OPENAI_MODEL;
				const realtimeModel = REALTIME_MODELS.includes(requestedModel) 
					? requestedModel 
					: 'gpt-4o-mini-realtime-preview-2024-12-17';
				
				if (requestedModel && !REALTIME_MODELS.includes(requestedModel)) {
					logger.warn(`Model "${requestedModel}" is not a realtime model. Using "${realtimeModel}" instead.`);
				}
				
				return new OpenAIProvider({
					apiKey: process.env.OPENAI_API_KEY,
					model: realtimeModel,
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
                    model: agentConfig.deepgram_model || 'nova-2',
                    voice: agentConfig.deepgram_voice || 'aura-asteria-en',
                    language: agentConfig.deepgram_language || 'en',
                    instructions: agentConfig.instructions,
                    functions: agentConfig.functions || [],
                    greeting: agentConfig.greeting,
                    temperature: agentConfig.temperature || 0.6,
                    ...sessionConfig
                });
                
            case 'custom':
                // NEW: Custom Voice Provider
                // Uses Soniox STT + Groq/OpenAI LLM + Azure/Uplift/OpenAI TTS
                
                // Debug: log agent config for voice settings
                logger.info(`Custom provider config from agent:`, {
                    tts_provider: agentConfig.tts_provider,
                    custom_voice: agentConfig.custom_voice,
                    tts_voice: agentConfig.tts_voice
                });
                
                // Resolve voice - prioritize agent config over env
                const resolvedVoice = agentConfig.custom_voice || agentConfig.tts_voice;
                const finalVoice = resolvedVoice || process.env.OPENAI_TTS_VOICE || 'nova';
                
                logger.info(`Resolved voice: ${finalVoice} (from: ${resolvedVoice ? 'agent config' : 'env/default'})`);
                
                return new CustomVoiceProvider({
                    // STT Config
                    sonioxApiKey: process.env.SONIOX_API_KEY,
                    sttModel: agentConfig.stt_model || 'stt-rt-preview',
                    languageHints: agentConfig.language_hints || ['ur', 'en'],
                    
                    // LLM Config
                    groqApiKey: process.env.GROQ_API_KEY,
                    openaiApiKey: process.env.OPENAI_API_KEY,
                    llmModel: agentConfig.llm_model || 'llama-3.3-70b-versatile',
                    temperature: agentConfig.temperature || 0.7,
                    maxTokens: agentConfig.max_tokens || 1024,
                    
                    // TTS Provider Selection
                    ttsProvider: agentConfig.tts_provider || process.env.TTS_PROVIDER || 'uplift',
                    
                    // Azure TTS Config
                    azureKey: process.env.AZURE_SPEECH_KEY,
                    azureRegion: process.env.AZURE_SPEECH_REGION || 'eastus',
                    
                    // Uplift TTS Config
                    upliftApiKey: process.env.UPLIFT_API_KEY,
					upliftOutputFormat: agentConfig.uplift_output_format,
					upliftResample16to8: agentConfig.uplift_resample_16to8,
                    
                    // OpenAI TTS Config
                    openaiTtsModel: agentConfig.openai_tts_model || process.env.OPENAI_TTS_MODEL || 'tts-1',
                    
                    // Voice - from agent config, fallback to env
                    voice: finalVoice,
                    
                    // Conversation Config
                    silenceTimeoutMs: agentConfig.silence_timeout_ms || 30000,
                    allowBargeIn: agentConfig.allow_barge_in !== false,
                    
                    // Agent config
                    instructions: agentConfig.instructions,
                    functions: agentConfig.functions || [],
                    greeting: agentConfig.greeting,
                    
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
     */
    static validateProviderConfig(provider, config) {
        const errors = [];
        
        switch (provider.toLowerCase()) {
            case 'openai':
                if (!process.env.OPENAI_API_KEY) {
                    errors.push('OPENAI_API_KEY is required');
                }
                break;
                
            case 'deepgram':
                if (!process.env.DEEPGRAM_API_KEY) {
                    errors.push('DEEPGRAM_API_KEY is required');
                }
                break;
                
            case 'custom':
                if (!process.env.SONIOX_API_KEY) {
                    errors.push('SONIOX_API_KEY is required for custom provider');
                }
                if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
                    errors.push('GROQ_API_KEY or OPENAI_API_KEY is required for custom provider');
                }
                // Check TTS provider - need at least one configured
                const ttsProvider = process.env.TTS_PROVIDER || 'uplift';
                if (ttsProvider === 'azure' && !process.env.AZURE_SPEECH_KEY) {
                    errors.push('AZURE_SPEECH_KEY is required when TTS_PROVIDER=azure');
                }
                if (ttsProvider === 'uplift' && !process.env.UPLIFT_API_KEY) {
                    errors.push('UPLIFT_API_KEY is required when TTS_PROVIDER=uplift');
                }
                if (ttsProvider === 'openai' && !process.env.OPENAI_API_KEY) {
                    errors.push('OPENAI_API_KEY is required when TTS_PROVIDER=openai');
                }
                break;
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * Get available providers
     */
    static getAvailableProviders() {
        const providers = [];
        
        if (process.env.OPENAI_API_KEY) {
            providers.push({
                name: 'openai',
                description: 'OpenAI Realtime API (bundled STT+LLM+TTS)',
                costPerMinute: 0.30
            });
        }
        
        if (process.env.DEEPGRAM_API_KEY) {
            providers.push({
                name: 'deepgram',
                description: 'Deepgram Agent API (bundled STT+LLM+TTS)',
                costPerMinute: 0.05
            });
        }
        
        if (process.env.SONIOX_API_KEY && 
            (process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)) {
            providers.push({
                name: 'custom',
                description: 'Custom Stack (Soniox STT + Groq/OpenAI LLM + Azure/Uplift/OpenAI TTS)',
                costPerMinute: 0.01
            });
        }
        
        return providers;
    }
}

module.exports = ProviderFactory;
