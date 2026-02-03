/**
 * Provider Factory - UPDATED
 * Creates appropriate provider instance based on agent configuration
 * 
 * Supports: openai, deepgram, custom, intent-ivr
 */

const OpenAIProvider = require('./openai-provider');
const DeepgramProvider = require('./deepgram-provider');
const CustomVoiceProvider = require('./custom/custom-voice-provider');
const IntentIVRProvider = require('./custom/intent-ivr-provider');
const PipecatProvider = require('./pipecat-provider');
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
                // Custom Voice Provider
                // Uses Soniox STT + Groq/OpenAI LLM + Azure/Uplift/OpenAI TTS
                
                logger.info(`Custom provider config from agent:`, {
                    tts_provider: agentConfig.tts_provider,
                    custom_voice: agentConfig.custom_voice,
                    tts_voice: agentConfig.tts_voice
                });
                
                // Resolve voice
                const resolvedVoice = agentConfig.custom_voice || agentConfig.tts_voice;
                const finalVoice = resolvedVoice || process.env.OPENAI_TTS_VOICE || 'nova';
                
                logger.info(`Resolved voice: ${finalVoice}`);
                
                return new CustomVoiceProvider({
                    // STT Config
                    sttApiKey: process.env.SONIOX_API_KEY,
                    languageHints: agentConfig.language_hints || ['ur', 'en'],
                    
                    // LLM Config
                    llmProvider: 'openai', //process.env.GROQ_API_KEY ? 'groq' : 'openai',
                    llmApiKey: process.env.OPENAI_API_KEY, //process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY,
                    llmModel: agentConfig.llm_model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
                    
                    // TTS Config
                    ttsProvider: agentConfig.tts_provider || process.env.TTS_PROVIDER || 'uplift',
                    voice: finalVoice,
                    openaiTtsModel: agentConfig.openai_tts_model || 'tts-1',
                    upliftOutputFormat: agentConfig.uplift_output_format || 'ULAW_8000_8',
                    upliftResample16to8: agentConfig.uplift_resample_16to8 !== false,
                    
                    // TTS Formatting Config (NEW!)
					tts_number_format: agentConfig.tts_number_format || 'words-english',
					tts_script: agentConfig.tts_script || 'auto',
					tts_currency_format: agentConfig.tts_currency_format || 'words-english',
					
					// Streaming LLM Config (NEW!)
					streaming_llm: agentConfig.streaming_llm !== false,  // Default: enabled
					
					// Barge-in Config (NEW!)
					barge_in_threshold: agentConfig.barge_in_threshold || 4,
					interim_barge_in_threshold: agentConfig.interim_barge_in_threshold || 2,
					
					// Conversation settings
					temperature: agentConfig.temperature || 0.6,
					allowBargeIn: agentConfig.allow_barge_in !== false,
					
                    
                    // Agent config
                    instructions: agentConfig.instructions,
                    functions: agentConfig.functions || [],
                    greeting: agentConfig.greeting,
					kb_id: agentConfig.kb_id,
                    name: agentConfig.name,
                    // Session config
                    ...sessionConfig
                });
            
            case 'intent-ivr':
                // Intent-based IVR Provider
                // Uses Soniox STT + Intent Matching + Pre-recorded Audio
                
                logger.info(`Intent IVR provider config:`, {
                    agentId: agentConfig.agentId,
                    tts_provider: agentConfig.tts_provider,
                    custom_voice: agentConfig.custom_voice
                });
                return new IntentIVRProvider({
                    // Agent info
                    agentId: agentConfig.agentId || agentConfig.id,
                    tenantId: agentConfig.tenantId || agentConfig.tenant_id,
                    
                    // STT Config (for speech recognition)
                    languageHints: agentConfig.language_hints || ['ur', 'en'],
                    
                    // TTS Config (fallback for uncached responses)
                    // Uses same config as custom provider for consistency
                    ttsProvider: agentConfig.tts_provider || process.env.TTS_PROVIDER || 'uplift',
                    voice: agentConfig.custom_voice || agentConfig.tts_voice || 'v_meklc281',
                    
                    // Uplift-specific TTS settings (same as custom provider)
                    upliftOutputFormat: agentConfig.uplift_output_format || 'ULAW_8000_8',
                    upliftResample16to8: agentConfig.uplift_resample_16to8 !== false, // Default true
                    
                    // API Config (for loading IVR configuration)
                    apiBaseUrl: process.env.MANAGEMENT_API_URL || 'http://localhost:62001/api',
                    apiKey: process.env.MANAGEMENT_API_KEY,
                    
                    // Agent config
                    instructions: agentConfig.instructions,
                    functions: agentConfig.functions || [],
                    greeting: agentConfig.greeting,
                    kb_id: agentConfig.kb_id,
                    
                    // Session config
                    ...sessionConfig
                });
            case 'pipecat':
				// Pipecat Python Framework Provider
				// Uses external Pipecat Python service via WebSocket
				
				logger.info(`Creating Pipecat provider for agent: ${agentConfig.agentId}`);
				
				return new PipecatProvider({
					// Service connection
					pipecatUrl: process.env.PIPECAT_SERVICE_URL || 'ws://localhost:8765',
					
					// STT Configuration
					sttProvider: agentConfig.pipecat_stt || process.env.PIPECAT_STT_PROVIDER || 'deepgram',
					sttModel: agentConfig.pipecat_stt_model || process.env.PIPECAT_STT_MODEL || 'nova-2',
					
					// LLM Configuration
					llmProvider: agentConfig.pipecat_llm || process.env.PIPECAT_LLM_PROVIDER || 'openai',
					llmModel: agentConfig.pipecat_llm_model || process.env.PIPECAT_LLM_MODEL || 'gpt-4o-mini',
					
					// TTS Configuration
					ttsProvider: agentConfig.pipecat_tts || process.env.PIPECAT_TTS_PROVIDER || 'cartesia',
					ttsVoice: agentConfig.pipecat_voice || agentConfig.custom_voice,
					
					// VAD Configuration
					vadEnabled: agentConfig.vad_enabled !== false,
					vadThreshold: agentConfig.vad_threshold || 0.5,
					silenceTimeoutMs: agentConfig.silence_duration_ms || 700,
					interruptionEnabled: agentConfig.allow_interruptions !== false,
					
					// Language
					language: agentConfig.language || 'en',
					
					// Audio formats
					inputFormat: 'mulaw_8000',      // From Asterisk
					outputFormat: 'pcm16_24000',    // From Pipecat TTS
					
					// Pass through session config
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
            
            case 'intent-ivr':
                // Intent IVR only requires STT for speech recognition
                if (!process.env.SONIOX_API_KEY) {
                    errors.push('SONIOX_API_KEY is required for intent-ivr provider');
                }
                // TTS is optional (used as fallback for uncached responses)
                // API access is optional (can work with pre-loaded config)
                break;
			case 'pipecat':
				// Pipecat validation
				if (!process.env.PIPECAT_SERVICE_URL) {
					errors.push('PIPECAT_SERVICE_URL environment variable not set');
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
        
        if (process.env.SONIOX_API_KEY) {
            providers.push({
                name: 'intent-ivr',
                description: 'Intent IVR (Soniox STT + Intent Matching + Pre-recorded Audio)',
                costPerMinute: 0.005 // Very low cost - mostly pre-recorded audio
            });
        }
        
        return providers;
    }
}

module.exports = ProviderFactory;