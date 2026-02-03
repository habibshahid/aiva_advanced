/**
 * Pipecat Routes
 * Handles Pipecat service health, providers, and configuration
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const ResponseBuilder = require('../utils/response-builder');
const db = require('../config/database');

// Default cost rates for Pipecat providers
const DEFAULT_COST_RATES = {
    stt: {
        deepgram: { model: 'nova-2', cost_per_minute: 0.0043 },
        soniox: { model: 'precision_ivr', cost_per_minute: 0.0035 },
        whisper: { model: 'whisper-1', cost_per_minute: 0.006 },
        azure: { model: 'default', cost_per_minute: 0.006 },
        assembly: { model: 'default', cost_per_minute: 0.006 }
    },
    llm: {
        openai: { model: 'gpt-4o-mini', cost_per_1m_input: 0.15, cost_per_1m_output: 0.60 },
        anthropic: { model: 'claude-3-5-sonnet', cost_per_1m_input: 3.00, cost_per_1m_output: 15.00 },
        groq: { model: 'llama-3.3-70b', cost_per_1m_input: 0.59, cost_per_1m_output: 0.79 },
        together: { model: 'llama-3.1-70b', cost_per_1m_input: 0.88, cost_per_1m_output: 0.88 }
    },
    tts: {
        cartesia: { cost_per_minute: 0.042 },
        elevenlabs: { cost_per_1k_chars: 0.30 },
        deepgram: { cost_per_minute: 0.015 },
        openai: { cost_per_1m_chars: 15.00 },
        playht: { cost_per_minute: 0.05 }
    }
};

/**
 * @route GET /api/pipecat/health
 * @desc Check Pipecat service health
 * @access Private
 */
router.get('/health', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const pipecatUrl = process.env.PIPECAT_SERVICE_URL || 'ws://localhost:8765';
        const httpUrl = pipecatUrl.replace('ws://', 'http://').replace('wss://', 'https://');
        
        // Try to check health endpoint
        let isHealthy = false;
        let serviceInfo = null;
        
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch(`${httpUrl}/health`, { 
                timeout: 5000 
            });
            
            if (response.ok) {
                isHealthy = true;
                serviceInfo = await response.json();
            }
        } catch (error) {
            // Service might not have HTTP health endpoint, try WebSocket
            isHealthy = false;
        }
        
        res.json(rb.success({
            healthy: isHealthy,
            service_url: pipecatUrl,
            service_info: serviceInfo
        }));
        
    } catch (error) {
        console.error('Pipecat health check error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Health check failed')
        );
    }
});

/**
 * @route GET /api/pipecat/providers
 * @desc Get available Pipecat providers based on configured API keys
 * @access Private
 */
router.get('/providers', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const available = {
            stt: [],
            llm: [],
            tts: []
        };
        
        // Check STT providers
        if (process.env.DEEPGRAM_API_KEY) available.stt.push('deepgram');
        if (process.env.SONIOX_API_KEY) available.stt.push('soniox');
        if (process.env.OPENAI_API_KEY) available.stt.push('whisper');
        if (process.env.AZURE_SPEECH_KEY) available.stt.push('azure');
        if (process.env.ASSEMBLYAI_API_KEY) available.stt.push('assembly');
        
        // Check LLM providers
        if (process.env.OPENAI_API_KEY) available.llm.push('openai');
        if (process.env.ANTHROPIC_API_KEY) available.llm.push('anthropic');
        if (process.env.GROQ_API_KEY) available.llm.push('groq');
        if (process.env.TOGETHER_API_KEY) available.llm.push('together');
        
        // Check TTS providers
        if (process.env.CARTESIA_API_KEY) available.tts.push('cartesia');
        if (process.env.ELEVENLABS_API_KEY) available.tts.push('elevenlabs');
        if (process.env.DEEPGRAM_API_KEY) available.tts.push('deepgram');
        if (process.env.OPENAI_API_KEY) available.tts.push('openai');
        if (process.env.PLAYHT_API_KEY) available.tts.push('playht');
        
        res.json(rb.success({
            available,
            default: {
                stt: 'deepgram',
                llm: 'openai',
                tts: 'cartesia'
            }
        }));
        
    } catch (error) {
        console.error('Get providers error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Failed to get providers')
        );
    }
});

/**
 * @route GET /api/pipecat/cost-rates
 * @desc Get cost rates for Pipecat providers
 * @access Private
 */
router.get('/cost-rates', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        // Try to get from database first
        let rates = DEFAULT_COST_RATES;
        
        try {
            const [rows] = await db.query(
                'SELECT * FROM yovo_tbl_aiva_pipecat_cost_rates WHERE is_active = 1'
            );
            
            if (rows.length > 0) {
                // Transform database rows to rate structure
                rates = { stt: {}, llm: {}, tts: {} };
                
                for (const row of rows) {
                    if (row.service_type === 'stt') {
                        rates.stt[row.provider] = {
                            model: row.model,
                            cost_per_minute: parseFloat(row.cost_per_minute)
                        };
                    } else if (row.service_type === 'llm') {
                        rates.llm[row.provider] = {
                            model: row.model,
                            cost_per_1m_input: parseFloat(row.cost_per_1m_input_tokens),
                            cost_per_1m_output: parseFloat(row.cost_per_1m_output_tokens)
                        };
                    } else if (row.service_type === 'tts') {
                        rates.tts[row.provider] = {
                            cost_per_minute: row.cost_per_minute ? parseFloat(row.cost_per_minute) : null,
                            cost_per_1k_chars: row.cost_per_1k_chars ? parseFloat(row.cost_per_1k_chars) : null
                        };
                    }
                }
            }
        } catch (dbError) {
            // Table might not exist yet, use defaults
            console.warn('Could not fetch cost rates from DB, using defaults:', dbError.message);
        }
        
        res.json(rb.success(rates));
        
    } catch (error) {
        console.error('Get cost rates error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Failed to get cost rates')
        );
    }
});

/**
 * @route POST /api/pipecat/estimate-cost
 * @desc Estimate cost for a Pipecat configuration
 * @access Private
 */
router.post('/estimate-cost', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const {
            stt_provider = 'deepgram',
            llm_provider = 'openai',
            tts_provider = 'cartesia',
            estimated_minutes = 1,
            estimated_tokens_per_minute = 500
        } = req.body;
        
        // Get rates
        const sttRate = DEFAULT_COST_RATES.stt[stt_provider]?.cost_per_minute || 0.005;
        const llmRates = DEFAULT_COST_RATES.llm[llm_provider] || { cost_per_1m_input: 0.15, cost_per_1m_output: 0.60 };
        const ttsRate = DEFAULT_COST_RATES.tts[tts_provider]?.cost_per_minute || 0.04;
        
        // Calculate costs
        const sttCost = sttRate * estimated_minutes;
        
        // Assume 60% input, 40% output tokens
        const inputTokens = estimated_tokens_per_minute * estimated_minutes * 0.6;
        const outputTokens = estimated_tokens_per_minute * estimated_minutes * 0.4;
        const llmCost = (inputTokens / 1000000 * llmRates.cost_per_1m_input) + 
                        (outputTokens / 1000000 * llmRates.cost_per_1m_output);
        
        const ttsCost = ttsRate * estimated_minutes;
        
        const totalCost = sttCost + llmCost + ttsCost;
        
        res.json(rb.success({
            breakdown: {
                stt: {
                    provider: stt_provider,
                    cost: sttCost,
                    rate_per_minute: sttRate
                },
                llm: {
                    provider: llm_provider,
                    cost: llmCost,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens
                },
                tts: {
                    provider: tts_provider,
                    cost: ttsCost,
                    rate_per_minute: ttsRate
                }
            },
            total_cost: totalCost,
            cost_per_minute: totalCost / estimated_minutes,
            estimated_minutes
        }));
        
    } catch (error) {
        console.error('Estimate cost error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Failed to estimate cost')
        );
    }
});

/**
 * @route GET /api/pipecat/voices/:provider
 * @desc Get available voices for a TTS provider
 * @access Private
 */
router.get('/voices/:provider', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const { provider } = req.params;
        
        const voices = {
            cartesia: [
                { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man', gender: 'male' },
                { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'British Lady', gender: 'female' },
                { id: '638efaaa-4d0c-442e-b701-3fae16aad012', name: 'Sarah', gender: 'female' },
                { id: 'b7d50908-b17c-442d-ad8d-810c63997ed9', name: 'California Girl', gender: 'female' },
                { id: '95856005-0332-41b0-935f-352e296aa0df', name: 'Classy British Man', gender: 'male' }
            ],
            elevenlabs: [
                { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' },
                { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female' },
                { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male' },
                { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female' },
                { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male' }
            ],
            deepgram: [
                { id: 'aura-asteria-en', name: 'Asteria', gender: 'female' },
                { id: 'aura-luna-en', name: 'Luna', gender: 'female' },
                { id: 'aura-orion-en', name: 'Orion', gender: 'male' },
                { id: 'aura-arcas-en', name: 'Arcas', gender: 'male' },
                { id: 'aura-stella-en', name: 'Stella', gender: 'female' }
            ],
            openai: [
                { id: 'alloy', name: 'Alloy', gender: 'neutral' },
                { id: 'echo', name: 'Echo', gender: 'male' },
                { id: 'fable', name: 'Fable', gender: 'neutral' },
                { id: 'onyx', name: 'Onyx', gender: 'male' },
                { id: 'nova', name: 'Nova', gender: 'female' },
                { id: 'shimmer', name: 'Shimmer', gender: 'female' }
            ],
            playht: [
                { id: 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/jennifersarah/manifest.json', name: 'Jennifer', gender: 'female' },
                { id: 's3://voice-cloning-zero-shot/e6c2f766-a5b1-4a5c-8f1a-1b1a1a1a1a1a/michael/manifest.json', name: 'Michael', gender: 'male' }
            ]
        };
        
        const providerVoices = voices[provider.toLowerCase()];
        
        if (!providerVoices) {
            return res.status(404).json(
                ResponseBuilder.notFound(`No voices found for provider: ${provider}`)
            );
        }
        
        res.json(rb.success({
            provider,
            voices: providerVoices
        }));
        
    } catch (error) {
        console.error('Get voices error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Failed to get voices')
        );
    }
});

/**
 * @route GET /api/pipecat/models/:provider
 * @desc Get available models for a provider
 * @access Private
 */
router.get('/models/:provider', verifyToken, async (req, res) => {
    const rb = new ResponseBuilder();
    
    try {
        const { provider } = req.params;
        const { type } = req.query; // stt, llm, or tts
        
        const models = {
            // STT models
            deepgram_stt: [
                { id: 'nova-2', name: 'Nova-2 (Recommended)', description: 'Best accuracy and speed' },
                { id: 'nova-2-phonecall', name: 'Nova-2 Phonecall', description: 'Optimized for phone audio' },
                { id: 'nova-3', name: 'Nova-3', description: 'Latest model, highest accuracy' }
            ],
            soniox_stt: [
                { id: 'precision_ivr', name: 'Precision IVR', description: 'Best for phone/IVR' },
                { id: 'low_latency', name: 'Low Latency', description: 'Fastest response time' }
            ],
            whisper_stt: [
                { id: 'whisper-1', name: 'Whisper-1', description: 'OpenAI Whisper model' }
            ],
            
            // LLM models
            openai_llm: [
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and affordable' },
                { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable' },
                { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High performance' }
            ],
            anthropic_llm: [
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Best balance' },
                { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Fast and efficient' }
            ],
            groq_llm: [
                { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Most capable' },
                { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', description: 'Fastest' }
            ],
            together_llm: [
                { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo', description: 'High performance' }
            ]
        };
        
        const key = type ? `${provider.toLowerCase()}_${type}` : provider.toLowerCase();
        const providerModels = models[key];
        
        if (!providerModels) {
            return res.status(404).json(
                ResponseBuilder.notFound(`No models found for: ${key}`)
            );
        }
        
        res.json(rb.success({
            provider,
            type,
            models: providerModels
        }));
        
    } catch (error) {
        console.error('Get models error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message || 'Failed to get models')
        );
    }
});

module.exports = router;