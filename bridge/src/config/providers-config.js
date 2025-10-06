/**
 * Provider Configuration
 * Centralized configuration for all providers
 */

module.exports = {
    openai: {
        name: 'OpenAI',
        apiKey: process.env.OPENAI_API_KEY,
        models: [
            'gpt-4o-realtime-preview-2024-12-17',
            'gpt-4o-mini-realtime-preview-2024-12-17'
        ],
        voices: ['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'],
        defaultModel: 'gpt-4o-mini-realtime-preview-2024-12-17',
        defaultVoice: 'shimmer',
        pricing: {
            input_tokens: 0.000005,  // $5/1M
            output_tokens: 0.000020,  // $20/1M
            input_audio: 0.0001,  // $0.06/min
            output_audio: 0.0002   // $0.12/min
        }
    },
    
    deepgram: {
        name: 'Deepgram',
        apiKey: process.env.DEEPGRAM_API_KEY,
        sttModels: [
            'nova-2',
            'nova-2-general',
            'nova-2-meeting',
            'nova-2-phonecall',
            'nova-2-finance',
            'nova-2-conversationalai'
        ],
        ttsVoices: [
            'aura-asteria-en',
            'aura-luna-en',
            'aura-stella-en',
            'aura-athena-en',
            'aura-hera-en',
            'aura-orion-en',
            'aura-arcas-en',
            'aura-perseus-en',
            'aura-angus-en',
            'aura-orpheus-en',
            'aura-helios-en',
            'aura-zeus-en'
        ],
        defaultModel: 'nova-2',
        defaultVoice: 'aura-asteria-en',
        pricing: {
            stt: 0.0043,  // $0.0043/min
            tts: 0.015,   // $0.015/min (Aura)
            llm: 0.00000015  // GPT-4o-mini for conversation logic
        }
    }
};