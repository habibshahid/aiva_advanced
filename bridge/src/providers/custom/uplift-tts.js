/**
 * Uplift AI TTS Handler
 * Text-to-speech using Uplift AI REST API
 * 
 * Updated: Switched from WebSocket to REST API for simplicity and reliability
 * 
 * Features:
 * - Pakistani language voices (Urdu, Sindhi, Balochi)
 * - PCM 22kHz 16-bit output (caller must convert to 8kHz μ-law for telephony)
 * - Simple REST API calls
 * - Automatic voice ID resolution from friendly names
 * 
 * NOTE: Uplift does NOT support 8kHz output - only 22kHz!
 * 
 * Docs: https://docs.upliftai.org/async-concepts
 */

const { EventEmitter } = require('events');
const axios = require('axios');

// ===== UPLIFT VOICES WITH PAKISTANI NAMES =====
const UPLIFT_VOICES = {
    // ===== URDU VOICES =====
    'v_meklc281': { 
        name: 'Ayesha', 
        language: 'Urdu', 
        gender: 'Female',
        style: 'Info/Education V2',
        description: 'Clear and engaging, great for articles and videos'
    },
    'v_8eelc901': { 
        name: 'Fatima', 
        language: 'Urdu', 
        gender: 'Female',
        style: 'Info/Education',
        description: 'Fast and easy to understand'
    },
    'v_30s70t3a': { 
        name: 'Asad', 
        language: 'Urdu', 
        gender: 'Male',
        style: 'News Anchor',
        description: 'Classic Pakistani news voice, calm and professional'
    },
    'v_yypgzenx': { 
        name: 'Dada Jee', 
        language: 'Urdu', 
        gender: 'Male',
        style: 'Storyteller',
        description: 'Deep and suspenseful, perfect for stories'
    },
    'v_kwmp7zxt': { 
        name: 'Zara', 
        language: 'Urdu', 
        gender: 'Female',
        style: 'Gen Z',
        description: 'Modern and fast (under development)'
    },
    
    // ===== SINDHI VOICES =====
    'v_sd0kl3m9': { 
        name: 'Samina', 
        language: 'Sindhi', 
        gender: 'Female',
        style: 'General',
        description: 'Natural Sindhi female voice'
    },
    'v_sd6mn4p2': { 
        name: 'Waqar', 
        language: 'Sindhi', 
        gender: 'Male',
        style: 'Calm',
        description: 'Calm and soothing Sindhi male voice'
    },
    'v_sd9qr7x5': { 
        name: 'Imran', 
        language: 'Sindhi', 
        gender: 'Male',
        style: 'News',
        description: 'Professional Sindhi news voice'
    },
    
    // ===== BALOCHI VOICES =====
    'v_bl0ab8c4': { 
        name: 'Karim', 
        language: 'Balochi', 
        gender: 'Male',
        style: 'General',
        description: 'Best Balochi male voice'
    },
    'v_bl1de2f7': { 
        name: 'Nazia', 
        language: 'Balochi', 
        gender: 'Female',
        style: 'General',
        description: 'Best Balochi female voice'
    }
};

// Voice name mapping (friendly names to voice IDs)
const VOICE_NAME_MAPPING = {
    // Pakistani names (case-insensitive)
    'ayesha': 'v_meklc281',
    'fatima': 'v_8eelc901',
    'asad': 'v_30s70t3a',
    'dada jee': 'v_yypgzenx',
    'dadajee': 'v_yypgzenx',
    'zara': 'v_kwmp7zxt',
    'samina': 'v_sd0kl3m9',
    'waqar': 'v_sd6mn4p2',
    'imran': 'v_sd9qr7x5',
    'karim': 'v_bl0ab8c4',
    'nazia': 'v_bl1de2f7',
    
    // Legacy names (backwards compatibility)
    'ur-pk-female': 'v_meklc281',
    'ur-pk-news': 'v_30s70t3a',
    'ur-pk-dadajee': 'v_yypgzenx',
    'urdu-female': 'v_meklc281',
    'urdu-male': 'v_30s70t3a',
    'sindhi-female': 'v_sd0kl3m9',
    'sindhi-male': 'v_sd6mn4p2',
    'balochi-female': 'v_bl1de2f7',
    'balochi-male': 'v_bl0ab8c4',
    
    // Direct voice IDs (pass through)
    'v_meklc281': 'v_meklc281',
    'v_8eelc901': 'v_8eelc901',
    'v_30s70t3a': 'v_30s70t3a',
    'v_yypgzenx': 'v_yypgzenx',
    'v_kwmp7zxt': 'v_kwmp7zxt',
    'v_sd0kl3m9': 'v_sd0kl3m9',
    'v_sd6mn4p2': 'v_sd6mn4p2',
    'v_sd9qr7x5': 'v_sd9qr7x5',
    'v_bl0ab8c4': 'v_bl0ab8c4',
    'v_bl1de2f7': 'v_bl1de2f7'
};

// Output formats supported by Uplift
// NOTE: Uplift does NOT support 8kHz - only 22kHz output!
const OUTPUT_FORMATS = {
    'PCM_22050_16': { sampleRate: 22050, encoding: 'pcm', bytesPerSecond: 44100, description: 'PCM 22kHz 16-bit (recommended for conversion)' },
    'MP3_22050_32': { sampleRate: 22050, encoding: 'mp3', bytesPerSecond: 4000, description: 'MP3 32kbps' },
    'MP3_22050_128': { sampleRate: 22050, encoding: 'mp3', bytesPerSecond: 16000, description: 'MP3 128kbps' },
    'WAV_22050_32': { sampleRate: 22050, encoding: 'wav', bytesPerSecond: 44100, description: 'WAV lossless' }
    // ULAW_8000_8 is NOT supported by Uplift API!
};

class UpliftTTS extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Resolve voice ID from name
        const requestedVoice = (config.voice || 'v_meklc281').toLowerCase();
        const voiceId = VOICE_NAME_MAPPING[requestedVoice] || requestedVoice;
        
        // Log voice resolution
        if (UPLIFT_VOICES[voiceId]) {
            const voice = UPLIFT_VOICES[voiceId];
            console.log(`[UpliftTTS] Voice: ${voice.name} (${voice.language} ${voice.gender}) - ${voice.style}`);
        } else {
            console.log(`[UpliftTTS] Voice ID: ${voiceId}`);
        }
        
        this.config = {
            apiKey: config.apiKey || process.env.UPLIFT_API_KEY,
            baseUrl: config.baseUrl || 'https://api.upliftai.org',
            
            // Default voice (Ayesha - Urdu Female)
            voiceId: voiceId,
            
            // Use PCM for best quality (caller must convert to 8kHz μ-law for telephony)
            outputFormat: config.outputFormat || 'PCM_22050_16',
            
            // Request timeout
            timeout: config.timeout || 30000,
            
            ...config,
            voiceId: voiceId  // Ensure resolved voice is used
        };
        
        // Validate API key
        if (!this.config.apiKey) {
            console.warn('[UpliftTTS] No API key provided - TTS will fail');
        }
        
        // State
        this.isInitialized = false;
        this.isCancelled = false;
        this.currentRequestId = null;
        
        // Metrics
        this.metrics = {
            requestCount: 0,
            totalCharacters: 0,
            totalAudioBytes: 0,
            averageLatencyMs: 0
        };
    }
    
    /**
     * Initialize TTS (no-op for REST API, kept for interface compatibility)
     */
    async initialize() {
        if (!this.config.apiKey) {
            throw new Error('Uplift API key not configured');
        }
        
        this.isInitialized = true;
        console.log('[UpliftTTS] Initialized with REST API');
        console.log(`[UpliftTTS] Voice: ${this.config.voiceId}, Format: ${this.config.outputFormat}`);
        
        return true;
    }
    
    /**
     * Synthesize text to speech using REST API
     * Returns complete audio buffer (μ-law 8kHz for Asterisk)
     * 
     * @param {string} text - Text to synthesize
     * @returns {Promise<Buffer>} Audio buffer in configured format
     */
    async synthesize(text) {
        if (!text || text.trim().length === 0) {
            console.warn('[UpliftTTS] Empty text, skipping synthesis');
            return null;
        }
        
        if (!this.config.apiKey) {
            throw new Error('Uplift API key not configured');
        }
        
        const startTime = Date.now();
        this.isCancelled = false;
        this.currentRequestId = `uplift_${Date.now()}`;
        
        try {
            console.log(`[UpliftTTS] Synthesizing: "${text.substring(0, 50)}..." (${text.length} chars)`);
            
            // Call Uplift REST API
            const response = await axios.post(
                `${this.config.baseUrl}/v1/synthesis/text-to-speech`,
                {
                    voiceId: this.config.voiceId,
                    text: text,
                    outputFormat: this.config.outputFormat
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: this.config.timeout
                }
            );
            
            // Check if cancelled during request
            if (this.isCancelled) {
                console.log('[UpliftTTS] Request cancelled, discarding audio');
                return null;
            }
            
            const audioBuffer = Buffer.from(response.data);
            const latencyMs = Date.now() - startTime;
            
            // Update metrics
            this.metrics.requestCount++;
            this.metrics.totalCharacters += text.length;
            this.metrics.totalAudioBytes += audioBuffer.length;
            this.metrics.averageLatencyMs = (
                (this.metrics.averageLatencyMs * (this.metrics.requestCount - 1)) + latencyMs
            ) / this.metrics.requestCount;
            
            console.log(`[UpliftTTS] Complete: ${audioBuffer.length} bytes in ${latencyMs}ms`);
            
            // Emit audio event for compatibility with streaming interface
            this.emit('audio', audioBuffer);
            this.emit('done');
            
            return audioBuffer;
            
        } catch (error) {
            // Better error logging
            let errorMessage = error.message;
            if (error.response) {
                errorMessage = `Status ${error.response.status}: `;
                if (error.response.data) {
                    try {
                        const errorData = JSON.parse(Buffer.from(error.response.data).toString());
                        errorMessage += JSON.stringify(errorData);
                    } catch {
                        errorMessage += Buffer.from(error.response.data).toString().substring(0, 200);
                    }
                }
            }
            
            console.error(`[UpliftTTS] Error: ${errorMessage}`);
            this.emit('error', new Error(errorMessage));
            throw error;
        }
    }
    
    /**
     * Synthesize with streaming events (for compatibility)
     * Calls synthesize() and emits events
     */
    async synthesizeStreaming(text) {
        this.emit('start');
        
        try {
            const audioBuffer = await this.synthesize(text);
            
            if (audioBuffer) {
                // Emit as single chunk (REST API returns complete audio)
                this.emit('audio', audioBuffer);
                this.emit('done');
            }
            
            return audioBuffer;
            
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Cancel current synthesis request
     */
    cancel() {
        this.isCancelled = true;
        this.currentRequestId = null;
        console.log('[UpliftTTS] Synthesis cancelled');
    }
    
    /**
     * Set voice (can be name or ID)
     */
    setVoice(voice) {
        if (!voice) return;
        
        const lower = voice.toLowerCase();
        const voiceId = VOICE_NAME_MAPPING[lower] || voice;
        
        if (voiceId !== this.config.voiceId) {
            this.config.voiceId = voiceId;
            
            if (UPLIFT_VOICES[voiceId]) {
                const v = UPLIFT_VOICES[voiceId];
                console.log(`[UpliftTTS] Voice changed to: ${v.name} (${v.language})`);
            } else {
                console.log(`[UpliftTTS] Voice changed to: ${voiceId}`);
            }
        }
    }
    
    /**
     * Set output format
     */
    setOutputFormat(format) {
        if (OUTPUT_FORMATS[format]) {
            this.config.outputFormat = format;
            console.log(`[UpliftTTS] Output format: ${format}`);
        } else {
            console.warn(`[UpliftTTS] Unknown format: ${format}, keeping ${this.config.outputFormat}`);
        }
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    
    /**
     * Get available voices
     */
    static getAvailableVoices() {
        return UPLIFT_VOICES;
    }
    
    /**
     * Get voice info by ID or name
     */
    static getVoiceInfo(voiceIdOrName) {
        const lower = (voiceIdOrName || '').toLowerCase();
        const voiceId = VOICE_NAME_MAPPING[lower] || voiceIdOrName;
        return UPLIFT_VOICES[voiceId] || null;
    }
    
    /**
     * Calculate estimated audio duration from bytes
     * For ULAW_8000_8: 8000 bytes = 1 second
     */
    calculateDuration(audioBytes) {
        const format = OUTPUT_FORMATS[this.config.outputFormat];
        if (!format) return 0;
        
        return Math.ceil((audioBytes / format.bytesPerSecond) * 1000); // ms
    }
    
    /**
     * Disconnect (no-op for REST, kept for interface compatibility)
     */
    disconnect() {
        this.cancel();
        this.isInitialized = false;
        console.log('[UpliftTTS] Disconnected');
    }
}

// Export class and voice mappings
module.exports = UpliftTTS;
module.exports.UPLIFT_VOICES = UPLIFT_VOICES;
module.exports.VOICE_NAME_MAPPING = VOICE_NAME_MAPPING;
module.exports.OUTPUT_FORMATS = OUTPUT_FORMATS;