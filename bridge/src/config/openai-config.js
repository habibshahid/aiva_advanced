/**
 * OpenAI Configuration
 */

module.exports = {
    // API Configuration
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17',
    
    // Voice Settings
    voice: process.env.OPENAI_VOICE || 'shimmer',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.6'),
    maxResponseTokens: parseInt(process.env.MAX_RESPONSE_OUTPUT_TOKENS || '200'),
    
    // VAD Settings
    vad: {
        threshold: parseFloat(process.env.VAD_THRESHOLD || '0.5'),
        prefixPaddingMs: parseInt(process.env.VAD_PREFIX_PADDING_MS || '300'),
        silenceDurationMs: parseInt(process.env.SILENCE_DURATION_MS || '500')
    },
    
    // Cost Settings
    profitMargin: parseFloat(process.env.PROFIT_MARGIN_PERCENT || '20'),
    
    // Session Settings
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS || '300000'), // 5 minutes
    
    // Audio Settings
    inputAudioFormat: 'pcm16',
    outputAudioFormat: 'pcm16',
    inputSampleRate: 16000,
    outputSampleRate: 24000,
    
    // Agent Configuration
    agentType: process.env.AGENT_TYPE || 'sales'
};