/**
 * Azure TTS Handler
 * Text-to-speech using Azure Cognitive Services
 * 
 * This is a placeholder that will be replaced with Uplift AI later.
 * 
 * Features:
 * - Native Pakistani Urdu voices (ur-PK)
 * - Streaming audio output
 * - SSML support for expressive speech
 * - PCM16 24kHz output (compatible with your audio pipeline)
 */

const EventEmitter = require('events');
const https = require('https');

class AzureTTS extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Voice mapping: Uplift voice names -> Azure voice names
        this.voiceMapping = {
            'ur-PK-female': 'ur-PK-UzmaNeural',
            'ur-PK-news': 'ur-PK-UzmaNeural',
            'ur-PK-dadajee': 'ur-PK-AsadNeural',
            'v_meklc281': 'ur-PK-UzmaNeural',  // Uplift voice IDs
            'v_30s70t3a': 'ur-PK-UzmaNeural',
            'v_yypgzenx': 'ur-PK-AsadNeural'
        };
        
        // Map the voice if needed
        const requestedVoice = config.voice || 'ur-PK-UzmaNeural';
        const mappedVoice = this.voiceMapping[requestedVoice] || requestedVoice;
        
        if (requestedVoice !== mappedVoice) {
            console.log(`[AZURE-TTS] Mapped voice '${requestedVoice}' to '${mappedVoice}'`);
        }
        
        this.config = {
            subscriptionKey: config.subscriptionKey || process.env.AZURE_SPEECH_KEY,
            region: config.region || process.env.AZURE_SPEECH_REGION || 'eastus',
            
            // Voice settings (use mapped voice)
            voice: mappedVoice,
            language: config.language || 'ur-PK',
            
            // Audio format: PCM 24kHz 16-bit mono (matches OpenAI output)
            outputFormat: config.outputFormat || 'raw-24khz-16bit-mono-pcm',
            
            // Rate and pitch adjustments
            rate: config.rate || '0%',
            pitch: config.pitch || '0%',
            
            ...config,
            voice: mappedVoice  // Ensure mapped voice is used
        };
        
        // Available Pakistani Urdu voices
        this.availableVoices = {
            'ur-PK-UzmaNeural': { gender: 'Female', description: 'Pakistani Urdu Female' },
            'ur-PK-AsadNeural': { gender: 'Male', description: 'Pakistani Urdu Male' }
        };
        
        // Token caching
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Metrics
        this.metrics = {
            startTime: null,
            charactersProcessed: 0,
            audioSecondsGenerated: 0,
            requests: 0
        };
        
        // State
        this.isProcessing = false;
    }
    
    /**
     * Initialize TTS (get access token)
     */
    async initialize() {
        await this.refreshToken();
        this.metrics.startTime = Date.now();
        console.log('[AZURE-TTS] Initialized with voice:', this.config.voice);
    }
    
    /**
     * Refresh access token
     */
    async refreshToken() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: `${this.config.region}.api.cognitive.microsoft.com`,
                path: '/sts/v1.0/issueToken',
                method: 'POST',
                headers: {
                    'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
                    'Content-Length': 0
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        this.accessToken = data;
                        // Token is valid for 10 minutes
                        this.tokenExpiry = Date.now() + (9 * 60 * 1000);
                        resolve(this.accessToken);
                    } else {
                        reject(new Error(`Token refresh failed: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.end();
        });
    }
    
    /**
     * Ensure we have a valid token
     */
    async ensureToken() {
        if (!this.accessToken || Date.now() >= this.tokenExpiry) {
            await this.refreshToken();
        }
        return this.accessToken;
    }
    
    /**
     * Synthesize text to speech
     * @param {string} text - Text to synthesize
     * @param {Object} options - Additional options
     * @returns {Promise<Buffer>} PCM audio buffer
     */
    async synthesize(text, options = {}) {
        await this.ensureToken();
        
        const voice = options.voice || this.config.voice;
        const rate = options.rate || this.config.rate;
        const pitch = options.pitch || this.config.pitch;
        
        // Build SSML
        const ssml = this.buildSSML(text, voice, rate, pitch);
        
        this.isProcessing = true;
        this.metrics.requests++;
        this.metrics.charactersProcessed += text.length;
        
		const requestId = `azure_${Date.now()}`;
		console.log('[AZURE-TTS] Synthesis started:', requestId);
		this.emit('synthesis.started', { requestId });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: `${this.config.region}.tts.speech.microsoft.com`,
                path: '/cognitiveservices/v1',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': this.config.outputFormat,
                    'User-Agent': 'AiVA-Bridge'
                }
            };
            
            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let errorData = '';
                    res.on('data', chunk => errorData += chunk);
                    res.on('end', () => {
                        this.isProcessing = false;
                        reject(new Error(`TTS failed: ${res.statusCode} - ${errorData}`));
                    });
                    return;
                }
                
                const chunks = [];
                
                res.on('data', (chunk) => {
                    chunks.push(chunk);
                    
                    // Emit chunk for streaming
                    this.emit('audio.chunk', {
                        data: chunk,
                        format: 'pcm16',
                        sampleRate: 24000
                    });
                });
                
                res.on('end', () => {
                    this.isProcessing = false;
                    const audioBuffer = Buffer.concat(chunks);
                    
                    // Calculate audio duration
                    // PCM16 24kHz: 48000 bytes per second
                    const durationSeconds = audioBuffer.length / 48000;
                    this.metrics.audioSecondsGenerated += durationSeconds;
                    
                    this.emit('audio.complete', {
                        buffer: audioBuffer,
                        durationSeconds: durationSeconds
                    });
                    
                    resolve(audioBuffer);
                });
            });
            
            req.on('error', (error) => {
                this.isProcessing = false;
                reject(error);
            });
            
            req.write(ssml);
            req.end();
        });
    }
    
    /**
     * Synthesize with streaming (emits audio chunks)
     * @param {string} text - Text to synthesize
     * @param {Object} options - Additional options
     */
    async synthesizeStreaming(text, options = {}) {
        await this.ensureToken();
        
        const voice = options.voice || this.config.voice;
        const rate = options.rate || this.config.rate;
        const pitch = options.pitch || this.config.pitch;
        
        const ssml = this.buildSSML(text, voice, rate, pitch);
        
        this.isProcessing = true;
        this.metrics.requests++;
        this.metrics.charactersProcessed += text.length;
        
        return new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: `${this.config.region}.tts.speech.microsoft.com`,
                path: '/cognitiveservices/v1',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/ssml+xml',
                    'X-Microsoft-OutputFormat': this.config.outputFormat,
                    'User-Agent': 'AiVA-Bridge'
                }
            };
            
            const req = https.request(reqOptions, (res) => {
                if (res.statusCode !== 200) {
                    let errorData = '';
                    res.on('data', chunk => errorData += chunk);
                    res.on('end', () => {
                        this.isProcessing = false;
                        reject(new Error(`TTS failed: ${res.statusCode} - ${errorData}`));
                    });
                    return;
                }
                
                let totalBytes = 0;
                
                res.on('data', (chunk) => {
                    totalBytes += chunk.length;
                    
                    // Emit for streaming playback
                    this.emit('audio.delta', {
                        delta: chunk.toString('base64'),
                        format: 'pcm16',
                        sampleRate: 24000
                    });
                });
                
                res.on('end', () => {
                    this.isProcessing = false;
                    
                    const durationSeconds = totalBytes / 48000;
                    this.metrics.audioSecondsGenerated += durationSeconds;
                    
                    this.emit('audio.done', {
                        totalBytes: totalBytes,
                        durationSeconds: durationSeconds
                    });
                    
                    resolve({
                        totalBytes: totalBytes,
                        durationSeconds: durationSeconds
                    });
                });
            });
            
            req.on('error', (error) => {
                this.isProcessing = false;
                reject(error);
            });
            
            req.write(ssml);
            req.end();
        });
    }
    
    /**
     * Build SSML from text
     */
    buildSSML(text, voice, rate, pitch) {
        // Escape special XML characters
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        
        // Determine language from voice
        const lang = voice.startsWith('ur-') ? 'ur-PK' : 
                     voice.startsWith('en-') ? 'en-US' : 
                     this.config.language;
        
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">
    <voice name="${voice}">
        <prosody rate="${rate}" pitch="${pitch}">
            ${escapedText}
        </prosody>
    </voice>
</speak>`;
    }
    
    /**
     * Build SSML with emotion/style
     */
    buildExpressiveSSML(text, voice, style, styleDegree = 1) {
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        const lang = voice.startsWith('ur-') ? 'ur-PK' : 'en-US';
        
        // Note: Neural voice styles may have limited availability
        return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">
    <voice name="${voice}">
        <mstts:express-as style="${style}" styledegree="${styleDegree}">
            ${escapedText}
        </mstts:express-as>
    </voice>
</speak>`;
    }
    
    /**
     * Set voice
     */
    setVoice(voice) {
        if (this.availableVoices[voice] || voice.includes('Neural')) {
            this.config.voice = voice;
            console.log('[AZURE-TTS] Voice changed to:', voice);
        } else {
            console.warn('[AZURE-TTS] Unknown voice:', voice);
        }
    }
    
    /**
     * Get available voices
     */
    getAvailableVoices() {
        return this.availableVoices;
    }
    
    /**
     * Cancel current processing
     */
    cancel() {
		this.isProcessing = false;
		this.emit('synthesis.cancelled', { requestId: `azure_cancelled_${Date.now()}` });
		this.emit('cancelled');
	}
    
    /**
     * Get metrics
     */
    getMetrics() {
        const duration = this.metrics.startTime 
            ? (Date.now() - this.metrics.startTime) / 1000 
            : 0;
        
        return {
            duration: duration,
            requests: this.metrics.requests,
            charactersProcessed: this.metrics.charactersProcessed,
            audioSecondsGenerated: this.metrics.audioSecondsGenerated
        };
    }
    
    /**
     * Estimate cost
     * Azure Neural TTS: ~$16 per 1M characters
     */
    getCost() {
        const costPerMillion = 16;
        const cost = (this.metrics.charactersProcessed / 1000000) * costPerMillion;
        
        return {
            charactersProcessed: this.metrics.charactersProcessed,
            estimatedCost: cost
        };
    }
}

module.exports = AzureTTS;
