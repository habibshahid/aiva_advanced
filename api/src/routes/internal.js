/**
 * Internal Routes
 * API endpoints for bridge/internal system communication
 * These routes use internal token authentication
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const FlowService = require('../services/FlowService');
const SegmentService = require('../services/SegmentService');
const TemplateService = require('../services/TemplateService');
const LanguageService = require('../services/LanguageService');
const TTSService = require('../services/TTSService');
const IVRService = require('../services/IVRService');

const ttsService = new TTSService();

/**
 * @route GET /api/internal/ivr/:agentId/audio/:audioId/stream
 * @desc Stream audio file (internal use - no JWT required)
 */
router.get('/ivr/:agentId/audio/:audioId/stream', async (req, res) => {
    try {
        const { agentId, audioId } = req.params;
        
        // Get audio record
        const IVRService = require('../services/IVRService');
        const audio = await IVRService.getAudio(audioId);
        
        if (!audio) {
            return res.status(404).json({ error: 'Audio not found' });
        }
        
        if (audio.agent_id !== agentId) {
            return res.status(403).json({ error: 'Audio does not belong to this agent' });
        }
        
        const fs = require('fs');
        const path = require('path');
        
        // Build file path
        //const STORAGE_BASE = process.env.AUDIO_STORAGE_PATH || '/etc/aiva-oai/storage';
		//const IVR_AUDIO_PATH = process.env.IVR_AUDIO_PATH || path.join(STORAGE_BASE, 'ivr-audio');
        const filePath = audio.file_path;
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Audio file not found on disk' });
        }
        
        // Get file stats
        const stat = fs.statSync(filePath);
        
        // Set headers
        res.setHeader('Content-Type', audio.mime_type || 'audio/mpeg');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        
        // Stream the file
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        
    } catch (error) {
        console.error('Internal audio stream error:', error);
        res.status(500).json({ error: 'Failed to stream audio' });
    }
});

// Internal token verification
const verifyInternalToken = (req, res, next) => {
    const token = req.headers['x-internal-token'] || req.headers['authorization']?.replace('Bearer ', '');
    const validToken = process.env.INTERNAL_API_TOKEN;
    
    if (!token || token !== validToken) {
        return res.status(401).json({ error: 'Invalid internal token' });
    }
    
    next();
};

router.use(verifyInternalToken);

// ============================================================================
// FLOW ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/flows/:flowId
 */
router.get('/flows/:flowId', async (req, res) => {
    try {
        const flow = await FlowService.getFlow(req.params.flowId);
        
        if (!flow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        res.json({ success: true, data: flow });
    } catch (error) {
        console.error('Get flow error:', error);
        res.status(500).json({ error: 'Failed to get flow' });
    }
});

/**
 * GET /api/internal/flows/agent/:agentId/key/:flowKey
 */
router.get('/flows/agent/:agentId/key/:flowKey', async (req, res) => {
    try {
        const flow = await FlowService.getFlowByKey(req.params.agentId, req.params.flowKey);
        
        if (!flow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        res.json({ success: true, data: flow });
    } catch (error) {
        console.error('Get flow by key error:', error);
        res.status(500).json({ error: 'Failed to get flow' });
    }
});

// ============================================================================
// FLOW SESSION ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/flow-sessions/:sessionId
 */
router.get('/flow-sessions/:sessionId', async (req, res) => {
    try {
        const [sessions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_flow_sessions WHERE id = ?',
            [req.params.sessionId]
        );
        
        if (sessions.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        const session = sessions[0];
        
        // Parse JSON fields
        if (typeof session.slots_data === 'string') {
            session.slots_data = JSON.parse(session.slots_data);
        }
        if (typeof session.context_data === 'string') {
            session.context_data = JSON.parse(session.context_data);
        }
        if (typeof session.pending_confirmation === 'string' && session.pending_confirmation) {
            session.pending_confirmation = JSON.parse(session.pending_confirmation);
        }
        
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

/**
 * GET /api/internal/flow-sessions/:sessionId/active
 */
router.get('/flow-sessions/:sessionId/active', async (req, res) => {
    try {
        const [sessions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_flow_sessions WHERE id = ? AND status = ?',
            [req.params.sessionId, 'active']
        );
        
        if (sessions.length === 0) {
            return res.json({ success: true, data: null });
        }
        
        const session = sessions[0];
        if (typeof session.slots_data === 'string') {
            session.slots_data = JSON.parse(session.slots_data);
        }
        
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Get active session error:', error);
        res.status(500).json({ error: 'Failed to get session' });
    }
});

/**
 * POST /api/internal/flow-sessions
 * Create or update session
 */
router.post('/flow-sessions', async (req, res) => {
    try {
        const session = req.body;
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_flow_sessions 
            (id, flow_id, agent_id, tenant_id, caller_phone, caller_id, language,
             status, current_step_key, slots_data, context_data, pending_confirmation,
             retry_count, error_message, created_at, updated_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
            ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                current_step_key = VALUES(current_step_key),
                slots_data = VALUES(slots_data),
                context_data = VALUES(context_data),
                pending_confirmation = VALUES(pending_confirmation),
                retry_count = VALUES(retry_count),
                error_message = VALUES(error_message),
                updated_at = NOW(),
                completed_at = VALUES(completed_at)
        `, [
            session.id,
            session.flow_id,
            session.agent_id,
            session.tenant_id,
            session.caller_phone,
            session.caller_id,
            session.language || 'en',
            session.status || 'active',
            session.current_step_key,
            JSON.stringify(session.slots_data || {}),
            JSON.stringify(session.context_data || {}),
            session.pending_confirmation ? JSON.stringify(session.pending_confirmation) : null,
            session.retry_count || 0,
            session.error_message || session.error || null,
            session.created_at || new Date().toISOString(),
            session.completed_at || null
        ]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save session error:', error);
        res.status(500).json({ error: 'Failed to save session' });
    }
});

// ============================================================================
// SEGMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/segments/:agentId/key/:segmentKey
 */
router.get('/segments/:agentId/key/:segmentKey', async (req, res) => {
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
        
        res.json({ success: true, data: segment });
    } catch (error) {
        console.error('Get segment error:', error);
        res.status(500).json({ error: 'Failed to get segment' });
    }
});

// ============================================================================
// TEMPLATE ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/templates/:templateId
 */
router.get('/templates/:templateId', async (req, res) => {
    try {
        const template = await TemplateService.getTemplate(req.params.templateId);
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({ success: true, data: template });
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
});

/**
 * POST /api/internal/templates/:agentId/:templateId/render
 */
router.post('/templates/:agentId/:templateId/render', async (req, res) => {
    try {
        const { variables, language } = req.body;
        
        const text = await TemplateService.renderText(
            req.params.agentId,
            req.params.templateId,
            variables || {},
            language || 'en'
        );
        
        res.json({ success: true, data: { rendered_text: text } });
    } catch (error) {
        console.error('Render template error:', error);
        res.status(500).json({ error: 'Failed to render template' });
    }
});

// ============================================================================
// TTS CACHE ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/tts-cache/:agentId/:hash
 */
router.get('/tts-cache/:agentId/:hash', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_tts_cache WHERE agent_id = ? AND text_hash = ?',
            [req.params.agentId, req.params.hash]
        );
        
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        console.error('Get TTS cache error:', error);
        res.status(500).json({ error: 'Failed to get cache' });
    }
});

/**
 * POST /api/internal/tts-cache/:agentId
 */
router.post('/tts-cache/:agentId', async (req, res) => {
    try {
        const { text_hash, text_content, language_code, voice_id, audio_id, duration_ms } = req.body;
        
        // Get tenant_id
        const [agents] = await db.query('SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?', [req.params.agentId]);
        const tenantId = agents[0]?.tenant_id;
        
        await ttsService.addToCache(
            req.params.agentId,
            tenantId,
            text_content,
            language_code,
            voice_id,
            audio_id,
            duration_ms
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Add to TTS cache error:', error);
        res.status(500).json({ error: 'Failed to add to cache' });
    }
});

/**
 * POST /api/internal/tts-cache/:agentId/:hash/hit
 */
router.post('/tts-cache/:agentId/:hash/hit', async (req, res) => {
    try {
        await db.query(`
            UPDATE yovo_tbl_aiva_ivr_tts_cache 
            SET hit_count = hit_count + 1, last_used_at = NOW()
            WHERE agent_id = ? AND text_hash = ?
        `, [req.params.agentId, req.params.hash]);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update hit count' });
    }
});

// ============================================================================
// AGENT ENDPOINTS
// ============================================================================

/**
 * GET /api/internal/agents/:agentId/tts-config
 */
router.get('/agents/:agentId/tts-config', async (req, res) => {
    try {
        const [agents] = await db.query(
            'SELECT tts_config FROM yovo_tbl_aiva_agents WHERE id = ?',
            [req.params.agentId]
        );
        
        if (agents.length === 0) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        let config = agents[0].tts_config;
        if (typeof config === 'string') {
            config = JSON.parse(config);
        }
        
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Get TTS config error:', error);
        res.status(500).json({ error: 'Failed to get config' });
    }
});

// ============================================================================
// FUNCTION EXECUTION
// ============================================================================

/**
 * POST /api/internal/functions/execute
 */
router.post('/functions/execute', async (req, res) => {
    try {
        const { agent_id, function_name, arguments: args } = req.body;
        
        // Get function definition
        const [functions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_functions WHERE agent_id = ? AND name = ? AND is_active = 1',
            [agent_id, function_name]
        );
        
        if (functions.length === 0) {
            return res.status(404).json({ error: `Function "${function_name}" not found` });
        }
        
        const func = functions[0];
        
        // Execute based on type
        let result;
        
        if (func.type === 'api') {
            // API call
            const config = typeof func.config === 'string' ? JSON.parse(func.config) : func.config;
            
            // Build URL with path params
            let url = config.url;
            for (const [key, value] of Object.entries(args)) {
                url = url.replace(`{${key}}`, encodeURIComponent(value));
            }
            
            // Make request
            const response = await fetch(url, {
                method: config.method || 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...config.headers
                },
                body: config.method === 'GET' ? undefined : JSON.stringify(args)
            });
            
            result = await response.json();
            
        } else if (func.type === 'inline') {
            // Inline handler (eval - use with caution)
            const handler = eval(`(${func.handler})`);
            result = await handler(args);
            
        } else {
            return res.status(400).json({ error: `Unknown function type: ${func.type}` });
        }
        
        res.json({ success: true, data: { result } });
    } catch (error) {
        console.error('Function execution error:', error);
        res.status(500).json({ error: error.message || 'Failed to execute function' });
    }
});

// ============================================================================
// WHATSAPP
// ============================================================================

/**
 * POST /api/internal/whatsapp/send
 */
router.post('/whatsapp/send', async (req, res) => {
    try {
        const { phone, template, variables } = req.body;
        
        // TODO: Integrate with WhatsApp API
        console.log(`[WhatsApp] Sending template "${template}" to ${phone}`);
        console.log('[WhatsApp] Variables:', variables);
        
        res.json({ success: true, message: 'WhatsApp notification queued' });
    } catch (error) {
        console.error('WhatsApp send error:', error);
        res.status(500).json({ error: 'Failed to send WhatsApp' });
    }
});

// ============================================================================
// I18N CONTENT
// ============================================================================

/**
 * GET /api/internal/i18n/:entityType/:entityId
 */
router.get('/i18n/:entityType/:entityId', async (req, res) => {
    try {
        const content = await FlowService.getI18nContent(
            req.params.entityType,
            req.params.entityId
        );
        
        res.json({ success: true, data: content });
    } catch (error) {
        console.error('Get i18n content error:', error);
        res.status(500).json({ error: 'Failed to get content' });
    }
});

/**
 * GET /api/internal/i18n/:entityType/:entityId/:field/:language
 */
router.get('/i18n/:entityType/:entityId/:field/:language', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_content_i18n
            WHERE entity_type = ? AND entity_id = ? AND field_name = ? AND language_code = ?
        `, [req.params.entityType, req.params.entityId, req.params.field, req.params.language]);
        
        res.json({ success: true, data: rows[0] || null });
    } catch (error) {
        console.error('Get i18n content error:', error);
        res.status(500).json({ error: 'Failed to get content' });
    }
});

module.exports = router;
