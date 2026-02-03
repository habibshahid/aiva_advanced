/**
 * Audio Queue Manager
 * Manages RTP audio packet transmission with proper timing
 * 
 * FIXES APPLIED:
 * - Fade-in to eliminate click sound at audio start (applied ONCE per stream)
 * - Fade-out to eliminate pop sound during interruption
 * - Flushes remaining audio in accumulator to prevent missing words
 * - clearWithFade() for smooth barge-in experience
 * - Packet statistics for debugging
 * 
 * v2: Fixed tick sound issue - fade-in now only applied once at stream start
 */

const EventEmitter = require('events');

class AudioQueue extends EventEmitter {
    constructor(rtpServer, clientKey) {
        super();
        this.rtpServer = rtpServer;
        this.clientKey = clientKey;
        this.queue = [];
        this.isProcessing = false;
        this.timer = null;
        this.audioAccumulator = Buffer.alloc(0);
        this.lastAudioReceived = 0;
        this.audioStreamActive = false;
        
        // Fade state tracking - prevents multiple fade-ins per stream
        this.fadeInApplied = false;
        
        // Packet statistics for debugging
        this.packetsSent = 0;
        this.packetsDropped = 0;
        
        // Configurable thresholds
        this.config = {
            chunkSize: 160,       // 20ms at 8kHz (160 samples)
            packetInterval: 20,   // ms between packets
            streamEndDelay: 300,  // ms to wait before considering stream ended
            maxQueueSize: 5000,   // Maximum packets to queue
            fadeInSamples: 80,    // 10ms fade-in (80 samples at 8kHz)
            fadeOutSamples: 240   // 30ms fade-out for smoother cutoff
        };
    }
    
    /**
     * Apply fade-in to reduce click at audio start
     * mulaw: 0xFF = silence (zero amplitude)
     * 
     * Note: Only call this ONCE at the start of a new audio stream
     */
    applyFadeIn(buffer, samples) {
        if (buffer.length < samples) {
            samples = buffer.length;
        }
        
        const result = Buffer.from(buffer);
        const silenceValue = 0xFF; // mulaw silence
        
        for (let i = 0; i < samples; i++) {
            // Exponential curve for smoother fade
            const fadeRatio = (i / samples) * (i / samples);
            const original = result[i];
            
            // Interpolate between silence and original value
            const diff = original - silenceValue;
            result[i] = Math.round(silenceValue + (diff * fadeRatio));
        }
        
        return result;
    }
    
    /**
     * Apply fade-out to reduce click at audio end
     */
    applyFadeOut(buffer, samples) {
        if (buffer.length < samples) {
            samples = buffer.length;
        }
        
        const result = Buffer.from(buffer);
        const silenceValue = 0xFF; // mulaw silence
        const startIdx = Math.max(0, buffer.length - samples);
        
        for (let i = 0; i < samples; i++) {
            // Exponential curve for smoother fade
            const progress = i / samples;
            const fadeRatio = 1 - (progress * progress); // Fade from 1 to 0
            const idx = startIdx + i;
            if (idx < result.length) {
                const original = result[idx];
                const diff = original - silenceValue;
                result[idx] = Math.round(silenceValue + (diff * fadeRatio));
            }
        }
        
        return result;
    }
    
    /**
     * Add audio to the queue
     */
    addAudio(ulawBuffer) {
        // Check if queue is getting too full
        if (this.queue.length > this.config.maxQueueSize * 0.8) {
            console.warn(`[AUDIO-QUEUE] Queue at ${this.queue.length}/${this.config.maxQueueSize} - nearing capacity`);
        }
        
        let processedBuffer = ulawBuffer;
        
        // Apply fade-in ONLY at the true start of a new audio stream
        // This prevents tick sounds from re-applying fade on every chunk
        if (!this.fadeInApplied) {
            processedBuffer = this.applyFadeIn(ulawBuffer, this.config.fadeInSamples);
            this.fadeInApplied = true;
        }
        
        // Add to accumulator
        this.audioAccumulator = Buffer.concat([this.audioAccumulator, processedBuffer]);
        
        // Split into chunks
        while (this.audioAccumulator.length >= this.config.chunkSize) {
            const chunk = this.audioAccumulator.slice(0, this.config.chunkSize);
            this.queue.push(chunk);
            this.audioAccumulator = this.audioAccumulator.slice(this.config.chunkSize);
        }
        
        this.lastAudioReceived = Date.now();
        this.audioStreamActive = true;
        
        // Start processing immediately if not running
        if (!this.isProcessing && this.queue.length > 0) {
            this.startTransmission();
        }
    }
    
    /**
     * Clear the queue with smooth fade-out to eliminate click sounds
     * Use this for barge-in / interruption scenarios
     */
    clearWithFade() {
        if (this.queue.length === 0 && this.audioAccumulator.length === 0) {
            this.stopTransmission();
            this.fadeInApplied = false;  // Reset for next stream
            this.emit('cleared');
            return;
        }
        
        // Collect remaining audio for fade-out
        let remainingAudio;
        
        if (this.queue.length > 0) {
            // Take up to 10 packets (200ms) for fade-out
            const fadePacketCount = Math.min(this.queue.length, 10);
            const fadePackets = this.queue.slice(0, fadePacketCount);
            remainingAudio = Buffer.concat(fadePackets);
        } else if (this.audioAccumulator.length > 0) {
            remainingAudio = this.audioAccumulator;
        } else {
            remainingAudio = Buffer.alloc(0);
        }
        
        // Clear the queue
        this.queue = [];
        this.audioAccumulator = Buffer.alloc(0);
        
        if (remainingAudio.length > 0) {
            // Apply fade-out to remaining audio
            const fadedAudio = this.applyFadeOut(remainingAudio, this.config.fadeOutSamples);
            
            // Re-chunk the faded audio
            for (let i = 0; i < fadedAudio.length; i += this.config.chunkSize) {
                let chunk = fadedAudio.slice(i, i + this.config.chunkSize);
                
                // Pad last chunk if needed
                if (chunk.length < this.config.chunkSize) {
                    const padding = Buffer.alloc(this.config.chunkSize - chunk.length, 0xFF);
                    chunk = Buffer.concat([chunk, padding]);
                }
                
                this.queue.push(chunk);
            }
            
            // Add silence packets for smooth transition
            const silencePacket = Buffer.alloc(this.config.chunkSize, 0xFF);
            for (let i = 0; i < 5; i++) {
                this.queue.push(Buffer.from(silencePacket));
            }
        }
        
        this.audioStreamActive = false;
        this.fadeInApplied = false;  // Reset for next stream
        this.emit('cleared');
        
        // Let the remaining fade-out packets play, then stop
        // The queue will naturally drain and stopTransmission will be called
    }
    
    /**
     * Start RTP transmission
     */
    startTransmission() {
        if (this.isProcessing) return;
        
        this.isProcessing = true;
        this.packetsSent = 0;
        this.packetsDropped = 0;
        this.emit('started');
        
        // Send first packet immediately
        this.sendNextPacket();
        
        // Set up interval for subsequent packets
        this.timer = setInterval(() => {
            this.sendNextPacket();
        }, this.config.packetInterval);
    }
    
    /**
     * Send next packet in queue
     */
    sendNextPacket() {
        if (this.queue.length === 0) {
            // Check if we're still receiving audio
            const timeSinceLastAudio = Date.now() - this.lastAudioReceived;
            
            if (this.audioStreamActive && timeSinceLastAudio < this.config.streamEndDelay) {
                // Still active, wait longer
                return;
            }
            
            // CRITICAL FIX: Flush remaining audio in accumulator before stopping
            // This prevents the last word/syllable from being cut off
            if (this.audioAccumulator.length > 0) {
                // Pad with silence (0xFF for mulaw) to make a full packet
                const padding = Buffer.alloc(this.config.chunkSize - this.audioAccumulator.length, 0xFF);
                const lastPacket = Buffer.concat([this.audioAccumulator, padding]);
                this.queue.push(lastPacket);
                this.audioAccumulator = Buffer.alloc(0);
                // Don't stop yet - send this last packet on next interval
                return;
            }
            
            // Stop transmission
            this.stopTransmission();
            return;
        }
        
        // Get and send next packet
        const packet = this.queue.shift();
        const sent = this.rtpServer.sendAudio(this.clientKey, packet);
        
        if (sent) {
            this.packetsSent++;
        } else {
            this.packetsDropped++;
            if (this.packetsDropped % 100 === 0) {
                console.error(`[AUDIO-QUEUE] Dropped ${this.packetsDropped} packets for ${this.clientKey}`);
            }
            this.emit('error', new Error('Failed to send RTP packet'));
        }
        
        this.emit('packetSent', packet.length);
    }
    
    /**
     * Stop RTP transmission
     */
    stopTransmission() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        this.isProcessing = false;
        this.audioStreamActive = false;
        this.fadeInApplied = false;  // Reset for next stream
        
        this.emit('stopped');
    }
    
    /**
     * Clear the queue immediately (no fade - use sparingly)
     * Prefer clearWithFade() for user-facing interruptions
     */
    clear() {
        this.queue = [];
        this.audioAccumulator = Buffer.alloc(0);
        this.fadeInApplied = false;  // Reset for next stream
        this.stopTransmission();
        this.emit('cleared');
    }
    
    /**
     * Reset fade state - call this when starting a new TTS response
     * This ensures fade-in is applied to the next audio stream
     */
    resetFadeState() {
        this.fadeInApplied = false;
    }
    
    /**
     * Get queue statistics
     */
    getStats() {
        return {
            queueLength: this.queue.length,
            accumulatorSize: this.audioAccumulator.length,
            isProcessing: this.isProcessing,
            audioStreamActive: this.audioStreamActive,
            lastAudioReceived: this.lastAudioReceived,
            packetsSent: this.packetsSent,
            packetsDropped: this.packetsDropped,
            fadeInApplied: this.fadeInApplied
        };
    }
    
    /**
     * Destroy the queue
     */
    destroy() {
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = AudioQueue;