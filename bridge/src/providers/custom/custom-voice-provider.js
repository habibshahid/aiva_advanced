/**
 * Custom Voice Provider for AIVA
 * Uses Soniox STT + Groq/OpenAI LLM + Multiple TTS Providers
 * 
 * Based on proven implementation with:
 * - Endpoint-only STT processing (no interim cascade)
 * - Echo suppression with timing + word count
 * - Simple state flags (no complex state machine)
 * - Single-call TTS (no sentence streaming)
 * 
 * TTS Providers: ElevenLabs, Deepgram, OpenAI, Uplift (Pakistani), Azure
 * 
 * AIVA Features:
 * - Knowledge Base search with "please wait"
 * - Transfer handling via events
 * - Function execution support
 */

const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

// Import AIVA TTS modules (same directory)
let UpliftTTS, AzureTTS, OpenAITTS, MP3ToPCMConverter;
try {
    UpliftTTS = require('./uplift-tts');
} catch (e) {
    console.warn('[Custom] Uplift TTS module not found');
}
try {
    AzureTTS = require('./azure-tts');
} catch (e) {
    console.warn('[Custom] Azure TTS module not found');
}
try {
    OpenAITTS = require('./openai-tts');
} catch (e) {
    // OpenAI TTS is optional - we have inline fallback
}
try {
    MP3ToPCMConverter = require('./mp3-converter');
} catch (e) {
    console.warn('[Custom] MP3 converter not found - Uplift TTS will fallback to ElevenLabs');
}

// Import KB Search Handler - try multiple paths based on AIVA directory structure
// Provider is at: bridge/src/providers/custom/custom-voice-provider.js
// Handler is at:  bridge/src/functions/kb-search-handler.js
let KBSearchHandler;
const kbPaths = [
    '../../functions/kb-search-handler',           // from providers/custom
    '../../../src/functions/kb-search-handler',    // alternate
    '../../src/functions/kb-search-handler',       // alternate
    '../functions/kb-search-handler',              // if in providers
];
for (const kbPath of kbPaths) {
    try {
        KBSearchHandler = require(kbPath);
        console.log(`[Custom] KB Search handler loaded from: ${kbPath}`);
        break;
    } catch (e) {
        // Try next path
    }
}
if (!KBSearchHandler) {
    console.warn('[Custom] KB Search handler not found - KB search will be disabled');
    console.warn('[Custom] Searched paths:', kbPaths.join(', '));
}

// Try to load base provider
let BaseProvider;
try {
    BaseProvider = require('../base-provider');
} catch (e) {
    // Create minimal base provider if not in bridge context
    BaseProvider = class extends EventEmitter {
        constructor(config) {
            super();
            this.config = config;
            this.isConnected = false;
            this.metrics = { startTime: 0 };
        }
        disconnect() { this.isConnected = false; }
    };
}

// Logger fallback
const logger = {
    info: (...args) => console.log('[Custom]', ...args),
    warn: (...args) => console.warn('[Custom]', ...args),
    error: (...args) => console.error('[Custom]', ...args),
    debug: (...args) => {} // Silent by default
};

// ===== TTS PROVIDER CONSTANTS =====
const TTS_PROVIDERS = ['elevenlabs', 'openai', 'azure', 'deepgram', 'uplift'];

// Groq-compatible models
const GROQ_MODELS = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant', 
    'mixtral-8x7b-32768',
    'llama-3.1-70b-versatile',
    'gemma2-9b-it'
];

// OpenAI models
const OPENAI_MODELS = [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo'
];

// Combined for validation
const LLM_MODELS = [...GROQ_MODELS, ...OPENAI_MODELS];

// ElevenLabs voice IDs
const ELEVENLABS_VOICES = {
    'Rachel': '21m00Tcm4TlvDq8ikWAM',
    'Domi': 'AZnzlk1XvdvUeBnXmlld',
    'Bella': 'EXAVITQu4vr4xnSDxMaL',
    'Antoni': 'ErXwobaYiN019PkySvjV',
    'Josh': 'TxGEqnHWrfWFTfGW9XjX',
    'Adam': 'pNInz6obpgDQGcFmaJgB',
    'Sam': 'yoZ06aMxZJJ28mfd3POQ',
    'Nicole': 'piTKgcLEGmPE4e6mEKli',
    'Sarah': 'EXAVITQu4vr4xnSDxMaL',
    'George': 'JBFqnCBsd6RMkjVDRZzb',
    'Charlie': 'IKne3meq5aSn9XLyUdCD',
    'James': 'ZQe5CZNOzWyzPSCn5a3c',
    'Callum': 'N2lVS1w4EtoT3dr4eOWO',
    'Patrick': 'ODq5zmih8GrVes37Dizd',
    'Harry': 'SOYHLrjzK2X1ezoPC6cr',
    'Liam': 'TX3LPaxmHKxFdv7VOQHJ',
    'Daniel': 'onwK4e9ZLuTAKqWW03F9',
    'Bill': 'pqHfZKP75CvOlQylNhV4'
};

// Deepgram Aura voices
const DEEPGRAM_VOICES = {
    'Asteria': 'aura-asteria-en',
    'Luna': 'aura-luna-en',
    'Stella': 'aura-stella-en',
    'Athena': 'aura-athena-en',
    'Hera': 'aura-hera-en',
    'Orion': 'aura-orion-en',
    'Arcas': 'aura-arcas-en',
    'Perseus': 'aura-perseus-en',
    'Angus': 'aura-angus-en',
    'Orpheus': 'aura-orpheus-en',
    'Helios': 'aura-helios-en',
    'Zeus': 'aura-zeus-en'
};

// Uplift Pakistani voices
const UPLIFT_VOICES = {
    'Ayesha': 'v_meklc281',
    'Fatima': 'v_8eelc901',
    'Asad': 'v_30s70t3a',
    'Dada Jee': 'v_yypgzenx',
    'Zara': 'v_kwmp7zxt',
    'Samina': 'v_sd0kl3m9',
    'Waqar': 'v_sd6mn4p2',
    'Imran': 'v_sd9qr7x5',
    'Karim': 'v_bl0ab8c4',
    'Nazia': 'v_bl1de2f7',
    // Legacy mappings
    'ur-pk-female': 'v_meklc281',
    'ur-pk-news': 'v_30s70t3a',
    'ur-pk-dadajee': 'v_yypgzenx',
    'v_meklc281': 'v_meklc281',
    'v_8eelc901': 'v_8eelc901',
    'v_30s70t3a': 'v_30s70t3a',
    'v_yypgzenx': 'v_yypgzenx'
};

// Azure voices
const AZURE_VOICES = {
    'ur-PK-UzmaNeural': 'ur-PK-UzmaNeural',
    'ur-PK-AsadNeural': 'ur-PK-AsadNeural',
    'en-US-JennyNeural': 'en-US-JennyNeural',
    'en-US-GuyNeural': 'en-US-GuyNeural'
};


class CustomVoiceProvider extends BaseProvider {
    constructor(config = {}) {
        super(config);
        
        // CRITICAL: Initialize metrics FIRST (before anything else can reference it)
        // BaseProvider may not initialize it, and WebSocket handlers need it
        this.metrics = this.metrics || {};
        this.metrics.startTime = 0;
        this.metrics.transcriptCount = 0;
        this.metrics.audioBytesSent = 0;
        this.metrics.ttsCharacters = 0;
        this.metrics.llmInputTokens = 0;     // Track LLM input tokens
        this.metrics.llmOutputTokens = 0;    // Track LLM output tokens
        this.metrics.llmCalls = 0;           // Track number of LLM calls
        
        // ===== STT Config (Soniox) =====
        this.sttApiKey = config.sttApiKey || config.sonioxApiKey || process.env.SONIOX_API_KEY;
        if (!this.sttApiKey) {
            throw new Error('Soniox API key not configured');
        }
        
        // Language hints
        let hints = config.languageHints || config.language_hints || ['en', 'ur'];
        if (typeof hints === 'string') {
            try { hints = JSON.parse(hints); } catch (e) { hints = hints.split(',').map(h => h.trim()); }
        }
        const validCodes = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi', 'ur', 'bn', 'ta', 'te', 'tr', 'vi', 'th', 'id', 'ms', 'tl'];
        this.languageHints = (Array.isArray(hints) ? hints : ['en', 'ur'])
            .filter(h => h && typeof h === 'string')
            .map(h => h.toLowerCase().trim().substring(0, 2))
            .filter(h => validCodes.includes(h));
        if (this.languageHints.length === 0) this.languageHints = ['en', 'ur'];
        
        // ===== LLM Config =====
        // Auto-detect provider from model name if not explicitly set
        const requestedModel = config.llmModel || 'gpt-4o-mini';
        const isOpenAIModel = requestedModel.startsWith('gpt-') || requestedModel.includes('openai');
        
        // Use explicit provider if set, otherwise detect from model
        if (config.llmProvider) {
            this.llmProvider = config.llmProvider;
        } else {
            this.llmProvider = isOpenAIModel ? 'openai' : 'groq';
        }
        
        // Get the right API key for the provider
        if (this.llmProvider === 'openai') {
            this.llmApiKey = config.llmApiKey || config.openaiApiKey || process.env.OPENAI_API_KEY;
        } else {
            this.llmApiKey = config.llmApiKey || config.groqApiKey || process.env.GROQ_API_KEY;
        }
        
        // Fallback if no API key for selected provider
        if (!this.llmApiKey) {
            if (this.llmProvider === 'groq') {
                this.llmApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
                this.llmProvider = 'openai';
                logger.warn('[Custom] No Groq API key, falling back to OpenAI');
            } else {
                this.llmApiKey = config.groqApiKey || process.env.GROQ_API_KEY;
                this.llmProvider = 'groq';
                logger.warn('[Custom] No OpenAI API key, falling back to Groq');
            }
        }
        
        // Use the requested model directly - no overriding!
        this.llmModel = requestedModel;
        
        // ===== TTS Config =====
        this.ttsProvider = TTS_PROVIDERS.includes(config.ttsProvider) ? config.ttsProvider : 'elevenlabs';
        this.ttsApiKey = config.ttsApiKey || config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
        this.voice = config.voice || config.custom_voice || 'Rachel';
        
        // Store all API keys for fallbacks
        this.openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
        this.deepgramApiKey = config.deepgramApiKey || process.env.DEEPGRAM_API_KEY;
        this.elevenlabsApiKey = config.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
        this.upliftApiKey = config.upliftApiKey || process.env.UPLIFT_API_KEY;
        this.azureKey = config.azureKey || process.env.AZURE_SPEECH_KEY;
        this.azureRegion = config.azureRegion || process.env.AZURE_SPEECH_REGION || 'eastus';
        
        // ===== WebSocket & State =====
        this.sttWs = null;
        this.conversationHistory = [];
        this.accumulatedTranscript = '';
        this.keepaliveInterval = null;
        
        // ===== Echo Suppression (CRITICAL) =====
        this.isSpeaking = false;           // True while TTS is playing
        this.speakingEndTime = 0;          // When TTS playback will end
        this.echoSuppressionMs = 500;      // Extra delay after TTS for echo
        // Barge-in thresholds - configurable via agent settings
        this.bargeInThreshold = parseInt(config.barge_in_threshold) || 4;         // Min words for final barge-in
        this.interimBargeInThreshold = parseInt(config.interim_barge_in_threshold) || 2;  // Min words for INTERIM barge-in (faster!)
        this.lastTTSBytes = 0;             // Track TTS audio size
        this.speakingTimer = null;         // Timer for speaking end callback
        this.ttsStartTime = 0;             // When TTS started
        this.playbackInterval = null;      // Audio playback interval
        this.safetyTimeout = null;         // Safety timeout for playback
        this.playbackResolve = null;       // Promise resolve for playback (for barge-in)
        
        // ===== TTS Queue (ensures sequential playback) =====
        this.ttsQueue = [];                // Queue of text items to speak
        this.ttsProcessing = false;        // True while processing queue
        
        // ===== Interim Speech Tracking =====
        this.interimTranscript = '';       // Current interim (non-final) text
        this.lastInterimTime = 0;          // When we last received interim tokens
        this.interimWordCount = 0;         // Count of interim words
        
        // ===== Streaming LLM =====
        this.useStreamingLLM = config.streaming_llm !== false;  // Enable by default
        this.streamingSentenceBuffer = ''; // Buffer for accumulating streaming text
        this.isStreamingResponse = false;  // True while streaming LLM response
        this.streamingTTSQueue = [];       // Queue of sentences to speak
        this.streamingAborted = false;     // Set to true when barge-in aborts streaming
        
        // ===== Wait State =====
        this.isWaitingForUser = false;
        this.waitStartTime = 0;
        
        // ===== Function Call Tracking =====
        this.calledFunctionsThisTurn = new Set();
        this.functionCallDepth = 0;
        this.maxFunctionCallDepth = 2;
        this.isWaitingForFunction = false;
        this.pendingUserMessage = null;  // Message queued while waiting for function
        this.isProcessingLLM = false;    // Lock to prevent concurrent LLM calls
        this.pendingFunctionCallId = null;  // Track current function call being processed
        
        // ===== KB Search =====
        this.kbSearchHandler = KBSearchHandler ? new KBSearchHandler() : null;
        this.lastKBSearchTime = 0;           // Timestamp of last KB search
        this.kbSearchCooldown = 3000;        // 3 second cooldown between searches
        this.recentKBQueries = [];           // Cache of recent search queries
        this.maxRecentKBQueries = 5;         // Keep last 5 queries
        this.kbCache = new Map();            // Cache: query -> { result, timestamp }
        this.kbCacheTTL = 300000;            // KB cache TTL: 5 minutes
        this.pendingKBSearch = null;         // Pending async KB search promise
        
        // ===== Greeting State =====
        this.greetingPlayed = false;         // Track if greeting was already played
        this.firstUserMessage = true;        // Track first user message
        
        // ===== Transfer State =====
        this.pendingTransfer = null;
        this.defaultTransferQueue = config.transfer_queue || 'support';
        
        // ===== Connection State =====
        this.isDestroyed = false;  // Set to true when provider is destroyed
        
        // ===== TTS Configuration =====
        // Determine script preference from language_hints if set to 'auto'
        let scriptPref = config.tts_script || 'auto';
        if (scriptPref === 'auto') {
            // If Urdu is primary language (first in hints), use Urdu script
            const primaryLang = (this.languageHints && this.languageHints[0]) || 'en';
            scriptPref = primaryLang === 'ur' ? 'urdu' : 'roman-urdu';
            logger.info(`[Custom] Auto-detected script preference: ${scriptPref} (from language: ${primaryLang})`);
        }
        
        this.ttsConfig = {
            // Number format: 'words-english', 'words-urdu', 'digits'
            numberFormat: config.tts_number_format || 'words-english',
            // Script preference: 'urdu', 'roman-urdu' (auto resolved above)
            scriptPreference: scriptPref,
            // Currency format: 'words-english', 'words-urdu', 'short'
            currencyFormat: config.tts_currency_format || 'words-english'
        };
        logger.info(`[Custom] TTS config: ${JSON.stringify(this.ttsConfig)}`);
        
        // ===== Cost tracking =====
        this.costPerMinute = 0.005;
        
        logger.info(`[Custom] Provider initialized: LLM=${this.llmProvider}/${this.llmModel}, TTS=${this.ttsProvider}, Voice=${this.voice}`);
        logger.info(`[Custom] Language hints: ${JSON.stringify(this.languageHints)}`);
    }
    
    getType() {
        return 'custom';
    }
    
    /**
     * Get provider name for connection manager
     * CRITICAL: Must return 'custom' for proper audio handling
     */
    getProviderName() {
        return 'custom';
    }
    
    /**
     * Get cost metrics for billing
     * Returns format compatible with connection manager
     */
    getCostMetrics() {
        const durationSeconds = this.metrics.startTime 
            ? (Date.now() - this.metrics.startTime) / 1000 
            : 0;
        
        // ===== STT Cost (Soniox) =====
        // Soniox: ~$0.10/hour = $0.00167/minute = $0.0000278/second
        const sttCost = durationSeconds * 0.0000278;
        
        // ===== LLM Cost =====
        const inputTokens = this.metrics.llmInputTokens || 0;
        const outputTokens = this.metrics.llmOutputTokens || 0;
        const llmCalls = this.metrics.llmCalls || 0;
        
        // GPT-4o-mini: ~$0.15/1M input, ~$0.60/1M output
        // Groq: ~$0.05/1M input, ~$0.10/1M output
        const isGroq = this.llmProvider === 'groq';
        const inputCostPer1M = isGroq ? 0.05 : 0.15;
        const outputCostPer1M = isGroq ? 0.10 : 0.60;
        const llmCost = (inputTokens * inputCostPer1M / 1000000) + (outputTokens * outputCostPer1M / 1000000);
        
        // ===== TTS Cost =====
        const ttsCharacters = this.metrics.ttsCharacters || 0;
        const outputAudioSeconds = ttsCharacters / 15; // ~15 chars/second estimate
        
        let ttsCost;
        if (this.ttsProvider === 'uplift') {
            // Uplift AI: $5/100K credits = $50/1M characters
            // 1 credit ≈ 1 character
            ttsCost = ttsCharacters * 0.00005;
        } else if (this.ttsProvider === 'openai') {
            // OpenAI TTS: $15/1M characters
            ttsCost = ttsCharacters * 0.000015;
        } else {
            // Azure TTS: ~$16/1M characters
            ttsCost = ttsCharacters * 0.000016;
        }
        
        // Total base cost
        const baseCost = sttCost + llmCost + ttsCost;
        
        return {
            // Primary fields (what connection-manager expects)
            base_cost: baseCost,                    // REQUIRED by connection-manager
            duration: durationSeconds,
            durationSeconds: durationSeconds,
            cost: baseCost,
            totalCost: baseCost,
            
            // Audio metrics (for connection-manager breakdown)
            input_audio_seconds: durationSeconds,  // Approximate STT duration
            output_audio_seconds: outputAudioSeconds,
            
            // Usage details
            transcriptCount: this.metrics.transcriptCount || 0,
            ttsCharacters: ttsCharacters,
            tts_characters: ttsCharacters,  // snake_case for index.js
            audioBytesSent: this.metrics.audioBytesSent || 0,
            
            // Provider info
            provider: 'custom',
            llmProvider: this.llmProvider,
            ttsProvider: this.ttsProvider,
            
            // LLM token tracking
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cached_tokens: 0,
            llmCalls: llmCalls,
            
            // Breakdown for detailed logging (REQUIRED by connection-manager)
            breakdown: {
                input_audio: sttCost,       // STT cost
                output_audio: ttsCost,      // TTS cost  
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                llm: llmCost,
                tts: ttsCost,
                stt: sttCost
            }
        };
    }
    
    /**
     * Emit transcript event in format expected by connection-manager
     * @param {string} speaker - 'user' or 'agent'/'assistant'
     * @param {string} text - The transcript text
     */
    emitTranscript(speaker, text) {
        // Don't emit if disconnected
        if (this.isDestroyed) return;
        
        if (speaker === 'user') {
            this.emit('transcript.user', { transcript: text });
        } else {
            this.emit('transcript.agent', { transcript: text });
        }
    }
    
    // =========================================================================
    // CONNECTION
    // =========================================================================
    
    async connect() {
        return new Promise((resolve, reject) => {
            if (!this.sttApiKey) {
                return reject(new Error('SONIOX_API_KEY not configured'));
            }
            
            logger.info('[Custom] Connecting to Soniox STT...');
            
            const wsUrl = 'wss://stt-rt.soniox.com/transcribe-websocket';
            this.sttWs = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                reject(new Error('Soniox connection timeout'));
            }, 30000);
            
            let configSent = false;
            
            this.sttWs.on('open', () => {
                logger.info('[Custom] Soniox WebSocket opened');
                // Ensure metrics exists (defensive - BaseProvider may not initialize it)
                if (!this.metrics) this.metrics = {};
                this.metrics.startTime = Date.now();
                this.configureSoniox();
                configSent = true;
                // Start keepalive IMMEDIATELY - don't wait for ready
                this.startKeepalive();
            });
            
            this.sttWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    if (message.error) {
                        logger.error('[Custom] Soniox error:', message.error);
                        clearTimeout(timeout);
                        reject(new Error(`Soniox error: ${message.error}`));
                        return;
                    }
                    
                    // Check for ready/status message
                    if (message.status === 'ready' || message.fw !== undefined || message.channel !== undefined) {
                        logger.info('[Custom] Soniox ready');
                        clearTimeout(timeout);
                        this.isConnected = true;
                        // Keepalive already started on 'open'
                        this.emit('connected');
                        resolve(true);
                        return;
                    }
                    
                    // If we get tokens, we're connected
                    if (message.tokens) {
                        if (!this.isConnected) {
                            clearTimeout(timeout);
                            this.isConnected = true;
                            // Keepalive already started on 'open'
                            this.emit('connected');
                            resolve(true);
                        }
                        this.handleSTTMessage(message);
                        return;
                    }
                    
                    this.handleSTTMessage(message);
                } catch (error) {
                    logger.error('[Custom] STT parse error:', error.message);
                }
            });
            
            this.sttWs.on('close', (code, reason) => {
                const reasonStr = reason ? reason.toString() : 'no reason';
                logger.info(`[Custom] Soniox disconnected: code=${code}, reason=${reasonStr}`);
                this.stopKeepalive();
                
                const wasConnected = this.isConnected;
                this.isConnected = false;
                
                if (!wasConnected && configSent) {
                    clearTimeout(timeout);
                    reject(new Error(`Soniox closed: code=${code}`));
                    return;
                }
                
                this.emit('disconnected', { code, reason: reasonStr });
                
                // Auto-reconnect if we were connected and session is still active
                if (wasConnected && !this.isDestroyed) {
                    logger.info('[Custom] Attempting Soniox reconnect in 1s...');
                    setTimeout(() => {
                        if (!this.isDestroyed) {
                            this.reconnectSoniox();
                        }
                    }, 1000);
                }
            });
            
            this.sttWs.on('error', (error) => {
                logger.error('[Custom] Soniox error:', error.message);
                this.emit('error', error);
                if (!this.isConnected) {
                    clearTimeout(timeout);
                    reject(error);
                }
            });
        });
    }
    
    async reconnectSoniox() {
        if (this.isDestroyed || this.isConnected) return;
        
        logger.info('[Custom] Reconnecting to Soniox...');
        
        try {
            // Close existing connection if any
            if (this.sttWs) {
                try {
                    this.sttWs.close();
                } catch (e) {}
                this.sttWs = null;
            }
            
            // Reconnect
            const wsUrl = 'wss://stt-rt.soniox.com/transcribe-websocket';
            this.sttWs = new WebSocket(wsUrl);
            
            this.sttWs.on('open', () => {
                logger.info('[Custom] Soniox reconnected');
                this.configureSoniox();
                // Start keepalive IMMEDIATELY - don't wait for ready
                // This prevents timeout during config phase
                this.startKeepalive();
            });
            
            this.sttWs.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    
                    if (message.error) {
                        logger.error('[Custom] Soniox error after reconnect:', message.error);
                        return;
                    }
                    
                    if (message.status === 'ready' || message.fw !== undefined) {
                        logger.info('[Custom] Soniox ready after reconnect');
                        this.isConnected = true;
                        // Keepalive already started on 'open'
                        return;
                    }
                    
                    if (message.tokens) {
                        if (!this.isConnected) {
                            this.isConnected = true;
                        }
                        this.handleSTTMessage(message);
                    }
                } catch (error) {
                    logger.error('[Custom] STT parse error:', error.message);
                }
            });
            
            this.sttWs.on('close', (code, reason) => {
                logger.info(`[Custom] Soniox disconnected after reconnect: code=${code}`);
                this.stopKeepalive();
                this.isConnected = false;
                
                // Try reconnecting again
                if (!this.isDestroyed) {
                    setTimeout(() => this.reconnectSoniox(), 2000);
                }
            });
            
            this.sttWs.on('error', (error) => {
                logger.error('[Custom] Soniox reconnect error:', error.message);
            });
            
        } catch (error) {
            logger.error('[Custom] Reconnect failed:', error.message);
            // Retry in 3 seconds
            if (!this.isDestroyed) {
                setTimeout(() => this.reconnectSoniox(), 3000);
            }
        }
    }
    
    startKeepalive() {
        this.stopKeepalive();
        logger.info('[Custom] Starting Soniox keepalive (every 3s)');
        
        // Track keepalive count for debugging
        let keepaliveCount = 0;
        
        this.keepaliveInterval = setInterval(() => {
            keepaliveCount++;
            if (this.sttWs && this.sttWs.readyState === WebSocket.OPEN) {
                try {
                    // Send empty audio frame to keep connection alive
                    // Soniox needs data flow to maintain connection
                    this.sttWs.send(Buffer.alloc(0));
                    // Log every 7th keepalive (~every 21s) to confirm it's running
                    if (keepaliveCount % 7 === 0) {
                        logger.info(`[Custom] Keepalive #${keepaliveCount} sent (every 3s)`);
                    }
                } catch (error) {
                    logger.error('[Custom] Keepalive send error:', error.message);
                }
            } else {
                const state = this.sttWs?.readyState;
                const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                logger.warn(`[Custom] Keepalive #${keepaliveCount} skipped - WebSocket state: ${stateNames[state] || state}`);
            }
        }, 3000);  // Every 3 seconds
    }
    
    stopKeepalive() {
        if (this.keepaliveInterval) {
            clearInterval(this.keepaliveInterval);
            this.keepaliveInterval = null;
        }
    }
    
    configureSoniox() {
        const config = {
            api_key: this.sttApiKey,
            model: 'stt-rt-preview',
            audio_format: 'mulaw',
            sample_rate: 8000,
            num_channels: 1,
            language_hints: this.languageHints,
            enable_endpoint_detection: true,
            enable_speaker_diarization: false,
            enable_non_final_tokens: true
        };
        
        logger.info('[Custom] Soniox config:', JSON.stringify(config));
        this.sttWs.send(JSON.stringify(config));
    }
    
    // =========================================================================
    // SESSION CONFIGURATION
    // =========================================================================
    
    async configureSession(agentConfig) {
        if (!this.isConnected) {
            throw new Error('Not connected');
        }
        
        this.agentConfig = agentConfig;
        this.conversationHistory = [];
        this.greetingPlayed = false;
        this.firstUserMessage = true;
        
        // Get agent name from various possible fields
        const agentName = agentConfig.name || agentConfig.agentName || agentConfig.agent_name || 'Voice Agent';
        
        logger.info(`[Custom] Configuring session for agent: ${agentName}`);
        logger.info(`[Custom] KB ID: ${agentConfig.kb_id || 'NOT SET'}, KB Handler: ${this.kbSearchHandler ? 'YES' : 'NO'}`);
        
        // Log available functions for debugging
        if (agentConfig.functions && Array.isArray(agentConfig.functions)) {
            logger.info(`[Custom] Agent has ${agentConfig.functions.length} functions:`);
            agentConfig.functions.forEach(f => {
                logger.info(`[Custom]   - ${f.name} (type: ${f.type || 'unknown'}, endpoint: ${f.endpoint || 'none'})`);
            });
        }
        
        // Load TTS config from agent if available
        if (agentConfig.tts_config) {
            const ttsConfig = typeof agentConfig.tts_config === 'string' 
                ? JSON.parse(agentConfig.tts_config) 
                : agentConfig.tts_config;
            this.ttsConfig = {
                numberFormat: ttsConfig.number_format || this.ttsConfig.numberFormat,
                scriptPreference: ttsConfig.script || this.ttsConfig.scriptPreference,
                currencyFormat: ttsConfig.currency_format || this.ttsConfig.currencyFormat
            };
            logger.info(`[Custom] TTS config loaded:`, this.ttsConfig);
        }
        
        // Build system prompt
        let systemContent = agentConfig.instructions || 'You are a helpful voice assistant.';
        
        // Add call context
        if (agentConfig.callerId) {
            systemContent += `\n\n=== CALL CONTEXT ===\nCaller Phone: ${agentConfig.callerId}`;
        }
        
        // Add function instructions if KB search available
        if (agentConfig.kb_id && this.kbSearchHandler) {
            systemContent += `\n\n=== KNOWLEDGE BASE ===
You have access to a knowledge base with information about products, prices, routes, and services.
The system will automatically search the knowledge base when needed and provide you with relevant information.
You do NOT need to call search_knowledge - it's handled automatically.
Just answer questions naturally using the information provided to you.`;
        }
        
        // Add transfer instructions
        systemContent += `\n\n=== TRANSFER ===
When transferring the call:
- Use transfer_to_agent function with queue parameter
- Say a brief message before transferring`;

        // CRITICAL: Greeting guard - prevent LLM from repeating greeting
        if (agentConfig.greeting) {
            systemContent += `\n\n=== GREETING ALREADY PLAYED ===
IMPORTANT: The greeting has ALREADY been played at the start of this call.
- DO NOT greet the user again
- DO NOT say "Hello", "Welcome", "Assalam-o-Alaikum", or any greeting
- If user greets you, respond naturally WITHOUT a greeting (e.g., "How can I help you?" instead of "Hello! How can I help you?")
- Jump directly into helping the user`;
        }

        // Add TTS formatting instructions if using Uplift
        if (this.ttsProvider === 'uplift') {
            systemContent += `\n\n=== VOICE OUTPUT FORMATTING (CRITICAL) ===
IMPORTANT: Your responses will be converted to speech synthesis.
Follow these rules STRICTLY for proper pronunciation:

GENERAL VOICE RULES:
- Keep responses concise and natural for phone conversations
- NEVER use markdown formatting (**, ##, bullets, numbered lists)
- NEVER use special characters or symbols
- Add natural pauses using commas (،) or periods (۔)
- Separate distinct pieces of information with commas or periods
- Spell out abbreviations when speaking`;

            // Script preference for Urdu
            if (this.ttsConfig.scriptPreference === 'urdu') {
                systemContent += `

SCRIPT - ALWAYS use URDU SCRIPT (نستعلیق):
- When responding in Urdu, ALWAYS use Urdu script (نستعلیق)
- NEVER use Roman Urdu (Latin letters for Urdu words)
- Example: "آپ کا شکریہ" NOT "Aap ka shukriya"
- Example: "میں آپ کی مدد کروں گی" NOT "Main aap ki madad karungi"`;
            } else if (this.ttsConfig.scriptPreference === 'roman-urdu') {
                systemContent += `

SCRIPT - Use ROMAN URDU:
- When responding in Urdu, use Roman Urdu (Latin script)
- Example: "Aap ka shukriya" not "آپ کا شکریہ"`;
            }
            
            // Number formatting
            if (this.ttsConfig.numberFormat === 'words-english') {
                systemContent += `

NUMBERS - Write as ENGLISH WORDS (MANDATORY even in Urdu responses):
- Write ALL numbers as English words, NEVER digits, NEVER Urdu number words
- Even when speaking Urdu, numbers must be in English words
- "380" → "three hundred and eighty" (NOT "تین سو اسّی")
- "1,100" → "one thousand one hundred" (NOT "گیارہ سو")
- "19" → "nineteen" (NOT "انیس")
- Example in Urdu: "قیمت ہے three hundred ninety rupees" (NOT "قیمت ہے تین سو نوے روپے")
- Phone: "055-111-787-489" → "zero five five، one one one، seven eight seven، four eight nine"
- Quantities: "5 bottles" → "five bottles"`;
            } else if (this.ttsConfig.numberFormat === 'words-urdu') {
                systemContent += `

NUMBERS - Write as URDU WORDS (mandatory):
- Write ALL numbers as Urdu words, never digits
- "380" → "تین سو اسّی"
- "1,100" → "گیارہ سو" or "ایک ہزار ایک سو"
- "19" → "انیس"
- Phone numbers digit by digit in Urdu words`;
            } else {
                // Default: English words for numbers
                systemContent += `

NUMBERS - Write as ENGLISH WORDS (mandatory):
- Write ALL numbers as English words, never digits
- "380" → "three hundred and eighty"
- "1,100" → "one thousand one hundred"
- Phone: digit by digit in English`;
            }
            
            // Currency formatting
            if (this.ttsConfig.currencyFormat === 'words-english') {
                systemContent += `

CURRENCY - Write in ENGLISH WORDS (MANDATORY even in Urdu responses):
- Write ALL currency amounts as English words, NEVER Urdu currency words
- Even when speaking Urdu, currency must be in English words
- "PKR 1,100" → "one thousand one hundred rupees" (NOT "ایک ہزار ایک سو روپے")
- "PKR 380" → "three hundred and eighty rupees" (NOT "تین سو اسّی روپے")
- "PKR 362.95" → "three hundred sixty two rupees and ninety five paisa"
- Example: "آپ کی قیمت ہے three hundred ninety rupees" (NOT "تین سو نوے روپے")
- Never write "PKR" or "Rs." - always write the full word "rupees"`;
            } else if (this.ttsConfig.currencyFormat === 'words-urdu') {
                systemContent += `

CURRENCY - Write in URDU (mandatory):
- "PKR 1,100" → "ایک ہزار ایک سو روپے"
- "PKR 380" → "تین سو اسّی روپے"
- Never write "PKR" or "Rs."`;
            } else {
                // Default: English for currency
                systemContent += `

CURRENCY - Write in ENGLISH (mandatory):
- Write currency amounts in English words
- Never write "PKR" or "Rs." symbols`;
            }
        }
        
        this.conversationHistory.push({
            role: 'system',
            content: systemContent
        });
        
        this.isConfigured = true;
        logger.info('[Custom] Session configured');
        
        // Play greeting if configured
        const greeting = agentConfig.greeting?.trim();
        if (greeting && greeting.length > 0) {
            this.greetingPlayed = true;
            
            // Add greeting to conversation history so LLM knows it was said
            // This prevents LLM from repeating the greeting
            this.conversationHistory.push({
                role: 'assistant',
                content: greeting
            });
            
            // Emit transcript for the greeting
            this.emitTranscript('agent', greeting);
            
            setTimeout(() => this.synthesizeAndSend(greeting), 500);
        }
        
        return true;
    }
    
    // =========================================================================
    // AUDIO HANDLING
    // =========================================================================
    
    async sendAudio(audioData) {
        if (!this.isConnected || !this.sttWs) {
            return false;
        }
        
        try {
            if (this.sttWs.readyState === WebSocket.OPEN) {
                this.sttWs.send(audioData);
                return true;
            }
            return false;
        } catch (error) {
            logger.error('[Custom] Send audio error:', error);
            return false;
        }
    }
    
    // =========================================================================
    // STT MESSAGE HANDLING (WITH INTERIM BARGE-IN)
    // =========================================================================
    
    async handleSTTMessage(message) {
        // Check for errors
        if (message.error_code) {
            if (message.error_message === 'No audio received.') {
                logger.info('[Custom] Soniox session ended (no audio)');
                return;
            }
            logger.error('[Custom] Soniox error:', message.error_message);
            this.emit('error', new Error(message.error_message));
            return;
        }
        
        if (message.finished) {
            logger.info('[Custom] Soniox stream finished');
            return;
        }
        
        // Process tokens
        if (message.tokens && message.tokens.length > 0) {
            let endpointDetected = false;
            let currentFinalText = '';
            let currentInterimText = '';
            
            for (const token of message.tokens) {
                if (token.text === '<end>') {
                    endpointDetected = true;
                    continue;
                }
                if (token.text === '<fin>') {
                    continue;
                }
                if (token.is_final) {
                    currentFinalText += token.text;
                } else {
                    // Track interim (non-final) tokens for early barge-in
                    currentInterimText += token.text;
                }
            }
            
            if (currentFinalText) {
                this.accumulatedTranscript = currentFinalText;
            }
            
            // ===== INTERIM BARGE-IN DETECTION (FASTER!) =====
            // Check interim words DURING TTS playback for quick interruption
            if (currentInterimText && this.isSpeaking) {
                this.interimTranscript = currentInterimText;
                this.lastInterimTime = Date.now();
                
                const interimWords = currentInterimText.trim().split(/\s+/).filter(w => w.length > 0);
                const timeSinceTTSStart = Date.now() - (this.ttsStartTime || 0);
                
                // Require at least 500ms since TTS started to avoid echo
                // AND minimum 2 words to confirm real speech
                if (interimWords.length >= this.interimBargeInThreshold && timeSinceTTSStart > 500) {
                    logger.info(`[Custom] INTERIM BARGE-IN: "${currentInterimText}" (${interimWords.length} interim words, ${timeSinceTTSStart}ms)`);
                    
                    // IMMEDIATELY stop TTS playback
                    this.stopTTSPlayback();
                    
                    // Don't process yet - wait for endpoint to get full utterance
                    // But TTS is already stopped, so user feels heard immediately
                    return;
                }
            }
            
            // ===== PROCESS ON ENDPOINT DETECTION =====
            if (endpointDetected) {
                // Reset interim tracking
                this.interimTranscript = '';
                this.interimWordCount = 0;
                
                const utterance = (this.accumulatedTranscript || '').trim();
                
                if (utterance) {
                    const wordCount = utterance.split(/\s+/).filter(w => w.length > 0).length;
                    
                    // ===== ECHO SUPPRESSION CHECK (for final transcripts) =====
                    if (this.isSpeaking) {
                        const timeSinceTTSStart = Date.now() - (this.ttsStartTime || 0);
                        
                        // During TTS: require MORE words AND timing check for barge-in
                        if (wordCount >= this.bargeInThreshold && timeSinceTTSStart > 500) {
                            logger.info(`[Custom] BARGE-IN: "${utterance}" (${wordCount} words, ${timeSinceTTSStart}ms)`);
                            
                            // Stop TTS playback
                            this.stopTTSPlayback();
                            
                            this.emit('interrupt', { reason: 'barge-in', utterance });
                            this.emit('speaking.stopped');
                            
                            // Process the interruption
                            this.accumulatedTranscript = '';
                            
                            // Check if we're waiting for a function - queue if so
                            if (this.isWaitingForFunction) {
                                logger.info(`[Custom] Queuing barge-in while waiting for function: "${utterance}"`);
                                this.pendingUserMessage = utterance;
                                return;
                            }
                            
                            await this.processWithLLM(utterance);
                            return;
                        } else {
                            // Echo - suppress it
                            logger.info(`[Custom] Echo suppressed (${wordCount} words, ${timeSinceTTSStart}ms): "${utterance}"`);
                            this.accumulatedTranscript = '';
                            return;
                        }
                    }
                    
                    // ===== NOT SPEAKING - PROCESS ANY UTTERANCE =====
                    
                    // Check if we're waiting for a function to complete
                    if (this.isWaitingForFunction) {
                        logger.info(`[Custom] Queuing message while waiting for function: "${utterance}"`);
                        // Store the message to process after function completes
                        this.pendingUserMessage = utterance;
                        this.accumulatedTranscript = '';
                        return;
                    }
                    
                    logger.info(`[Custom] User said: "${utterance}"`);
                    
                    // Track transcript count for metrics
                    this.metrics.transcriptCount = (this.metrics.transcriptCount || 0) + 1;
                    
                    this.emitTranscript('user', utterance);
                    
                    // Process with LLM
                    await this.processWithLLM(utterance);
                }
                
                this.accumulatedTranscript = '';
            }
        }
    }
    
    /**
     * Stop TTS playback immediately (for barge-in)
     */
    stopTTSPlayback() {
        this.isSpeaking = false;
        
        // Clear the TTS queue to prevent queued sentences from playing
        this.clearTTSQueue();
        
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        
        // Resolve any pending playback promise
        if (this.playbackResolve) {
            const resolve = this.playbackResolve;
            this.playbackResolve = null;
            resolve();
        }
        
        // Stop streaming LLM if active - set abort flag
        if (this.isStreamingResponse) {
            logger.info('[Custom] Aborting streaming response due to barge-in');
            this.isStreamingResponse = false;
            this.streamingAborted = true;  // NEW: Signal to abort streaming
            this.streamingSentenceBuffer = '';
            this.streamingTTSQueue = [];
        }
    }
    
    // =========================================================================
    // LLM PROCESSING
    // =========================================================================
    
    async processWithLLM(userMessage) {
        // CRITICAL: Don't process if disconnected
        if (this.isDestroyed) {
            logger.info(`[Custom] Ignoring message - provider destroyed`);
            return;
        }
        
        // CRITICAL: Check if we're already processing or waiting for function
        if (this.isProcessingLLM || this.isWaitingForFunction) {
            // ACCUMULATE messages instead of overwriting
            if (this.pendingUserMessage) {
                this.pendingUserMessage = `${this.pendingUserMessage} ${userMessage}`;
                logger.info(`[Custom] Accumulating message (${this.pendingUserMessage.split(' ').length} words total)`);
            } else {
                this.pendingUserMessage = userMessage;
                logger.info(`[Custom] Queuing message: "${userMessage.substring(0, 50)}..."`);
            }
            return;
        }
        
        this.isProcessingLLM = true;
        const processStartTime = Date.now();
        
        try {
            // Reset function tracking for this turn
            this.calledFunctionsThisTurn.clear();
            this.functionCallDepth = 0;
            
            // Check if user is asking to wait/hold
            if (this.isWaitSignal(userMessage)) {
                logger.info(`[Custom] Wait signal: "${userMessage}"`);
                const ack = "Sure, take your time.";
                this.conversationHistory.push({ role: 'user', content: userMessage });
                this.conversationHistory.push({ role: 'assistant', content: ack });
                this.emitTranscript('agent', ack);
                await this.synthesizeAndSend(ack);
                this.isWaitingForUser = true;
                this.waitStartTime = Date.now();
                return;
            }
            
            // If waiting for user, check if this is substantive
            if (this.isWaitingForUser) {
                const wordCount = userMessage.split(/\s+/).filter(w => w.length > 0).length;
                const timeSinceWait = Date.now() - this.waitStartTime;
                
                // Check if identity confirmation
                if (this.isIdentityConfirmation(userMessage)) {
                    logger.info(`[Custom] Identity confirmation after wait: "${userMessage}"`);
                    this.isWaitingForUser = false;
                    // Continue to normal processing
                } else if (timeSinceWait < 10000 && wordCount < 4) {
                    // Short message during wait - might be noise
                    if (this.isWaitSignal(userMessage)) {
                        logger.info(`[Custom] Another wait signal, continuing to wait`);
                        return;
                    }
                    const isGreeting = /^(hello|hi|hey|yes|yeah|okay|ok|go ahead|ready)/i.test(userMessage.trim());
                    if (!isGreeting) {
                        logger.info(`[Custom] Short message during wait, ignoring: "${userMessage}"`);
                        return;
                    }
                }
                
                this.isWaitingForUser = false;
            }
            
            // Add user message to history
            this.conversationHistory.push({ role: 'user', content: userMessage });
            
            // Keep history manageable
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = [
                    this.conversationHistory[0],
                    ...this.conversationHistory.slice(-18)
                ];
            }
            
            // ===== PRE-FLIGHT: Detect if KB search needed (async approach) =====
            if (this.kbSearchHandler && this.agentConfig?.kb_id) {
                logger.info(`[Custom] Pre-flight: Checking if KB search needed for "${userMessage.substring(0, 50)}..."`);
                const kbDecision = await this.detectKBSearchNeeded(userMessage);
                
                if (kbDecision && kbDecision.needsSearch) {
                    logger.info(`[Custom] Pre-flight: YES - search needed for "${kbDecision.query}"`);
                    await this.processWithAsyncKBSearch(kbDecision, processStartTime);
                    return;
                } else {
                    logger.info(`[Custom] Pre-flight: NO - no KB search needed`);
                }
            }
            
            // ===== HANDLE SIMPLE ACKNOWLEDGMENTS =====
            // Don't run full LLM for simple "اچھا جی", "ٹھیک ہے" etc.
            if (this.isSimpleAcknowledgment(userMessage)) {
                logger.info(`[Custom] Simple acknowledgment detected: "${userMessage}"`);
                const customerLang = this.detectMessageLanguage(userMessage);
                
                let ack;
                if (customerLang === 'urdu') {
                    ack = "جی، کیا کوئی اور سوال ہے؟";
                } else if (customerLang === 'roman-urdu') {
                    ack = "Ji, kya koi aur sawal hai?";
                } else {
                    ack = "Sure. Is there anything else I can help with?";
                }
                
                this.conversationHistory.push({ role: 'assistant', content: ack });
                this.emitTranscript('agent', ack);
                await this.synthesizeAndSend(ack);
                return;
            }
            
            // ===== REGULAR FLOW: No KB search needed =====
            if (this.useStreamingLLM) {
                await this.processWithStreamingLLM(processStartTime);
            } else {
                // Fallback to non-streaming
                await this.processWithNonStreamingLLM(processStartTime);
            }
            
        } catch (error) {
            logger.error('[Custom] Process LLM error:', error.message);
            
            // Say error message
            const errorMsg = this.ttsConfig.scriptPreference === 'urdu'
                ? "معذرت، ایک مسئلہ ہوا۔ براہ کرم دوبارہ کوشش کریں۔"
                : "Sorry, there was an issue. Please try again.";
            await this.synthesizeAndSend(errorMsg);
        } finally {
            this.isProcessingLLM = false;
            
            // Process any pending messages - CONSOLIDATE if multiple
            if (this.pendingUserMessage && !this.isWaitingForFunction) {
                const pending = this.pendingUserMessage;
                this.pendingUserMessage = null;
                
                // Check if more messages accumulated (user kept talking)
                // Give a tiny delay to see if more come in
                await new Promise(r => setTimeout(r, 100));
                
                if (this.pendingUserMessage) {
                    // Consolidate messages
                    const consolidated = `${pending} ${this.pendingUserMessage}`;
                    this.pendingUserMessage = null;
                    logger.info(`[Custom] Processing consolidated messages: "${consolidated.substring(0, 80)}..."`);
                    await this.processWithLLM(consolidated);
                } else {
                    logger.info(`[Custom] Processing pending message: "${pending.substring(0, 50)}..."`);
                    await this.processWithLLM(pending);
                }
            }
        }
    }
    
    /**
     * Pre-flight detection: Does this query need KB search?
     * Uses a quick, lightweight LLM call with structured output
     */
    async detectKBSearchNeeded(userMessage) {
        // Skip detection for VERY short simple messages (under 4 words)
        const wordCount = userMessage.trim().split(/\s+/).filter(w => w.length > 0).length;
        
        // Simple acknowledgment patterns (can be combined: "اچھا جی", "جی ہاں", etc.)
        const simpleWords = ['ہاں', 'جی', 'اچھا', 'ٹھیک', 'okay', 'ok', 'yes', 'no', 'نہیں', 'شکریہ', 'thanks', 'hello', 'hi', 'السلام', 'وعلیکم', 'ہیلو', 'bye', 'خدا', 'حافظ'];
        const messageWords = userMessage.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        // Skip if ALL words are simple acknowledgment words and <= 3 words
        if (wordCount <= 3) {
            const allSimple = messageWords.every(word => 
                simpleWords.some(simple => word.includes(simple.toLowerCase()) || simple.toLowerCase().includes(word))
            );
            if (allSimple) {
                logger.info(`[Custom] Pre-flight: Skipping KB detection for simple acknowledgment: "${userMessage}"`);
                return { needsSearch: false };
            }
        }
        
        // Check if we already have cached KB results that might answer this
        const cachedResult = this.getFromKBCache(userMessage.toLowerCase());
        if (cachedResult) {
            logger.info(`[Custom] Pre-flight: Using cached KB result`);
            // Still need to detect language for response
            const customerLang = this.detectMessageLanguage(userMessage);
            return { 
                needsSearch: true, 
                query: userMessage,
                cachedResult: cachedResult,
                waitMessage: null,  // No wait needed, we have cache
                customerLanguage: customerLang
            };
        }
        
        try {
            // Build context about what KB contains (if available from agent config)
            const kbDescription = this.agentConfig?.kb_description || 'location/area coverage, service availability, and regional information';
            
            // Build brief conversation context (last 3 exchanges)
            let conversationContext = '';
            const recentHistory = this.conversationHistory.slice(-6); // Last 3 exchanges
            if (recentHistory.length > 0) {
                conversationContext = '\nRECENT CONVERSATION:\n';
                for (const msg of recentHistory) {
                    const msgContent = msg.content || '';  // Handle null/undefined content
                    if (msg.role === 'user' && msgContent) {
                        conversationContext += `Customer: ${msgContent.substring(0, 100)}\n`;
                    } else if (msg.role === 'assistant' && msgContent) {
                        conversationContext += `Agent: ${msgContent.substring(0, 100)}\n`;
                    }
                }
            }
            
            const detectPrompt = `You are a query classifier. Decide if this question needs knowledge base search.
${conversationContext}
CURRENT MESSAGE: "${userMessage}"

The knowledge base contains: ${kbDescription}

Answer needs_search=true ONLY if:
- The question asks about specific locations, areas, or regions that HAVEN'T been answered yet
- The question needs data that changes by location/area
- The question explicitly asks to "check" or "look up" something NEW

Answer needs_search=false if:
- The question is about prices, products, or services (agent instructions have this)
- The question is conversational (greetings, confirmations, thanks)
- The question is about placing an order or giving personal info
- The question refers to information ALREADY provided in conversation
- The customer is frustrated about repeating information (don't search, just use context)
- The agent can answer from its general knowledge/instructions

Respond ONLY with JSON:
{"needs_search": true/false, "search_query": "short English keywords", "confidence": "high"}`;

            const response = await axios.post(
                `${this.llmProvider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'}/chat/completions`,
                {
                    model: this.llmModel,
                    messages: [{ role: 'user', content: detectPrompt }],
                    max_tokens: 100,
                    temperature: 0.1
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.llmApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 3000  // Quick timeout - this should be fast
                }
            );
            
            const content = response.data.choices[0]?.message?.content || '';
            logger.info(`[Custom] Pre-flight: LLM response: ${content ? content.substring(0, 100) : '(empty)'}`);
            
            // Track tokens
            if (response.data.usage) {
                this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + response.data.usage.prompt_tokens;
                this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + response.data.usage.completion_tokens;
                this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
            }
            
            // Parse JSON response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const decision = JSON.parse(jsonMatch[0]);
                logger.info(`[Custom] Pre-flight: Decision: needs_search=${decision.needs_search}, query="${decision.search_query}"`);
                
                if (decision.needs_search && decision.search_query) {
                    // Detect customer's language from their actual message
                    const customerLang = this.detectMessageLanguage(userMessage);
                    
                    // Generate wait message in SAME language as customer
                    let waitMessage;
                    if (customerLang === 'urdu') {
                        waitMessage = "ایک لمحہ، میں چیک کر لیتی ہوں۔";
                    } else if (customerLang === 'roman-urdu') {
                        waitMessage = "Ek lamha, main check kar leti hoon.";
                    } else {
                        waitMessage = "One moment, let me check.";
                    }
                    
                    logger.info(`[Custom] Pre-flight: Customer language=${customerLang}, wait message in same language`);
                    
                    return {
                        needsSearch: true,
                        query: decision.search_query,
                        confidence: decision.confidence || 'medium',
                        waitMessage: waitMessage,
                        customerLanguage: customerLang
                    };
                }
            } else {
                logger.warn(`[Custom] Pre-flight: Could not parse JSON from response`);
            }
            
            return { needsSearch: false };
            
        } catch (error) {
            logger.warn(`[Custom] Pre-flight KB detection failed: ${error.message}`);
            // On error, fall back to regular streaming (which has tool calls)
            return { needsSearch: false };
        }
    }
    
    /**
     * Detect language from message text
     * Returns: 'urdu' (Urdu script), 'roman-urdu' (Latin script Urdu), 'english'
     */
    detectMessageLanguage(message) {
        if (!message) return 'english';
        
        // Count Urdu script characters (Arabic script range)
        const urduChars = (message.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
        const totalChars = message.replace(/\s/g, '').length;
        
        if (totalChars === 0) return 'english';
        
        const urduRatio = urduChars / totalChars;
        
        // If more than 30% Urdu script characters, it's Urdu script
        if (urduRatio > 0.3) {
            return 'urdu';
        }
        
        // Check for Roman Urdu patterns (common Urdu words in Latin script)
        const romanUrduPatterns = /\b(aap|mein|mujhe|kya|hai|hain|nahi|ji|jee|shukriya|theek|acha|kahan|kab|kaisa|kitna|bohat|bahut|zaroor|please|abhi|kal|aaj|ghar|dukan|paani|pani|bottle|delivery|order)\b/i;
        if (romanUrduPatterns.test(message)) {
            return 'roman-urdu';
        }
        
        return 'english';
    }
    
    /**
     * Check if message is a simple acknowledgment that doesn't need full LLM processing
     * Examples: "اچھا جی", "ٹھیک ہے", "جی ہاں", "okay", "alright"
     */
    isSimpleAcknowledgment(message) {
        if (!message) return false;
        
        const wordCount = message.trim().split(/\s+/).filter(w => w.length > 0).length;
        
        // Must be short (3 words or less)
        if (wordCount > 3) return false;
        
        // Simple acknowledgment words in Urdu script
        const urduAcks = ['جی', 'ہاں', 'اچھا', 'ٹھیک', 'شکریہ', 'بس', 'ہیں', 'نہیں', 'السلام', 'وعلیکم'];
        
        // Simple acknowledgment words in Roman Urdu / English
        const romanAcks = ['ji', 'jee', 'haan', 'han', 'acha', 'achha', 'okay', 'ok', 'theek', 'thik', 
                          'shukriya', 'thanks', 'yes', 'no', 'nahi', 'bye', 'hello', 'hi', 'alright'];
        
        const words = message.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        // Check if ALL words are acknowledgment words
        const allAcks = words.every(word => {
            // Check Urdu acks
            for (const ack of urduAcks) {
                if (word.includes(ack) || ack.includes(word)) return true;
            }
            // Check Roman acks
            for (const ack of romanAcks) {
                if (word === ack || word.includes(ack)) return true;
            }
            return false;
        });
        
        return allAcks;
    }
    
    /**
     * Process with async KB search - much faster flow:
     * 1. Say wait message immediately
     * 2. Do KB search in background
     * 3. Generate response with KB context
     */
    async processWithAsyncKBSearch(kbDecision, processStartTime) {
        const { query, waitMessage, cachedResult, customerLanguage } = kbDecision;
        
        // CRITICAL: Reset streaming abort flag for new KB response
        this.streamingAborted = false;
        
        // If we have cached result, skip wait message and search
        if (cachedResult) {
            logger.info(`[Custom] ASYNC-KB: Using cached result, skipping wait message`);
            await this.generateKBResponse(cachedResult, processStartTime, customerLanguage);
            return;
        }
        
        // 1. Say wait message IMMEDIATELY (no LLM delay!)
        logger.info(`[Custom] ASYNC-KB: Saying wait message immediately`);
        const ttsPromise = this.synthesizeAndSend(waitMessage);
        this.emitTranscript('agent', waitMessage);
        
        // 2. Start KB search in parallel with TTS
        logger.info(`[Custom] ASYNC-KB: Starting search for "${query}"`);
        const searchStartTime = Date.now();
        
        let kbResult;
        try {
            kbResult = await this.kbSearchHandler.searchKnowledge(
                { query: query, top_k: 3 },
                { agentId: this.agentConfig?.id, tenantId: this.agentConfig?.tenant_id }
            );
            
            const searchTime = Date.now() - searchStartTime;
            // KB handler returns different structures - handle all
            const resultsCount = kbResult?.detailed_results?.length || 
                                kbResult?.text_results?.length || 
                                kbResult?.results_found || 0;
            logger.info(`[Custom] ASYNC-KB: Search completed in ${searchTime}ms, ${resultsCount} results`);
            
            // Cache the result
            this.addToKBCache(query.toLowerCase(), kbResult);
            
        } catch (error) {
            logger.error(`[Custom] ASYNC-KB: Search failed: ${error.message}`);
            kbResult = { error: error.message, detailed_results: [] };
        }
        
        // 3. Wait for TTS to finish before generating response
        await ttsPromise;
        
        // 4. Check if aborted during wait
        if (this.isDestroyed || this.streamingAborted) {
            logger.info(`[Custom] ASYNC-KB: Aborted during wait`);
            return;
        }
        
        // 5. Generate response with KB context AND customer's language
        await this.generateKBResponse(kbResult, processStartTime, customerLanguage);
    }
    
    /**
     * Generate LLM response using KB search results
     * Includes conversation history for context but ensures direct answers
     */
    async generateKBResponse(kbResult, processStartTime, customerLanguage = 'urdu') {
        const kbContext = this.formatKBResultsForPrompt(kbResult);
        
        // Get the last user message from history
        let lastUserMsg = '';
        for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
            if (this.conversationHistory[i].role === 'user' && this.conversationHistory[i].content) {
                lastUserMsg = this.conversationHistory[i].content;
                break;
            }
        }
        
        // Build conversation context summary (last few exchanges for context)
        let conversationContext = '';
        const recentHistory = this.conversationHistory.slice(-8); // Last 4 exchanges
        if (recentHistory.length > 2) {
            conversationContext = '\n\nRecent conversation context:\n';
            for (const msg of recentHistory) {
                const msgContent = msg.content || '';  // Handle null/undefined
                if (msg.role === 'user' && msgContent) {
                    conversationContext += `Customer: ${msgContent}\n`;
                } else if (msg.role === 'assistant' && msgContent) {
                    conversationContext += `Agent: ${msgContent}\n`;
                }
            }
        }
        
        // Determine language for response
        let langNote;
        if (customerLanguage === 'urdu') {
            langNote = 'اردو میں جواب دیں۔';
        } else if (customerLanguage === 'roman-urdu') {
            langNote = 'Roman Urdu mein jawab dein.';
        } else {
            langNote = 'Respond in English.';
        }
        
        // Include conversation context but ensure direct answers
        const systemPrompt = `You are a customer service agent. ${langNote}
CRITICAL RULES:
1. NEVER say "ایک لمحہ" or "let me check" - just give the answer directly.
2. USE the conversation context - don't ask questions the customer already answered.
3. If information is not available, apologize briefly and offer to help with something else.
4. Keep answers to 1-2 sentences.`;

        const userPrompt = `${conversationContext}
Current question: "${lastUserMsg}"

Information from database:
${kbContext}

Answer (direct, use conversation context, no waiting phrases):`;

        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
        
        try {
            if (this.useStreamingLLM) {
                await this.streamKBResponse(messages, processStartTime);
            } else {
                const response = await this.callLLMWithMessages(messages, { skipTools: true });
                if (response) {
                    const textResponse = typeof response === 'string' ? response : response.message || response.content;
                    if (textResponse) {
                        // Add to ACTUAL history for context
                        this.conversationHistory.push({ role: 'assistant', content: textResponse });
                        this.emitTranscript('agent', textResponse);
                        await this.synthesizeAndSend(textResponse);
                    }
                }
            }
            
            const totalTime = Date.now() - processStartTime;
            logger.info(`[Custom] ASYNC-KB: Total time ${totalTime}ms`);
            
        } catch (error) {
            logger.error(`[Custom] ASYNC-KB: Response generation failed: ${error.message}`);
            
            const errorMsg = customerLanguage === 'urdu'
                ? "معذرت، معلومات حاصل کرنے میں مسئلہ ہوا۔"
                : "Sorry, there was an issue getting the information.";
            await this.synthesizeAndSend(errorMsg);
        }
    }
    
    /**
     * Stream KB response with sentence-by-sentence TTS
     */
    async streamKBResponse(messages, processStartTime) {
        let fullResponse = '';
        let sentenceBuffer = '';
        let firstSentenceSent = false;
        
        // Ensure abort flag is clear for this new response
        this.streamingAborted = false;
        
        const sentenceEnders = /[.!?۔؟]\s*$/;
        const minSentenceLength = 15;  // Reduced for faster first sentence
        
        const baseUrl = this.llmProvider === 'groq' 
            ? 'https://api.groq.com/openai/v1' 
            : 'https://api.openai.com/v1';
        
        const requestBody = {
            model: this.llmModel,
            messages: messages,
            stream: true,
            temperature: 0.3,  // Lower temperature for more direct answers
            max_tokens: 150    // Shorter responses for KB answers
        };
        
        // Only add stream_options for OpenAI
        if (this.llmProvider !== 'groq') {
            requestBody.stream_options = { include_usage: true };
        }
        
        try {
            const response = await axios({
                method: 'post',
                url: `${baseUrl}/chat/completions`,
                data: requestBody,
                headers: {
                    'Authorization': `Bearer ${this.llmApiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                responseType: 'stream',
                timeout: 30000
            });
            
            return new Promise((resolve, reject) => {
                let buffer = '';
                
                response.data.on('data', async (chunk) => {
                    if (this.isDestroyed || this.streamingAborted) {
                        response.data.destroy();
                        resolve(fullResponse);
                        return;
                    }
                    
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            
                            // Track usage
                            if (parsed.usage) {
                                this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + parsed.usage.prompt_tokens;
                                this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + parsed.usage.completion_tokens;
                                this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
                            }
                            
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                fullResponse += content;
                                sentenceBuffer += content;
                                
                                // Check for sentence boundary
                                if (sentenceEnders.test(sentenceBuffer) && sentenceBuffer.length >= minSentenceLength) {
                                    const sentence = sentenceBuffer.trim();
                                    sentenceBuffer = '';
                                    
                                    if (!firstSentenceSent) {
                                        const timeToFirst = Date.now() - processStartTime;
                                        logger.info(`[Custom] ASYNC-KB: First sentence ready in ${timeToFirst}ms`);
                                        firstSentenceSent = true;
                                    }
                                    
                                    // Queue sentence for TTS (don't await - let it process in background)
                                    if (!this.isDestroyed && !this.streamingAborted) {
                                        this.synthesizeAndSend(sentence);  // No await!
                                    }
                                }
                            }
                        } catch (e) {
                            // Skip parse errors
                        }
                    }
                });
                
                response.data.on('end', async () => {
                    // Queue remaining text (don't await)
                    if (sentenceBuffer.trim() && !this.isDestroyed && !this.streamingAborted) {
                        this.synthesizeAndSend(sentenceBuffer.trim());
                    }
                    
                    // Wait for all queued TTS to complete
                    await this.waitForTTSQueue();
                    
                    // Add to history
                    if (fullResponse && !this.streamingAborted) {
                        this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                        this.emitTranscript('agent', fullResponse);
                    }
                    
                    resolve(fullResponse);
                });
                
                response.data.on('error', (error) => {
                    logger.error(`[Custom] ASYNC-KB streaming error: ${error.message}`);
                    reject(error);
                });
            });
            
        } catch (error) {
            logger.error(`[Custom] ASYNC-KB streaming request failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Call LLM with custom messages array
     */
    async callLLMWithMessages(messages, options = {}) {
        const baseUrl = this.llmProvider === 'groq' 
            ? 'https://api.groq.com/openai/v1' 
            : 'https://api.openai.com/v1';
        
        try {
            const response = await axios.post(
                `${baseUrl}/chat/completions`,
                {
                    model: this.llmModel,
                    messages: messages,
                    temperature: this.temperature || 0.7,
                    max_tokens: 500
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.llmApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            // Track usage
            if (response.data.usage) {
                this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + response.data.usage.prompt_tokens;
                this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + response.data.usage.completion_tokens;
                this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
            }
            
            return response.data.choices[0]?.message?.content;
            
        } catch (error) {
            logger.error(`[Custom] callLLMWithMessages error: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Format KB results for injection into prompt
     * Handles multiple KB result structures from kb-search-handler
     */
    formatKBResultsForPrompt(kbResult) {
        if (!kbResult) {
            return "No information found in knowledge base.";
        }
        
        // KB handler can return results in different structures:
        // - detailed_results: [{content, source, relevance}]
        // - text_results: [{content, score}]  
        // - message: formatted voice response
        // - matches: legacy format
        
        let context = "";
        
        // Try detailed_results first (most common from voice calls)
        if (kbResult.detailed_results && kbResult.detailed_results.length > 0) {
            for (const result of kbResult.detailed_results) {
                if (result.content) {
                    context += `- ${result.content}\n`;
                }
            }
        }
        // Try text_results (from API search)
        else if (kbResult.text_results && kbResult.text_results.length > 0) {
            for (const result of kbResult.text_results) {
                if (result.content) {
                    context += `- ${result.content}\n`;
                }
            }
        }
        // Use pre-formatted message if available
        else if (kbResult.message && kbResult.success) {
            context = kbResult.message;
        }
        // Legacy matches format
        else if (kbResult.matches && kbResult.matches.length > 0) {
            for (const match of kbResult.matches) {
                if (match.content) {
                    context += `- ${match.content}\n`;
                }
            }
        }
        
        if (!context || context.trim() === "") {
            return "No specific information found in knowledge base. The service area or information requested may not be available. Offer to connect them to support.";
        }
        
        return context;
    }
    
    /**
     * Process user message with streaming LLM and sentence-by-sentence TTS
     * This provides much faster time-to-first-audio
     */
    async processWithStreamingLLM(processStartTime) {
        let fullResponse = '';
        let sentenceQueue = [];
        let isFirstSentence = true;
        let ttsPromise = null;
        let toolCallResponse = null;
        
        // Reset abort flag at start
        this.streamingAborted = false;
        
        // TTS queue processor - plays sentences sequentially
        const processTTSQueue = async () => {
            while (sentenceQueue.length > 0 && !this.isDestroyed && !toolCallResponse && !this.streamingAborted) {
                const sentence = sentenceQueue.shift();
                if (sentence && sentence.trim()) {
                    if (isFirstSentence) {
                        const timeToFirstSentence = Date.now() - processStartTime;
                        logger.info(`[Custom] STREAMING: First sentence ready in ${timeToFirstSentence}ms`);
                        isFirstSentence = false;
                    }
                    
                    // Check abort before each TTS
                    if (this.streamingAborted) {
                        logger.info('[Custom] STREAMING: Aborted before TTS, skipping remaining sentences');
                        break;
                    }
                    
                    // Wait for TTS completion before next sentence
                    await this.synthesizeAndSend(sentence);
                }
            }
        };
        
        // Sentence callback - called for each complete sentence from streaming LLM
        const onSentence = async (sentence, isFirst) => {
            if (this.isDestroyed || this.streamingAborted) return;
            
            sentenceQueue.push(sentence);
            
            // Start TTS processing if not already running
            if (!ttsPromise || isFirst) {
                ttsPromise = processTTSQueue();
            }
        };
        
        try {
            // Call streaming LLM
            const response = await this.callLLMStreaming(true, onSentence);
            
            // CRITICAL: Check if destroyed or aborted after LLM call
            if (this.isDestroyed) {
                logger.info('[Custom] Aborting response - provider destroyed during streaming LLM');
                return;
            }
            
            if (this.streamingAborted) {
                logger.info('[Custom] STREAMING: Aborted by barge-in, not adding to history');
                const totalTime = Date.now() - processStartTime;
                logger.info(`[Custom] STREAMING: Aborted after ${totalTime}ms`);
                return;
            }
            
            // Check for tool call
            if (response && response.toolCall) {
                toolCallResponse = response;
                fullResponse = response.message || '';
                
                logger.info(`[Custom] Tool call detected: ${response.toolCall.name}`);
                
                // Wait for any pending TTS to complete (unless aborted)
                if (ttsPromise && !this.streamingAborted) {
                    await ttsPromise;
                }
                
                // Don't handle tool call if aborted
                if (this.streamingAborted) {
                    logger.info('[Custom] STREAMING: Aborted before tool call handling');
                    return;
                }
                
                // Handle tool call (existing logic)
                await this.handleStreamingToolCall(response, fullResponse);
                return;
            }
            
            // Text response
            fullResponse = typeof response === 'string' ? response : (response?.message || response?.content || '');
            
            // Wait for all TTS to complete (unless aborted)
            if (ttsPromise && !this.streamingAborted) {
                await ttsPromise;
            }
            
            // Add to conversation history (only if not aborted)
            if (fullResponse && !this.streamingAborted) {
                this.conversationHistory.push({ role: 'assistant', content: fullResponse });
                this.emitTranscript('agent', fullResponse);
            }
            
            const totalTime = Date.now() - processStartTime;
            logger.info(`[Custom] STREAMING: Total processing time ${totalTime}ms`);
            
        } catch (error) {
            // Don't fallback if aborted - that's expected
            if (this.streamingAborted) {
                logger.info('[Custom] STREAMING: Error after abort (expected):', error.message);
                return;
            }
            
            // If error is 'aborted', it was likely due to state change (Soniox reconnect, etc.)
            if (error.message === 'aborted') {
                logger.info('[Custom] Streaming aborted - likely due to state change, falling back to non-streaming');
            } else {
                logger.error('[Custom] Streaming LLM error, falling back to non-streaming:', error.message);
            }
            
            // Fallback to non-streaming
            await this.processWithNonStreamingLLM(processStartTime);
        }
    }
    
    /**
     * Handle tool calls from streaming LLM response
     */
    async handleStreamingToolCall(response, fullText) {
        const toolCall = response.toolCall;
        
        // Check for duplicate
        const funcKey = `${toolCall.name}:${JSON.stringify(toolCall.arguments || {})}`;
        if (this.calledFunctionsThisTurn.has(funcKey)) {
            logger.warn(`[Custom] Preventing duplicate: ${toolCall.name}`);
            return;
        }
        
        // Add assistant message with tool_calls to history
        this.conversationHistory.push({
            role: 'assistant',
            content: fullText || null,
            tool_calls: [{
                id: toolCall.id,
                type: 'function',
                function: {
                    name: toolCall.name,
                    arguments: JSON.stringify(toolCall.arguments || {})
                }
            }]
        });
        
        // Special handling for search_knowledge
        if (toolCall.name === 'search_knowledge') {
            // ALWAYS generate a wait message - use LLM's if available, otherwise default
            let waitMessage = fullText;
            
            if (!waitMessage || waitMessage.trim().length < 5) {
                // Generate default wait message based on script preference
                if (this.ttsConfig.scriptPreference === 'urdu') {
                    waitMessage = "ایک لمحہ، میں چیک کر لیتی ہوں۔";
                } else {
                    waitMessage = "Ek lamha, main check kar leti hoon.";
                }
                logger.info('[Custom] KB search: Using default wait message (LLM did not provide one)');
            }
            
            this.emitTranscript('agent', waitMessage);
            
            // TTS and KB search in parallel for faster response
            const ttsPromise = this.synthesizeAndSend(waitMessage);
            const kbPromise = this.handleToolCall(toolCall);
            await Promise.all([ttsPromise, kbPromise]);
        } else {
            // Handle other tool calls
            await this.handleToolCall(toolCall);
            
            // Say message if there is one
            if (fullText && !['transfer_to_agent', 'end_call'].includes(toolCall.name)) {
                this.emitTranscript('agent', fullText);
                await this.synthesizeAndSend(fullText);
            }
        }
    }
    
    /**
     * Fallback: Process with non-streaming LLM (original behavior)
     */
    async processWithNonStreamingLLM(processStartTime) {
        // Call LLM (non-streaming)
        const response = await this.callLLM();
        
        // CRITICAL: Check if destroyed after LLM call
        if (this.isDestroyed) {
            logger.info('[Custom] Aborting response - provider destroyed during LLM call');
            return;
        }
        
        const llmTime = Date.now() - processStartTime;
        logger.info(`[Custom] NON-STREAMING: LLM response in ${llmTime}ms`);
        
        if (response) {
            // Check for tool call
            if (response.toolCall) {
                logger.info(`[Custom] Tool call: ${response.toolCall.name}`);
                
                // Check for duplicate
                const funcKey = `${response.toolCall.name}:${JSON.stringify(response.toolCall.arguments || {})}`;
                if (this.calledFunctionsThisTurn.has(funcKey)) {
                    logger.warn(`[Custom] Preventing duplicate: ${response.toolCall.name}`);
                    if (response.message) {
                        await this.synthesizeAndSend(response.message);
                    }
                    return;
                }
                
                // Add assistant message with tool_calls to history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response.message || null,
                    tool_calls: [{
                        id: response.toolCall.id,
                        type: 'function',
                        function: {
                            name: response.toolCall.name,
                            arguments: JSON.stringify(response.toolCall.arguments || {})
                        }
                    }]
                });
                
                // Special handling for search_knowledge
                if (response.toolCall.name === 'search_knowledge') {
                    // ALWAYS generate a wait message - use LLM's if available, otherwise default
                    let waitMessage = response.message;
                    
                    if (!waitMessage || waitMessage.trim().length < 5) {
                        // Generate default wait message based on script preference
                        if (this.ttsConfig.scriptPreference === 'urdu') {
                            waitMessage = "ایک لمحہ، میں چیک کر لیتی ہوں۔";
                        } else {
                            waitMessage = "Ek lamha, main check kar leti hoon.";
                        }
                        logger.info('[Custom] KB search: Using default wait message (LLM did not provide one)');
                    }
                    
                    this.emitTranscript('agent', waitMessage);
                    const ttsPromise = this.synthesizeAndSend(waitMessage);
                    const kbPromise = this.handleToolCall(response.toolCall);
                    await Promise.all([ttsPromise, kbPromise]);
                } else {
                    await this.handleToolCall(response.toolCall);
                    
                    if (response.message && !['transfer_to_agent', 'end_call'].includes(response.toolCall.name)) {
                        this.emitTranscript('agent', response.message);
                        await this.synthesizeAndSend(response.message);
                    }
                }
            } else {
                // Regular text response
                const textResponse = typeof response === 'string' ? response : response.message || response.content;
                
                if (textResponse) {
                    this.conversationHistory.push({ role: 'assistant', content: textResponse });
                    this.emitTranscript('agent', textResponse);
                    await this.synthesizeAndSend(textResponse);
                }
            }
        }
    }
    
    async callLLM(options = {}) {
        // Don't call LLM if disconnected
        if (this.isDestroyed) {
            logger.info(`[Custom] Skipping LLM call - provider destroyed`);
            return null;
        }
        
        const { skipTools = false } = options;
        const isGroq = this.llmProvider === 'groq';
        const baseUrl = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
        
        // Build tools array (unless skipTools is true)
        const tools = [];
        
        if (!skipTools) {
            tools.push(
                {
                    type: 'function',
                    function: {
                        name: 'transfer_to_agent',
                        description: 'Transfer the call to a human agent queue when requested.',
                        parameters: {
                            type: 'object',
                            properties: {
                                queue: { type: 'string', description: 'Queue name (e.g., support, sales)' },
                                reason: { type: 'string', description: 'Reason for transfer' }
                            },
                            required: []
                        }
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'end_call',
                        description: 'End the call when conversation is complete.',
                        parameters: {
                            type: 'object',
                            properties: {
                                reason: { type: 'string', description: 'Reason for ending' }
                            },
                            required: []
                        }
                    }
                }
            );
            
            // NOTE: search_knowledge is NOT added as a tool here because we handle
            // KB search with pre-flight detection in processWithLLM(). This prevents
            // the LLM from calling it and causing double wait messages.
            
            // Add custom functions from agent config
            if (this.agentConfig?.functions && Array.isArray(this.agentConfig.functions)) {
                for (const func of this.agentConfig.functions) {
                    if (func.name && !['transfer_to_agent', 'end_call', 'search_knowledge'].includes(func.name)) {
                        tools.push({
                            type: 'function',
                            function: {
                                name: func.name,
                                description: func.description || `Execute ${func.name}`,
                                parameters: func.parameters || { type: 'object', properties: {} }
                            }
                        });
                    }
                }
            }
        }
        
        try {
            // Build messages with KB context if available
            let messages = [...this.conversationHistory];
            
            // Inject KB context into system message if we have cached results
            const kbContext = this.getKBContextForLLM();
            if (kbContext && messages.length > 0 && messages[0].role === 'system') {
                messages[0] = {
                    ...messages[0],
                    content: messages[0].content + kbContext
                };
            }
            
            const requestBody = {
                model: this.llmModel,
                messages: messages,
                temperature: parseFloat(this.agentConfig?.temperature) || 0.6,
                max_tokens: 500,
                stream: false
            };
            
            // Only include tools if we have any
            if (tools.length > 0) {
                requestBody.tools = tools;
                requestBody.tool_choice = 'auto';
            }
            
            const response = await axios.post(
                `${baseUrl}/chat/completions`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${this.llmApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );
            
            // Track LLM token usage - check both standard and Groq formats
            const usage = response.data.usage || response.data.x_groq?.usage;
            if (usage) {
                const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
                const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
                this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + inputTokens;
                this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + outputTokens;
                this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
                logger.info(`[Custom] LLM tokens: ${inputTokens} in, ${outputTokens} out (total: ${this.metrics.llmInputTokens}+${this.metrics.llmOutputTokens})`);
            } else {
                // Log when usage is missing for debugging
                logger.warn(`[Custom] LLM response missing usage data. Response keys: ${Object.keys(response.data).join(', ')}`);
                // Still count the call
                this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
            }
            
            const choice = response.data.choices[0];
            const message = choice?.message;
            
            // Check for tool call
            if (message?.tool_calls && message.tool_calls.length > 0) {
                const toolCall = message.tool_calls[0];
                let args = {};
                try {
                    args = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    logger.warn('[Custom] Failed to parse tool arguments');
                }
                
                return {
                    toolCall: {
                        id: toolCall.id,
                        name: toolCall.function.name,
                        arguments: args
                    },
                    message: message.content
                };
            }
            
            // Check for text-based function call in response (some models do this)
            const textFuncCall = this.parseTextFunctionCall(message?.content);
            if (textFuncCall) {
                return {
                    toolCall: textFuncCall,
                    message: textFuncCall.prefixText || null
                };
            }
            
            return message?.content || '';
        } catch (error) {
            // Handle Groq's tool_use_failed error - parse the failed_generation
            if (error.response?.data?.error?.code === 'tool_use_failed') {
                const failedGen = error.response.data.error.failed_generation;
                if (failedGen) {
                    logger.warn('[Custom] Groq tool_use_failed, parsing text-based function call');
                    const textFuncCall = this.parseTextFunctionCall(failedGen);
                    if (textFuncCall) {
                        return {
                            toolCall: textFuncCall,
                            message: textFuncCall.prefixText || null
                        };
                    }
                }
            }
            
            logger.error('[Custom] LLM error:', error.response?.data || error.message);
            throw error;
        }
    }
    
    /**
     * Parse text-based function calls like: <function=name {"arg": "value"}</function>
     * Groq sometimes outputs this format instead of proper tool_calls
     */
    parseTextFunctionCall(text) {
        if (!text) return null;
        
        // Pattern: <function=function_name {"key": "value", ...}</function>
        // or: <function=function_name {"key": "value", ...}>
        const funcMatch = text.match(/<function=(\w+)\s*(\{[^}]+\})\s*>?<?\/?function>?/);
        
        if (funcMatch) {
            const funcName = funcMatch[1];
            let args = {};
            
            try {
                args = JSON.parse(funcMatch[2]);
            } catch (e) {
                logger.warn(`[Custom] Failed to parse function args: ${funcMatch[2]}`);
            }
            
            // Extract any text before the function call (the "please wait" message)
            const prefixText = text.substring(0, text.indexOf('<function=')).trim();
            
            logger.info(`[Custom] Parsed text function call: ${funcName}(${JSON.stringify(args)})`);
            
            return {
                id: `text_func_${Date.now()}`,
                name: funcName,
                arguments: args,
                prefixText: prefixText || null
            };
        }
        
        return null;
    }
    
    /**
     * Call LLM with streaming for faster response
     * Sends sentences to TTS as they complete
     * @param {Function} onSentence - Callback for each complete sentence
     * @returns {Object} Full response (text or tool call)
     */
    async callLLMStreaming(includeTools = true, onSentence = null) {
        const baseUrl = this.llmProvider === 'groq' 
            ? 'https://api.groq.com/openai/v1'
            : 'https://api.openai.com/v1';
        
        // Build tools array (same as callLLM)
        let tools = [];
        if (includeTools) {
            // Transfer function
            tools.push({
                type: 'function',
                function: {
                    name: 'transfer_to_agent',
                    description: 'Transfer call to a human agent',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Reason for transfer' },
                            queue: { type: 'string', description: 'Queue to transfer to (default: support)' }
                        },
                        required: ['reason']
                    }
                }
            });
            
            // End call function
            tools.push({
                type: 'function',
                function: {
                    name: 'end_call',
                    description: 'End the call gracefully',
                    parameters: {
                        type: 'object',
                        properties: {
                            reason: { type: 'string', description: 'Reason for ending' }
                        },
                        required: []
                    }
                }
            });
            
            // NOTE: search_knowledge is NOT added here - handled by pre-flight detection
            
            // Custom functions
            if (this.agentConfig?.functions && Array.isArray(this.agentConfig.functions)) {
                for (const func of this.agentConfig.functions) {
                    if (func.name && !['transfer_to_agent', 'end_call', 'search_knowledge'].includes(func.name)) {
                        tools.push({
                            type: 'function',
                            function: {
                                name: func.name,
                                description: func.description || `Execute ${func.name}`,
                                parameters: func.parameters || { type: 'object', properties: {} }
                            }
                        });
                    }
                }
            }
        }
        
        // Build messages
        let messages = [...this.conversationHistory];
        const kbContext = this.getKBContextForLLM();
        if (kbContext && messages.length > 0 && messages[0].role === 'system') {
            messages[0] = {
                ...messages[0],
                content: messages[0].content + kbContext
            };
        }
        
        const requestBody = {
            model: this.llmModel,
            messages: messages,
            temperature: parseFloat(this.agentConfig?.temperature) || 0.6,
            max_tokens: 500,
            stream: true
        };
        
        // Only add stream_options for OpenAI (Groq doesn't support it)
        if (this.llmProvider !== 'groq') {
            requestBody.stream_options = { include_usage: true };
        }
        
        if (tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto';
        }
        
        // Track for token estimation if streaming fails
        const inputText = messages.map(m => m.content || '').join(' ');
        const estimatedInputTokens = Math.ceil(inputText.length / 4);  // ~4 chars per token
        
        let fullText = '';
        let sentenceBuffer = '';
        let toolCallChunks = {};
        let firstSentenceSent = false;
        let usageReceived = false;
        
        // Sentence boundary detection (English + Urdu)
        const sentenceEnders = /[.!?۔؟]\s*$/;
        const minSentenceLength = 20;
        
        const sendSentence = async (text) => {
            if (text.trim() && onSentence && !this.isDestroyed) {
                const isFirst = !firstSentenceSent;
                firstSentenceSent = true;
                
                await onSentence(text.trim(), isFirst);
            }
        };
        
        this.streamStartTime = Date.now();
        this.isStreamingResponse = true;
        
        try {
            // Use axios with responseType: 'stream' for better stability
            const response = await axios({
                method: 'post',
                url: `${baseUrl}/chat/completions`,
                data: requestBody,
                headers: {
                    'Authorization': `Bearer ${this.llmApiKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                responseType: 'stream',
                timeout: 30000
            });
            
            return new Promise((resolve, reject) => {
                let buffer = '';
                
                response.data.on('data', (chunk) => {
                    if (!this.isStreamingResponse || this.isDestroyed) {
                        response.data.destroy();
                        return;
                    }
                    
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;
                            
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta;
                                
                                if (delta?.content) {
                                    fullText += delta.content;
                                    sentenceBuffer += delta.content;
                                    
                                    // Check for sentence boundary
                                    if (sentenceEnders.test(sentenceBuffer) && sentenceBuffer.length >= minSentenceLength) {
                                        const sentence = sentenceBuffer;
                                        sentenceBuffer = '';
                                        sendSentence(sentence);
                                    }
                                }
                                
                                // Handle tool calls
                                if (delta?.tool_calls) {
                                    for (const tc of delta.tool_calls) {
                                        const idx = tc.index || 0;
                                        if (!toolCallChunks[idx]) {
                                            toolCallChunks[idx] = { id: '', name: '', arguments: '' };
                                        }
                                        if (tc.id) toolCallChunks[idx].id = tc.id;
                                        if (tc.function?.name) toolCallChunks[idx].name = tc.function.name;
                                        if (tc.function?.arguments) toolCallChunks[idx].arguments += tc.function.arguments;
                                    }
                                }
                                
                                // Track usage (OpenAI sends in final chunk with stream_options)
                                if (parsed.usage) {
                                    usageReceived = true;
                                    const inputTokens = parsed.usage.prompt_tokens || 0;
                                    const outputTokens = parsed.usage.completion_tokens || 0;
                                    this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + inputTokens;
                                    this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + outputTokens;
                                    this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
                                    logger.info(`[Custom] LLM tokens (streaming): ${inputTokens} in, ${outputTokens} out (total: ${this.metrics.llmInputTokens}+${this.metrics.llmOutputTokens})`);
                                }
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                });
                
                response.data.on('end', async () => {
                    this.isStreamingResponse = false;
                    
                    // Send remaining text
                    if (sentenceBuffer.trim()) {
                        await sendSentence(sentenceBuffer);
                    }
                    
                    // Estimate tokens if usage not received (Groq or stream interrupted)
                    if (!usageReceived && fullText) {
                        const estimatedOutputTokens = Math.ceil(fullText.length / 4);
                        this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + estimatedInputTokens;
                        this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + estimatedOutputTokens;
                        this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
                        logger.info(`[Custom] LLM tokens (estimated): ~${estimatedInputTokens} in, ~${estimatedOutputTokens} out (total: ${this.metrics.llmInputTokens}+${this.metrics.llmOutputTokens})`);
                    }
                    
                    // Check for tool calls
                    const toolCallIds = Object.keys(toolCallChunks);
                    if (toolCallIds.length > 0) {
                        const tc = toolCallChunks[0];
                        let args = {};
                        try {
                            args = JSON.parse(tc.arguments || '{}');
                        } catch (e) {
                            logger.warn('[Custom] Failed to parse streaming tool arguments');
                        }
                        
                        resolve({
                            toolCall: {
                                id: tc.id || `stream_${Date.now()}`,
                                name: tc.name,
                                arguments: args
                            },
                            message: fullText || null
                        });
                    } else {
                        resolve(fullText);
                    }
                });
                
                response.data.on('error', (error) => {
                    this.isStreamingResponse = false;
                    
                    // If we have partial text, return it instead of failing
                    if (fullText.trim()) {
                        logger.warn(`[Custom] Streaming interrupted but have partial response: ${fullText.length} chars`);
                        
                        // Send remaining text
                        if (sentenceBuffer.trim()) {
                            sendSentence(sentenceBuffer);
                        }
                        
                        // Estimate tokens for partial response
                        const estimatedOutputTokens = Math.ceil(fullText.length / 4);
                        this.metrics.llmInputTokens = (this.metrics.llmInputTokens || 0) + estimatedInputTokens;
                        this.metrics.llmOutputTokens = (this.metrics.llmOutputTokens || 0) + estimatedOutputTokens;
                        this.metrics.llmCalls = (this.metrics.llmCalls || 0) + 1;
                        
                        resolve(fullText);
                    } else if (error.message === 'aborted' || this.streamingAborted) {
                        // Stream was intentionally aborted (barge-in or state change) - not a real error
                        logger.info('[Custom] Streaming aborted (intentional or state change)');
                        reject(new Error('aborted'));
                    } else {
                        logger.error('[Custom] Streaming error with no response:', error.message);
                        reject(error);
                    }
                });
            });
            
        } catch (error) {
            this.isStreamingResponse = false;
            
            // If we have partial text, return it
            if (fullText.trim()) {
                logger.warn(`[Custom] Streaming request failed but have partial response: ${fullText.length} chars`);
                return fullText;
            }
            
            logger.error('[Custom] Streaming request error:', error.message);
            throw error;
        }
    }
    
    // =========================================================================
    // TOOL CALL HANDLING
    // =========================================================================
    
    async handleToolCall(toolCall) {
        const name = toolCall.name;
        const args = toolCall.arguments || {};
        
        logger.info(`[Custom] Handling tool: ${name}`, JSON.stringify(args));
        
        // Mark as called
        const funcKey = `${name}:${JSON.stringify(args)}`;
        this.calledFunctionsThisTurn.add(funcKey);
        this.functionCallDepth++;
        
        switch (name) {
            case 'transfer_to_agent':
                // Add tool response to history BEFORE handling (prevents 400 errors)
                this.conversationHistory.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ status: 'transferring', queue: args.queue || 'support' })
                });
                await this.handleTransfer(args);
                break;
                
            case 'end_call':
                // Add tool response to history BEFORE handling
                this.conversationHistory.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ status: 'ending_call', reason: args.reason || 'completed' })
                });
                await this.handleEndCall(args);
                break;
                
            case 'search_knowledge':
                await this.handleKBSearch(args, toolCall.id);
                break;
                
            default:
                // Custom function (post_lead, check_order_status, etc.)
                await this.handleCustomFunction(name, args, toolCall.id);
                break;
        }
    }
    
    /**
     * Handle custom/API functions like post_lead, check_order_status
     * Emits function.call event for connection-manager to execute via FunctionExecutor
     */
    async handleCustomFunction(name, args, toolCallId) {
        // Say "please wait" while processing - use appropriate script
        let pleaseWait;
        if (this.ttsConfig.scriptPreference === 'urdu') {
            pleaseWait = "ایک لمحہ، میں آپ کی درخواست پر کام کر رہی ہوں۔";
        } else {
            pleaseWait = "Ek lamha, main aap ki darkhwast process kar rahi hoon.";
        }
        
        this.emitTranscript('agent', pleaseWait);
        await this.synthesizeAndSend(pleaseWait);
        
        this.isWaitingForFunction = true;
        this.pendingFunctionCallId = toolCallId;
        
        // Emit function.call event for connection-manager to handle
        // Format matches what connection-manager.handleFunctionCall expects
        logger.info(`[Custom] Emitting function.call: ${name} (call_id: ${toolCallId})`);
        this.emit('function.call', {
            name: name,
            call_id: toolCallId,
            arguments: JSON.stringify(args)
        });
        
        // connection-manager will call sendFunctionResponse when done
    }
    
    /**
     * Receive function result from connection-manager
     * This is called by connection-manager after FunctionExecutor completes
     * @param {string} callId - The tool call ID
     * @param {object} result - The function execution result
     */
    async sendFunctionResponse(callId, result) {
        // Don't process if disconnected
        if (this.isDestroyed) {
            logger.info(`[Custom] Ignoring function response - provider destroyed`);
            return false;
        }
        
        logger.info(`[Custom] Received function response for call_id: ${callId}`, JSON.stringify(result).substring(0, 200));
        
        try {
            // Add tool result to conversation history for OpenAI format
            this.conversationHistory.push({
                role: 'tool',
                tool_call_id: callId,
                content: JSON.stringify(result)
            });
            
            // Set flag to false BEFORE TTS
            this.isWaitingForFunction = false;
            this.pendingFunctionCallId = null;
            
            // Call LLM to generate response based on function result
            const response = await this.callLLM({ skipTools: true });
            
            if (response) {
                const textResponse = typeof response === 'string' ? response : response.message || response.content;
                if (textResponse) {
                    this.conversationHistory.push({ role: 'assistant', content: textResponse });
                    this.emitTranscript('agent', textResponse);
                    await this.synthesizeAndSend(textResponse);
                }
            }
            
            return true;
        } catch (error) {
            logger.error(`[Custom] Error processing function response:`, error);
            
            this.isWaitingForFunction = false;
            this.pendingFunctionCallId = null;
            
            // Generate error response - use appropriate script
            let errorMsg;
            if (this.ttsConfig.scriptPreference === 'urdu') {
                errorMsg = "معذرت، کچھ مسئلہ ہو گیا۔ کیا آپ دوبارہ کوشش کر سکتے ہیں؟";
            } else {
                errorMsg = "Maazrat, kuch masla ho gaya. Kya aap dobara koshish kar sakte hain?";
            }
            this.conversationHistory.push({ role: 'assistant', content: errorMsg });
            this.emitTranscript('agent', errorMsg);
            await this.synthesizeAndSend(errorMsg);
            
            return false;
        }
    }
    
    async handleTransfer(args) {
        const queue = args.queue || this.defaultTransferQueue || 'support';
        
        // Say transfer message - use appropriate script
        let transferMsg;
        if (this.ttsConfig.scriptPreference === 'urdu') {
            transferMsg = `میں آپ کو ابھی ${queue} سے ملا رہی ہوں۔ برائے کرم انتظار کریں۔`;
        } else {
            transferMsg = `Main aap ko abhi ${queue} se mila rahi hoon. Intezar kariye.`;
        }
        this.emitTranscript('agent', transferMsg);
        await this.synthesizeAndSend(transferMsg);
        
        // Wait for TTS then transfer
        const ttsDuration = this.lastTTSBytes > 0 ? Math.ceil(this.lastTTSBytes / 8) : 2000;
        
        setTimeout(() => {
            logger.info(`[Custom] Executing transfer to: ${queue}`);
            this.emit('transfer.requested', {
                queue: queue,
                reason: args.reason || 'user_request'
            });
        }, ttsDuration + 1000);
    }
    
    async handleEndCall(args) {
        // Use appropriate default goodbye message based on script
        let defaultGoodbye;
        if (this.ttsConfig.scriptPreference === 'urdu') {
            defaultGoodbye = 'کال کرنے کا شکریہ۔ اللہ حافظ!';
        } else {
            defaultGoodbye = 'Call karne ka shukriya. Allah Hafiz!';
        }
        const goodbyeMsg = args.message || defaultGoodbye;
        this.emitTranscript('agent', goodbyeMsg);
        await this.synthesizeAndSend(goodbyeMsg);
        
        const ttsDuration = this.lastTTSBytes > 0 ? Math.ceil(this.lastTTSBytes / 8) : 2000;
        
        setTimeout(() => {
            logger.info('[Custom] Ending call');
            this.emit('session.ended', { reason: args.reason || 'completed' });
        }, ttsDuration + 1000);
    }
    
    async handleKBSearch(args, toolCallId) {
        const query = args.query || '';
        const normalizedQuery = query.toLowerCase().trim();
        
        // Check for cooldown - prevent rapid-fire searches
        const now = Date.now();
        const timeSinceLastSearch = now - this.lastKBSearchTime;
        
        if (timeSinceLastSearch < this.kbSearchCooldown) {
            logger.warn(`[Custom] KB search cooldown (${timeSinceLastSearch}ms < ${this.kbSearchCooldown}ms), skipping`);
            
            // Check KB cache first
            const cachedResult = this.getFromKBCache(normalizedQuery);
            
            // Add a placeholder tool response
            this.conversationHistory.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify(cachedResult || { 
                    note: 'Search skipped due to cooldown. Please use previously retrieved information.',
                    cachedResults: this.getKBCacheSummary()
                })
            });
            
            // Generate response without new search
            const response = await this.callLLM({ skipTools: true });
            if (response) {
                const textResponse = typeof response === 'string' ? response : response.message || response.content;
                if (textResponse) {
                    // Wait for any "please wait" TTS to finish
                    await this.waitForTTSComplete();
                    this.conversationHistory.push({ role: 'assistant', content: textResponse });
                    this.emitTranscript('agent', textResponse);
                    await this.synthesizeAndSend(textResponse);
                }
            }
            return;
        }
        
        // Check for similar recent query in cache
        const cachedResult = this.getFromKBCache(normalizedQuery);
        if (cachedResult) {
            logger.info(`[Custom] Using cached KB result for: "${query}"`);
            
            // Add cached result as tool response
            this.conversationHistory.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify(cachedResult)
            });
            
            // Generate response from cache
            const response = await this.callLLM({ skipTools: true });
            if (response) {
                const textResponse = typeof response === 'string' ? response : response.message || response.content;
                if (textResponse) {
                    // Wait for any "please wait" TTS to finish
                    await this.waitForTTSComplete();
                    this.conversationHistory.push({ role: 'assistant', content: textResponse });
                    this.emitTranscript('agent', textResponse);
                    await this.synthesizeAndSend(textResponse);
                }
            }
            return;
        }
        
        // NOTE: The LLM generates a natural "please wait" message which is played 
        // in PARALLEL with this search (from processWithLLM). We use waitForTTSComplete()
        // before playing the KB response to ensure the wait message finishes first.
        
        this.isWaitingForFunction = true;
        this.lastKBSearchTime = now;
        let toolResponseAdded = false;
        
        try {
            logger.info(`[Custom] KB search starting: "${query}"`);
            
            // Perform search
            const result = await this.kbSearchHandler.searchKnowledge(
                { query: args.query, top_k: args.top_k || 3 },
                { agentId: this.agentConfig?.id, tenantId: this.agentConfig?.tenant_id }
            );
            
            logger.info(`[Custom] KB search completed, results: ${result?.matches?.length || 0} matches`);
            
            // Cache the result
            this.addToKBCache(normalizedQuery, result);
            
            // Also add to recent queries for duplicate detection
            this.recentKBQueries.push({ query: normalizedQuery, timestamp: now, result });
            if (this.recentKBQueries.length > this.maxRecentKBQueries) {
                this.recentKBQueries.shift(); // Remove oldest
            }
            
            // Add tool result to history
            this.conversationHistory.push({
                role: 'tool',
                tool_call_id: toolCallId,
                content: JSON.stringify(result)
            });
            toolResponseAdded = true;
            
            // CRITICAL: Set flag to false BEFORE LLM call
            // This allows processing of user messages during the (potentially long) LLM call
            this.isWaitingForFunction = false;
            
            // Call LLM again to generate response based on results
            // Skip tools to prevent recursive tool calls and API errors
            logger.info(`[Custom] KB search: calling LLM to generate response`);
            const response = await this.callLLM({ skipTools: true });
            
            if (response) {
                const textResponse = typeof response === 'string' ? response : response.message || response.content;
                if (textResponse) {
                    logger.info(`[Custom] KB search: LLM response received (${textResponse.length} chars)`);
                    
                    // Wait for any ongoing "please wait" TTS to finish before playing response
                    await this.waitForTTSComplete();
                    
                    this.conversationHistory.push({ role: 'assistant', content: textResponse });
                    this.emitTranscript('agent', textResponse);
                    await this.synthesizeAndSend(textResponse);
                    logger.info(`[Custom] KB search: TTS playback completed`);
                } else {
                    logger.warn(`[Custom] KB search: LLM returned empty text response`);
                }
            } else {
                logger.warn(`[Custom] KB search: LLM returned null/undefined response`);
            }
        } catch (error) {
            logger.error('[Custom] KB search error:', error);
            
            // CRITICAL: Add tool response to history if not already added
            // Otherwise OpenAI will reject subsequent requests
            if (!toolResponseAdded) {
                this.conversationHistory.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: JSON.stringify({ error: 'Search failed', message: error.message })
                });
            }
            
            // Set flag to false BEFORE TTS
            this.isWaitingForFunction = false;
            
            // Wait for any "please wait" TTS to finish
            await this.waitForTTSComplete();
            
            // Use appropriate script for error message
            let errorMsg;
            if (this.ttsConfig.scriptPreference === 'urdu') {
                errorMsg = "معذرت، میں یہ معلومات نہیں ڈھونڈ سکی۔ کیا آپ دوبارہ کوشش کر سکتے ہیں؟";
            } else {
                errorMsg = "Maazrat, main yeh maloomat nahi dhoond saki. Kya aap dobara koshish kar sakte hain?";
            }
            this.conversationHistory.push({ role: 'assistant', content: errorMsg });
            await this.synthesizeAndSend(errorMsg);
        } finally {
            // Safety net - ensure flag is always cleared
            this.isWaitingForFunction = false;
        }
    }
    
    // Calculate similarity between two queries using word overlap
    calculateQuerySimilarity(query1, query2) {
        const words1 = new Set(query1.split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(query2.split(/\s+/).filter(w => w.length > 2));
        
        if (words1.size === 0 || words2.size === 0) return 0;
        
        let intersection = 0;
        for (const word of words1) {
            if (words2.has(word)) intersection++;
        }
        
        const union = new Set([...words1, ...words2]).size;
        return intersection / union; // Jaccard similarity
    }
    
    // =========================================================================
    // KB CACHE METHODS - Store KB results in call memory
    // =========================================================================
    
    /**
     * Add KB search result to cache
     * @param {string} query - Normalized search query
     * @param {object} result - Search result
     */
    addToKBCache(query, result) {
        const cacheKey = this.normalizeKBQuery(query);
        this.kbCache.set(cacheKey, {
            result: result,
            timestamp: Date.now(),
            query: query
        });
        logger.info(`[Custom] KB cache updated. Total cached: ${this.kbCache.size}`);
    }
    
    /**
     * Get from KB cache with similarity matching
     * @param {string} query - Search query
     * @returns {object|null} Cached result or null
     */
    getFromKBCache(query) {
        const normalizedQuery = this.normalizeKBQuery(query);
        const now = Date.now();
        
        // Check for exact match first
        if (this.kbCache.has(normalizedQuery)) {
            const cached = this.kbCache.get(normalizedQuery);
            if (now - cached.timestamp < this.kbCacheTTL) {
                logger.info(`[Custom] KB cache HIT (exact): "${query}"`);
                return cached.result;
            }
            // Expired, remove it
            this.kbCache.delete(normalizedQuery);
        }
        
        // Check for similar queries (70% similarity threshold)
        for (const [key, cached] of this.kbCache.entries()) {
            if (now - cached.timestamp >= this.kbCacheTTL) {
                this.kbCache.delete(key); // Clean up expired
                continue;
            }
            
            const similarity = this.calculateQuerySimilarity(normalizedQuery, key);
            if (similarity >= 0.7) {
                logger.info(`[Custom] KB cache HIT (similar ${Math.round(similarity * 100)}%): "${query}" ≈ "${cached.query}"`);
                return cached.result;
            }
        }
        
        logger.info(`[Custom] KB cache MISS: "${query}"`);
        return null;
    }
    
    /**
     * Normalize KB query for caching
     */
    normalizeKBQuery(query) {
        return query.toLowerCase().trim()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ');   // Normalize spaces
    }
    
    /**
     * Get summary of cached KB results for context
     * @returns {array} Summary of cached results
     */
    getKBCacheSummary() {
        const summary = [];
        const now = Date.now();
        
        for (const [key, cached] of this.kbCache.entries()) {
            if (now - cached.timestamp < this.kbCacheTTL) {
                summary.push({
                    query: cached.query,
                    timestamp: cached.timestamp,
                    hasResults: cached.result && (cached.result.results?.length > 0 || cached.result.success)
                });
            }
        }
        
        return summary;
    }
    
    /**
     * Get full KB context string for system prompt injection
     * @returns {string} KB context for LLM
     */
    getKBContextForLLM() {
        const now = Date.now();
        const contextParts = [];
        
        // Add KB search results
        for (const [key, cached] of this.kbCache.entries()) {
            if (now - cached.timestamp < this.kbCacheTTL && cached.result) {
                const resultStr = typeof cached.result === 'string' 
                    ? cached.result 
                    : JSON.stringify(cached.result);
                contextParts.push(`Query: "${cached.query}"\nResult: ${resultStr.substring(0, 500)}`);
            }
        }
        
        // Extract customer context from conversation history
        const customerContext = this.extractCustomerContext();
        
        let result = '';
        
        if (contextParts.length > 0) {
            result += `\n\n=== VERIFIED INFORMATION (from previous searches) ===\n${contextParts.join('\n---\n')}`;
        }
        
        if (customerContext) {
            result += `\n\n=== CUSTOMER ALREADY PROVIDED (DO NOT ASK AGAIN) ===\n${customerContext}`;
        }
        
        return result;
    }
    
    /**
     * Extract customer info from conversation history
     * Prevents agent from asking for info already provided
     */
    extractCustomerContext() {
        const context = [];
        const history = this.conversationHistory;
        
        // Look for city/area mentions in recent history
        const cityPatterns = [
            /گوجرانوالہ|gujranwala/i,
            /لاہور|lahore/i,
            /ملتان|multan/i,
            /فیصل آباد|faisalabad/i,
            /راولپنڈی|rawalpindi/i,
            /اسلام آباد|islamabad/i,
            /کراچی|karachi/i
        ];
        
        const areaKeywords = ['ٹاؤن', 'town', 'فیز', 'phase', 'بلاک', 'block', 'سیکٹر', 'sector', 'کالونی', 'colony', 'واپڈا', 'wapda', 'dha', 'ڈی ایچ اے'];
        
        // Check customer messages for locations
        for (const msg of history) {
            if (msg.role === 'user') {
                const content = msg.content.toLowerCase();
                
                // Check for city mentions
                for (const pattern of cityPatterns) {
                    if (pattern.test(msg.content)) {
                        const match = msg.content.match(pattern);
                        if (match && !context.includes(`City: ${match[0]}`)) {
                            context.push(`City: ${match[0]}`);
                        }
                    }
                }
                
                // Check for area mentions
                for (const keyword of areaKeywords) {
                    if (content.includes(keyword.toLowerCase())) {
                        // Extract phrase around the keyword
                        const words = msg.content.split(/\s+/);
                        const idx = words.findIndex(w => w.toLowerCase().includes(keyword.toLowerCase()));
                        if (idx >= 0) {
                            const areaPhrase = words.slice(Math.max(0, idx - 1), idx + 2).join(' ');
                            if (areaPhrase.length > 3 && !context.some(c => c.includes(areaPhrase))) {
                                context.push(`Area mentioned: ${areaPhrase}`);
                            }
                        }
                    }
                }
            }
        }
        
        // Check if name was provided
        const namePatterns = [/میرا نام.*?ہے|my name is|naam hai|نام ہے/i];
        for (const msg of history) {
            if (msg.role === 'user') {
                for (const pattern of namePatterns) {
                    if (pattern.test(msg.content)) {
                        context.push(`Customer has provided their name`);
                        break;
                    }
                }
            }
        }
        
        // Check if order quantity was mentioned
        const quantityPatterns = [/(\d+)\s*(بوتل|bottle|بوٹل)/i, /(پانچ|چار|تین|دو|ایک|five|four|three|two|one)\s*(بوتل|bottle)/i];
        for (const msg of history) {
            if (msg.role === 'user') {
                for (const pattern of quantityPatterns) {
                    const match = msg.content.match(pattern);
                    if (match) {
                        context.push(`Order quantity mentioned: ${match[0]}`);
                        break;
                    }
                }
            }
        }
        
        if (context.length === 0) return '';
        
        return context.join('\n') + '\n\nIMPORTANT: Do not ask for information the customer has already provided above!';
    }
    
    // =========================================================================
    // WAIT/HOLD DETECTION
    // =========================================================================
    
    isWaitSignal(message) {
        const lower = message.toLowerCase().trim();
        const waitPhrases = [
            'hold on', 'hold please', 'please hold', 'one moment', 'one second',
            'just a moment', 'just a second', 'wait', 'wait a moment', 'hang on',
            'give me a moment', 'one sec', 'gimme a sec', 'bear with me'
        ];
        
        for (const phrase of waitPhrases) {
            if (lower.includes(phrase)) return true;
        }
        
        const shortWaitWords = ['hold', 'wait', 'pause', 'moment', 'second'];
        const words = lower.split(/\s+/);
        if (words.length <= 3) {
            for (const word of shortWaitWords) {
                if (lower.includes(word)) return true;
            }
        }
        
        return false;
    }
    
    isIdentityConfirmation(message) {
        const lower = message.toLowerCase().trim();
        const confirmPhrases = [
            'this is', 'speaking', 'yes this is', "that's me", 'its me',
            "i'm here", 'im here', 'go ahead', "i'm back", 'back now',
            'how can i help', 'what can i do'
        ];
        
        for (const phrase of confirmPhrases) {
            if (lower.includes(phrase)) return true;
        }
        
        if (this.isWaitingForUser && lower.match(/^(yes|yeah|yep|yup|okay|ok|hi|hello|hey)$/i)) {
            return true;
        }
        
        return false;
    }
    
    // =========================================================================
    // TTS SYNTHESIS
    // =========================================================================
    
    /**
     * Wait for any ongoing TTS playback to complete
     * @param {number} maxWait - Maximum wait time in ms (default 30000)
     */
    async waitForTTSComplete(maxWait = 30000) {
        if (!this.isSpeaking) return;
        
        const startTime = Date.now();
        logger.info('[Custom] Waiting for TTS to complete...');
        
        while (this.isSpeaking && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.isDestroyed) break;
        }
        
        if (this.isSpeaking) {
            logger.warn('[Custom] TTS wait timeout, proceeding anyway');
        } else {
            logger.info(`[Custom] TTS completed after ${Date.now() - startTime}ms`);
        }
    }
    
    /**
     * Queue text for sequential TTS playback
     * This ensures sentences are played in order without overlap
     */
    async queueAndSpeak(text) {
        if (!text || text.trim().length === 0 || this.isDestroyed) return;
        
        // Add to queue
        return new Promise((resolve, reject) => {
            this.ttsQueue.push({ text, resolve, reject });
            this.processTTSQueue();
        });
    }
    
    /**
     * Process TTS queue - ensures only one TTS runs at a time
     */
    async processTTSQueue() {
        // If already processing, the current processor will handle the queue
        if (this.ttsProcessing) return;
        
        this.ttsProcessing = true;
        
        while (this.ttsQueue.length > 0 && !this.isDestroyed) {
            const item = this.ttsQueue.shift();
            if (!item) break;
            
            try {
                await this.synthesizeAndSendInternal(item.text);
                item.resolve();
            } catch (error) {
                item.reject(error);
            }
        }
        
        this.ttsProcessing = false;
    }
    
    /**
     * Clear the TTS queue and stop current playback (for barge-in)
     */
    clearTTSQueue() {
        // Reject all pending items
        while (this.ttsQueue.length > 0) {
            const item = this.ttsQueue.shift();
            if (item) item.resolve(); // Resolve (don't reject) to avoid error handling
        }
        this.ttsProcessing = false;
    }
    
    /**
     * Wait for TTS queue to drain (all sentences played)
     */
    async waitForTTSQueue(maxWait = 30000) {
        const startTime = Date.now();
        
        while ((this.ttsQueue.length > 0 || this.ttsProcessing) && (Date.now() - startTime) < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.isDestroyed || this.streamingAborted) break;
        }
    }
    
    async synthesizeAndSend(text) {
        // Use queue-based playback to ensure sequential audio
        return this.queueAndSpeak(text);
    }
    
    async synthesizeAndSendInternal(text) {
        // Don't synthesize if disconnected
        if (this.isDestroyed) {
            logger.info(`[Custom] Skipping TTS - provider destroyed`);
            return;
        }
        
        if (!text || text.trim().length === 0) return;
        
        // Clean text for TTS
        const cleanedText = this.cleanTextForTTS(text);
        if (!cleanedText) return;
        
        logger.info(`[Custom] TTS: "${cleanedText.substring(0, 50)}..."`);
        
        // Track TTS characters for cost metrics
        this.metrics.ttsCharacters = (this.metrics.ttsCharacters || 0) + cleanedText.length;
        
        // CRITICAL: Clear any existing playback/timers before starting new TTS
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        
        // Mark as speaking
        this.isSpeaking = true;
        this.ttsStartTime = Date.now();
        this.emit('speaking.started');
        
        try {
            let audioBuffer = null;
            
            switch (this.ttsProvider) {
                case 'elevenlabs':
                    audioBuffer = await this.synthesizeElevenLabs(cleanedText);
                    break;
                case 'deepgram':
                    audioBuffer = await this.synthesizeDeepgram(cleanedText);
                    break;
                case 'openai':
                    audioBuffer = await this.synthesizeOpenAI(cleanedText);
                    break;
                case 'uplift':
                    audioBuffer = await this.synthesizeUplift(cleanedText);
                    break;
                case 'azure':
                    audioBuffer = await this.synthesizeAzure(cleanedText);
                    break;
                default:
                    audioBuffer = await this.synthesizeElevenLabs(cleanedText);
            }
            
            if (!audioBuffer || audioBuffer.length === 0) {
                logger.warn('[Custom] TTS returned empty audio');
                this.isSpeaking = false;
                this.emit('speaking.stopped');
                return;
            }
            
            // CRITICAL: Check if destroyed after TTS call (which can take time)
            if (this.isDestroyed) {
                logger.info('[Custom] Aborting TTS playback - provider destroyed during synthesis');
                this.isSpeaking = false;
                return;
            }
            
            // Stream audio to connection manager via audio.delta events
            await this.playAudioBuffer(audioBuffer);
            
        } catch (error) {
            this.isSpeaking = false;
            if (this.speakingTimer) {
                clearTimeout(this.speakingTimer);
                this.speakingTimer = null;
            }
            logger.error('[Custom] TTS error:', error);
            this.emit('speaking.stopped');
            this.emit('error', error);
        }
    }
    
    /**
     * Play audio buffer by streaming it to the connection manager
     * Emits audio events with base64 encoded chunks
     * @param {Buffer} buffer - mulaw 8kHz audio buffer
     */
    async playAudioBuffer(buffer) {
        return new Promise((resolve) => {
            // Don't play if disconnected
            if (this.isDestroyed) {
                logger.info(`[Custom] Skipping playback - provider destroyed`);
                resolve();
                return;
            }
            
            // Store resolve so we can call it from barge-in
            this.playbackResolve = resolve;
            
            if (!buffer || buffer.length === 0) {
                this.isSpeaking = false;
                this.emit('speaking.stopped');
                this.playbackResolve = null;
                resolve();
                return;
            }
            
            // CRITICAL: Clear any existing playback before starting new one
            if (this.playbackInterval) {
                clearInterval(this.playbackInterval);
                this.playbackInterval = null;
            }
            if (this.speakingTimer) {
                clearTimeout(this.speakingTimer);
                this.speakingTimer = null;
            }
            if (this.safetyTimeout) {
                clearTimeout(this.safetyTimeout);
                this.safetyTimeout = null;
            }
            
            // Chunk size: 160 bytes = 20ms of audio at 8kHz mulaw
            const chunkSize = 160;
            const intervalMs = 20;
            
            this.lastTTSBytes = buffer.length;
            let position = 0;
            
            const playbackDuration = Math.ceil(buffer.length / 8); // ms
            logger.info(`[Custom] Playing ${buffer.length} bytes (~${playbackDuration}ms)`);
            
            // Track if we've started sending audio
            let audioStarted = false;
            
            // Stream audio chunks
            this.playbackInterval = setInterval(() => {
                // CRITICAL: Stop immediately if provider is destroyed
                if (this.isDestroyed) {
                    if (this.playbackInterval) {
                        clearInterval(this.playbackInterval);
                        this.playbackInterval = null;
                    }
                    this.isSpeaking = false;
                    this.playbackResolve = null;
                    resolve();
                    return;
                }
                
                // Once we start, we MUST finish sending all audio
                // Only stop early if explicitly interrupted (playbackInterval cleared externally)
                if (position >= buffer.length) {
                    // Stop playback - we're done
                    if (this.playbackInterval) {
                        clearInterval(this.playbackInterval);
                        this.playbackInterval = null;
                    }
                    
                    // Clear safety timeout since we finished normally
                    if (this.safetyTimeout) {
                        clearTimeout(this.safetyTimeout);
                        this.safetyTimeout = null;
                    }
                    
                    // Signal end of audio
                    this.emit('audio.done', {});
                    
                    // CRITICAL: Clear any existing timer before setting new one
                    if (this.speakingTimer) {
                        clearTimeout(this.speakingTimer);
                        this.speakingTimer = null;
                    }
                    
                    // Set timer for echo suppression buffer (only if still speaking)
                    if (this.isSpeaking) {
                        this.speakingTimer = setTimeout(() => {
                            // Double-check we should still finish (guard against race)
                            if (this.isSpeaking && this.speakingTimer) {
                                this.isSpeaking = false;
                                this.speakingTimer = null;
                                logger.info('[Custom] Finished speaking');
                                this.emit('speaking.stopped');
                                this.emit('response.done');
                            }
                        }, this.echoSuppressionMs);
                    }
                    
                    this.playbackResolve = null;
                    resolve();
                    return;
                }
                
                // Get next chunk
                const chunk = buffer.slice(position, position + chunkSize);
                position += chunkSize;
                audioStarted = true;
                
                // Emit audio.delta event - this is what connection manager listens for
                try {
                    this.emit('audio.delta', {
                        delta: chunk.toString('base64'),
                        format: 'mulaw_8000'
                    });
                } catch (e) {
                    logger.error('[Custom] Error emitting audio chunk:', e.message);
                }
                
            }, intervalMs);
            
            // Safety timeout - resolve after expected duration + buffer
            const maxDuration = playbackDuration + 5000;
            this.safetyTimeout = setTimeout(() => {
                // Only act if we still have an active playback
                if (this.playbackInterval) {
                    logger.warn(`[Custom] Playback safety timeout after ${maxDuration}ms`);
                    clearInterval(this.playbackInterval);
                    this.playbackInterval = null;
                }
                if (this.isSpeaking) {
                    this.isSpeaking = false;
                    this.emit('speaking.stopped');
                }
                this.safetyTimeout = null;
                this.playbackResolve = null;
                resolve();
            }, maxDuration);
        });
    }
    
    cleanTextForTTS(text) {
        if (!text) return '';
        return text
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    // ===== TTS PROVIDERS =====
    
    async synthesizeElevenLabs(text) {
        const voiceId = ELEVENLABS_VOICES[this.voice] || ELEVENLABS_VOICES['Rachel'] || this.voice;
        
        try {
            const response = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=ulaw_8000`,
                {
                    text,
                    model_id: 'eleven_turbo_v2_5',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                },
                {
                    headers: { 'xi-api-key': this.ttsApiKey || this.elevenlabsApiKey, 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );
            
            const buffer = Buffer.from(response.data);
            this.lastTTSBytes = buffer.length;
            return buffer;
        } catch (error) {
            logger.error('[Custom] ElevenLabs error:', error.response?.status || error.message);
            return this.synthesizeOpenAI(text); // Fallback
        }
    }
    
    async synthesizeDeepgram(text) {
        const voiceModel = DEEPGRAM_VOICES[this.voice] || this.voice || 'aura-asteria-en';
        
        try {
            const response = await axios.post(
                `https://api.deepgram.com/v1/speak?model=${voiceModel}&encoding=mulaw&sample_rate=8000`,
                text,
                {
                    headers: { 'Authorization': `Token ${this.deepgramApiKey}`, 'Content-Type': 'text/plain' },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );
            
            const buffer = Buffer.from(response.data);
            this.lastTTSBytes = buffer.length;
            return buffer;
        } catch (error) {
            logger.error('[Custom] Deepgram error:', error.message);
            return this.synthesizeElevenLabs(text); // Fallback
        }
    }
    
    async synthesizeOpenAI(text) {
        try {
            const response = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: 'tts-1',
                    voice: 'shimmer',
                    input: text,
                    response_format: 'pcm'
                },
                {
                    headers: { 'Authorization': `Bearer ${this.openaiApiKey}`, 'Content-Type': 'application/json' },
                    responseType: 'arraybuffer',
                    timeout: 30000
                }
            );
            
            // Note: OpenAI returns PCM, may need conversion
            const buffer = Buffer.from(response.data);
            this.lastTTSBytes = buffer.length;
            return buffer;
        } catch (error) {
            logger.error('[Custom] OpenAI TTS error:', error.message);
            throw error;
        }
    }
    
    async synthesizeUplift(text) {
        // Uplift only supports PCM_22050_16 or MP3 - NOT 8kHz μ-law
        // We request PCM 22kHz and convert to μ-law 8kHz for Asterisk
        
        if (!UpliftTTS) {
            logger.warn('[Custom] Uplift TTS module not available - using ElevenLabs');
            return this.synthesizeElevenLabs(text);
        }
        
        // Get voice ID - either from UPLIFT_VOICES mapping or use directly
        const voiceId = UPLIFT_VOICES[this.voice] || this.voice || 'v_meklc281';
        
        try {
            // Create Uplift TTS instance if not exists
            if (!this.upliftTts) {
                this.upliftTts = new UpliftTTS({
                    apiKey: this.upliftApiKey,
                    voice: voiceId,
                    voiceId: voiceId,
                    outputFormat: 'PCM_22050_16'  // Uplift only supports this or MP3
                });
                await this.upliftTts.initialize();
                logger.info(`[Custom] Uplift TTS initialized: voice=${voiceId}, format=PCM_22050_16 (will convert to μ-law 8kHz)`);
            }
            
            // REST API returns PCM 22kHz 16-bit buffer
            const pcmBuffer = await this.upliftTts.synthesize(text);
            
            if (!pcmBuffer || pcmBuffer.length === 0) {
                logger.warn('[Custom] Uplift returned empty audio');
                return null;
            }
            
            logger.info(`[Custom] Uplift PCM: ${pcmBuffer.length} bytes (22kHz 16-bit)`);
            
            // Convert PCM 22050Hz 16-bit to μ-law 8000Hz
            const mulawBuffer = this.convertPcm22kToMulaw8k(pcmBuffer);
            
            logger.info(`[Custom] Converted to μ-law: ${mulawBuffer.length} bytes (~${(mulawBuffer.length/8000).toFixed(2)}s)`);
            return mulawBuffer;
            
        } catch (error) {
            logger.error('[Custom] Uplift synthesis failed:', error.message);
            logger.info('[Custom] Falling back to ElevenLabs');
            return this.synthesizeElevenLabs(text);
        }
    }
    
    /**
     * Convert PCM 22050Hz 16-bit to μ-law 8000Hz
     * @param {Buffer} pcmBuffer - PCM 22050Hz 16-bit signed little-endian
     * @returns {Buffer} μ-law 8000Hz buffer
     */
    convertPcm22kToMulaw8k(pcmBuffer) {
        // PCM 22050Hz has 22050 samples/sec, each sample is 2 bytes (16-bit)
        // μ-law 8000Hz has 8000 samples/sec, each sample is 1 byte
        // Downsample ratio: 22050 / 8000 = 2.75625
        
        const inputSampleRate = 22050;
        const outputSampleRate = 8000;
        const ratio = inputSampleRate / outputSampleRate;
        
        const numInputSamples = pcmBuffer.length / 2; // 16-bit = 2 bytes per sample
        const numOutputSamples = Math.floor(numInputSamples / ratio);
        
        const output = Buffer.alloc(numOutputSamples);
        
        for (let i = 0; i < numOutputSamples; i++) {
            // Find corresponding input sample (linear interpolation)
            const inputIndex = Math.floor(i * ratio);
            const byteOffset = inputIndex * 2;
            
            if (byteOffset + 1 < pcmBuffer.length) {
                // Read 16-bit signed little-endian sample
                const sample = pcmBuffer.readInt16LE(byteOffset);
                // Convert to μ-law
                output[i] = this.linearToMulaw(sample);
            }
        }
        
        return output;
    }
    
    /**
     * Convert 16-bit linear PCM sample to 8-bit μ-law
     * @param {number} sample - 16-bit signed PCM sample (-32768 to 32767)
     * @returns {number} 8-bit μ-law value (0-255)
     */
    linearToMulaw(sample) {
        const MULAW_MAX = 0x1FFF;
        const MULAW_BIAS = 33;
        const CLIP = 32635;
        
        // Get sign and absolute value
        const sign = (sample >> 8) & 0x80;
        if (sign) sample = -sample;
        
        // Clip the sample
        if (sample > CLIP) sample = CLIP;
        
        // Add bias
        sample += MULAW_BIAS;
        
        // Find segment and quantization
        let exponent = 7;
        let mask = 0x4000;
        
        for (; exponent > 0; exponent--) {
            if (sample & mask) break;
            mask >>= 1;
        }
        
        const mantissa = (sample >> (exponent + 3)) & 0x0F;
        const mulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
        
        return mulaw;
    }
    
    async synthesizeAzure(text) {
        // Use Azure TTS module if available
        if (AzureTTS) {
            try {
                const tts = new AzureTTS({
                    subscriptionKey: this.azureKey,
                    region: this.azureRegion,
                    voice: this.voice
                });
                await tts.initialize();
                const buffer = await tts.synthesize(text);
                this.lastTTSBytes = buffer?.length || 0;
                return buffer;
            } catch (error) {
                logger.error('[Custom] Azure error:', error.message);
                return this.synthesizeOpenAI(text); // Fallback
            }
        }
        
        // Fallback if Azure module not available
        return this.synthesizeOpenAI(text);
    }
    
    // =========================================================================
    // INTERRUPT & DISCONNECT
    // =========================================================================
    
    async interrupt() {
        this.isSpeaking = false;
        
        // Stop ALL playback timers
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        
        // Resolve any pending playback
        if (this.playbackResolve) {
            const resolve = this.playbackResolve;
            this.playbackResolve = null;
            resolve();
        }
        
        if (this.sttWs && this.sttWs.readyState === WebSocket.OPEN) {
            try {
                this.sttWs.send(JSON.stringify({ type: 'finalize', trailing_silence_ms: 300 }));
            } catch (e) {}
        }
        
        return true;
    }
    
    async disconnect() {
        logger.info('[Custom] Disconnect called - stopping all operations');
        
        // Mark as destroyed FIRST to prevent any new operations
        this.isDestroyed = true;
        this.isConnected = false;
        
        // Clear pending message to prevent queued processing
        this.pendingUserMessage = null;
        
        // Clear processing flags
        this.isProcessingLLM = false;
        this.isWaitingForFunction = false;
        this.isSpeaking = false;
        
        this.stopKeepalive();
        
        // Clear all playback timers and resolve any pending playback
        if (this.playbackInterval) {
            clearInterval(this.playbackInterval);
            this.playbackInterval = null;
        }
        if (this.speakingTimer) {
            clearTimeout(this.speakingTimer);
            this.speakingTimer = null;
        }
        if (this.safetyTimeout) {
            clearTimeout(this.safetyTimeout);
            this.safetyTimeout = null;
        }
        if (this.playbackResolve) {
            const resolve = this.playbackResolve;
            this.playbackResolve = null;
            resolve();
        }
        
        // Close STT WebSocket
        if (this.sttWs) {
            try {
                if (this.sttWs.readyState === WebSocket.OPEN) {
                    this.sttWs.send('');
                }
                this.sttWs.close();
            } catch (error) {
                // Ignore close errors
            }
            this.sttWs = null;
        }
        
        // Clear state
        this.conversationHistory = [];
        this.accumulatedTranscript = '';
        this.calledFunctionsThisTurn.clear();
        this.kbCache.clear();
        this.recentKBQueries = [];
        this.greetingPlayed = false;
        this.firstUserMessage = true;
        
        logger.info('[Custom] Disconnect complete');
        
        if (super.disconnect) super.disconnect();
    }
    
    calculateCost(durationSeconds) {
        return (durationSeconds / 60) * this.costPerMinute;
    }
}

module.exports = CustomVoiceProvider;