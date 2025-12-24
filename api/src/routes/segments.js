/**
 * Segment Routes
 * API endpoints for managing audio segments
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const SegmentService = require('../services/SegmentService');
const db = require('../config/database');

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
        
        const agent = agents[0];
        const tenantId = req.user.tenant_id || req.user.id;
        
        if (agent.tenant_id !== tenantId && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        req.agent = agent;
        next();
    } catch (error) {
        console.error('Agent access verification error:', error);
        res.status(500).json({ error: 'Failed to verify agent access' });
    }
};

// ============================================================================
// SEGMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/segments/:agentId
 * List all segments for an agent
 */
router.get('/:agentId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { language, type, search, include_global } = req.query;
        
        const segments = await SegmentService.listSegments(req.params.agentId, {
            language,
            type,
            search,
            includeGlobal: include_global !== 'false'
        });
        
        res.json({
            success: true,
            data: segments
        });
    } catch (error) {
        console.error('List segments error:', error);
        res.status(500).json({ error: 'Failed to list segments' });
    }
});

/**
 * GET /api/segments/:agentId/:segmentId
 * Get a single segment
 */
router.get('/:agentId/:segmentId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const segment = await SegmentService.getSegment(req.params.segmentId);
        
        if (!segment) {
            return res.status(404).json({ error: 'Segment not found' });
        }
        
        res.json({
            success: true,
            data: segment
        });
    } catch (error) {
        console.error('Get segment error:', error);
        res.status(500).json({ error: 'Failed to get segment' });
    }
});

/**
 * GET /api/segments/:agentId/key/:segmentKey
 * Get segment by key
 */
router.get('/:agentId/key/:segmentKey', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { language } = req.query;
        const segment = await SegmentService.getSegmentByKey(
            req.params.agentId,
            req.params.segmentKey,
            language
        );
        
        if (!segment) {
            return res.status(404).json({ error: 'Segment not found' });
        }
        
        res.json({
            success: true,
            data: segment
        });
    } catch (error) {
        console.error('Get segment by key error:', error);
        res.status(500).json({ error: 'Failed to get segment' });
    }
});

/**
 * POST /api/segments/:agentId
 * Create a new segment
 */
router.post('/:agentId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { segment_key, segment_type, description, is_global, content } = req.body;
        
        if (!segment_key) {
            return res.status(400).json({ error: 'segment_key is required' });
        }
        
        if (!segment_type) {
            return res.status(400).json({ error: 'segment_type is required' });
        }
        
        const segment = await SegmentService.createSegment(
            req.params.agentId,
            req.agent.tenant_id,
            { segment_key, segment_type, description, is_global, content }
        );
        
        res.status(201).json({
            success: true,
            data: segment
        });
    } catch (error) {
        console.error('Create segment error:', error);
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create segment' });
    }
});

/**
 * PUT /api/segments/:agentId/:segmentId
 * Update a segment
 */
router.put('/:agentId/:segmentId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const segment = await SegmentService.updateSegment(req.params.segmentId, req.body);
        
        if (!segment) {
            return res.status(404).json({ error: 'Segment not found' });
        }
        
        res.json({
            success: true,
            data: segment
        });
    } catch (error) {
        console.error('Update segment error:', error);
        res.status(500).json({ error: 'Failed to update segment' });
    }
});

/**
 * DELETE /api/segments/:agentId/:segmentId
 * Delete a segment
 */
router.delete('/:agentId/:segmentId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await SegmentService.deleteSegment(req.params.segmentId);
        
        res.json({
            success: true,
            message: 'Segment deleted'
        });
    } catch (error) {
        console.error('Delete segment error:', error);
        res.status(500).json({ error: 'Failed to delete segment' });
    }
});

// ============================================================================
// SEGMENT CONTENT ENDPOINTS
// ============================================================================

/**
 * PUT /api/segments/:agentId/:segmentId/content/:languageCode
 * Set content for a specific language
 */
router.put('/:agentId/:segmentId/content/:languageCode', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { text_content, audio_id, audio_source, duration_ms } = req.body;
        
        if (!text_content) {
            return res.status(400).json({ error: 'text_content is required' });
        }
        
        await SegmentService.setSegmentContent(
            req.params.segmentId,
            req.params.languageCode,
            { text_content, audio_id, audio_source, duration_ms }
        );
        
        const segment = await SegmentService.getSegment(req.params.segmentId);
        
        res.json({
            success: true,
            data: segment
        });
    } catch (error) {
        console.error('Set segment content error:', error);
        res.status(500).json({ error: 'Failed to set segment content' });
    }
});

/**
 * DELETE /api/segments/:agentId/:segmentId/content/:languageCode
 * Delete content for a specific language
 */
router.delete('/:agentId/:segmentId/content/:languageCode', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await SegmentService.deleteSegmentContent(
            req.params.segmentId,
            req.params.languageCode
        );
        
        res.json({
            success: true,
            message: 'Content deleted'
        });
    } catch (error) {
        console.error('Delete segment content error:', error);
        res.status(500).json({ error: 'Failed to delete segment content' });
    }
});

// ============================================================================
// COVERAGE ENDPOINTS
// ============================================================================

/**
 * GET /api/segments/:agentId/coverage/languages
 * Get language coverage for segments
 */
router.get('/:agentId/coverage/languages', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const coverage = await SegmentService.getLanguageCoverage(req.params.agentId);
        
        res.json({
            success: true,
            data: coverage
        });
    } catch (error) {
        console.error('Get coverage error:', error);
        res.status(500).json({ error: 'Failed to get coverage' });
    }
});

/**
 * GET /api/segments/:agentId/coverage/missing/:languageCode
 * Get missing translations for a language
 */
router.get('/:agentId/coverage/missing/:languageCode', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const missing = await SegmentService.getMissingTranslations(
            req.params.agentId,
            req.params.languageCode
        );
        
        res.json({
            success: true,
            data: missing
        });
    } catch (error) {
        console.error('Get missing translations error:', error);
        res.status(500).json({ error: 'Failed to get missing translations' });
    }
});

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * POST /api/segments/:agentId/bulk
 * Bulk create segments
 */
router.post('/:agentId/bulk', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { segments } = req.body;
        
        if (!segments || !Array.isArray(segments)) {
            return res.status(400).json({ error: 'segments array is required' });
        }
        
        const results = await SegmentService.bulkCreateSegments(
            req.params.agentId,
            req.agent.tenant_id,
            segments
        );
        
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        
        res.json({
            success: true,
            message: `Created ${successCount} segments, ${failCount} failed`,
            data: results
        });
    } catch (error) {
        console.error('Bulk create error:', error);
        res.status(500).json({ error: 'Failed to create segments' });
    }
});

module.exports = router;
