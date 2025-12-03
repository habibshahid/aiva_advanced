/**
 * Soniox STT Handler
 * Real-time speech-to-text using Soniox WebSocket API
 * 
 * Features:
 * - Direct mulaw audio input (no conversion needed for Asterisk)
 * - Endpoint detection for turn-taking
 * - Multi-language support (Urdu, English, etc.)
 * - Manual finalization support
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class SonioxSTT extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            apiKey: config.apiKey || process.env.SONIOX_API_KEY,
            model: config.model || 'stt-rt-preview',
            languageHints: config.languageHints || ['ur', 'en'],
            enableEndpointDetection: config.enableEndpointDetection !== false,
            enableSpeakerDiarization: config.enableSpeakerDiarization || false,
            sampleRate: config.sampleRate || 8000,
            ...config
        };
        
        this.ws = null;
        this.isConnected = false;
        this.isConfigured = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        // Transcript accumulation
        this.currentTranscript = '';
        this.finalTranscript = '';
        this.pendingTokens = [];
        
        // Metrics
        this.metrics = {
            startTime: null,
            audioSeconds: 0,
            bytesProcessed: 0
        };
    }
    
    /**
     * Connect to Soniox WebSocket API
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const wsUrl = 'wss://stt-rt.soniox.com/transcribe-websocket';
            
            console.log('[SONIOX-STT] Connecting to Soniox...');
            
            this.ws = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                reject(new Error('Soniox connection timeout'));
            }, 10000);
            
            this.ws.on('open', () => {
                clearTimeout(timeout);
                console.log('[SONIOX-STT] WebSocket connected');
                this.isConnected = true;
                this.metrics.startTime = Date.now();
                
                // Send configuration
                this.sendConfig();
                resolve(true);
            });
            
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            
            this.ws.on('error', (error) => {
                console.error('[SONIOX-STT] WebSocket error:', error.message);
                this.emit('error', error);
            });
            
            this.ws.on('close', (code, reason) => {
                console.log(`[SONIOX-STT] WebSocket closed: ${code} - ${reason}`);
                this.isConnected = false;
                this.isConfigured = false;
                this.emit('disconnected', { code, reason: reason?.toString() });
            });
        });
    }
    
    /**
     * Send initial configuration to Soniox
     */
    sendConfig() {
        const config = {
            api_key: this.config.apiKey,
            model: this.config.model,
            audio_format: 'mulaw',  // Direct from Asterisk!
            sample_rate: this.config.sampleRate,
            num_channels: 1,
            language_hints: this.config.languageHints,
            enable_endpoint_detection: this.config.enableEndpointDetection,
            enable_speaker_diarization: this.config.enableSpeakerDiarization,
            enable_non_final_tokens: true  // Get interim results
        };
        
        // Add context if provided
        if (this.config.context) {
            config.context = this.config.context;
        }
        
        console.log('[SONIOX-STT] Sending config:', {
            model: config.model,
            audio_format: config.audio_format,
            sample_rate: config.sample_rate,
            language_hints: config.language_hints
        });
        
        this.ws.send(JSON.stringify(config));
        this.isConfigured = true;
        
        this.emit('ready');
    }
    
    /**
     * Handle incoming messages from Soniox
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            // Check for errors
            if (message.error_code) {
                // "No audio received" is expected when disconnecting without sending audio
                if (message.error_message === 'No audio received.') {
                    console.log('[SONIOX-STT] Session ended (no audio was sent)');
                    return;
                }
                console.error('[SONIOX-STT] Error:', message.error_message);
                this.emit('error', new Error(message.error_message));
                return;
            }
            
            // Check for finished message
            if (message.finished) {
                console.log('[SONIOX-STT] Stream finished');
                this.emit('finished', {
                    finalTranscript: this.finalTranscript,
                    audioProcessedMs: message.final_audio_proc_ms
                });
                return;
            }
            
            // Process tokens
            if (message.tokens && message.tokens.length > 0) {
                this.processTokens(message.tokens);
            }
            
        } catch (error) {
            console.error('[SONIOX-STT] Error parsing message:', error);
        }
    }
    
    /**
     * Process tokens from Soniox response
     */
    processTokens(tokens) {
        let newFinalText = '';
        let interimText = '';
        let endpointDetected = false;
        
        for (const token of tokens) {
            // Check for endpoint token
            if (token.text === '<end>') {
                endpointDetected = true;
                continue;
            }
            
            // Check for finalization token
            if (token.text === '<fin>') {
                continue;
            }
            
            if (token.is_final) {
                newFinalText += token.text;
                this.finalTranscript += token.text;
            } else {
                interimText += token.text;
            }
        }
        
        // Build current transcript (final + interim)
        this.currentTranscript = this.finalTranscript + interimText;
        
        // Emit interim transcript for real-time feedback
        if (interimText || newFinalText) {
            this.emit('transcript.interim', {
                text: this.currentTranscript,
                isFinal: false
            });
        }
        
        // Emit final transcript when we have confirmed text
        if (newFinalText) {
            this.emit('transcript.partial', {
                text: newFinalText,
                fullText: this.finalTranscript
            });
        }
        
        // Emit endpoint event - user has stopped speaking
        if (endpointDetected) {
            const utterance = this.finalTranscript.trim();
            
            if (utterance) {
                console.log('[SONIOX-STT] Endpoint detected:', utterance);
                
                this.emit('transcript.final', {
                    text: utterance,
                    timestamp: Date.now()
                });
                
                // Also emit speech.ended for turn management
                this.emit('speech.ended', {
                    transcript: utterance
                });
            }
            
            // Reset for next utterance
            this.finalTranscript = '';
            this.currentTranscript = '';
        }
    }
    
    /**
     * Send audio data to Soniox
     * @param {Buffer} audioData - mulaw audio buffer from Asterisk
     */
    sendAudio(audioData) {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            // Send binary audio data directly
            this.ws.send(audioData);
            
            // Update metrics
            this.metrics.bytesProcessed += audioData.length;
            // For mulaw @ 8kHz: 8000 bytes = 1 second
            this.metrics.audioSeconds = this.metrics.bytesProcessed / 8000;
            
            return true;
        } catch (error) {
            console.error('[SONIOX-STT] Error sending audio:', error);
            return false;
        }
    }
    
    /**
     * Force finalization of pending tokens
     * Useful for interruption handling
     */
    finalize(trailingSilenceMs = 300) {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'finalize',
                trailing_silence_ms: trailingSilenceMs
            }));
            
            console.log('[SONIOX-STT] Manual finalization requested');
            return true;
        } catch (error) {
            console.error('[SONIOX-STT] Error sending finalize:', error);
            return false;
        }
    }
    
    /**
     * Send keepalive to prevent connection timeout
     */
    sendKeepalive() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'keepalive'
            }));
            return true;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Gracefully close the connection
     */
    async stop() {
        if (!this.isConnected || !this.ws) {
            return;
        }
        
        try {
            // Send empty frame to signal end of stream
            this.ws.send('');
            
            // Wait a bit for final tokens
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.ws.close();
        } catch (error) {
            console.error('[SONIOX-STT] Error stopping:', error);
        }
        
        this.isConnected = false;
        this.isConfigured = false;
    }
    
    /**
     * Immediately cancel the connection
     */
    cancel() {
        if (this.ws) {
            this.ws.close();
        }
        this.isConnected = false;
        this.isConfigured = false;
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        const duration = this.metrics.startTime 
            ? (Date.now() - this.metrics.startTime) / 1000 
            : 0;
        
        return {
            duration: duration,
            audioSeconds: this.metrics.audioSeconds,
            bytesProcessed: this.metrics.bytesProcessed
        };
    }
    
    /**
     * Reset transcript state
     */
    resetTranscript() {
        this.currentTranscript = '';
        this.finalTranscript = '';
        this.pendingTokens = [];
    }
}

module.exports = SonioxSTT;
