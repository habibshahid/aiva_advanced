/**
 * Soniox STT Handler - ENHANCED
 * Real-time speech-to-text using Soniox WebSocket API
 * 
 * FIXES APPLIED:
 * - Auto keepalive timer (prevents timeout during TTS playback)
 * - Auto-reconnect on unexpected disconnect
 * - Connection state monitoring
 * - Better error handling
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
            
            // NEW: Keepalive and reconnect settings
            keepaliveIntervalMs: config.keepaliveIntervalMs || 15000,  // Send keepalive every 15s
            autoReconnect: config.autoReconnect !== false,             // Auto-reconnect on disconnect
            maxReconnectAttempts: config.maxReconnectAttempts || 5,
            reconnectDelayMs: config.reconnectDelayMs || 1000,
            
            ...config
        };
        
        this.ws = null;
        this.isConnected = false;
        this.isConfigured = false;
        this.reconnectAttempts = 0;
        
        // NEW: Connection state tracking
        this.isInCall = false;           // True when we're in an active call
        this.shouldBeConnected = false;  // True when connection is expected
        this.lastAudioTime = 0;          // Last time audio was sent
        this.keepaliveTimer = null;      // Keepalive interval timer
        this.reconnectTimer = null;      // Reconnect delay timer
        
        // Transcript accumulation
        this.currentTranscript = '';
        this.finalTranscript = '';
        this.pendingTokens = [];
        
        // Metrics
        this.metrics = {
            startTime: null,
            audioSeconds: 0,
            bytesProcessed: 0,
            keepalivesSent: 0,
            reconnects: 0
        };
    }
    
    /**
     * Connect to Soniox WebSocket API
     */
    async connect() {
        // If already connected, return
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
            console.log('[SONIOX-STT] Already connected');
            return true;
        }
        
        this.shouldBeConnected = true;
        this.isInCall = true;
        
        return new Promise((resolve, reject) => {
            const wsUrl = 'wss://stt-rt.soniox.com/transcribe-websocket';
            
            console.log('[SONIOX-STT] Connecting to Soniox...');
            
            // Clean up any existing connection
            this.cleanupConnection();
            
            this.ws = new WebSocket(wsUrl);
            
            const timeout = setTimeout(() => {
                this.ws?.close();
                reject(new Error('Soniox connection timeout'));
            }, 10000);
            
            this.ws.on('open', () => {
                clearTimeout(timeout);
                console.log('[SONIOX-STT] WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;  // Reset on successful connect
                this.metrics.startTime = Date.now();
                
                // Send configuration
                this.sendConfig();
                
                // START KEEPALIVE TIMER
                this.startKeepaliveTimer();
                
                resolve(true);
            });
            
            this.ws.on('message', (data) => {
                this.handleMessage(data);
            });
            
            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                console.error('[SONIOX-STT] WebSocket error:', error.message);
                this.emit('error', error);
                
                // Don't reject here - let close handler deal with reconnection
            });
            
            this.ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                this.handleDisconnect(code, reason);
            });
        });
    }
    
    /**
     * Handle WebSocket disconnect
     */
    handleDisconnect(code, reason) {
        const reasonStr = reason?.toString() || '';
        console.log(`[SONIOX-STT] WebSocket closed: code=${code}, reason="${reasonStr}"`);
        console.log('[SONIOX-STT] Connection stats at close:', {
            audioSecondsProcessed: this.metrics.audioSeconds.toFixed(2),
            bytesProcessed: this.metrics.bytesProcessed,
            keepalivesSent: this.metrics.keepalivesSent,
            wasConnected: this.isConnected,
            wasConfigured: this.isConfigured,
            isInCall: this.isInCall,
            shouldBeConnected: this.shouldBeConnected
        });
        
        this.isConnected = false;
        this.isConfigured = false;
        
        // Stop keepalive timer
        this.stopKeepaliveTimer();
        
        this.emit('disconnected', { code, reason: reasonStr });
        
        // AUTO-RECONNECT if we're still in a call and should be connected
        if (this.shouldBeConnected && this.isInCall && this.config.autoReconnect) {
            // Code 1006 = abnormal closure (timeout, network issue)
            // Code 1001 = going away
            // Code 1000 = normal closure (we initiated)
            
            if (code !== 1000) {  // Don't reconnect on normal closure
                this.attemptReconnect();
            }
        }
    }
    
    /**
     * Attempt to reconnect
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error(`[SONIOX-STT] Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`);
            this.emit('reconnect.failed', { attempts: this.reconnectAttempts });
            return;
        }
        
        this.reconnectAttempts++;
        this.metrics.reconnects++;
        
        const delay = this.config.reconnectDelayMs * this.reconnectAttempts;  // Exponential backoff
        
        console.log(`[SONIOX-STT] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
                console.log('[SONIOX-STT] Reconnected successfully');
                this.emit('reconnected', { attempts: this.reconnectAttempts });
            } catch (error) {
                console.error('[SONIOX-STT] Reconnect failed:', error.message);
                // Will retry via handleDisconnect
            }
        }, delay);
    }
    
    /**
     * Start keepalive timer
     */
    startKeepaliveTimer() {
        this.stopKeepaliveTimer();  // Clear any existing timer
        
        this.keepaliveTimer = setInterval(() => {
            if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
                // Check if we've sent audio recently
                const timeSinceLastAudio = Date.now() - this.lastAudioTime;
                
                // If no audio sent in last 10s, send keepalive
                if (timeSinceLastAudio > 10000) {
                    this.sendKeepalive();
                }
            }
        }, this.config.keepaliveIntervalMs);
        
        console.log(`[SONIOX-STT] Keepalive timer started (${this.config.keepaliveIntervalMs}ms interval)`);
    }
    
    /**
     * Stop keepalive timer
     */
    stopKeepaliveTimer() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }
    
    /**
     * Clean up connection resources
     */
    cleanupConnection() {
        this.stopKeepaliveTimer();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.close();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            this.ws = null;
        }
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
        
        // Check WebSocket state (1 = OPEN)
        if (this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            // Send binary audio data directly
            this.ws.send(audioData);
            
            // Update last audio time (for keepalive logic)
            this.lastAudioTime = Date.now();
            
            // Update metrics
            this.metrics.bytesProcessed += audioData.length;
            // For mulaw @ 8kHz: 8000 bytes = 1 second
            this.metrics.audioSeconds = this.metrics.bytesProcessed / 8000;
            
            return true;
        } catch (error) {
            console.error('[SONIOX-STT] Error sending audio:', error.message);
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
        
        if (this.ws.readyState !== WebSocket.OPEN) {
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
     * Soniox closes connection if no audio/keepalive for >20s
     */
    sendKeepalive() {
        if (!this.isConnected || !this.ws) {
            return false;
        }
        
        // Check WebSocket state (1 = OPEN)
        if (this.ws.readyState !== WebSocket.OPEN) {
            console.warn('[SONIOX-STT] Cannot send keepalive - WebSocket state:', this.ws.readyState);
            return false;
        }
        
        try {
            this.ws.send(JSON.stringify({
                type: 'keepalive'
            }));
            
            this.metrics.keepalivesSent++;
            console.log(`[SONIOX-STT] Keepalive sent (#${this.metrics.keepalivesSent})`);
            
            return true;
        } catch (error) {
            console.error('[SONIOX-STT] Error sending keepalive:', error.message);
            return false;
        }
    }
    
    /**
     * Mark that we're in an active call (enables auto-reconnect)
     */
    setInCall(inCall) {
        this.isInCall = inCall;
        console.log(`[SONIOX-STT] In-call state: ${inCall}`);
        
        if (!inCall) {
            this.shouldBeConnected = false;
        }
    }
    
    /**
     * Gracefully close the connection
     */
    async stop() {
        console.log('[SONIOX-STT] Stopping...');
        
        // Mark that we intentionally want to disconnect
        this.shouldBeConnected = false;
        this.isInCall = false;
        
        // Stop keepalive timer
        this.stopKeepaliveTimer();
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (!this.isConnected || !this.ws) {
            return;
        }
        
        try {
            // Send empty frame to signal end of stream
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('');
            }
            
            // Wait a bit for final tokens
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.ws.close(1000, 'Normal closure');  // 1000 = normal closure
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
        console.log('[SONIOX-STT] Cancelling...');
        
        // Mark that we intentionally want to disconnect
        this.shouldBeConnected = false;
        this.isInCall = false;
        
        this.cleanupConnection();
        
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
            bytesProcessed: this.metrics.bytesProcessed,
            keepalivesSent: this.metrics.keepalivesSent,
            reconnects: this.metrics.reconnects,
            isConnected: this.isConnected,
            isInCall: this.isInCall
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
    
    /**
     * Check if connected and ready
     */
    isReady() {
        return this.isConnected && this.isConfigured && this.ws?.readyState === WebSocket.OPEN;
    }
}

module.exports = SonioxSTT;