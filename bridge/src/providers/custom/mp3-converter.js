/**
 * MP3 to PCM Converter
 * Converts MP3 audio to PCM16 24kHz for Asterisk compatibility
 * 
 * Uses ffmpeg-static for reliable cross-platform conversion
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

// Try to load ffmpeg-static, fallback to system ffmpeg
let ffmpegPath;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (e) {
    ffmpegPath = 'ffmpeg'; // Use system ffmpeg
    console.warn('[MP3-CONVERTER] ffmpeg-static not found, using system ffmpeg');
}

class MP3ToPCMConverter extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            sampleRate: options.sampleRate || 24000,  // 24kHz to match OpenAI/Azure
            channels: options.channels || 1,          // Mono
            bitDepth: options.bitDepth || 16,         // 16-bit
            ...options
        };
        
        // Streaming state
        this.ffmpegProcess = null;
        this.isActive = false;
        this.inputBuffer = Buffer.alloc(0);
        this.outputBuffer = Buffer.alloc(0);
        
        // Buffering for smoother output
        this.minBufferSize = options.minBufferSize || 4800;  // ~100ms at 24kHz mono 16-bit
        this.flushTimeout = null;
        this.inactivityTimeout = null;  // Auto-kill if stalled
    }
    
    /**
     * Reset inactivity timeout - kills process if no data for 30 seconds
     */
    _resetInactivityTimeout() {
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
        }
        
        this.inactivityTimeout = setTimeout(() => {
            if (this.isActive && this.ffmpegProcess) {
                console.log('[MP3-CONVERTER] ⚠ Inactivity timeout - killing stalled ffmpeg');
                this.stop();
            }
        }, 30000);  // 30 seconds
    }
    
    /**
     * Start the streaming converter
     */
    start() {
        if (this.isActive) {
            //console.log('[MP3-CONVERTER-DEBUG] Already active, skipping start');
            return;
        }
        
        //console.log('[MP3-CONVERTER-DEBUG] Starting converter...');
        //console.log('[MP3-CONVERTER-DEBUG] ffmpeg path:', ffmpegPath);
        //console.log('[MP3-CONVERTER-DEBUG] Options:', JSON.stringify(this.options));
        
        this.isActive = true;
        this.inputBuffer = Buffer.alloc(0);
        this.outputBuffer = Buffer.alloc(0);
        this.totalBytesIn = 0;
        this.totalBytesOut = 0;
        
        // Start inactivity timeout
        this._resetInactivityTimeout();
        
        // Spawn ffmpeg process for streaming conversion
        const args = [
            '-hide_banner',
            '-loglevel', 'error',  // Only show errors, not progress
            '-f', 'mp3',              // Input format
            '-i', 'pipe:0',           // Read from stdin
            '-f', 's16le',            // Output format: signed 16-bit little-endian
            '-ar', this.options.sampleRate.toString(),  // Sample rate
            '-ac', this.options.channels.toString(),    // Channels
            '-acodec', 'pcm_s16le',   // PCM codec
            'pipe:1'                   // Write to stdout
        ];
        
        //console.log('[MP3-CONVERTER-DEBUG] ffmpeg args:', args.join(' '));
        
        this.ffmpegProcess = spawn(ffmpegPath, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        //console.log('[MP3-CONVERTER-DEBUG] ffmpeg process spawned, PID:', this.ffmpegProcess.pid);
        
        // Handle PCM output
        this.ffmpegProcess.stdout.on('data', (chunk) => {
            this.totalBytesOut += chunk.length;
            //console.log(`[MP3-CONVERTER-DEBUG] PCM output: ${chunk.length} bytes (total out: ${this.totalBytesOut})`);
            
            this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);
            
            // Emit chunks when we have enough data
            while (this.outputBuffer.length >= this.minBufferSize) {
                const pcmChunk = this.outputBuffer.slice(0, this.minBufferSize);
                this.outputBuffer = this.outputBuffer.slice(this.minBufferSize);
                
                this.emit('pcm', pcmChunk);
            }
        });
        
        // Handle errors/info from ffmpeg
        this.ffmpegProcess.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) {
                //console.log('[MP3-CONVERTER-DEBUG] ffmpeg stderr:', msg);
            }
        });
        
        this.ffmpegProcess.on('error', (err) => {
            //console.error('[MP3-CONVERTER-DEBUG] Process spawn error:', err);
            this.emit('error', err);
        });
        
        this.ffmpegProcess.on('close', (code) => {
            //console.log(`[MP3-CONVERTER-DEBUG] Process closed with code: ${code}`);
            //console.log(`[MP3-CONVERTER-DEBUG] Total bytes in: ${this.totalBytesIn}, out: ${this.totalBytesOut}`);
            
            if (code !== 0 && code !== null) {
                //console.warn('[MP3-CONVERTER-DEBUG] ⚠ Non-zero exit code:', code);
            }
            this.isActive = false;
            
            // Flush remaining output
            if (this.outputBuffer.length > 0) {
                this.emit('pcm', this.outputBuffer);
                this.outputBuffer = Buffer.alloc(0);
            }
            
            this.emit('end');
        });
        
        //console.log('[MP3-CONVERTER-DEBUG] Converter started successfully');
    }
    
    /**
     * Write MP3 data to the converter
     * @param {Buffer} mp3Data - MP3 audio data
     */
    write(mp3Data) {
        if (!this.isActive || !this.ffmpegProcess) {
            //console.log('[MP3-CONVERTER-DEBUG] Not active, starting converter first');
            this.start();
        }
        
        // Reset inactivity timeout on each write
        this._resetInactivityTimeout();
        
        try {
            if (this.ffmpegProcess && this.ffmpegProcess.stdin.writable) {
                this.totalBytesIn = (this.totalBytesIn || 0) + mp3Data.length;
                //console.log(`[MP3-CONVERTER-DEBUG] Writing ${mp3Data.length} bytes to ffmpeg (total in: ${this.totalBytesIn})`);
                
                // Log first few bytes to verify format
                if (this.totalBytesIn === mp3Data.length) {
                    const header = mp3Data.slice(0, 10).toString('hex').toUpperCase();
                    //console.log('[MP3-CONVERTER-DEBUG] First write header (hex):', header);
                }
                
                this.ffmpegProcess.stdin.write(mp3Data);
            } else {
                //console.log('[MP3-CONVERTER-DEBUG] ⚠ stdin not writable!');
            }
        } catch (err) {
            //console.error('[MP3-CONVERTER-DEBUG] Write error:', err);
        }
    }
    
    /**
     * Signal end of input and flush remaining data
     */
    end() {
        //console.log('[MP3-CONVERTER-DEBUG] End called, flushing...');
        //console.log(`[MP3-CONVERTER-DEBUG] Total bytes written: ${this.totalBytesIn || 0}`);
        
        // Clear inactivity timeout - we're done
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
            this.inactivityTimeout = null;
        }
        
        if (this.ffmpegProcess && this.ffmpegProcess.stdin.writable) {
            this.ffmpegProcess.stdin.end();
            //console.log('[MP3-CONVERTER-DEBUG] stdin.end() called');
        } else {
            //console.log('[MP3-CONVERTER-DEBUG] ⚠ Cannot end - stdin not writable');
        }
    }
    
    /**
     * Stop the converter immediately
     * FIXED: Force kill orphaned ffmpeg processes
     */
    stop() {
        // Clear inactivity timeout
        if (this.inactivityTimeout) {
            clearTimeout(this.inactivityTimeout);
            this.inactivityTimeout = null;
        }
        
        if (this.ffmpegProcess) {
            const pid = this.ffmpegProcess.pid;
            console.log(`[MP3-CONVERTER] Stopping ffmpeg PID: ${pid}`);
            
            try {
                // Close stdin first to signal EOF
                if (this.ffmpegProcess.stdin && this.ffmpegProcess.stdin.writable) {
                    this.ffmpegProcess.stdin.end();
                }
                
                // Try graceful termination
                this.ffmpegProcess.kill('SIGTERM');
                
                // Force kill after 500ms if still running
                const proc = this.ffmpegProcess;
                setTimeout(() => {
                    try {
                        if (proc && !proc.killed) {
                            console.log(`[MP3-CONVERTER] Force killing ffmpeg PID: ${pid}`);
                            proc.kill('SIGKILL');
                        }
                    } catch (e) {
                        // Process already dead - ignore
                    }
                }, 500);
            } catch (e) {
                console.log('[MP3-CONVERTER] Error stopping ffmpeg:', e.message);
            }
            
            this.ffmpegProcess = null;
        }
        
        this.isActive = false;
        this.inputBuffer = Buffer.alloc(0);
        this.outputBuffer = Buffer.alloc(0);
        
        if (this.flushTimeout) {
            clearTimeout(this.flushTimeout);
            this.flushTimeout = null;
        }
    }
    
    /**
     * Convert a complete MP3 buffer to PCM (non-streaming)
     * @param {Buffer} mp3Buffer - Complete MP3 audio
     * @returns {Promise<Buffer>} - PCM audio
     */
    static async convert(mp3Buffer) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, [
                '-hide_banner',
                '-loglevel', 'error',
                '-f', 'mp3',
                '-i', 'pipe:0',
                '-f', 's16le',
                '-ar', '24000',
                '-ac', '1',
                '-acodec', 'pcm_s16le',
                'pipe:1'
            ]);
            
            const chunks = [];
            
            ffmpeg.stdout.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            ffmpeg.stderr.on('data', (data) => {
                // Ignore stderr unless it's a real error
            });
            
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve(Buffer.concat(chunks));
                } else {
                    reject(new Error(`ffmpeg exited with code ${code}`));
                }
            });
            
            ffmpeg.on('error', (err) => {
                reject(err);
            });
            
            ffmpeg.stdin.write(mp3Buffer);
            ffmpeg.stdin.end();
        });
    }
}

module.exports = MP3ToPCMConverter;
