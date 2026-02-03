/**
 * AMD (Answering Machine Detection) Detector
 * Detects if a call was answered by a human or answering machine/voicemail
 * 
 * Detection methods:
 * 1. Audio energy patterns (machines have consistent energy, humans vary)
 * 2. Speech duration (voicemail greetings are typically longer)
 * 3. Silence patterns (humans pause, machines are continuous)
 * 4. Beep detection (voicemail beep at end of greeting)
 * 
 * Usage:
 *   const amd = new AMDDetector(options);
 *   amd.on('result', ({ isHuman, confidence, reason }) => { ... });
 *   amd.processAudio(audioBuffer);  // Feed audio samples
 *   amd.finalize();  // Force final decision
 */

const EventEmitter = require('events');

class AMDDetector extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            // Timing thresholds (in ms)
            maxDetectionTime: options.maxDetectionTime || 4000,    // Max time to wait for decision
            minSpeechDuration: options.minSpeechDuration || 200,   // Min speech to analyze
            humanMaxGreeting: options.humanMaxGreeting || 1500,    // Humans usually say "hello" quickly
            machineMinGreeting: options.machineMinGreeting || 2500, // Machines have longer greetings
            
            // Audio analysis
            sampleRate: options.sampleRate || 8000,
            silenceThreshold: options.silenceThreshold || 200,     // RMS below this = silence
            energyWindowMs: options.energyWindowMs || 50,          // Window for energy calculation
            
            // Beep detection
            beepMinFreq: options.beepMinFreq || 800,               // Min frequency for beep
            beepMaxFreq: options.beepMaxFreq || 1200,              // Max frequency for beep
            beepMinDuration: options.beepMinDuration || 200,       // Min beep duration (ms)
            
            ...options
        };
        
        // State
        this.isActive = false;
        this.isComplete = false;
        this.result = null;
        this.startTime = null;
        
        // Audio analysis state
        this.totalSamples = 0;
        this.speechSamples = 0;
        this.silenceSamples = 0;
        this.speechSegments = [];       // Array of { start, end, duration }
        this.currentSpeechStart = null;
        this.inSpeech = false;
        
        // Energy tracking
        this.energyHistory = [];        // Rolling window of energy values
        this.energyVariance = 0;
        
        // Beep detection
        this.beepDetected = false;
        this.potentialBeepStart = null;
        
        // Decision timer
        this.decisionTimer = null;
    }
    
    /**
     * Start AMD detection
     */
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.isComplete = false;
        this.startTime = Date.now();
        this.result = null;
        
        // Reset state
        this.totalSamples = 0;
        this.speechSamples = 0;
        this.silenceSamples = 0;
        this.speechSegments = [];
        this.currentSpeechStart = null;
        this.inSpeech = false;
        this.energyHistory = [];
        this.beepDetected = false;
        
        console.log('[AMD] Detection started');
        
        // Set maximum detection time
        this.decisionTimer = setTimeout(() => {
            if (!this.isComplete) {
                this.makeDecision('timeout');
            }
        }, this.options.maxDetectionTime);
        
        this.emit('started');
    }
    
    /**
     * Process audio buffer (PCM16 or µ-law)
     */
    processAudio(buffer, format = 'pcm16') {
        if (!this.isActive || this.isComplete) return;
        
        // Convert to samples
        const samples = this.bufferToSamples(buffer, format);
        this.totalSamples += samples.length;
        
        // Analyze audio in windows
        const windowSize = Math.floor(this.options.sampleRate * this.options.energyWindowMs / 1000);
        
        for (let i = 0; i < samples.length; i += windowSize) {
            const window = samples.slice(i, i + windowSize);
            this.analyzeWindow(window);
        }
        
        // Check if we can make early decision
        this.checkEarlyDecision();
    }
    
    /**
     * Convert buffer to sample array
     */
    bufferToSamples(buffer, format) {
        const samples = [];
        
        if (format === 'pcm16') {
            for (let i = 0; i < buffer.length - 1; i += 2) {
                samples.push(buffer.readInt16LE(i));
            }
        } else if (format === 'ulaw' || format === 'mulaw') {
            // µ-law decode table (simplified)
            for (let i = 0; i < buffer.length; i++) {
                const ulaw = buffer[i];
                // Simple decode - expand from 8-bit to approximate 16-bit
                const sign = (ulaw & 0x80) ? -1 : 1;
                const exponent = (ulaw >> 4) & 0x07;
                const mantissa = ulaw & 0x0F;
                const sample = sign * ((mantissa << (exponent + 3)) + (1 << (exponent + 2)) - 132);
                samples.push(sample);
            }
        }
        
        return samples;
    }
    
    /**
     * Analyze a window of samples
     */
    analyzeWindow(samples) {
        if (samples.length === 0) return;
        
        // Calculate RMS energy
        let sumSquares = 0;
        for (const sample of samples) {
            sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        
        // Track energy history (for variance calculation)
        this.energyHistory.push(rms);
        if (this.energyHistory.length > 100) {
            this.energyHistory.shift();
        }
        
        // Detect speech vs silence
        const isSpeech = rms > this.options.silenceThreshold;
        const currentTime = (this.totalSamples / this.options.sampleRate) * 1000;
        
        if (isSpeech) {
            this.speechSamples += samples.length;
            
            if (!this.inSpeech) {
                // Speech started
                this.inSpeech = true;
                this.currentSpeechStart = currentTime;
            }
        } else {
            this.silenceSamples += samples.length;
            
            if (this.inSpeech) {
                // Speech ended - record segment
                this.inSpeech = false;
                const segment = {
                    start: this.currentSpeechStart,
                    end: currentTime,
                    duration: currentTime - this.currentSpeechStart
                };
                this.speechSegments.push(segment);
                this.currentSpeechStart = null;
            }
        }
        
        // Check for beep (high energy in narrow frequency range)
        // Simplified: high energy after silence
        if (rms > this.options.silenceThreshold * 3) {
            if (!this.potentialBeepStart) {
                this.potentialBeepStart = currentTime;
            }
        } else if (this.potentialBeepStart) {
            const beepDuration = currentTime - this.potentialBeepStart;
            if (beepDuration >= this.options.beepMinDuration && beepDuration <= 500) {
                this.beepDetected = true;
                console.log(`[AMD] Beep detected at ${this.potentialBeepStart}ms (${beepDuration}ms)`);
            }
            this.potentialBeepStart = null;
        }
    }
    
    /**
     * Check if we can make early decision
     */
    checkEarlyDecision() {
        const elapsedMs = Date.now() - this.startTime;
        const speechDurationMs = (this.speechSamples / this.options.sampleRate) * 1000;
        
        // Too early to decide
        if (elapsedMs < this.options.minSpeechDuration) {
            return;
        }
        
        // Beep detected = definitely machine
        if (this.beepDetected) {
            this.makeDecision('beep_detected');
            return;
        }
        
        // Very long continuous speech without pause = machine
        if (this.speechSegments.length === 0 && this.inSpeech) {
            const currentSpeechDuration = elapsedMs - (this.currentSpeechStart || 0);
            if (currentSpeechDuration > this.options.machineMinGreeting) {
                this.makeDecision('long_continuous_speech');
                return;
            }
        }
        
        // Quick greeting with pause = human
        if (this.speechSegments.length >= 1) {
            const firstSegment = this.speechSegments[0];
            if (firstSegment.duration < this.options.humanMaxGreeting) {
                // Short first utterance - likely "Hello?" from human
                // Wait a bit for more evidence
                if (elapsedMs > firstSegment.end + 500) {
                    // Silence after short greeting = human
                    this.makeDecision('short_greeting_with_pause');
                    return;
                }
            }
        }
        
        // Multiple speech segments = human (conversation-like)
        if (this.speechSegments.length >= 3) {
            this.makeDecision('multiple_segments');
            return;
        }
    }
    
    /**
     * Force final decision
     */
    finalize() {
        if (!this.isActive || this.isComplete) return;
        this.makeDecision('forced');
    }
    
    /**
     * Make final AMD decision
     */
    makeDecision(trigger) {
        if (this.isComplete) return;
        
        this.isComplete = true;
        this.isActive = false;
        
        if (this.decisionTimer) {
            clearTimeout(this.decisionTimer);
            this.decisionTimer = null;
        }
        
        // Calculate metrics
        const elapsedMs = Date.now() - this.startTime;
        const speechDurationMs = (this.speechSamples / this.options.sampleRate) * 1000;
        const speechRatio = this.totalSamples > 0 ? this.speechSamples / this.totalSamples : 0;
        
        // Calculate energy variance (low variance = machine)
        let energyVariance = 0;
        if (this.energyHistory.length > 10) {
            const mean = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
            const squaredDiffs = this.energyHistory.map(e => Math.pow(e - mean, 2));
            energyVariance = squaredDiffs.reduce((a, b) => a + b, 0) / this.energyHistory.length;
        }
        
        // Decision logic
        let isHuman = true;
        let confidence = 0.5;
        let reason = 'default';
        
        switch (trigger) {
            case 'beep_detected':
                isHuman = false;
                confidence = 0.95;
                reason = 'Voicemail beep detected';
                break;
                
            case 'long_continuous_speech':
                isHuman = false;
                confidence = 0.85;
                reason = 'Long continuous speech without pause (machine greeting)';
                break;
                
            case 'short_greeting_with_pause':
                isHuman = true;
                confidence = 0.80;
                reason = 'Short greeting followed by pause (human behavior)';
                break;
                
            case 'multiple_segments':
                isHuman = true;
                confidence = 0.75;
                reason = 'Multiple speech segments (conversational pattern)';
                break;
                
            case 'timeout':
            case 'forced':
            default:
                // Make best guess based on metrics
                if (speechDurationMs > this.options.machineMinGreeting && this.speechSegments.length <= 1) {
                    isHuman = false;
                    confidence = 0.70;
                    reason = 'Long single utterance';
                } else if (speechDurationMs < this.options.humanMaxGreeting) {
                    isHuman = true;
                    confidence = 0.65;
                    reason = 'Short utterance';
                } else {
                    isHuman = true;
                    confidence = 0.50;
                    reason = 'Inconclusive - defaulting to human';
                }
        }
        
        this.result = {
            isHuman,
            isMachine: !isHuman,
            confidence,
            reason,
            trigger,
            metrics: {
                elapsedMs,
                speechDurationMs,
                speechRatio,
                segmentCount: this.speechSegments.length,
                energyVariance,
                beepDetected: this.beepDetected
            }
        };
        
        console.log(`[AMD] Result: ${isHuman ? 'HUMAN' : 'MACHINE'} (${(confidence * 100).toFixed(0)}% confidence) - ${reason}`);
        
        this.emit('result', this.result);
        
        return this.result;
    }
    
    /**
     * Stop detection
     */
    stop() {
        if (this.decisionTimer) {
            clearTimeout(this.decisionTimer);
            this.decisionTimer = null;
        }
        this.isActive = false;
        this.emit('stopped');
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            isActive: this.isActive,
            isComplete: this.isComplete,
            result: this.result,
            elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
            speechSamples: this.speechSamples,
            silenceSamples: this.silenceSamples,
            segmentCount: this.speechSegments.length
        };
    }
}

module.exports = AMDDetector;