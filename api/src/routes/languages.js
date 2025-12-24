/**
 * Language Routes
 * API endpoints for managing languages
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const LanguageService = require('../services/LanguageService');
const db = require('../config/database');

// Middleware for authentication
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return verifyApiKey(req, res, next);
    }
    return verifyToken(req, res, next);
};

// ============================================================================
// LANGUAGE ENDPOINTS
// ============================================================================

/**
 * GET /api/languages
 * Get all available languages
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const { active_only } = req.query;
        
        const languages = await LanguageService.getLanguages(active_only !== 'false');
        
        res.json({
            success: true,
            data: languages
        });
    } catch (error) {
        console.error('List languages error:', error);
        res.status(500).json({ error: 'Failed to list languages' });
    }
});

/**
 * GET /api/languages/:code
 * Get a specific language
 */
router.get('/:code', authenticate, async (req, res) => {
    try {
        const language = await LanguageService.getLanguage(req.params.code);
        
        if (!language) {
            return res.status(404).json({ error: 'Language not found' });
        }
        
        res.json({
            success: true,
            data: language
        });
    } catch (error) {
        console.error('Get language error:', error);
        res.status(500).json({ error: 'Failed to get language' });
    }
});

/**
 * GET /api/languages/region/:region
 * Get languages for a region
 */
router.get('/region/:region', authenticate, async (req, res) => {
    try {
        const languages = await LanguageService.getLanguagesByRegion(req.params.region);
        
        res.json({
            success: true,
            data: languages
        });
    } catch (error) {
        console.error('Get languages by region error:', error);
        res.status(500).json({ error: 'Failed to get languages' });
    }
});

/**
 * POST /api/languages/detect
 * Detect language from text
 */
router.post('/detect', authenticate, async (req, res) => {
    try {
        const { text, use_llm } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        
        let detectedCode;
        
        if (use_llm) {
            // TODO: Integrate with LLM client
            detectedCode = LanguageService.detectLanguage(text);
        } else {
            detectedCode = LanguageService.detectLanguage(text);
        }
        
        const language = await LanguageService.getLanguage(detectedCode);
        
        res.json({
            success: true,
            data: {
                code: detectedCode,
                language: language
            }
        });
    } catch (error) {
        console.error('Detect language error:', error);
        res.status(500).json({ error: 'Failed to detect language' });
    }
});

// ============================================================================
// AGENT LANGUAGE ENDPOINTS
// ============================================================================

/**
 * GET /api/languages/agent/:agentId
 * Get agent's supported languages
 */
router.get('/agent/:agentId', authenticate, async (req, res) => {
    try {
        const languages = await LanguageService.getAgentLanguages(req.params.agentId);
        
        res.json({
            success: true,
            data: languages
        });
    } catch (error) {
        console.error('Get agent languages error:', error);
        res.status(500).json({ error: 'Failed to get agent languages' });
    }
});

/**
 * PUT /api/languages/agent/:agentId
 * Update agent's supported languages
 */
router.put('/agent/:agentId', authenticate, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { languages, default_language } = req.body;
        
        if (!languages || !Array.isArray(languages) || languages.length === 0) {
            return res.status(400).json({ error: 'languages array is required' });
        }
        
        await LanguageService.updateAgentLanguages(
            req.params.agentId,
            languages,
            default_language
        );
        
        const updatedLanguages = await LanguageService.getAgentLanguages(req.params.agentId);
        
        res.json({
            success: true,
            data: updatedLanguages
        });
    } catch (error) {
        console.error('Update agent languages error:', error);
        res.status(500).json({ error: error.message || 'Failed to update agent languages' });
    }
});

/**
 * GET /api/languages/agent/:agentId/coverage
 * Get language coverage for an agent
 */
router.get('/agent/:agentId/coverage', authenticate, async (req, res) => {
    try {
        const coverage = await LanguageService.getAgentLanguageCoverage(req.params.agentId);
        
        res.json({
            success: true,
            data: coverage
        });
    } catch (error) {
        console.error('Get coverage error:', error);
        res.status(500).json({ error: 'Failed to get coverage' });
    }
});

module.exports = router;
