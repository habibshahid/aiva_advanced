/**
 * TTS Routes
 * API endpoints for text-to-speech generation
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const TTSService = require('../services/TTSService');
const db = require('../config/database');

const ttsService = new TTSService();

// Middleware for authentication
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return verifyApiKey(req, res, next);
    }
    return verifyToken(req, res, next);
};

// Verify agent access
const verifyAgentAccess = async (req, res, next) => {
    try {
        const [agents] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_agents WHERE id = ?',
            [req.params.agentId]
        );
        
        if (agents.length === 0) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        req.agent = agents[0];
        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify agent access' });
    }
};

/**
 * POST /api/tts/:agentId/generate
 * Generate TTS audio
 */
router.post('/:agentId/generate', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { text, language, voice, save_to_library, use_cache } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        
        const lang = language || 'en';
        
        // Check cache if enabled
        if (use_cache !== false) {
            const cached = await ttsService.getCached(req.params.agentId, text, lang, voice?.voice_id);
            if (cached) {
                return res.json({
                    success: true,
                    data: {
                        audio_id: cached.audio_id,
                        from_cache: true
                    }
                });
            }
        }
        
        // Generate audio
        if (save_to_library) {
            const result = await ttsService.generateAndSave(
                req.params.agentId,
                req.agent.tenant_id,
                text,
                lang,
                { voice }
            );
            
            // Add to cache
            if (use_cache !== false) {
                await ttsService.addToCache(
                    req.params.agentId,
                    req.agent.tenant_id,
                    text,
                    lang,
                    voice?.voice_id,
                    result.audio_id,
                    result.duration_ms
                );
            }
            
            res.json({
                success: true,
                data: {
                    audio_id: result.audio_id,
                    from_cache: false
                }
            });
        } else {
            // Just generate, don't save
            const result = await ttsService.synthesize(text, voice, lang);
            
            res.set('Content-Type', 'audio/mpeg');
            res.send(result.buffer);
        }
    } catch (error) {
        console.error('TTS generation error:', error);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

/**
 * POST /api/tts/:agentId/preview
 * Generate TTS preview without saving
 */
router.post('/:agentId/preview', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { text, language, voice } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        
        const result = await ttsService.synthesize(text, voice, language || 'en');
        
        res.set('Content-Type', 'audio/mpeg');
        res.send(result.buffer);
    } catch (error) {
        console.error('TTS preview error:', error);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

/**
 * GET /api/tts/voices
 * Get available voices
 */
router.get('/voices', authenticate, async (req, res) => {
    try {
        const { language } = req.query;
        const voices = await ttsService.getVoices(language);
        
        res.json({
            success: true,
            data: voices
        });
    } catch (error) {
        console.error('Get voices error:', error);
        res.status(500).json({ error: 'Failed to get voices' });
    }
});

/**
 * GET /api/tts/:agentId/cache
 * Get cache statistics
 */
router.get('/:agentId/cache', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const [stats] = await db.query(`
            SELECT 
                COUNT(*) AS total_entries,
                SUM(hit_count) AS total_hits,
                COUNT(DISTINCT language_code) AS languages,
                MAX(last_used_at) AS last_used
            FROM yovo_tbl_aiva_ivr_tts_cache
            WHERE agent_id = ?
        `, [req.params.agentId]);
        
        res.json({
            success: true,
            data: stats[0]
        });
    } catch (error) {
        console.error('Get cache stats error:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

/**
 * DELETE /api/tts/:agentId/cache
 * Clear TTS cache
 */
router.delete('/:agentId/cache', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { max_age_days, min_hits } = req.query;
        
        if (max_age_days || min_hits) {
            await ttsService.cleanupCache(
                req.params.agentId,
                parseInt(max_age_days) || 30,
                parseInt(min_hits) || 1
            );
        } else {
            await db.query(
                'DELETE FROM yovo_tbl_aiva_ivr_tts_cache WHERE agent_id = ?',
                [req.params.agentId]
            );
        }
        
        res.json({
            success: true,
            message: 'Cache cleared'
        });
    } catch (error) {
        console.error('Clear cache error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

module.exports = router;
