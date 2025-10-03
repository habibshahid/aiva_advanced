/**
 * Audio Queue Manager - IMPROVED VERSION
 * Fixes race conditions in your original implementation
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
        
        // Configurable thresholds
        this.config = {
            chunkSize: 160,  // 20ms at 8kHz
            packetInterval: 20,  // ms
            streamEndDelay: 500,  // ms to wait before considering stream ended
            maxQueueSize: 3000  // Maximum packets to queue
        };
    }
    
    addAudio(ulawBuffer) {
		// Check if queue is getting too full
		if (this.queue.length > this.config.maxQueueSize * 0.8) {
			console.warn(`[AUDIO-QUEUE] Queue at ${this.queue.length}/${this.config.maxQueueSize} - nearing capacity`);
		}
		
		// Add to accumulator
		this.audioAccumulator = Buffer.concat([this.audioAccumulator, ulawBuffer]);
		
		// Split into chunks
		const chunks = [];
		while (this.audioAccumulator.length >= this.config.chunkSize) {
			chunks.push(this.audioAccumulator.slice(0, this.config.chunkSize));
			this.audioAccumulator = this.audioAccumulator.slice(this.config.chunkSize);
		}
		
		// Add to queue with overflow protection
		if (this.queue.length + chunks.length > this.config.maxQueueSize) {
			// Instead of dropping, we'll just warn and increase capacity dynamically
			const overflow = (this.queue.length + chunks.length) - this.config.maxQueueSize;
			console.warn(`[AUDIO-QUEUE] Queue would overflow by ${overflow} packets, allowing growth`);
			
			// Emit event but don't drop
			this.emit('nearCapacity', this.queue.length);
		}
		
		this.queue.push(...chunks);
		this.lastAudioReceived = Date.now();
		this.audioStreamActive = true;
		
		// Start processing if not already running
		if (!this.isProcessing && this.queue.length > 0) {
			this.startTransmission();
		}
	}
    
    startTransmission() {
		if (this.isProcessing) return;
		
		this.isProcessing = true;
		this.emit('started');
		
		// Send first packet immediately
		this.sendNextPacket();
		
		// Adaptive interval based on queue size
		const getInterval = () => {
			if (this.queue.length > 500) {
				return 18;  // Speed up slightly when queue is large
			}
			return this.config.packetInterval;  // Normal 20ms
		};
		
		// Set up interval for subsequent packets
		this.timer = setInterval(() => {
			this.sendNextPacket();
			
			// Adjust interval dynamically
			if (this.timer) {
				clearInterval(this.timer);
				this.timer = setInterval(() => this.sendNextPacket(), getInterval());
			}
		}, getInterval());
	}
    
    sendNextPacket() {
        if (this.queue.length === 0) {
            // Check if we're still receiving audio
            const timeSinceLastAudio = Date.now() - this.lastAudioReceived;
            
            if (this.audioStreamActive && timeSinceLastAudio < this.config.streamEndDelay) {
                // Still active, wait longer
                return;
            }
            
            // Stop transmission
            this.stopTransmission();
            return;
        }
        
        // Get and send next packet
        const packet = this.queue.shift();
        const sent = this.rtpServer.sendAudio(this.clientKey, packet);
        
        if (!sent) {
            console.error(`[AUDIO-QUEUE] Failed to send packet to ${this.clientKey}`);
            this.emit('error', new Error('Failed to send RTP packet'));
        }
        
        this.emit('packetSent', packet.length);
    }
    
    stopTransmission() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        
        this.isProcessing = false;
        this.audioStreamActive = false;
        
        this.emit('stopped');
    }
    
    clear() {
        this.queue = [];
        this.audioAccumulator = Buffer.alloc(0);
        this.stopTransmission();
        this.emit('cleared');
    }
    
    getStats() {
        return {
            queueLength: this.queue.length,
            accumulatorSize: this.audioAccumulator.length,
            isProcessing: this.isProcessing,
            audioStreamActive: this.audioStreamActive,
            lastAudioReceived: this.lastAudioReceived
        };
    }
    
    destroy() {
        this.clear();
        this.removeAllListeners();
    }
}

module.exports = AudioQueue;