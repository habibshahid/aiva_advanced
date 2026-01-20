/**
 * Sync Message Consolidator
 * 
 * PHASE 3: Message Consolidation for Sync API
 * 
 * Handles rapid-fire message consolidation for synchronous endpoints
 * (WhatsApp webhook, public chat API) where we can't use async buffering.
 * 
 * Architecture:
 * 1. First message starts a consolidation window
 * 2. Subsequent messages within window are collected
 * 3. After window expires, all messages processed together
 * 4. Uses database for cross-request coordination
 * 
 * This solves the problem where customers send multiple quick messages
 * and each triggers a separate API call/response.
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

class SyncMessageConsolidator {

    /**
     * Default configuration
     */
    static DEFAULTS = {
        WINDOW_MS: 3000,           // 3 second consolidation window
        MAX_WINDOW_MS: 10000,      // Maximum 10 second window
        POLL_INTERVAL_MS: 500,     // Check every 500ms
        MAX_MESSAGES: 10,          // Max messages to consolidate
        LOCK_TIMEOUT_MS: 30000     // Lock timeout for processing
    };

    /**
     * Add message to consolidation window and determine if should process
     * 
     * This is the main entry point for sync endpoints.
     * Returns: { action: 'wait' | 'process' | 'skip', data?: ConsolidatedData }
     * 
     * @param {string} sessionId - Session/conversation ID
     * @param {object} message - { text, imageUrl, audioTranscript, metadata }
     * @param {object} options - { windowMs, maxMessages }
     */
    static async addAndCheck(sessionId, message, options = {}) {
        const windowMs = options.windowMs || this.DEFAULTS.WINDOW_MS;
        const maxMessages = options.maxMessages || this.DEFAULTS.MAX_MESSAGES;
        const now = Date.now();

        try {
            // Get or create consolidation window
            const window = await this._getOrCreateWindow(sessionId, windowMs);

            // Add message to window
            await this._addMessageToWindow(window.id, message, now);

            // Check if we should process
            const shouldProcess = await this._shouldProcess(window, windowMs, maxMessages, now);

            if (shouldProcess.action === 'process') {
                // Acquire lock and get consolidated data
                const locked = await this._acquireLock(window.id, now);
                if (!locked) {
                    // Another process is handling it
                    return { action: 'skip', reason: 'another_process_handling' };
                }

                // Get all messages in window
                const consolidatedData = await this._getConsolidatedData(window.id);
                
                return {
                    action: 'process',
                    data: consolidatedData,
                    windowId: window.id
                };
            }

            return shouldProcess;

        } catch (error) {
            console.error('SyncMessageConsolidator error:', error);
            // On error, process immediately with single message
            return {
                action: 'process',
                data: this._createSingleMessageData(message),
                error: error.message
            };
        }
    }

    /**
     * Wait for consolidation window to be ready (blocking)
     * 
     * For sync endpoints that need to wait for the window to complete.
     * Returns consolidated data when ready.
     * 
     * @param {string} sessionId - Session ID
     * @param {object} message - Message data
     * @param {object} options - Configuration
     */
    static async waitAndProcess(sessionId, message, options = {}) {
        const windowMs = options.windowMs || this.DEFAULTS.WINDOW_MS;
        const maxWindowMs = options.maxWindowMs || this.DEFAULTS.MAX_WINDOW_MS;
        const pollIntervalMs = options.pollIntervalMs || this.DEFAULTS.POLL_INTERVAL_MS;
        const startTime = Date.now();

        // Add message
        const result = await this.addAndCheck(sessionId, message, options);

        // If we should process immediately, return
        if (result.action === 'process') {
            return result;
        }

        // If skipped (another process handling), wait for result
        if (result.action === 'skip') {
            return await this._waitForResult(sessionId, maxWindowMs, pollIntervalMs, startTime);
        }

        // Wait for window to complete
        const waitTime = Math.min(windowMs, maxWindowMs - (Date.now() - startTime));
        if (waitTime > 0) {
            await this._sleep(waitTime);
        }

        // Check again
        const finalResult = await this.addAndCheck(sessionId, { text: '', _checkOnly: true }, options);
        
        if (finalResult.action === 'process') {
            return finalResult;
        }

        // Timeout - process what we have
        const window = await this._getCurrentWindow(sessionId);
        if (window) {
            const data = await this._getConsolidatedData(window.id);
            await this._markWindowComplete(window.id);
            return { action: 'process', data, timeout: true };
        }

        return { action: 'skip', reason: 'no_window' };
    }

    /**
     * Mark consolidation window as complete
     */
    static async markComplete(windowId) {
        await this._markWindowComplete(windowId);
    }

    /**
     * Get or create consolidation window
     */
    static async _getOrCreateWindow(sessionId, windowMs) {
        const now = Date.now();
        const windowExpiry = new Date(now + windowMs);

        // Try to get existing active window
        const [existing] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_sync_consolidation
            WHERE session_id = ? 
            AND status = 'collecting'
            AND window_expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        `, [sessionId]);

        if (existing.length > 0) {
            return existing[0];
        }

        // Create new window
        const windowId = uuidv4();
        await db.query(`
            INSERT INTO yovo_tbl_aiva_sync_consolidation 
            (id, session_id, status, window_expires_at, created_at, message_count)
            VALUES (?, ?, 'collecting', ?, NOW(), 0)
        `, [windowId, sessionId, windowExpiry]);

        return {
            id: windowId,
            session_id: sessionId,
            status: 'collecting',
            window_expires_at: windowExpiry,
            message_count: 0
        };
    }

    /**
     * Add message to window
     */
    static async _addMessageToWindow(windowId, message, timestamp) {
        if (message._checkOnly) return;

        const messageId = uuidv4();
        await db.query(`
            INSERT INTO yovo_tbl_aiva_sync_consolidation_messages
            (id, window_id, message_text, image_url, audio_transcript, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `, [
            messageId,
            windowId,
            message.text || '',
            message.imageUrl || null,
            message.audioTranscript || null,
            JSON.stringify(message.metadata || {})
        ]);

        // Update message count
        await db.query(`
            UPDATE yovo_tbl_aiva_sync_consolidation
            SET message_count = message_count + 1,
                last_message_at = NOW()
            WHERE id = ?
        `, [windowId]);
    }

    /**
     * Check if we should process the window
     */
    static async _shouldProcess(window, windowMs, maxMessages, now) {
        // Refresh window data
        const [refreshed] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_sync_consolidation WHERE id = ?',
            [window.id]
        );

        if (refreshed.length === 0) {
            return { action: 'skip', reason: 'window_not_found' };
        }

        const currentWindow = refreshed[0];

        // Already being processed
        if (currentWindow.status === 'processing') {
            return { action: 'skip', reason: 'already_processing' };
        }

        // Already completed
        if (currentWindow.status === 'completed') {
            return { action: 'skip', reason: 'already_completed' };
        }

        // Max messages reached
        if (currentWindow.message_count >= maxMessages) {
            return { action: 'process', reason: 'max_messages' };
        }

        // Window expired
        const expiresAt = new Date(currentWindow.window_expires_at).getTime();
        if (now >= expiresAt) {
            return { action: 'process', reason: 'window_expired' };
        }

        // Calculate remaining time
        const remainingMs = expiresAt - now;
        return { 
            action: 'wait', 
            remainingMs,
            messageCount: currentWindow.message_count
        };
    }

    /**
     * Acquire processing lock
     */
    static async _acquireLock(windowId, now) {
        const lockExpiry = new Date(now + this.DEFAULTS.LOCK_TIMEOUT_MS);

        const [result] = await db.query(`
            UPDATE yovo_tbl_aiva_sync_consolidation
            SET status = 'processing',
                lock_expires_at = ?,
                processing_started_at = NOW()
            WHERE id = ? 
            AND status = 'collecting'
        `, [lockExpiry, windowId]);

        return result.affectedRows > 0;
    }

    /**
     * Get consolidated data from window
     */
    static async _getConsolidatedData(windowId) {
        const [messages] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_sync_consolidation_messages
            WHERE window_id = ?
            ORDER BY created_at ASC
        `, [windowId]);

        // Combine messages
        const texts = [];
        const images = [];
        const audioTranscripts = [];

        for (const msg of messages) {
            if (msg.message_text && msg.message_text.trim()) {
                texts.push(msg.message_text.trim());
            }
            if (msg.image_url) {
                images.push(msg.image_url);
            }
            if (msg.audio_transcript) {
                audioTranscripts.push(msg.audio_transcript);
            }
        }

        return {
            windowId,
            messageCount: messages.length,
            combinedMessage: texts.join('\n'),
            messages: texts,
            images,
            imageCount: images.length,
            audioTranscripts,
            hasAudio: audioTranscripts.length > 0,
            firstMessageAt: messages[0]?.created_at,
            lastMessageAt: messages[messages.length - 1]?.created_at
        };
    }

    /**
     * Mark window as complete
     */
    static async _markWindowComplete(windowId) {
        await db.query(`
            UPDATE yovo_tbl_aiva_sync_consolidation
            SET status = 'completed',
                completed_at = NOW()
            WHERE id = ?
        `, [windowId]);
    }

    /**
     * Get current window for session
     */
    static async _getCurrentWindow(sessionId) {
        const [windows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_sync_consolidation
            WHERE session_id = ?
            AND status IN ('collecting', 'processing')
            ORDER BY created_at DESC
            LIMIT 1
        `, [sessionId]);

        return windows.length > 0 ? windows[0] : null;
    }

    /**
     * Wait for another process to complete
     */
    static async _waitForResult(sessionId, maxWaitMs, pollIntervalMs, startTime) {
        while (Date.now() - startTime < maxWaitMs) {
            await this._sleep(pollIntervalMs);

            const window = await this._getCurrentWindow(sessionId);
            if (!window) {
                return { action: 'skip', reason: 'window_disappeared' };
            }

            if (window.status === 'completed') {
                return { action: 'skip', reason: 'completed_by_other' };
            }
        }

        return { action: 'skip', reason: 'timeout_waiting' };
    }

    /**
     * Create single message data structure
     */
    static _createSingleMessageData(message) {
        return {
            messageCount: 1,
            combinedMessage: message.text || '',
            messages: [message.text || ''].filter(Boolean),
            images: message.imageUrl ? [message.imageUrl] : [],
            imageCount: message.imageUrl ? 1 : 0,
            audioTranscripts: message.audioTranscript ? [message.audioTranscript] : [],
            hasAudio: !!message.audioTranscript
        };
    }

    /**
     * Sleep helper
     */
    static _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Cleanup old windows (call periodically)
     */
    static async cleanup(maxAgeMs = 3600000) { // 1 hour default
        const cutoff = new Date(Date.now() - maxAgeMs);

        // Delete old messages first
        await db.query(`
            DELETE m FROM yovo_tbl_aiva_sync_consolidation_messages m
            INNER JOIN yovo_tbl_aiva_sync_consolidation w ON m.window_id = w.id
            WHERE w.created_at < ?
        `, [cutoff]);

        // Delete old windows
        await db.query(`
            DELETE FROM yovo_tbl_aiva_sync_consolidation
            WHERE created_at < ?
        `, [cutoff]);
    }
}

module.exports = SyncMessageConsolidator;