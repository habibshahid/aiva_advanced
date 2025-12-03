/**
 * OpenAI TTS Handler
 * Text-to-speech using OpenAI's TTS API
 * 
 * Features:
 * - High quality voices (same as used in Realtime API)
 * - PCM output (no conversion needed!)
 * - Streaming support with audio buffering
 * - Multiple voice options
 * 
 * Voices: alloy, echo, fable, onyx, nova, shimmer
 * Models: tts-1 (fast), tts-1-hd (high quality)
 */

const EventEmitter = require('events');
const https = require('https');

// Available OpenAI TTS voices (tts-1, tts-1-hd)
const OPENAI_VOICES = {
    'alloy': { description: 'Neutral, balanced' },
    'echo': { description: 'Warm, conversational' },
    'fable': { description: 'Expressive, narrative' },
    'onyx': { description: 'Deep, authoritative' },
    'nova': { description: 'Friendly, upbeat' },
    'shimmer': { description: 'Clear, pleasant' }
};

// Voices only available in Realtime API (NOT in tts-1/tts-1-hd)
const REALTIME_ONLY_VOICES = ['ash', 'ballad', 'coral', 'sage', 'verse', 'marin', 'cedar'];

// Voice mapping from other providers to OpenAI
const VOICE_MAPPING = {
    // Azure Urdu voices -> OpenAI equivalents
    'ur-PK-UzmaNeural': 'nova',      // Female -> nova (friendly)
    'ur-PK-AsadNeural': 'onyx',      // Male -> onyx (deep)
    
    // Uplift voices -> OpenAI equivalents
    'ur-PK-female': 'nova',
    'ur-PK-news': 'alloy',
    'ur-PK-dadajee': 'onyx',
    'v_meklc281': 'nova',
    'v_30s70t3a': 'alloy',
    'v_yypgzenx': 'onyx',
    
    // Realtime-only voices -> Closest TTS equivalents
    'ash': 'alloy',       // Map to similar
    'ballad': 'fable',    // Map to narrative
    'coral': 'nova',      // Map to upbeat
    'sage': 'echo',       // Map to conversational
    'verse': 'fable',     // Map to expressive
    'marin': 'nova',      // Map to friendly (closest match)
    'cedar': 'onyx'       // Map to authoritative
};

class OpenAITTS extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Map voice if needed
        const requestedVoice = config.voice || 'nova';
        const mappedVoice = VOICE_MAPPING[requestedVoice] || requestedVoice;
        
        // Warn if using a Realtime-only voice
        if (REALTIME_ONLY_VOICES.includes(requestedVoice.toLowerCase())) {
            console.warn(`[OPENAI-TTS] ⚠️ Voice "${requestedVoice}" is only available in Realtime API, not tts-1/tts-1-hd`);
            console.warn(`[OPENAI-TTS] ⚠️ Mapping to closest equivalent: "${mappedVoice}"`);
        }
        
        // Validate voice
        if (!OPENAI_VOICES[mappedVoice]) {
            console.warn(`[OPENAI-TTS] Unknown voice "${mappedVoice}", using "nova"`);
        }
        
        if (requestedVoice !== mappedVoice && !REALTIME_ONLY_VOICES.includes(requestedVoice.toLowerCase())) {
            console.log(`[OPENAI-TTS] Mapped voice '${requestedVoice}' to '${mappedVoice}'`);
        }
        
        this.config = {
            apiKey: config.apiKey || process.env.OPENAI_API_KEY,
            
            // Model: tts-1 (faster) or tts-1-hd (better quality)
            model: config.model || 'tts-1',
            
            // Voice settings
            voice: mappedVoice,
            
            // Speed: 0.25 to 4.0 (1.0 is normal)
            speed: config.speed || 1.0,
            
            // Output format: pcm gives us raw audio (24kHz 16-bit mono)
            responseFormat: config.responseFormat || 'pcm',
            
            // Buffer size before emitting (prevents choppy audio)
            // 4800 bytes = 100ms at 24kHz 16-bit mono
            minBufferSize: config.minBufferSize || 4800,
            
            ...config,
            voice: mappedVoice  // Ensure mapped voice is used
        };
        
        // Available voices for reference
        this.availableVoices = OPENAI_VOICES;
        
        // Audio buffer for smooth playback
        this.audioBuffer = Buffer.alloc(0);
        
        // HTTP request reference for cancellation
        this.currentRequest = null;
        
        // Flag to track intentional cancellation (to suppress "aborted" errors)
        this.isCancelling = false;
        
        // Metrics
        this.metrics = {
            startTime: null,
            charactersProcessed: 0,
            audioSecondsGenerated: 0,
            requests: 0
        };
        
        // State
        this.isProcessing = false;
        this.currentRequestId = null;
    }
    
    /**
     * Initialize TTS (validate API key)
     */
    async initialize() {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        this.metrics.startTime = Date.now();
        console.log('[OPENAI-TTS] Initialized with voice:', this.config.voice, 'model:', this.config.model);
    }
    
    /**
     * Synthesize text to speech with streaming
     * @param {string} text - Text to synthesize
     * @param {object} options - Override options
     * @returns {Promise<string>} - Request ID
     */
    async synthesizeStreaming(text, options = {}) {
        if (!text || text.trim().length === 0) {
            console.warn('[OPENAI-TTS] Empty text, skipping synthesis');
            return null;
        }
        
        const requestId = `openai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.currentRequestId = requestId;
        this.isProcessing = true;
        this.isCancelling = false;  // Reset cancellation flag
        this.audioBuffer = Buffer.alloc(0);  // Reset buffer
        
        const voice = options.voice || this.config.voice;
        const model = options.model || this.config.model;
        const speed = options.speed || this.config.speed;
        
        console.log(`[OPENAI-TTS] Synthesizing: "${text.substring(0, 50)}..." (${text.length} chars)`);
        console.log(`[OPENAI-TTS] Voice: ${voice}, Model: ${model}, Speed: ${speed}`);
        
        // Update metrics
        this.metrics.requests++;
        this.metrics.charactersProcessed += text.length;
        
        // Emit synthesis started
        this.emit('synthesis.started', { requestId });
        
        try {
            await this._streamSynthesis(text, voice, model, speed, requestId);
        } catch (error) {
            // Suppress "aborted" errors if we intentionally cancelled
            if (this.isCancelling && (error.code === 'ECONNRESET' || error.message === 'aborted')) {
                console.log('[OPENAI-TTS] Request cancelled (expected abort)');
            } else {
                console.error('[OPENAI-TTS] Synthesis error:', error);
                this.emit('error', error);
            }
        }
        
        return requestId;
    }
    
    /**
     * Internal streaming synthesis with buffering
     */
    async _streamSynthesis(text, voice, model, speed, requestId) {
        return new Promise((resolve, reject) => {
            const postData = JSON.stringify({
                model: model,
                input: text,
                voice: voice,
                response_format: this.config.responseFormat,
                speed: speed
            });
            
            const options = {
                hostname: 'api.openai.com',
                port: 443,
                path: '/v1/audio/speech',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let errorBody = '';
                    res.on('data', chunk => errorBody += chunk);
                    res.on('end', () => {
                        const error = new Error(`TTS failed: ${res.statusCode} - ${errorBody}`);
                        this.isProcessing = false;
                        this.currentRequest = null;
                        reject(error);
                    });
                    return;
                }
                
                let totalBytes = 0;
                let chunkIndex = 0;
                let emittedChunks = 0;
                
                res.on('data', (chunk) => {
                    // Check if this request was cancelled
                    if (this.currentRequestId !== requestId) {
                        console.log('[OPENAI-TTS] Request cancelled, ignoring data');
                        return;
                    }
                    
                    totalBytes += chunk.length;
                    chunkIndex++;
                    
                    // Add to buffer
                    this.audioBuffer = Buffer.concat([this.audioBuffer, chunk]);
                    
                    // Emit when buffer is large enough (prevents choppy audio)
                    while (this.audioBuffer.length >= this.config.minBufferSize) {
                        const audioChunk = this.audioBuffer.slice(0, this.config.minBufferSize);
                        this.audioBuffer = this.audioBuffer.slice(this.config.minBufferSize);
                        emittedChunks++;
                        
                        // PCM format: 24kHz, 16-bit, mono
                        const base64Audio = audioChunk.toString('base64');
                        
                        this.emit('audio.delta', { 
                            delta: base64Audio,
                            requestId: requestId
                        });
                        
                        this.emit('audio.chunk', {
                            chunk: audioChunk,
                            chunkIndex: emittedChunks,
                            requestId: requestId
                        });
                    }
                });
                
                res.on('end', () => {
                    // Emit any remaining buffered audio
                    if (this.audioBuffer.length > 0) {
                        emittedChunks++;
                        const base64Audio = this.audioBuffer.toString('base64');
                        
                        this.emit('audio.delta', { 
                            delta: base64Audio,
                            requestId: requestId
                        });
                        
                        this.emit('audio.chunk', {
                            chunk: this.audioBuffer,
                            chunkIndex: emittedChunks,
                            requestId: requestId
                        });
                        
                        this.audioBuffer = Buffer.alloc(0);
                    }
                    
                    this.isProcessing = false;
                    this.currentRequest = null;
                    
                    // Calculate approximate audio duration
                    // PCM 24kHz 16-bit mono = 48000 bytes per second
                    const audioDuration = totalBytes / 48000;
                    this.metrics.audioSecondsGenerated += audioDuration;
                    
                    console.log(`[OPENAI-TTS] Synthesis complete: ${totalBytes} bytes (~${audioDuration.toFixed(2)}s), ${emittedChunks} chunks`);
                    
                    this.emit('audio.done', { 
                        requestId: requestId,
                        totalBytes: totalBytes,
                        duration: audioDuration
                    });
                    
                    resolve();
                });
                
                res.on('error', (error) => {
                    this.isProcessing = false;
                    this.currentRequest = null;
                    // Don't reject if we're intentionally cancelling
                    if (!this.isCancelling) {
                        reject(error);
                    }
                });
            });
            
            req.on('error', (error) => {
                this.isProcessing = false;
                this.currentRequest = null;
                // Don't reject if we're intentionally cancelling
                if (!this.isCancelling) {
                    reject(error);
                }
            });
            
            // Set timeout
            req.setTimeout(30000, () => {
                req.destroy();
                this.isProcessing = false;
                this.currentRequest = null;
                reject(new Error('TTS request timeout'));
            });
            
            // Store request reference for cancellation
            this.currentRequest = req;
            
            req.write(postData);
            req.end();
        });
    }
    
    /**
     * Synthesize and return complete audio buffer
     * @param {string} text - Text to synthesize
     * @param {object} options - Override options
     * @returns {Promise<Buffer>} - Audio buffer
     */
    async synthesize(text, options = {}) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            
            const onChunk = ({ chunk }) => {
                chunks.push(chunk);
            };
            
            const onDone = () => {
                this.removeListener('audio.chunk', onChunk);
                this.removeListener('audio.done', onDone);
                this.removeListener('error', onError);
                resolve(Buffer.concat(chunks));
            };
            
            const onError = (error) => {
                this.removeListener('audio.chunk', onChunk);
                this.removeListener('audio.done', onDone);
                this.removeListener('error', onError);
                reject(error);
            };
            
            this.on('audio.chunk', onChunk);
            this.on('audio.done', onDone);
            this.on('error', onError);
            
            this.synthesizeStreaming(text, options).catch(onError);
        });
    }
    
    /**
     * Cancel ongoing synthesis
     */
    cancel(requestId = null) {
        const idToCancel = requestId || this.currentRequestId;
        
        if (idToCancel) {
            console.log(`[OPENAI-TTS] Cancelling synthesis: ${idToCancel}`);
            
            // Set flag BEFORE destroying request to suppress error
            this.isCancelling = true;
            
            // Destroy the HTTP request to stop receiving data immediately
            if (this.currentRequest) {
                try {
                    this.currentRequest.destroy();
                    console.log('[OPENAI-TTS] HTTP request destroyed');
                } catch (e) {
                    // Ignore errors during destroy
                }
                this.currentRequest = null;
            }
            
            if (idToCancel === this.currentRequestId) {
                this.currentRequestId = null;
            }
            
            this.isProcessing = false;
            this.audioBuffer = Buffer.alloc(0);  // Clear buffer on cancel
            this.emit('synthesis.cancelled', { requestId: idToCancel });
        }
    }
    
    /**
     * Set voice
     */
    setVoice(voiceName) {
        const mappedVoice = VOICE_MAPPING[voiceName] || voiceName;
        
        if (!OPENAI_VOICES[mappedVoice]) {
            console.warn(`[OPENAI-TTS] Unknown voice "${mappedVoice}", using current`);
            return;
        }
        
        this.config.voice = mappedVoice;
        console.log(`[OPENAI-TTS] Voice set to: ${mappedVoice}`);
    }
    
    /**
     * Set model
     */
    setModel(model) {
        if (!['tts-1', 'tts-1-hd'].includes(model)) {
            console.warn(`[OPENAI-TTS] Unknown model "${model}", using current`);
            return;
        }
        
        this.config.model = model;
        console.log(`[OPENAI-TTS] Model set to: ${model}`);
    }
    
    /**
     * Get available voices
     */
    getVoices() {
        return Object.entries(OPENAI_VOICES).map(([name, info]) => ({
            name: name,
            ...info
        }));
    }
    
    /**
     * Get metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: this.metrics.startTime ? Date.now() - this.metrics.startTime : 0
        };
    }
    
    /**
     * Get estimated cost
     * OpenAI TTS pricing: $15 per 1M characters (tts-1), $30 per 1M characters (tts-1-hd)
     */
    getEstimatedCost() {
        const pricePerChar = this.config.model === 'tts-1-hd' ? 0.00003 : 0.000015;
        return this.metrics.charactersProcessed * pricePerChar;
    }
}

module.exports = OpenAITTS;
