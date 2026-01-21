/**
 * Chat Media Service
 * Handles saving and retrieving chat media (images, audio) from file storage
 * 
 * Storage structure:
 *   /etc/aiva-oai/storage/chat_media/{session_id}/{message_id}_{index}.{ext}
 * 
 * Usage:
 *   const ChatMediaService = require('./ChatMediaService');
 *   const mediaObjects = await ChatMediaService.saveMedia(sessionId, messageId, [base64Image, base64Audio]);
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class ChatMediaService {
    
    constructor() {
        // Base storage path from environment or default
        this.storageBasePath = process.env.STORAGE_PATH || '/etc/aiva-oai/storage';
        this.chatMediaPath = path.join(this.storageBasePath, 'chat_media');
        this.apiBaseUrl = process.env.MANAGEMENT_API_URL || 'http://localhost:62001';
    }

    /**
     * Save multiple media items (images/audio) from base64 to storage
     * 
     * @param {string} sessionId - Chat session ID
     * @param {string} messageId - Message ID
     * @param {Array<string>} mediaItems - Array of base64 strings or URLs
     * @returns {Promise<Array<Object>>} Array of media metadata objects
     */
    async saveMedia(sessionId, messageId, mediaItems) {
        if (!mediaItems || !Array.isArray(mediaItems) || mediaItems.length === 0) {
            return [];
        }

        const savedMedia = [];
        
        for (let i = 0; i < mediaItems.length; i++) {
            const mediaItem = mediaItems[i];
            
            if (!mediaItem) continue;
            
            try {
                const result = await this.saveMediaItem(sessionId, messageId, mediaItem, i);
                if (result) {
                    savedMedia.push(result);
                }
            } catch (error) {
                console.error(`❌ [ChatMediaService] Error saving media item ${i}:`, error.message);
                // Continue with other items, don't fail completely
            }
        }
        
        return savedMedia;
    }

    /**
     * Save a single media item
     * 
     * @param {string} sessionId - Chat session ID
     * @param {string} messageId - Message ID
     * @param {string} mediaData - Base64 string or URL
     * @param {number} index - Index for multiple items
     * @returns {Promise<Object|null>} Media metadata object or null
     */
    async saveMediaItem(sessionId, messageId, mediaData, index = 0) {
        // Skip if not a string
        if (typeof mediaData !== 'string') {
            console.log(`⚠️ [ChatMediaService] Skipping non-string media item`);
            return null;
        }

        // Check if it's already a URL (not base64)
        if (this.isUrl(mediaData)) {
            console.log(`📎 [ChatMediaService] Media is already a URL, keeping as-is`);
            return {
                type: this.detectTypeFromUrl(mediaData),
                url: mediaData,
                storage_path: null,
                mime_type: this.detectMimeTypeFromUrl(mediaData),
                size_bytes: null,
                is_external: true,
                created_at: new Date().toISOString()
            };
        }

        // Check if it's base64
        if (!this.isBase64(mediaData)) {
            console.log(`⚠️ [ChatMediaService] Media is neither URL nor base64, skipping`);
            return null;
        }

        // Parse base64 data URI
        const parsed = this.parseBase64(mediaData);
        if (!parsed) {
            console.error(`❌ [ChatMediaService] Failed to parse base64 data`);
            return null;
        }

        const { mimeType, extension, buffer, mediaType } = parsed;

        // Ensure directory exists
        const sessionDir = path.join(this.chatMediaPath, sessionId);
        await this.ensureDirectoryExists(sessionDir);

        // Generate filename
        const filename = `${messageId}_${index}${extension}`;
        const filePath = path.join(sessionDir, filename);

        // Write file
        await fs.writeFile(filePath, buffer);
        
        // Get file stats
        const stats = await fs.stat(filePath);

        console.log(`✅ [ChatMediaService] Saved ${mediaType}: ${filePath} (${stats.size} bytes)`);

        // Build URL for serving
        const relativeUrl = `/api/chat-media/${sessionId}/${filename}`;
        const fullUrl = `${this.apiBaseUrl}${relativeUrl}`;

        return {
            type: mediaType,
            url: relativeUrl,
            full_url: fullUrl,
            storage_path: filePath,
            filename: filename,
            mime_type: mimeType,
            size_bytes: stats.size,
            is_external: false,
            created_at: new Date().toISOString()
        };
    }

    /**
     * Check if string is a URL
     */
    isUrl(str) {
        return str.startsWith('http://') || 
               str.startsWith('https://') || 
               str.startsWith('/api/');
    }

    /**
     * Check if string is base64 data URI
     */
    isBase64(str) {
        return str.startsWith('data:');
    }

    /**
     * Parse base64 data URI
     * 
     * @param {string} dataUri - Base64 data URI (e.g., "data:image/jpeg;base64,/9j/4AAQ...")
     * @returns {Object|null} Parsed data or null
     */
    parseBase64(dataUri) {
        try {
            // Match data URI format: data:mime/type;base64,<data>
            const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
            
            if (!matches) {
                console.error(`❌ [ChatMediaService] Invalid base64 data URI format`);
                return null;
            }

            const mimeType = matches[1];
            const base64Data = matches[2];
            const buffer = Buffer.from(base64Data, 'base64');

            // Determine media type and extension
            const { mediaType, extension } = this.getMimeTypeInfo(mimeType);

            return {
                mimeType,
                extension,
                buffer,
                mediaType
            };
        } catch (error) {
            console.error(`❌ [ChatMediaService] Error parsing base64:`, error.message);
            return null;
        }
    }

    /**
     * Get media type and extension from MIME type
     */
    getMimeTypeInfo(mimeType) {
        const mimeMap = {
            // Images
            'image/jpeg': { mediaType: 'image', extension: '.jpg' },
            'image/jpg': { mediaType: 'image', extension: '.jpg' },
            'image/png': { mediaType: 'image', extension: '.png' },
            'image/gif': { mediaType: 'image', extension: '.gif' },
            'image/webp': { mediaType: 'image', extension: '.webp' },
            'image/svg+xml': { mediaType: 'image', extension: '.svg' },
            'image/bmp': { mediaType: 'image', extension: '.bmp' },
            
            // Audio
            'audio/mpeg': { mediaType: 'audio', extension: '.mp3' },
            'audio/mp3': { mediaType: 'audio', extension: '.mp3' },
            'audio/wav': { mediaType: 'audio', extension: '.wav' },
            'audio/webm': { mediaType: 'audio', extension: '.webm' },
            'audio/ogg': { mediaType: 'audio', extension: '.ogg' },
            'audio/opus': { mediaType: 'audio', extension: '.opus' },
            'audio/m4a': { mediaType: 'audio', extension: '.m4a' },
            'audio/x-m4a': { mediaType: 'audio', extension: '.m4a' },
            'audio/mp4': { mediaType: 'audio', extension: '.m4a' },
            'audio/flac': { mediaType: 'audio', extension: '.flac' },
            'audio/amr': { mediaType: 'audio', extension: '.amr' },
            'audio/3gpp': { mediaType: 'audio', extension: '.3gp' },
            
            // Video (if needed in future)
            'video/mp4': { mediaType: 'video', extension: '.mp4' },
            'video/webm': { mediaType: 'video', extension: '.webm' },
        };

        const info = mimeMap[mimeType.toLowerCase()];
        
        if (info) {
            return info;
        }

        // Fallback: try to extract from MIME type
        const [type, subtype] = mimeType.split('/');
        return {
            mediaType: type || 'file',
            extension: `.${subtype || 'bin'}`
        };
    }

    /**
     * Detect media type from URL
     */
    detectTypeFromUrl(url) {
        const ext = path.extname(url).toLowerCase();
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
        const audioExts = ['.mp3', '.wav', '.webm', '.ogg', '.opus', '.m4a', '.flac', '.amr', '.3gp'];
        const videoExts = ['.mp4', '.webm', '.mov', '.avi'];
        
        if (imageExts.includes(ext)) return 'image';
        if (audioExts.includes(ext)) return 'audio';
        if (videoExts.includes(ext)) return 'video';
        
        // Check URL patterns
        if (url.includes('/image') || url.includes('img')) return 'image';
        if (url.includes('/audio') || url.includes('voice')) return 'audio';
        
        return 'file';
    }

    /**
     * Detect MIME type from URL
     */
    detectMimeTypeFromUrl(url) {
        const ext = path.extname(url).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.webm': 'audio/webm',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/m4a',
            '.mp4': 'video/mp4',
        };
        
        return mimeMap[ext] || 'application/octet-stream';
    }

    /**
     * Ensure directory exists
     */
    async ensureDirectoryExists(dirPath) {
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Get media file by path
     * 
     * @param {string} sessionId - Session ID
     * @param {string} filename - Filename
     * @returns {Promise<Object|null>} File info or null
     */
    async getMediaFile(sessionId, filename) {
        const filePath = path.join(this.chatMediaPath, sessionId, filename);
        
        // Security check - prevent path traversal
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(this.chatMediaPath)) {
            console.error(`❌ [ChatMediaService] Path traversal attempt detected`);
            return null;
        }

        // Check if file exists
        if (!fsSync.existsSync(normalizedPath)) {
            return null;
        }

        const stats = await fs.stat(normalizedPath);
        const ext = path.extname(filename).toLowerCase();
        const { mediaType, mimeType } = this.getInfoFromExtension(ext);

        return {
            path: normalizedPath,
            filename,
            size: stats.size,
            mediaType,
            mimeType,
            createdAt: stats.birthtime
        };
    }

    /**
     * Get info from file extension
     */
    getInfoFromExtension(ext) {
        const extMap = {
            '.jpg': { mediaType: 'image', mimeType: 'image/jpeg' },
            '.jpeg': { mediaType: 'image', mimeType: 'image/jpeg' },
            '.png': { mediaType: 'image', mimeType: 'image/png' },
            '.gif': { mediaType: 'image', mimeType: 'image/gif' },
            '.webp': { mediaType: 'image', mimeType: 'image/webp' },
            '.svg': { mediaType: 'image', mimeType: 'image/svg+xml' },
            '.mp3': { mediaType: 'audio', mimeType: 'audio/mpeg' },
            '.wav': { mediaType: 'audio', mimeType: 'audio/wav' },
            '.webm': { mediaType: 'audio', mimeType: 'audio/webm' },
            '.ogg': { mediaType: 'audio', mimeType: 'audio/ogg' },
            '.opus': { mediaType: 'audio', mimeType: 'audio/opus' },
            '.m4a': { mediaType: 'audio', mimeType: 'audio/m4a' },
            '.flac': { mediaType: 'audio', mimeType: 'audio/flac' },
            '.amr': { mediaType: 'audio', mimeType: 'audio/amr' },
            '.3gp': { mediaType: 'audio', mimeType: 'audio/3gpp' },
            '.mp4': { mediaType: 'video', mimeType: 'video/mp4' },
        };
        
        return extMap[ext] || { mediaType: 'file', mimeType: 'application/octet-stream' };
    }

    /**
     * Delete media for a session (cleanup)
     * 
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteSessionMedia(sessionId) {
        const sessionDir = path.join(this.chatMediaPath, sessionId);
        
        try {
            if (fsSync.existsSync(sessionDir)) {
                await fs.rm(sessionDir, { recursive: true, force: true });
                console.log(`🗑️ [ChatMediaService] Deleted media for session ${sessionId}`);
            }
            return true;
        } catch (error) {
            console.error(`❌ [ChatMediaService] Error deleting session media:`, error.message);
            return false;
        }
    }

    /**
     * Delete specific media file
     * 
     * @param {string} sessionId - Session ID
     * @param {string} filename - Filename
     * @returns {Promise<boolean>} Success status
     */
    async deleteMediaFile(sessionId, filename) {
        const filePath = path.join(this.chatMediaPath, sessionId, filename);
        
        try {
            if (fsSync.existsSync(filePath)) {
                await fs.unlink(filePath);
                console.log(`🗑️ [ChatMediaService] Deleted media file ${filename}`);
            }
            return true;
        } catch (error) {
            console.error(`❌ [ChatMediaService] Error deleting media file:`, error.message);
            return false;
        }
    }

    /**
     * Get storage stats for a session
     * 
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Storage stats
     */
    async getSessionStorageStats(sessionId) {
        const sessionDir = path.join(this.chatMediaPath, sessionId);
        
        if (!fsSync.existsSync(sessionDir)) {
            return {
                exists: false,
                fileCount: 0,
                totalSizeBytes: 0
            };
        }

        const files = await fs.readdir(sessionDir);
        let totalSize = 0;

        for (const file of files) {
            const filePath = path.join(sessionDir, file);
            const stats = await fs.stat(filePath);
            totalSize += stats.size;
        }

        return {
            exists: true,
            fileCount: files.length,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        };
    }
}

// Export singleton instance
module.exports = new ChatMediaService();

// Also export class for testing
module.exports.ChatMediaService = ChatMediaService;