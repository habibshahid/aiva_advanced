/**
 * Message Buffer Service
 * 
 * Handles rapid-fire message collection for WhatsApp and other channels.
 * When users send multiple messages quickly, this service:
 * 1. Buffers them together
 * 2. Waits for a configurable pause
 * 3. Returns combined message for processing
 * 
 * Prevents race conditions and improves context understanding.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

class MessageBufferService {
    
    /**
     * Default configuration
     */
    static DEFAULTS = {
        BUFFER_WAIT_SECONDS: 3,      // Wait 3 seconds for more messages
        LOCK_TIMEOUT_SECONDS: 30,    // Lock timeout for processing
        MAX_BUFFER_AGE_SECONDS: 60   // Discard buffers older than 1 minute
    };

    /**
     * Add a message to the buffer
     * Returns: { shouldProcess: boolean, bufferedData: object | null }
     * 
     * @param {string} sessionId - Chat session ID
     * @param {object} messageData - { text, type, imageUrl, audioTranscript, audioDuration }
     * @param {number} bufferSeconds - How long to wait (from agent settings)
     */
    static async addMessage(sessionId, messageData, bufferSeconds = null) {
        // Use nullish coalescing to allow 0 as a valid value
        const waitSeconds = bufferSeconds !== null && bufferSeconds !== undefined 
            ? bufferSeconds 
            : this.DEFAULTS.BUFFER_WAIT_SECONDS;
        const now = new Date();
        
        try {
            // Check for existing buffer
            const [existingBuffers] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_message_buffer 
                 WHERE session_id = ? AND status IN ('collecting', 'processing')
                 ORDER BY created_at DESC LIMIT 1`,
                [sessionId]
            );

            // CASE 1: No existing buffer - create new one
            if (existingBuffers.length === 0) {
                return await this._createNewBuffer(sessionId, messageData, now, waitSeconds);
            }

            const buffer = existingBuffers[0];
            
            // CASE 2: Buffer is being processed - queue this message for next batch
            if (buffer.status === 'processing') {
                // Check if lock is expired (stale processing)
                if (buffer.lock_expires_at && new Date(buffer.lock_expires_at) < now) {
                    // Lock expired, take over
                    console.log(`⚠️ Buffer lock expired, taking over for session ${sessionId}`);
                    await this._updateBufferStatus(buffer.id, 'collecting', null);
                    return await this._addToExistingBuffer(buffer, messageData, now, waitSeconds);
                }
                
                // Processing in progress, create new buffer for next batch
                return await this._createNewBuffer(sessionId, messageData, now, waitSeconds);
            }

            // CASE 3: Buffer is collecting - add to it
            return await this._addToExistingBuffer(buffer, messageData, now, waitSeconds);
            
        } catch (error) {
            console.error('Error in MessageBufferService.addMessage:', error);
            // On error, return message immediately without buffering
            return {
                shouldProcess: true,
                bufferedData: this._createImmediateData(messageData)
            };
        }
    }

    /**
     * Check if buffer is ready to process
     * Called by a polling mechanism or timer
     * 
     * @param {string} sessionId - Chat session ID
     * @param {number} bufferSeconds - How long to wait
     */
    static async checkBufferReady(sessionId, bufferSeconds = null) {
        // Use nullish coalescing to allow 0 as a valid value
        const waitSeconds = bufferSeconds !== null && bufferSeconds !== undefined 
            ? bufferSeconds 
            : this.DEFAULTS.BUFFER_WAIT_SECONDS;
        const now = new Date();
        
        try {
            const [buffers] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_message_buffer 
                 WHERE session_id = ? AND status = 'collecting'
                 ORDER BY created_at DESC LIMIT 1`,
                [sessionId]
            );

            if (buffers.length === 0) {
                return { ready: false, data: null };
            }

            const buffer = buffers[0];
            const lastMessageAt = new Date(buffer.last_message_at);
            const elapsedSeconds = (now - lastMessageAt) / 1000;

            // Check if enough time has passed since last message
            if (elapsedSeconds >= waitSeconds) {
                // Ready to process - acquire lock
                const lockExpires = new Date(now.getTime() + (this.DEFAULTS.LOCK_TIMEOUT_SECONDS * 1000));
                
                const [result] = await db.query(
                    `UPDATE yovo_tbl_aiva_message_buffer 
                     SET status = 'processing', lock_expires_at = ?
                     WHERE id = ? AND status = 'collecting'`,
                    [lockExpires, buffer.id]
                );

                if (result.affectedRows === 0) {
                    // Another process got it
                    return { ready: false, data: null };
                }

                // Return combined data
                return {
                    ready: true,
                    data: this._combineBufferData(buffer),
                    bufferId: buffer.id
                };
            }

            return { ready: false, data: null, waitMore: waitSeconds - elapsedSeconds };
            
        } catch (error) {
            console.error('Error in MessageBufferService.checkBufferReady:', error);
            return { ready: false, data: null, error: error.message };
        }
    }

    /**
     * Try to acquire lock and get buffer for processing
     * Returns null if buffer not ready or already being processed
     * 
     * @param {string} sessionId - Chat session ID
     * @param {number} bufferSeconds - How long to wait
     */
    static async acquireBuffer(sessionId, bufferSeconds = null) {
        const waitSeconds = bufferSeconds || this.DEFAULTS.BUFFER_WAIT_SECONDS;
        const now = new Date();
        const lockExpires = new Date(now.getTime() + (this.DEFAULTS.LOCK_TIMEOUT_SECONDS * 1000));

        try {
            // Atomic operation: update status and acquire lock if conditions met
            const [result] = await db.query(
                `UPDATE yovo_tbl_aiva_message_buffer 
                 SET status = 'processing', lock_expires_at = ?
                 WHERE session_id = ? 
                   AND status = 'collecting'
                   AND TIMESTAMPDIFF(SECOND, last_message_at, ?) >= ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [lockExpires, sessionId, now, waitSeconds]
            );

            if (result.affectedRows === 0) {
                return null; // Not ready or already processing
            }

            // Fetch the buffer we just locked
            const [buffers] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_message_buffer 
                 WHERE session_id = ? AND status = 'processing'
                 ORDER BY created_at DESC LIMIT 1`,
                [sessionId]
            );

            if (buffers.length === 0) {
                return null;
            }

            return {
                bufferId: buffers[0].id,
                data: this._combineBufferData(buffers[0])
            };
            
        } catch (error) {
            console.error('Error in MessageBufferService.acquireBuffer:', error);
            return null;
        }
    }

    /**
     * Mark buffer as done after processing
     * 
     * @param {string} bufferId - Buffer ID
     */
    static async markDone(bufferId) {
        try {
            await db.query(
                `UPDATE yovo_tbl_aiva_message_buffer 
                 SET status = 'done', lock_expires_at = NULL
                 WHERE id = ?`,
                [bufferId]
            );
            return true;
        } catch (error) {
            console.error('Error in MessageBufferService.markDone:', error);
            return false;
        }
    }

    /**
     * Release lock without marking as done (for retry)
     * 
     * @param {string} bufferId - Buffer ID
     */
    static async releaseLock(bufferId) {
        try {
            await db.query(
                `UPDATE yovo_tbl_aiva_message_buffer 
                 SET status = 'collecting', lock_expires_at = NULL
                 WHERE id = ?`,
                [bufferId]
            );
            return true;
        } catch (error) {
            console.error('Error in MessageBufferService.releaseLock:', error);
            return false;
        }
    }

    /**
     * Cleanup old buffers (call periodically)
     */
    static async cleanup() {
        const maxAge = this.DEFAULTS.MAX_BUFFER_AGE_SECONDS;
        
        try {
            const [result] = await db.query(
                `DELETE FROM yovo_tbl_aiva_message_buffer 
                 WHERE (status = 'done' AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND))
                    OR (status = 'collecting' AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND))
                    OR (status = 'processing' AND lock_expires_at < NOW())`,
                [maxAge, maxAge * 2]
            );

            if (result.affectedRows > 0) {
                console.log(`🧹 Cleaned up ${result.affectedRows} old message buffers`);
            }

            return result.affectedRows;
        } catch (error) {
            console.error('Error in MessageBufferService.cleanup:', error);
            return 0;
        }
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Create a new buffer
     */
    static async _createNewBuffer(sessionId, messageData, now, bufferSeconds = null) {
        // Use nullish check to allow 0 as valid value
        const waitSeconds = bufferSeconds !== null && bufferSeconds !== undefined 
            ? bufferSeconds 
            : this.DEFAULTS.BUFFER_WAIT_SECONDS;
        
        // If buffer time is 0, process immediately without buffering
        if (waitSeconds <= 0) {
            console.log(`⚡ Buffer disabled (${waitSeconds}s) - processing immediately`);
            return {
                shouldProcess: true,
                bufferId: null,
                bufferedData: this._createImmediateData(messageData)
            };
        }
        
        const id = uuidv4();
        const messages = [];
        const images = [];
        const audioTranscripts = [];

        // Add message data
        if (messageData.text) {
            messages.push({
                text: messageData.text,
                type: messageData.type || 'text',
                timestamp: now.toISOString()
            });
        }

        if (messageData.imageUrl) {
            images.push({
                url: messageData.imageUrl,
                timestamp: now.toISOString()
            });
        }

        if (messageData.audioTranscript) {
            audioTranscripts.push({
                text: messageData.audioTranscript,
                duration: messageData.audioDuration || 0,
                timestamp: now.toISOString()
            });
        }

        await db.query(
            `INSERT INTO yovo_tbl_aiva_message_buffer 
             (id, session_id, messages, images, audio_transcripts, first_message_at, last_message_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'collecting')`,
            [
                id,
                sessionId,
                JSON.stringify(messages),
                JSON.stringify(images),
                JSON.stringify(audioTranscripts),
                now,
                now
            ]
        );

        console.log(`📥 Created new message buffer ${id} for session ${sessionId}`);

        return {
            shouldProcess: false,
            bufferId: id,
            message: 'Message buffered, waiting for more'
        };
    }

    /**
     * Add to existing buffer
     */
    static async _addToExistingBuffer(buffer, messageData, now, waitSeconds = null) {
        // Parse existing data - MySQL2 may return JSON columns as objects or strings
        let messages = [];
        let images = [];
        let audioTranscripts = [];

        try {
            messages = this._safeParseJson(buffer.messages, []);
            images = this._safeParseJson(buffer.images, []);
            audioTranscripts = this._safeParseJson(buffer.audio_transcripts, []);
        } catch (e) {
            console.error('Error parsing buffer JSON:', e);
        }

        // Add new data
        if (messageData.text) {
            messages.push({
                text: messageData.text,
                type: messageData.type || 'text',
                timestamp: now.toISOString()
            });
        }

        if (messageData.imageUrl) {
            images.push({
                url: messageData.imageUrl,
                timestamp: now.toISOString()
            });
        }

        if (messageData.audioTranscript) {
            audioTranscripts.push({
                text: messageData.audioTranscript,
                duration: messageData.audioDuration || 0,
                timestamp: now.toISOString()
            });
        }

        // If buffer is disabled (waitSeconds <= 0), return immediately with combined data
        if (waitSeconds !== null && waitSeconds <= 0) {
            console.log(`⚡ Buffer disabled - returning ${messages.length} messages immediately`);
            
            // Mark buffer as done since we're processing it
            await db.query(
                `UPDATE yovo_tbl_aiva_message_buffer 
                 SET messages = ?, images = ?, audio_transcripts = ?, last_message_at = ?, status = 'done'
                 WHERE id = ?`,
                [
                    JSON.stringify(messages),
                    JSON.stringify(images),
                    JSON.stringify(audioTranscripts),
                    now,
                    buffer.id
                ]
            );
            
            return {
                shouldProcess: true,
                bufferId: buffer.id,
                bufferedData: {
                    messages: messages,
                    images: images,
                    audioTranscripts: audioTranscripts,
                    messageCount: messages.length,
                    imageCount: images.length,
                    combinedText: messages.map(m => m.text).filter(Boolean).join('\n'),
                    firstMessageAt: buffer.first_message_at,
                    lastMessageAt: now.toISOString()
                }
            };
        }

        // Update buffer (normal buffering mode)
        await db.query(
            `UPDATE yovo_tbl_aiva_message_buffer 
             SET messages = ?, images = ?, audio_transcripts = ?, last_message_at = ?
             WHERE id = ?`,
            [
                JSON.stringify(messages),
                JSON.stringify(images),
                JSON.stringify(audioTranscripts),
                now,
                buffer.id
            ]
        );

        console.log(`📥 Added to buffer ${buffer.id}: ${messages.length} msgs, ${images.length} imgs`);

        return {
            shouldProcess: false,
            bufferId: buffer.id,
            message: 'Message added to buffer',
            messageCount: messages.length,
            imageCount: images.length
        };
    }

    /**
     * Update buffer status
     */
    static async _updateBufferStatus(bufferId, status, lockExpiresAt) {
        await db.query(
            `UPDATE yovo_tbl_aiva_message_buffer 
             SET status = ?, lock_expires_at = ?
             WHERE id = ?`,
            [status, lockExpiresAt, bufferId]
        );
    }

    /**
     * Combine buffer data into single message context
     */
    static _combineBufferData(buffer) {
        let messages = [];
        let images = [];
        let audioTranscripts = [];

        try {
            messages = this._safeParseJson(buffer.messages, []);
            images = this._safeParseJson(buffer.images, []);
            audioTranscripts = this._safeParseJson(buffer.audio_transcripts, []);
        } catch (e) {
            console.error('Error parsing buffer JSON:', e);
        }

        // Combine text messages
        const textParts = [];
        
        // Add regular text messages
        for (const msg of messages) {
            if (msg.text) {
                textParts.push(msg.text);
            }
        }

        // Add audio transcripts
        for (const audio of audioTranscripts) {
            if (audio.text) {
                textParts.push(audio.text);
            }
        }

        // Combine with proper separators
        const combinedText = textParts.join('. ').replace(/\.\s*\./g, '.').trim();

        // Get image URLs
        const imageUrls = images.map(img => img.url).filter(Boolean);

        return {
            combinedMessage: combinedText,
            images: imageUrls,
            messageCount: messages.length,
            imageCount: images.length,
            audioCount: audioTranscripts.length,
            totalItems: messages.length + images.length + audioTranscripts.length,
            firstMessageAt: buffer.first_message_at,
            lastMessageAt: buffer.last_message_at,
            rawMessages: messages,
            rawAudio: audioTranscripts,
            hasAudio: audioTranscripts.length > 0
        };
    }

    /**
     * Create immediate data (bypass buffer)
     */
    static _createImmediateData(messageData) {
        return {
            combinedMessage: messageData.audioTranscript || messageData.text || '',
            images: messageData.imageUrl ? [messageData.imageUrl] : [],
            messageCount: 1,
            imageCount: messageData.imageUrl ? 1 : 0,
            audioCount: messageData.audioTranscript ? 1 : 0,
            totalItems: 1,
            hasAudio: !!messageData.audioTranscript
        };
    }

    /**
     * Safely parse JSON - handles both string and already-parsed object
     * MySQL2 returns JSON columns as objects, not strings
     */
    static _safeParseJson(value, defaultValue = null) {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        // Already an object/array (MySQL2 auto-parsed)
        if (typeof value === 'object') {
            return value;
        }
        // String that needs parsing
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch (e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }
}

module.exports = MessageBufferService;