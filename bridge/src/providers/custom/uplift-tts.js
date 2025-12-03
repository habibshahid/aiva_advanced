/**
 * Uplift AI TTS Handler
 * Real-time text-to-speech using Uplift AI WebSocket API
 * 
 * Features:
 * - Pakistani language voices (Urdu, Sindhi, Balochi)
 * - μ-law 8kHz output for telephony (no conversion needed!)
 * - PCM output option
 * - Streaming support with Socket.IO
 * - Cancellation handling
 * 
 * Docs: https://docs.upliftai.org/websocket-tts
 */

const { EventEmitter } = require('events');
const { io } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

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
    
    // Direct voice IDs
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
const OUTPUT_FORMATS = {
    'ULAW_8000_8': { sampleRate: 8000, encoding: 'ulaw', bytesPerSecond: 8000, description: 'μ-law 8kHz (telephony - best for Asterisk!)' },
    'PCM_22050_16': { sampleRate: 22050, encoding: 'pcm', bytesPerSecond: 44100, description: 'PCM 22kHz 16-bit' },
    'MP3_22050_32': { sampleRate: 22050, encoding: 'mp3', bytesPerSecond: 4000, description: 'MP3 32kbps' },
    'MP3_22050_128': { sampleRate: 22050, encoding: 'mp3', bytesPerSecond: 16000, description: 'MP3 128kbps' },
    'WAV_22050_32': { sampleRate: 22050, encoding: 'wav', bytesPerSecond: 44100, description: 'WAV lossless' }
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
            // CORRECT: Base URL without path - path is added in io() call
            baseUrl: config.baseUrl || 'wss://api.upliftai.org',
            
            // Default voice (Ayesha - Urdu Female)
            voiceId: voiceId,
            
            // Use ULAW for telephony (perfect for Asterisk - no conversion needed!)
            outputFormat: config.outputFormat || 'ULAW_8000_8',
            
            // Reconnection settings
            reconnectAttempts: config.reconnectAttempts || 3,
            reconnectDelay: config.reconnectDelay || 1000,
            
            ...config,
            voiceId: voiceId  // Ensure resolved voice ID is used
        };
        
        // Socket.IO connection
        this.socket = null;
        this.isConnected = false;
        this.sessionId = null;
        
        // Request tracking
        this.currentRequestId = null;
        this.pendingQueues = new Map();
        this.cancelledRequests = new Set();
        
        // State
        this.isProcessing = false;
        
        // Metrics
        this.metrics = {
            startTime: null,
            charactersProcessed: 0,
            audioSecondsGenerated: 0,
            requests: 0
        };
    }
    
    /**
     * Resolve voice name to voice ID
     */
    static resolveVoiceId(voiceName) {
        if (!voiceName) return 'v_meklc281';
        const lower = voiceName.toLowerCase();
        return VOICE_NAME_MAPPING[lower] || voiceName;
    }
    
    /**
     * Get voice info by ID or name
     */
    static getVoiceInfo(voiceNameOrId) {
        const voiceId = UpliftTTS.resolveVoiceId(voiceNameOrId);
        return UPLIFT_VOICES[voiceId] || null;
    }
    
    /**
     * Initialize and connect to Uplift
     */
    async initialize() {
        if (!this.config.apiKey) {
            throw new Error('Uplift API key not configured');
        }
        
        this.metrics.startTime = Date.now();
        await this.connect();
        
        const voiceInfo = UPLIFT_VOICES[this.config.voiceId];
        const voiceName = voiceInfo ? voiceInfo.name : this.config.voiceId;
        console.log(`[UpliftTTS] Initialized - Voice: ${voiceName}, Format: ${this.config.outputFormat}`);
    }
    
    /**
     * Connect to Socket.IO server
     * CORRECT PATH: /text-to-speech/multi-stream
     */
    async connect() {
        return new Promise((resolve, reject) => {
            console.log('[UpliftTTS] Connecting to Uplift...');
            
            // CORRECT: Use Socket.IO with the right path
            const socketUrl = `${this.config.baseUrl}/text-to-speech/multi-stream`;
            console.log(`[UpliftTTS] Socket.IO URL: ${socketUrl}`);
            
            this.socket = io(socketUrl, {
                // CORRECT: Auth via auth object, not URL query param
                auth: {
                    token: this.config.apiKey
                },
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: this.config.reconnectAttempts,
                reconnectionDelay: this.config.reconnectDelay
            });
            
            this.socket.on('connect', () => {
                console.log('[UpliftTTS] Socket connected');
                this.isConnected = true;
            });
            
            // Handle ready message
            this.socket.on('message', (data) => {
                this._handleMessage(data);
                
                // Resolve on first ready message
                if (data.type === 'ready' && !this.sessionId) {
                    this.sessionId = data.sessionId;
                    console.log(`[UpliftTTS] Ready, session: ${this.sessionId}`);
                    this.emit('ready', { sessionId: this.sessionId });
                    resolve();
                }
            });
            
            // NOTE: All events come via 'message' - these individual handlers are NOT called
            // Keeping them for reference but actual handling is in _handleMessage()
            
            this.socket.on('error', (error) => {
                console.error('[UpliftTTS] Socket error:', error);
                this.emit('error', error);
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log(`[UpliftTTS] Disconnected: ${reason}`);
                this.isConnected = false;
                this.emit('disconnected', { reason });
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('[UpliftTTS] Connection error:', error.message);
                reject(error);
            });
            
            // Timeout
            setTimeout(() => {
                if (!this.isConnected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }
    
    /**
     * Handle incoming messages - ALL events come through here
     */
    _handleMessage(data) {
        const requestId = data.requestId;
        
        // Ignore events for cancelled requests
        if (requestId && this.cancelledRequests.has(requestId)) {
            console.log(`[UpliftTTS] Ignoring ${data.type} for cancelled: ${requestId}`);
            return;
        }
        
        switch (data.type) {
            case 'ready':
                // Handled in connect()
                break;
                
            case 'audio_start':
                console.log(`[UpliftTTS] Audio starting: ${requestId}`);
                this.pendingQueues.set(requestId, { 
                    chunks: [], 
                    totalBytes: 0,
                    startTime: Date.now()
                });
                this.emit('synthesis.started', { requestId });
                break;
                
            case 'audio':
                // Audio chunk received
                const audioRequestId = requestId || this.currentRequestId;
                
                if (!audioRequestId) {
                    console.warn('[UpliftTTS] Received audio but no active request');
                    return;
                }
                
                const audioBuffer = Buffer.from(data.audio, 'base64');
                
                let queue = this.pendingQueues.get(audioRequestId);
                if (!queue) {
                    queue = { chunks: [], totalBytes: 0, startTime: Date.now() };
                    this.pendingQueues.set(audioRequestId, queue);
                }
                
                queue.chunks.push(audioBuffer);
                queue.totalBytes += audioBuffer.length;
                
                // Log every 5th chunk to reduce spam
                if (queue.chunks.length % 5 === 1) {
                    console.log(`[UpliftTTS] Audio chunk #${queue.chunks.length}: ${audioBuffer.length} bytes (total: ${queue.totalBytes})`);
                }
                
                // Emit audio - format is already ULAW 8kHz, no conversion needed!
                this.emit('audio.delta', { 
                    delta: data.audio,  // Already base64
                    requestId: audioRequestId
                });
                
                this.emit('audio.chunk', {
                    chunk: audioBuffer,
                    chunkIndex: queue.chunks.length,
                    requestId: audioRequestId
                });
                break;
                
            case 'audio_end':
                console.log(`[UpliftTTS] Audio complete: ${requestId}`);
                
                // Calculate and log expected duration
                const endQueue = this.pendingQueues.get(requestId);
                if (endQueue) {
                    // ULAW_8000_8 = 8000 samples/sec, 1 byte/sample
                    // So bytes = samples, duration = bytes / 8000
                    const expectedDuration = endQueue.totalBytes / 8000;
                    console.log(`[UpliftTTS] Audio stats: ${endQueue.totalBytes} bytes, ${endQueue.chunks.length} chunks`);
                    console.log(`[UpliftTTS] Expected duration at 8kHz: ${expectedDuration.toFixed(2)}s`);
                    console.log(`[UpliftTTS] If 16kHz audio: ${(expectedDuration / 2).toFixed(2)}s (plays 2x fast)`);
                }
                
                this._finalizeAudio(requestId);
                break;
                
            case 'error':
                console.error(`[UpliftTTS] Server error: ${data.code} - ${data.message}`);
                this.emit('error', new Error(`${data.code}: ${data.message}`));
                break;
                
            default:
                console.log(`[UpliftTTS] Unknown message type: ${data.type}`);
        }
    }
    
    /**
     * Finalize audio when synthesis is complete
     */
    _finalizeAudio(requestId) {
        const queue = this.pendingQueues.get(requestId);
        
        if (queue) {
            // Calculate duration based on format
            const formatInfo = OUTPUT_FORMATS[this.config.outputFormat];
            const bytesPerSecond = formatInfo ? formatInfo.bytesPerSecond : 8000;
            const audioDuration = queue.totalBytes / bytesPerSecond;
            
            this.metrics.audioSecondsGenerated += audioDuration;
            
            console.log(`[UpliftTTS] Complete: ${queue.totalBytes} bytes, ${queue.chunks.length} chunks (~${audioDuration.toFixed(2)}s)`);
            
            this.emit('audio.done', {
                requestId: requestId,
                totalBytes: queue.totalBytes,
                chunks: queue.chunks.length,
                duration: audioDuration
            });
            
            this.pendingQueues.delete(requestId);
        }
        
        this.isProcessing = false;
        
        if (requestId === this.currentRequestId) {
            this.currentRequestId = null;
        }
    }
    
    /**
     * Synthesize text to speech
     */
    async synthesizeStreaming(text, options = {}) {
        if (!text || text.trim().length === 0) {
            console.warn('[UpliftTTS] Empty text, skipping');
            return null;
        }
        
        if (!this.isConnected) {
            console.warn('[UpliftTTS] Not connected, reconnecting...');
            await this.connect();
        }
        
        // Resolve voice
        const requestedVoice = options.voice || this.config.voiceId;
        const voiceId = UpliftTTS.resolveVoiceId(requestedVoice);
        
        const requestId = options.requestId || uuidv4();
        this.currentRequestId = requestId;
        this.isProcessing = true;
        
        // Remove from cancelled set
        this.cancelledRequests.delete(requestId);
        
        const voiceInfo = UPLIFT_VOICES[voiceId];
        const voiceName = voiceInfo ? voiceInfo.name : voiceId;
        
        console.log(`[UpliftTTS] Synthesizing: "${text.substring(0, 50)}..." (${text.length} chars)`);
        console.log(`[UpliftTTS] Voice: ${voiceName}, Format: ${this.config.outputFormat}`);
        
        // Update metrics
        this.metrics.requests++;
        this.metrics.charactersProcessed += text.length;
        
        // Send synthesis request via Socket.IO emit
        const synthesizeRequest = {
            type: 'synthesize',
            requestId: requestId,
            text: text,
            voiceId: voiceId,
            outputFormat: this.config.outputFormat,
            // Speed control: 0.5 = half speed, 1.0 = normal, 2.0 = double
            speed: this.config.speed || 1.0
        };
        
        console.log(`[UpliftTTS] Request: voice=${voiceId}, format=${this.config.outputFormat}, speed=${synthesizeRequest.speed}`);
        
        this.socket.emit('synthesize', synthesizeRequest);
        
        return requestId;
    }
    
    /**
     * Cancel ongoing synthesis
     */
    cancel(requestId = null) {
        const idToCancel = requestId || this.currentRequestId;
        
        if (idToCancel) {
            console.log(`[UpliftTTS] Cancelling: ${idToCancel}`);
            
            // Mark as cancelled
            this.cancelledRequests.add(idToCancel);
            
            // Clean up after 10 seconds
            setTimeout(() => {
                this.cancelledRequests.delete(idToCancel);
            }, 10000);
            
            // Send cancel to server
            if (this.isConnected && this.socket) {
                try {
                    this.socket.emit('cancel', {
                        type: 'cancel',
                        requestId: idToCancel
                    });
                } catch (e) {
                    // Ignore
                }
            }
            
            // Clean up queue
            this.pendingQueues.delete(idToCancel);
            
            if (idToCancel === this.currentRequestId) {
                this.currentRequestId = null;
            }
            
            this.isProcessing = false;
            this.emit('synthesis.cancelled', { requestId: idToCancel });
        }
    }
    
    /**
     * Set voice by name or ID
     */
    setVoice(voiceName) {
        const voiceId = UpliftTTS.resolveVoiceId(voiceName);
        
        if (!UPLIFT_VOICES[voiceId]) {
            console.warn(`[UpliftTTS] Unknown voice "${voiceName}"`);
            return;
        }
        
        const voice = UPLIFT_VOICES[voiceId];
        this.config.voiceId = voiceId;
        console.log(`[UpliftTTS] Voice set to: ${voice.name} (${voice.language})`);
    }
    
    /**
     * Set output format
     */
    setOutputFormat(format) {
        if (!OUTPUT_FORMATS[format]) {
            console.warn(`[UpliftTTS] Unknown format "${format}"`);
            return;
        }
        
        this.config.outputFormat = format;
        console.log(`[UpliftTTS] Format set to: ${format}`);
    }
    
    /**
     * Get all available voices
     */
    getVoices() {
        return Object.entries(UPLIFT_VOICES).map(([id, info]) => ({
            id: id,
            ...info
        }));
    }
    
    /**
     * Get voices by language
     */
    getVoicesByLanguage(language) {
        return this.getVoices().filter(v => 
            v.language.toLowerCase() === language.toLowerCase()
        );
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
     * Disconnect
     */
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }
}

// Export voice constants for external use
UpliftTTS.VOICES = UPLIFT_VOICES;
UpliftTTS.VOICE_MAPPING = VOICE_NAME_MAPPING;
UpliftTTS.OUTPUT_FORMATS = OUTPUT_FORMATS;

module.exports = UpliftTTS;
