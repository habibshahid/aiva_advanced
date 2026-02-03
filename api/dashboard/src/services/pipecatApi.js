/**
 * Pipecat API Service
 * 
 * API service for dashboard to interact with Pipecat-specific endpoints.
 * 
 * File: api/dashboard/src/services/pipecatApi.js
 */

import axios from 'axios';

const API_BASE = '/api/pipecat';

// ============================================================================
// PROVIDER OPTIONS
// ============================================================================

/**
 * Available STT providers with their models
 */
export const STT_PROVIDERS = {
    deepgram: {
        name: 'Deepgram',
        description: 'Fast, accurate, best for real-time',
        cost: '$0.0043/min',
        models: [
            { value: 'nova-2', label: 'Nova-2 (Recommended)', description: 'Best accuracy and speed' },
            { value: 'nova-2-phonecall', label: 'Nova-2 Phonecall', description: 'Optimized for phone audio' },
            { value: 'nova-2-meeting', label: 'Nova-2 Meeting', description: 'Optimized for meetings' },
        ]
    },
	soniox: {
        name: 'Soniox',
        description: 'Ultra-low latency, optimized for IVR/telephony',
        cost: '$0.0035/min',
        models: [
            { value: 'precision_ivr', label: 'Precision IVR (Recommended)', description: 'Best for phone/IVR' },
            { value: 'low_latency', label: 'Low Latency', description: 'Fastest response time' },
        ]
    },
    whisper: {
        name: 'OpenAI Whisper',
        description: 'High accuracy, supports many languages',
        cost: '$0.006/min',
        models: [
            { value: 'whisper-1', label: 'Whisper-1', description: 'Standard model' },
        ]
    },
    azure: {
        name: 'Azure Speech',
        description: 'Microsoft Azure, enterprise ready',
        cost: '$0.006/min',
        models: [
            { value: 'default', label: 'Default', description: 'Standard recognition' },
        ]
    },
    assembly: {
        name: 'AssemblyAI',
        description: 'Good accuracy, speaker diarization',
        cost: '$0.006/min',
        models: [
            { value: 'default', label: 'Default', description: 'Standard recognition' },
        ]
    }
};

/**
 * Available LLM providers with their models
 */
export const LLM_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        description: 'GPT-4o, GPT-4o-mini',
        cost: 'From $0.15/1M tokens',
        models: [
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Recommended)', description: 'Fast, cost-effective' },
            { value: 'gpt-4o', label: 'GPT-4o', description: 'Most capable' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'Balanced performance' },
        ]
    },
    anthropic: {
        name: 'Anthropic',
        description: 'Claude 3.5, Claude 3',
        cost: 'From $3/1M tokens',
        models: [
            { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Best balance' },
            { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', description: 'Fast and capable' },
            { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku', description: 'Fastest' },
        ]
    },
    groq: {
        name: 'Groq',
        description: 'Ultra-fast Llama, Mixtral',
        cost: 'From $0.05/1M tokens',
        models: [
            { value: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B', description: 'Best quality' },
            { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', description: 'Ultra fast' },
            { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', description: 'Good balance' },
        ]
    },
    together: {
        name: 'Together AI',
        description: 'Various open models',
        cost: 'From $0.20/1M tokens',
        models: [
            { value: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo', description: 'Fast inference' },
            { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo', description: 'Very fast' },
        ]
    }
};

/**
 * Available TTS providers with their voices
 */
export const TTS_PROVIDERS = {
    cartesia: {
        name: 'Cartesia',
        description: 'Ultra-low latency, natural voices',
        cost: '$0.042/min',
        voices: [
            { value: 'a0e99841-438c-4a64-b679-ae501e7d6091', label: 'Barbershop Man', description: 'Male, professional' },
            { value: '79a125e8-cd45-4c13-8a67-188112f4dd22', label: 'British Lady', description: 'Female, British' },
            { value: '638efaaa-4d0c-442e-b701-3fae16aad012', label: 'Sarah', description: 'Female, friendly' },
        ]
    },
    elevenlabs: {
        name: 'ElevenLabs',
        description: 'Highly expressive, voice cloning',
        cost: '$0.30/1K chars',
        voices: [
            { value: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'Female, American' },
            { value: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'Female, soft' },
            { value: 'ErXwobaYiN019PkySvjV', label: 'Antoni', description: 'Male, professional' },
        ]
    },
    deepgram: {
        name: 'Deepgram Aura',
        description: 'Fast, natural, good value',
        cost: '$0.015/min',
        voices: [
            { value: 'aura-asteria-en', label: 'Asteria', description: 'Female, American' },
            { value: 'aura-luna-en', label: 'Luna', description: 'Female, soft' },
            { value: 'aura-helios-en', label: 'Helios', description: 'Male, British' },
            { value: 'aura-orion-en', label: 'Orion', description: 'Male, deep' },
        ]
    },
    openai: {
        name: 'OpenAI TTS',
        description: 'Simple, reliable',
        cost: '$0.015/min',
        voices: [
            { value: 'nova', label: 'Nova', description: 'Female, natural' },
            { value: 'alloy', label: 'Alloy', description: 'Neutral' },
            { value: 'echo', label: 'Echo', description: 'Male' },
            { value: 'fable', label: 'Fable', description: 'Female, British' },
            { value: 'onyx', label: 'Onyx', description: 'Male, deep' },
            { value: 'shimmer', label: 'Shimmer', description: 'Female, warm' },
        ]
    },
    playht: {
        name: 'PlayHT',
        description: 'Voice cloning, many voices',
        cost: '$0.03/min',
        voices: [
            { value: 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/original/manifest.json', label: 'Jennifer', description: 'Female, American' },
        ]
    }
};

// ============================================================================
// API CALLS
// ============================================================================

/**
 * Get Pipecat service health status
 */
export const getServiceHealth = async () => {
    try {
        const response = await axios.get(`${API_BASE}/health`);
        return response.data;
    } catch (error) {
        return { status: 'unavailable', error: error.message };
    }
};

/**
 * Get available providers based on configured API keys
 */
export const getAvailableProviders = async () => {
    try {
        const response = await axios.get(`${API_BASE}/providers`);
        return response.data;
    } catch (error) {
        console.error('Failed to get available providers:', error);
        // Return default if API unavailable
        return {
            stt: Object.keys(STT_PROVIDERS),
            llm: Object.keys(LLM_PROVIDERS),
            tts: Object.keys(TTS_PROVIDERS)
        };
    }
};

/**
 * Get cost rates for providers
 */
export const getCostRates = async () => {
    try {
        const response = await axios.get(`${API_BASE}/cost-rates`);
        return response.data;
    } catch (error) {
        console.error('Failed to get cost rates:', error);
        return null;
    }
};

/**
 * Estimate cost for a configuration
 */
export const estimateCost = async (config) => {
    try {
        const response = await axios.post(`${API_BASE}/estimate-cost`, config);
        return response.data;
    } catch (error) {
        console.error('Failed to estimate cost:', error);
        return null;
    }
};

/**
 * Test TTS voice preview
 */
export const previewVoice = async (provider, voice, text = 'Hello, this is a voice preview.') => {
    try {
        const response = await axios.post(`${API_BASE}/preview-voice`, {
            provider,
            voice,
            text
        }, {
            responseType: 'blob'
        });
        return URL.createObjectURL(response.data);
    } catch (error) {
        console.error('Failed to preview voice:', error);
        return null;
    }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get models for a provider
 */
export const getModelsForProvider = (type, provider) => {
    const providers = {
        stt: STT_PROVIDERS,
        llm: LLM_PROVIDERS,
        tts: TTS_PROVIDERS
    }[type];
    
    if (!providers || !providers[provider]) {
        return [];
    }
    
    if (type === 'tts') {
        return providers[provider].voices || [];
    }
    return providers[provider].models || [];
};

/**
 * Get provider info
 */
export const getProviderInfo = (type, provider) => {
    const providers = {
        stt: STT_PROVIDERS,
        llm: LLM_PROVIDERS,
        tts: TTS_PROVIDERS
    }[type];
    
    return providers?.[provider] || null;
};

/**
 * Calculate estimated cost per minute
 */
export const calculateEstimatedCostPerMinute = (config) => {
    let total = 0;
    
    // STT cost
    const sttProvider = STT_PROVIDERS[config.pipecat_stt];
    if (sttProvider?.cost) {
        const match = sttProvider.cost.match(/\$([\d.]+)/);
        if (match) total += parseFloat(match[1]);
    }
    
    // LLM cost (approximate per minute assuming ~100 tokens in/out per minute)
    const llmProvider = LLM_PROVIDERS[config.pipecat_llm];
    if (llmProvider?.cost) {
        // Very rough estimate: ~$0.01 per minute for gpt-4o-mini
        total += 0.01;
    }
    
    // TTS cost
    const ttsProvider = TTS_PROVIDERS[config.pipecat_tts];
    if (ttsProvider?.cost) {
        const match = ttsProvider.cost.match(/\$([\d.]+)/);
        if (match) {
            // For per-minute pricing
            if (ttsProvider.cost.includes('/min')) {
                total += parseFloat(match[1]);
            }
            // For per-character pricing (estimate ~1000 chars per minute)
            else if (ttsProvider.cost.includes('/1K chars')) {
                total += parseFloat(match[1]);
            }
        }
    }
    
    return total;
};

/**
 * Validate Pipecat configuration
 */
export const validateConfig = (config) => {
    const errors = [];
    
    if (!config.pipecat_stt || !STT_PROVIDERS[config.pipecat_stt]) {
        errors.push('Invalid STT provider');
    }
    
    if (!config.pipecat_llm || !LLM_PROVIDERS[config.pipecat_llm]) {
        errors.push('Invalid LLM provider');
    }
    
    if (!config.pipecat_tts || !TTS_PROVIDERS[config.pipecat_tts]) {
        errors.push('Invalid TTS provider');
    }
    
    if (config.pipecat_tts && !config.pipecat_voice) {
        errors.push('TTS voice is required');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
};

export default {
    STT_PROVIDERS,
    LLM_PROVIDERS,
    TTS_PROVIDERS,
    getServiceHealth,
    getAvailableProviders,
    getCostRates,
    estimateCost,
    previewVoice,
    getModelsForProvider,
    getProviderInfo,
    calculateEstimatedCostPerMinute,
    validateConfig
};
