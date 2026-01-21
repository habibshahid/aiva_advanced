/**
 * Chat Media Route
 * Serves chat media files (images, audio) from storage
 * 
 * Place this file at: api/src/routes/chat-media.js
 * 
 * Add to your api/src/index.js:
 *   const chatMediaRoutes = require('./routes/chat-media');
 *   app.use('/api/chat-media', chatMediaRoutes);
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const ChatMediaService = require('../services/ChatMediaService');

/**
 * @route GET /api/chat-media/:sessionId/:filename
 * @desc Serve a chat media file (image or audio)
 * @access Public (media files are accessed by URL in chat UI)
 */
router.get('/:sessionId/:filename', async (req, res) => {
    try {
        const { sessionId, filename } = req.params;

        // Validate parameters
        if (!sessionId || !filename) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing sessionId or filename' 
            });
        }

        // Sanitize inputs to prevent path traversal
        const sanitizedSessionId = path.basename(sessionId);
        const sanitizedFilename = path.basename(filename);

        // Get media file info
        const mediaFile = await ChatMediaService.getMediaFile(sanitizedSessionId, sanitizedFilename);

        if (!mediaFile) {
            return res.status(404).json({ 
                success: false, 
                error: 'Media file not found' 
            });
        }

        // Check if file exists
        if (!fs.existsSync(mediaFile.path)) {
            console.error(`[ChatMedia] File not found on disk: ${mediaFile.path}`);
            return res.status(404).json({ 
                success: false, 
                error: 'Media file not found on disk' 
            });
        }

        // Set response headers
        res.set({
            'Content-Type': mediaFile.mimeType,
            'Content-Length': mediaFile.size,
            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
            'Content-Disposition': `inline; filename="${sanitizedFilename}"`,
            'Accept-Ranges': 'bytes'
        });

        // Handle range requests for audio/video streaming
        const range = req.headers.range;
        if (range && (mediaFile.mediaType === 'audio' || mediaFile.mediaType === 'video')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : mediaFile.size - 1;
            const chunkSize = (end - start) + 1;

            res.status(206);
            res.set({
                'Content-Range': `bytes ${start}-${end}/${mediaFile.size}`,
                'Content-Length': chunkSize
            });

            const stream = fs.createReadStream(mediaFile.path, { start, end });
            stream.pipe(res);
        } else {
            // Stream the entire file
            const stream = fs.createReadStream(mediaFile.path);
            
            stream.on('error', (error) => {
                console.error('[ChatMedia] Stream error:', error);
                if (!res.headersSent) {
                    res.status(500).json({ 
                        success: false, 
                        error: 'Error streaming file' 
                    });
                }
            });

            stream.pipe(res);
        }

    } catch (error) {
        console.error('[ChatMedia] Error serving media:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to serve media file' 
        });
    }
});

/**
 * @route GET /api/chat-media/:sessionId/:filename/info
 * @desc Get metadata about a chat media file
 * @access Public
 */
router.get('/:sessionId/:filename/info', async (req, res) => {
    try {
        const { sessionId, filename } = req.params;

        // Sanitize inputs
        const sanitizedSessionId = path.basename(sessionId);
        const sanitizedFilename = path.basename(filename);

        // Get media file info
        const mediaFile = await ChatMediaService.getMediaFile(sanitizedSessionId, sanitizedFilename);

        if (!mediaFile) {
            return res.status(404).json({ 
                success: false, 
                error: 'Media file not found' 
            });
        }

        res.json({
            success: true,
            data: {
                filename: mediaFile.filename,
                mediaType: mediaFile.mediaType,
                mimeType: mediaFile.mimeType,
                sizeBytes: mediaFile.size,
                sizeMB: (mediaFile.size / (1024 * 1024)).toFixed(2),
                createdAt: mediaFile.createdAt,
                url: `/api/chat-media/${sanitizedSessionId}/${sanitizedFilename}`
            }
        });

    } catch (error) {
        console.error('[ChatMedia] Error getting media info:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get media info' 
        });
    }
});

/**
 * @route GET /api/chat-media/session/:sessionId/stats
 * @desc Get storage stats for a session
 * @access Private (requires authentication in production)
 */
router.get('/session/:sessionId/stats', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sanitizedSessionId = path.basename(sessionId);

        const stats = await ChatMediaService.getSessionStorageStats(sanitizedSessionId);

        res.json({
            success: true,
            data: {
                sessionId: sanitizedSessionId,
                ...stats
            }
        });

    } catch (error) {
        console.error('[ChatMedia] Error getting session stats:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get session stats' 
        });
    }
});

module.exports = router;