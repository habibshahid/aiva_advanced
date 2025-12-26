/**
 * IVR Routes
 * API endpoints for Intent IVR configuration management
 */

const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const IVRService = require('../services/IVRService');
const AgentService = require('../services/AgentService');
const FlowService = require('../services/FlowService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const router = express.Router();

// Audio storage configuration - uses same base as AudioService
const STORAGE_BASE = process.env.AUDIO_STORAGE_PATH || '/etc/aiva-oai/storage';
const IVR_AUDIO_PATH = process.env.IVR_AUDIO_PATH || path.join(STORAGE_BASE, 'ivr-audio');

const FLOW_AUDIO_FIELDS = [
    'intro_audio_id',
    'on_complete_audio_id',
    'on_cancel_audio_id',
    'on_timeout_audio_id',
    'on_error_audio_id',
    'anything_else_audio_id',
    'closing_audio_id'
];

// Ensure directory exists
if (!fs.existsSync(IVR_AUDIO_PATH)) {
    fs.mkdirSync(IVR_AUDIO_PATH, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const agentPath = path.join(IVR_AUDIO_PATH, req.params.agentId || 'temp');
        if (!fs.existsSync(agentPath)) {
            fs.mkdirSync(agentPath, { recursive: true });
        }
        cb(null, agentPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav', 'audio/basic'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: WAV, MP3, MULAW'), false);
        }
    }
});

// Middleware that accepts either JWT token OR API key
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return verifyApiKey(req, res, next);
    } else {
        return verifyToken(req, res, next);
    }
};

// Helper to verify agent access
const verifyAgentAccess = async (req, res, next) => {
    try {
        const agentId = req.params.agentId;
        const agent = await AgentService.getAgent(agentId);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        req.agent = agent;
        next();
    } catch (error) {
        console.error('Agent access verification error:', error);
        res.status(500).json({ error: 'Failed to verify agent access' });
    }
};

// =============================================================================
// IVR CONFIG ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/config
 * @desc Get IVR configuration for an agent
 */
router.get('/:agentId/config', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        let config = await IVRService.getConfig(req.params.agentId);
        
        // Auto-create config if doesn't exist
        if (!config) {
            config = await IVRService.createConfig(
                req.params.agentId,
                req.agent.tenant_id
            );
        }
        
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Get IVR config error:', error);
        res.status(500).json({ error: 'Failed to get IVR configuration' });
    }
});

/**
 * @route PUT /api/ivr/:agentId/config
 * @desc Update IVR configuration
 */
router.put('/:agentId/config', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        // Ensure config exists
        let config = await IVRService.getConfig(req.params.agentId);
        if (!config) {
            config = await IVRService.createConfig(
                req.params.agentId,
                req.agent.tenant_id,
                req.body
            );
        } else {
            config = await IVRService.updateConfig(req.params.agentId, req.body);
        }
        
        res.json({ success: true, data: config });
    } catch (error) {
        console.error('Update IVR config error:', error);
        res.status(500).json({ error: 'Failed to update IVR configuration' });
    }
});

// =============================================================================
// INTENT ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/intents
 * @desc List all intents for an agent
 */
router.get('/:agentId/intents', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const includeInactive = req.query.include_inactive === 'true';
        const intents = await IVRService.listIntents(req.params.agentId, includeInactive);
        
        res.json({ success: true, data: intents });
    } catch (error) {
        console.error('List intents error:', error);
        res.status(500).json({ error: 'Failed to list intents' });
    }
});

/**
 * @route GET /api/ivr/:agentId/intents/:intentId
 * @desc Get a single intent
 */
router.get('/:agentId/intents/:intentId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const intent = await IVRService.getIntent(req.params.intentId);
        
        if (!intent) {
            return res.status(404).json({ error: 'Intent not found' });
        }
        
        if (intent.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Intent does not belong to this agent' });
        }
        
        res.json({ success: true, data: intent });
    } catch (error) {
        console.error('Get intent error:', error);
        res.status(500).json({ error: 'Failed to get intent' });
    }
});

/**
 * @route POST /api/ivr/:agentId/intents
 * @desc Create a new intent
 */
router.post('/:agentId/intents', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { intent_name, trigger_phrases } = req.body;
        
        if (!intent_name) {
            return res.status(400).json({ error: 'Intent name is required' });
        }
        
        if (!trigger_phrases || !Array.isArray(trigger_phrases) || trigger_phrases.length === 0) {
            return res.status(400).json({ error: 'At least one trigger phrase is required' });
        }
        
        const intent = await IVRService.createIntent(
            req.params.agentId,
            req.agent.tenant_id,
            req.body
        );
        
        res.status(201).json({ success: true, data: intent });
    } catch (error) {
        console.error('Create intent error:', error);
        res.status(500).json({ error: 'Failed to create intent' });
    }
});

/**
 * @route PUT /api/ivr/:agentId/intents/:intentId
 * @desc Update an intent
 */
router.put('/:agentId/intents/:intentId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const existingIntent = await IVRService.getIntent(req.params.intentId);
        
        if (!existingIntent) {
            return res.status(404).json({ error: 'Intent not found' });
        }
        
        if (existingIntent.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Intent does not belong to this agent' });
        }
        
        const intent = await IVRService.updateIntent(req.params.intentId, req.body);
        
        res.json({ success: true, data: intent });
    } catch (error) {
        console.error('Update intent error:', error);
        res.status(500).json({ error: 'Failed to update intent' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/intents/:intentId
 * @desc Delete an intent
 */
router.delete('/:agentId/intents/:intentId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const existingIntent = await IVRService.getIntent(req.params.intentId);
        
        if (!existingIntent) {
            return res.status(404).json({ error: 'Intent not found' });
        }
        
        if (existingIntent.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Intent does not belong to this agent' });
        }
        
        await IVRService.deleteIntent(req.params.intentId);
        
        res.json({ success: true, message: 'Intent deleted successfully' });
    } catch (error) {
        console.error('Delete intent error:', error);
        res.status(500).json({ error: 'Failed to delete intent' });
    }
});

/**
 * @route POST /api/ivr/:agentId/intents/reorder
 * @desc Reorder intents by priority
 */
router.post('/:agentId/intents/reorder', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { intent_ids } = req.body;
        
        if (!intent_ids || !Array.isArray(intent_ids)) {
            return res.status(400).json({ error: 'intent_ids array is required' });
        }
        
        await IVRService.reorderIntents(req.params.agentId, intent_ids);
        
        const intents = await IVRService.listIntents(req.params.agentId);
        
        res.json({ success: true, data: intents });
    } catch (error) {
        console.error('Reorder intents error:', error);
        res.status(500).json({ error: 'Failed to reorder intents' });
    }
});

/**
 * @route POST /api/ivr/:agentId/intents/:intentId/generate-audio
 * @desc Generate audio for an intent using TTS
 */
router.post('/:agentId/intents/:intentId/generate-audio', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { voice } = req.body;
        
        // Get intent
        const intent = await IVRService.getIntent(req.params.intentId);
        
        if (!intent) {
            return res.status(404).json({ error: 'Intent not found' });
        }
        
        if (intent.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Intent does not belong to this agent' });
        }
        
        if (!intent.response_text) {
            return res.status(400).json({ error: 'Intent has no response text to generate audio from' });
        }
        
        // Get IVR config for TTS settings
        const config = await IVRService.getConfig(req.params.agentId);
        
        // Import AudioService for TTS
        const AudioService = require('../services/AudioService');
        
        const ttsProvider = config?.tts_provider || 'uplift';
        const ttsVoice = voice || config?.tts_voice || 'ayesha';
        
        console.log(`[IVR-TTS] Generating audio for intent "${intent.name}": "${intent.response_text.substring(0, 50)}..." (${ttsProvider}/${ttsVoice})`);
        
        try {
            // Generate audio using AudioService
            const ttsResult = await AudioService.synthesize({
                text: intent.response_text,
                config: {
                    tts: {
                        provider: ttsProvider,
                        voice: ttsVoice,
                        model: ttsProvider === 'openai' ? 'tts-1' : undefined,
                        speed: 1.0
                    }
                },
                sessionId: `ivr_intent_${intent.id}`
            });
            
            // Copy to IVR audio storage
            const agentPath = path.join(IVR_AUDIO_PATH, req.params.agentId);
            if (!fs.existsSync(agentPath)) {
                fs.mkdirSync(agentPath, { recursive: true });
            }
            
            const newFileName = `intent_${intent.id}_${uuidv4()}.mp3`;
            const newFilePath = path.join(agentPath, newFileName);
            
            // AudioService saves to {STORAGE_BASE}/output/{filename}
            const sourcePath = ttsResult.filename 
                ? path.join(STORAGE_BASE, 'output', ttsResult.filename)
                : null;
            
            if (sourcePath && fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, newFilePath);
            } else {
                console.warn(`[IVR-TTS] Source audio not found: ${sourcePath}`);
            }
            
            const stats = fs.existsSync(newFilePath) ? fs.statSync(newFilePath) : { size: 0 };
            const estimatedDurationMs = Math.round((intent.response_text.length / 10) * 1000);
            
            // Extract cost - AudioService returns { base_cost, final_cost }
            const ttsCost = typeof ttsResult.cost === 'object' 
                ? (ttsResult.cost.final_cost || ttsResult.cost.base_cost || 0)
                : (ttsResult.cost || (intent.response_text.length * 0.000015));
            
            // Create audio record
            const audio = await IVRService.createAudio(
                req.params.agentId,
                req.agent.tenant_id,
                {
                    name: `Intent: ${intent.name}`,
                    description: `Auto-generated audio for intent "${intent.name}"`,
                    source_type: 'generated_dashboard',
                    source_text: intent.response_text,
                    file_path: newFilePath,
                    file_format: 'mp3',
                    file_size_bytes: stats.size,
                    duration_ms: ttsResult.estimated_duration ? Math.round(ttsResult.estimated_duration * 1000) : estimatedDurationMs,
                    tts_provider: ttsProvider,
                    tts_voice: ttsVoice,
                    tts_model: ttsProvider === 'openai' ? 'tts-1' : null,
                    tts_cost: ttsCost,
                    language: config?.default_language || 'ur'
                }
            );
            
            // Update intent to use this audio
            await IVRService.updateIntent(intent.id, {
                audio_source: 'uploaded',
                audio_id: audio.id
            });
            
            console.log(`[IVR-TTS] Audio generated for intent ${intent.id}: ${audio.id} (${stats.size} bytes)`);
            
            res.json({ 
                success: true, 
                data: audio,
                intent_updated: true,
                message: 'Audio generated and linked to intent'
            });
            
        } catch (ttsError) {
            console.error('[IVR-TTS] Intent audio generation error:', ttsError);
            return res.status(500).json({ 
                error: 'TTS generation failed', 
                details: ttsError.message 
            });
        }
        
    } catch (error) {
        console.error('Generate intent audio error:', error);
        res.status(500).json({ error: 'Failed to generate audio for intent' });
    }
});

/**
 * @route POST /api/ivr/:agentId/intents/:intentId/cache-audio
 * @desc Generate and cache audio for KB lookup intent (called by bridge)
 * This is for auto_cache intents where response text is dynamic (from LLM)
 */
router.post('/:agentId/intents/:intentId/cache-audio', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { text, voice } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        const startTime = Date.now();
        console.log(`[IVR-CACHE] Starting cache-audio for intent ${req.params.intentId}, text length: ${text.length}`);
        
        // Get intent
        const intent = await IVRService.getIntent(req.params.intentId);
        
        if (!intent) {
            return res.status(404).json({ error: 'Intent not found' });
        }
        
        if (intent.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Intent does not belong to this agent' });
        }
        
        // Get IVR config for TTS settings
        const config = await IVRService.getConfig(req.params.agentId);
        
        // Import AudioService for TTS
        const AudioService = require('../services/AudioService');
        
        const ttsProvider = config?.tts_provider || 'uplift';
        const ttsVoice = voice || config?.tts_voice || 'ayesha';
        
        console.log(`[IVR-CACHE] Generating TTS for intent "${intent.intent_name}": "${text.substring(0, 50)}..." (${ttsProvider}/${ttsVoice})`);
        
        try {
            // Generate audio using AudioService
            const ttsStartTime = Date.now();
            const ttsResult = await AudioService.synthesize({
                text: text,
                config: {
                    tts: {
                        provider: ttsProvider,
                        voice: ttsVoice,
                        model: ttsProvider === 'openai' ? 'tts-1' : undefined,
                        speed: 1.0
                    }
                },
                sessionId: `ivr_cache_${intent.id}`
            });
            console.log(`[IVR-CACHE] TTS generation took ${Date.now() - ttsStartTime}ms`);
            
            // Copy to IVR audio storage
            const agentPath = path.join(IVR_AUDIO_PATH, req.params.agentId);
            if (!fs.existsSync(agentPath)) {
                fs.mkdirSync(agentPath, { recursive: true });
            }
            
            const newFileName = `cache_${intent.id}_${Date.now()}.mp3`;
            const newFilePath = path.join(agentPath, newFileName);
            
            // AudioService saves to {STORAGE_BASE}/output/{filename}
            const sourcePath = ttsResult.filename 
                ? path.join(STORAGE_BASE, 'output', ttsResult.filename)
                : null;
            
            if (sourcePath && fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, newFilePath);
            } else {
                console.warn(`[IVR-CACHE] Source audio not found: ${sourcePath}`);
                return res.status(500).json({ error: 'TTS audio file not found' });
            }
            
            const stats = fs.statSync(newFilePath);
            
            // Extract cost
            const ttsCost = typeof ttsResult.cost === 'object' 
                ? (ttsResult.cost.final_cost || ttsResult.cost.base_cost || 0)
                : (ttsResult.cost || (text.length * 0.000015));
            
            // Create audio record in library
            const audio = await IVRService.createAudio(
                req.params.agentId,
                req.agent.tenant_id,
                {
                    name: `Auto-Cache: ${intent.intent_name}`,
                    description: `Auto-generated response for "${intent.intent_name}". Text: ${text.substring(0, 100)}...`,
                    source_type: 'generated_auto',  // Must be: uploaded, generated_dashboard, or generated_auto
                    source_text: text,
                    file_path: newFilePath,
                    file_format: 'mp3',
                    file_size_bytes: stats.size,
                    duration_ms: ttsResult.estimated_duration ? Math.round(ttsResult.estimated_duration * 1000) : Math.round((text.length / 10) * 1000),
                    tts_provider: ttsProvider,
                    tts_voice: ttsVoice,
                    tts_model: ttsProvider === 'openai' ? 'tts-1' : null,
                    tts_cost: ttsCost,
                    language: config?.default_language || 'ur',
                    tags: ['auto-cache', 'kb-response']
                }
            );
            
            // Update intent to use this cached audio
            await IVRService.updateIntent(intent.id, {
                response_audio_id: audio.id
            });
            
            const totalTime = Date.now() - startTime;
            console.log(`[IVR-CACHE] ✓ Audio cached for intent ${intent.id}: ${audio.id} (${stats.size} bytes, total: ${totalTime}ms)`);
            
            res.json({ 
                success: true, 
                data: {
                    audio_id: audio.id,
                    file_path: newFilePath,
                    file_size: stats.size,
                    duration_ms: audio.duration_ms,
                    tts_cost: ttsCost
                },
                message: 'Audio generated and cached for intent'
            });
            
        } catch (ttsError) {
            console.error('[IVR-CACHE] TTS generation error:', ttsError);
            return res.status(500).json({ 
                error: 'TTS generation failed', 
                details: ttsError.message 
            });
        }
        
    } catch (error) {
        console.error('[IVR-CACHE] Cache audio error:', error);
        res.status(500).json({ error: 'Failed to cache audio for intent' });
    }
});

// =============================================================================
// AUDIO ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/audio
 * @desc List all audio files for an agent
 */
router.get('/:agentId/audio', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const filters = {
            source_type: req.query.source_type,
            language: req.query.language
        };
        
        const audioFiles = await IVRService.listAudio(req.params.agentId, filters);
        
        res.json({ success: true, data: audioFiles });
    } catch (error) {
        console.error('List audio error:', error);
        res.status(500).json({ error: 'Failed to list audio files' });
    }
});

/**
 * @route GET /api/ivr/:agentId/audio/:audioId
 * @desc Get a single audio file metadata
 */
router.get('/:agentId/audio/:audioId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const audio = await IVRService.getAudio(req.params.audioId);
        
        if (!audio) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        if (audio.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Audio does not belong to this agent' });
        }
        
        res.json({ success: true, data: audio });
    } catch (error) {
        console.error('Get audio error:', error);
        res.status(500).json({ error: 'Failed to get audio file' });
    }
});

/**
 * @route POST /api/ivr/:agentId/audio/cache-base64
 * @desc Save auto-generated TTS audio from bridge using base64 JSON
 * Creates audio record and updates:
 * - Flow step (if step_id provided)
 * - Flow (if flow_id provided without step_id)
 * - Intent (if intent_id provided)
 * Saves as MP3 for universal web playback
 */
router.post('/:agentId/audio/cache-base64', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { 
            audio_data,
            name, 
            source_text,
            file_format,
            duration_ms,
            tts_provider,
            tts_voice,
            language,
            step_id,
            flow_id,
            intent_id,
            audio_field,
            update_i18n  // NEW: flag to update i18n table
        } = req.body;
        
        if (!audio_data) {
            return res.status(400).json({ error: 'audio_data (base64) is required' });
        }
        
        const agentId = req.params.agentId;
        const tenantId = req.agent.tenant_id;
        
        // Decode base64 audio
        const audioBuffer = Buffer.from(audio_data, 'base64');
        const fileSizeBytes = audioBuffer.length;
        
        // Determine file extension from format
        const format = file_format || 'mp3';
        const extension = format === 'mp3' ? 'mp3' : 
                         format === 'mulaw_8000' ? 'raw' : 
                         format === 'wav' ? 'wav' : 'mp3';
        
        console.log('[IVR-CACHE-B64] Saving cached audio:', {
            agentId,
            stepId: step_id,
            flowId: flow_id,
            intentId: intent_id,
            audioField: audio_field,
            language: language,
            updateI18n: update_i18n,
            size: fileSizeBytes,
            format: format
        });
        
        // Ensure audio directory exists
        const agentAudioPath = path.join(IVR_AUDIO_PATH, agentId);
        if (!fs.existsSync(agentAudioPath)) {
            fs.mkdirSync(agentAudioPath, { recursive: true });
        }
        
        // Generate unique filename
        const filename = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
        const filePath = path.join(agentAudioPath, filename);
        
        // Write audio to file
        fs.writeFileSync(filePath, audioBuffer);
        console.log('[IVR-CACHE-B64] Audio file saved:', filePath);
        
        // Create audio record in library
        const audio = await IVRService.createAudio(
            agentId,
            tenantId,
            {
                name: name || `Auto-TTS ${new Date().toISOString()}`,
                description: `Auto-generated from: ${(source_text || '').substring(0, 100)}`,
                source_type: 'generated_auto',
                source_text: source_text || '',
                file_path: filePath,
                file_format: format,
                file_size_bytes: fileSizeBytes,
                duration_ms: duration_ms || 0,
                tts_provider: tts_provider || null,
                tts_voice: tts_voice || null,
                language: language || 'ur'
            }
        );
        
        console.log('[IVR-CACHE-B64] Audio record created:', audio.id);
        
        let stepUpdated = false;
        let intentUpdated = false;
        let flowUpdated = false;
        let i18nUpdated = false;
        
        // Determine entity info for i18n
        const entityType = step_id ? 'step' : flow_id ? 'flow' : intent_id ? 'intent' : null;
        const entityId = step_id || flow_id || intent_id;
        const fieldName = audio_field?.replace('_audio_id', '_text') || 'prompt_text';
        
        // UPDATE I18N CONTENT FIRST (if flag is set and language provided)
        if (update_i18n && language && entityType && entityId) {
            try {
                const [result] = await db.query(`
                    UPDATE yovo_tbl_aiva_ivr_i18n_content 
                    SET audio_id = ?, updated_at = NOW()
                    WHERE entity_type = ? 
                      AND entity_id = ? 
                      AND field_name = ? 
                      AND language_code = ?
                `, [audio.id, entityType, entityId, fieldName, language]);
                
                if (result.affectedRows > 0) {
                    i18nUpdated = true;
                    console.log(`[IVR-CACHE-B64] i18n content updated: ${entityType}/${entityId}/${fieldName}/${language} -> audio_id=${audio.id}`);
                } else {
                    console.log(`[IVR-CACHE-B64] No i18n record found for: ${entityType}/${entityId}/${fieldName}/${language}`);
                }
            } catch (i18nErr) {
                console.error('[IVR-CACHE-B64] Failed to update i18n content:', i18nErr.message);
            }
        }
        
        // Update base tables only if i18n was NOT updated (fallback)
        if (!i18nUpdated) {
            // Update flow step if step_id provided
            if (step_id && audio_field) {
                try {
                    await FlowService.updateStep(step_id, { [audio_field]: audio.id });
                    stepUpdated = true;
                    console.log(`[IVR-CACHE-B64] Flow step updated: ${step_id} -> ${audio_field}=${audio.id}`);
                } catch (stepErr) {
                    console.error('[IVR-CACHE-B64] Failed to update flow step:', stepErr.message);
                }
            }
            // Update flow if flow_id provided without step_id
            else if (flow_id && audio_field && FLOW_AUDIO_FIELDS.includes(audio_field)) {
                try {
                    await FlowService.updateFlow(flow_id, { [audio_field]: audio.id });
                    flowUpdated = true;
                    console.log(`[IVR-CACHE-B64] Flow updated: ${flow_id} -> ${audio_field}=${audio.id}`);
                } catch (flowErr) {
                    console.error('[IVR-CACHE-B64] Failed to update flow:', flowErr.message);
                }
            }
            
            // Update intent if intent_id provided
            if (intent_id && audio_field) {
                try {
                    await IVRService.updateIntent(intent_id, { [audio_field]: audio.id });
                    intentUpdated = true;
                    console.log(`[IVR-CACHE-B64] Intent updated: ${intent_id} -> ${audio_field}=${audio.id}`);
                } catch (intentErr) {
                    console.error('[IVR-CACHE-B64] Failed to update intent:', intentErr.message);
                }
            }
        }
        
        res.json({
            success: true,
            audio_id: audio.id,
            file_path: filePath,
            file_format: format,
            step_updated: stepUpdated,
            flow_updated: flowUpdated,
            intent_updated: intentUpdated,
            i18n_updated: i18nUpdated
        });
        
    } catch (error) {
        console.error('[IVR-CACHE-B64] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/ivr/:agentId/audio/cache
 * @desc Save auto-generated cache audio from bridge
 * Creates audio record, cache record, and updates intent
 */
router.post('/:agentId/audio/cache', authenticate, verifyAgentAccess, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }
        
        const { 
            name, 
            description, 
            source_text,
            file_format,
            duration_ms,
            tts_provider,
            tts_voice,
            language,
            tags,
            cache_key,
            intent_id
        } = req.body;
        
        const agentId = req.params.agentId;
        const tenantId = req.agent.tenant_id;
        const fileSizeBytes = req.file.size;
        
        console.log('[IVR-CACHE] Saving cached audio:', {
            agentId,
            intentId: intent_id,
            cacheKey: cache_key,
            size: fileSizeBytes,
            format: file_format
        });
        
        // 1. Create audio record in library
        const audio = await IVRService.createAudio(
            agentId,
            tenantId,
            {
                name: name || `Auto-Cache ${new Date().toISOString()}`,
                description: description || 'Auto-generated cache response',
                source_type: 'tts_cache',
                source_text: source_text || '',
                file_path: req.file.path,
                file_format: file_format || 'mulaw_8000',
                file_size_bytes: fileSizeBytes,
                duration_ms: parseInt(duration_ms) || Math.round((fileSizeBytes / 8000) * 1000),
                tts_provider: tts_provider || 'uplift',
                tts_voice: tts_voice || 'ayesha',
                language: language || 'ur',
                tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : ['auto-cache']
            }
        );
        
        console.log('[IVR-CACHE] Audio record created:', audio.id);
        
        // 2. Create cache record for stats tracking
        if (cache_key) {
            try {
                await IVRService.cacheResponse(
                    agentId,
                    tenantId,
                    source_text || '',
                    req.file.path,
                    {
                        intent_id: intent_id || null,
                        audio_format: file_format || 'mulaw_8000',
                        duration_ms: parseInt(duration_ms) || Math.round((fileSizeBytes / 8000) * 1000),
                        file_size_bytes: fileSizeBytes,
                        tts_provider: tts_provider || 'uplift',
                        tts_voice: tts_voice || 'ayesha',
                        tts_cost: 0.003 // Estimated cost
                    }
                );
                console.log('[IVR-CACHE] Cache record created for key:', cache_key);
            } catch (cacheErr) {
                console.warn('[IVR-CACHE] Failed to create cache record:', cacheErr.message);
            }
        }
        
        // 3. Update intent with the cached audio ID
        if (intent_id && audio.id) {
            try {
                await IVRService.updateIntent(intent_id, {
                    response_audio_id: audio.id
                });
                console.log('[IVR-CACHE] Intent updated with audio:', intent_id, '->', audio.id);
            } catch (intentErr) {
                console.warn('[IVR-CACHE] Failed to update intent:', intentErr.message);
            }
        }
        
        res.status(201).json({ 
            success: true, 
            data: audio,
            cache_key: cache_key,
            intent_updated: !!intent_id
        });
    } catch (error) {
        console.error('[IVR-CACHE] Error saving cached audio:', error);
        res.status(500).json({ error: 'Failed to save cached audio' });
    }
});

/**
 * @route POST /api/ivr/:agentId/audio/upload
 * @desc Upload an audio file
 */
router.post('/:agentId/audio/upload', authenticate, verifyAgentAccess, checkPermission('agents.update'), upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Audio file is required' });
        }
        
        const { name, description, language, tags } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Audio name is required' });
        }
        
        // Get audio duration (rough estimate based on file size)
        const fileSizeBytes = req.file.size;
        const estimatedDurationMs = Math.round((fileSizeBytes / 8000) * 1000);
        
        const audio = await IVRService.createAudio(
            req.params.agentId,
            req.agent.tenant_id,
            {
                name,
                description,
                source_type: 'uploaded',
                file_path: req.file.path,
                file_format: 'wav',
                file_size_bytes: fileSizeBytes,
                duration_ms: estimatedDurationMs,
                language: language || 'ur',
                tags: tags ? JSON.parse(tags) : []
            }
        );
        
        res.status(201).json({ success: true, data: audio });
    } catch (error) {
        console.error('Upload audio error:', error);
        res.status(500).json({ error: 'Failed to upload audio file' });
    }
});

/**
 * @route POST /api/ivr/:agentId/audio/generate
 * @desc Generate audio using TTS
 */
router.post('/:agentId/audio/generate', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { text, name, description, voice, language, provider } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        if (!name) {
            return res.status(400).json({ error: 'Audio name is required' });
        }
        
        // Get IVR config for TTS settings
        const config = await IVRService.getConfig(req.params.agentId);
        
        // Import AudioService for TTS
        const AudioService = require('../services/AudioService');
        const LanguageService = require('../services/LanguageService');
        
        // Determine TTS provider and voice
        let ttsProvider = provider;
        let ttsVoice = voice;
        
        // If voice/provider not specified but language is, lookup from agent languages
        if ((!ttsVoice || !ttsProvider) && language) {
            try {
                const agentLangs = await LanguageService.getAgentLanguages(req.params.agentId);
                const langConfig = agentLangs.find(l => l.language_code === language);
                
                if (langConfig) {
                    if (!ttsVoice) {
                        ttsVoice = langConfig.tts_voice_id || langConfig.tts_voice;
                    }
                    if (!ttsProvider) {
                        ttsProvider = langConfig.tts_provider;
                    }
                    console.log(`[IVR-TTS] Using language config for ${language}: ${ttsProvider}/${ttsVoice}`);
                }
            } catch (langErr) {
                console.warn('[IVR-TTS] Failed to lookup language config:', langErr.message);
            }
        }
        
        // Fallback to IVR config defaults
        ttsProvider = ttsProvider || config?.tts_provider || 'uplift';
        ttsVoice = ttsVoice || config?.tts_voice || 'ayesha';
        
        console.log(`[IVR-TTS] Generating audio: "${text.substring(0, 50)}..." (${ttsProvider}/${ttsVoice})`);
        
        try {
            // Use AudioService.synthesize which handles all TTS providers
            const ttsResult = await AudioService.synthesize({
                text: text,
                config: {
                    tts: {
                        provider: ttsProvider,
                        voice: ttsVoice,
                        model: ttsProvider === 'openai' ? 'tts-1' : undefined,
                        speed: 1.0
                    }
                },
                sessionId: `ivr_${req.params.agentId}`
            });
            
            // AudioService returns { audioUrl, audioPath, cost, duration }
            // We need to copy the file to IVR storage
            const agentPath = path.join(IVR_AUDIO_PATH, req.params.agentId);
            if (!fs.existsSync(agentPath)) {
                fs.mkdirSync(agentPath, { recursive: true });
            }
            
            // Copy from AudioService output path to IVR storage
            const newFileName = `${uuidv4()}.mp3`;
            const newFilePath = path.join(agentPath, newFileName);
            
            // AudioService saves to {STORAGE_BASE}/output/{filename}
            const sourcePath = ttsResult.filename 
                ? path.join(STORAGE_BASE, 'output', ttsResult.filename)
                : null;
            
            if (sourcePath && fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, newFilePath);
            } else {
                console.warn(`[IVR-TTS] Source audio not found: ${sourcePath}`);
            }
            
            // Get file size
            const stats = fs.existsSync(newFilePath) ? fs.statSync(newFilePath) : { size: 0 };
            
            // Estimate duration (rough: ~100 chars per second for Urdu/English)
            const estimatedDurationMs = Math.round((text.length / 10) * 1000);
            
            // Extract cost - AudioService returns { base_cost, final_cost }
            const ttsCost = typeof ttsResult.cost === 'object' 
                ? (ttsResult.cost.final_cost || ttsResult.cost.base_cost || 0)
                : (ttsResult.cost || (text.length * 0.000015));
            
            // Create audio record
            const audio = await IVRService.createAudio(
                req.params.agentId,
                req.agent.tenant_id,
                {
                    name,
                    description,
                    source_type: 'generated_dashboard',
                    source_text: text,
                    file_path: newFilePath,
                    file_format: 'mp3',
                    file_size_bytes: stats.size,
                    duration_ms: ttsResult.estimated_duration ? Math.round(ttsResult.estimated_duration * 1000) : estimatedDurationMs,
                    tts_provider: ttsProvider,
                    tts_voice: ttsVoice,
                    tts_model: ttsProvider === 'openai' ? 'tts-1' : null,
                    tts_cost: ttsCost,
                    language: language || 'ur'
                }
            );
            
            console.log(`[IVR-TTS] Audio generated: ${audio.id} (${stats.size} bytes)`);
            
            res.status(201).json({ 
                success: true, 
                data: audio,
                tts_cost: ttsCost,
                message: 'Audio generated successfully'
            });
            
        } catch (ttsError) {
            console.error('[IVR-TTS] Generation error:', ttsError);
            return res.status(500).json({ 
                error: 'TTS generation failed', 
                details: ttsError.message 
            });
        }
        
    } catch (error) {
        console.error('Generate audio error:', error);
        res.status(500).json({ error: 'Failed to generate audio' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/audio/:audioId
 * @desc Delete an audio file
 */
router.delete('/:agentId/audio/:audioId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const existingAudio = await IVRService.getAudio(req.params.audioId);
        
        if (!existingAudio) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        if (existingAudio.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Audio does not belong to this agent' });
        }
        
        await IVRService.deleteAudio(req.params.audioId);
        
        res.json({ success: true, message: 'Audio file deleted successfully' });
    } catch (error) {
        console.error('Delete audio error:', error);
        res.status(500).json({ error: 'Failed to delete audio file' });
    }
});

/**
 * @route GET /api/ivr/:agentId/audio/:audioId/stream
 * @desc Stream audio file
 * @note Supports token via query param for browser audio playback
 * @note Also supports x-api-key header for bridge access
 * @note Does NOT use authenticate middleware - handles auth internally
 */
router.get('/:agentId/audio/:audioId/stream', async (req, res) => {
    try {
        // Support multiple auth methods:
        // 1. x-api-key header (for bridge)
        // 2. JWT token via query parameter (for browser audio playback)
        // 3. JWT token via Authorization header
        const apiKey = req.headers['x-api-key'];
        const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
        
        // Get agent first (needed for both auth methods)
        const agent = await AgentService.getAgent(req.params.agentId);
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        // Try API key first (bridge access)
        if (apiKey) {
            // Check if API key matches agent's key or is a valid system key
            const isValidKey = agent.api_key === apiKey || 
                              process.env.SYSTEM_API_KEY === apiKey ||
                              process.env.BRIDGE_API_KEY === apiKey;
            
            if (!isValidKey) {
                return res.status(401).json({ error: 'Invalid API key' });
            }
            // API key is valid - proceed
        } else if (token) {
            // Verify JWT token
            const jwt = require('jsonwebtoken');
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                
                // Check tenant access (unless super_admin)
                if (decoded.role !== 'super_admin' && agent.tenant_id !== decoded.tenant_id) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            } catch (jwtError) {
                return res.status(401).json({ error: 'Invalid token' });
            }
        } else {
            return res.status(401).json({ error: 'No authentication provided' });
        }
        
        // Get audio file
        const audio = await IVRService.getAudio(req.params.audioId);
        
        if (!audio) {
            return res.status(404).json({ error: 'Audio file not found' });
        }
        
        if (!fs.existsSync(audio.file_path)) {
            console.error('[IVR] Audio file not found on disk:', audio.file_path);
            return res.status(404).json({ error: 'Audio file not found on disk', path: audio.file_path });
        }
        
        // Increment usage count
        await IVRService.incrementAudioUsage(req.params.audioId);
        
        // Determine content type
        const contentTypes = {
            'mulaw_8000': 'audio/basic',
            'pcm16_8000': 'audio/L16;rate=8000',
            'pcm16_16000': 'audio/L16;rate=16000',
            'pcm16_24000': 'audio/L16;rate=24000',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav'
        };
        
        res.setHeader('Content-Type', contentTypes[audio.file_format] || 'audio/mpeg');
        res.setHeader('Content-Disposition', `inline; filename="${audio.name}.${audio.file_format || 'mp3'}"`);
        
        const stream = fs.createReadStream(audio.file_path);
        stream.pipe(res);
    } catch (error) {
        console.error('Stream audio error:', error);
        res.status(500).json({ error: 'Failed to stream audio file' });
    }
});

// =============================================================================
// TEMPLATE ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/templates
 * @desc List all templates for an agent
 */
router.get('/:agentId/templates', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const templates = await IVRService.listTemplates(req.params.agentId);
        
        res.json({ success: true, data: templates });
    } catch (error) {
        console.error('List templates error:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

/**
 * @route POST /api/ivr/:agentId/templates
 * @desc Create a new template
 */
router.post('/:agentId/templates', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { template_name, template_structure, required_variables } = req.body;
        
        if (!template_name) {
            return res.status(400).json({ error: 'Template name is required' });
        }
        
        if (!template_structure || !Array.isArray(template_structure)) {
            return res.status(400).json({ error: 'Template structure is required and must be an array' });
        }
        
        if (!required_variables || !Array.isArray(required_variables)) {
            return res.status(400).json({ error: 'Required variables is required and must be an array' });
        }
        
        const template = await IVRService.createTemplate(
            req.params.agentId,
            req.agent.tenant_id,
            req.body
        );
        
        res.status(201).json({ success: true, data: template });
    } catch (error) {
        console.error('Create template error:', error);
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * @route PUT /api/ivr/:agentId/templates/:templateId
 * @desc Update a template
 */
router.put('/:agentId/templates/:templateId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const existingTemplate = await IVRService.getTemplate(req.params.templateId);
        
        if (!existingTemplate) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        if (existingTemplate.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Template does not belong to this agent' });
        }
        
        const template = await IVRService.updateTemplate(req.params.templateId, req.body);
        
        res.json({ success: true, data: template });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/templates/:templateId
 * @desc Delete a template
 */
router.delete('/:agentId/templates/:templateId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const existingTemplate = await IVRService.getTemplate(req.params.templateId);
        
        if (!existingTemplate) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        if (existingTemplate.agent_id !== req.params.agentId) {
            return res.status(403).json({ error: 'Template does not belong to this agent' });
        }
        
        await IVRService.deleteTemplate(req.params.templateId);
        
        res.json({ success: true, message: 'Template deleted successfully' });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// =============================================================================
// SEGMENT ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/segments
 * @desc List all segments for an agent
 */
router.get('/:agentId/segments', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const segments = await IVRService.listSegments(req.params.agentId);
        
        res.json({ success: true, data: segments });
    } catch (error) {
        console.error('List segments error:', error);
        res.status(500).json({ error: 'Failed to list segments' });
    }
});

/**
 * @route POST /api/ivr/:agentId/segments
 * @desc Create or update a segment
 */
router.post('/:agentId/segments', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { segment_key, segment_type, text_content } = req.body;
        
        if (!segment_key) {
            return res.status(400).json({ error: 'Segment key is required' });
        }
        
        if (!segment_type) {
            return res.status(400).json({ error: 'Segment type is required' });
        }
        
        if (!text_content) {
            return res.status(400).json({ error: 'Text content is required' });
        }
        
        const segment = await IVRService.upsertSegment(
            req.params.agentId,
            req.agent.tenant_id,
            req.body
        );
        
        res.status(201).json({ success: true, data: segment });
    } catch (error) {
        console.error('Upsert segment error:', error);
        res.status(500).json({ error: 'Failed to create/update segment' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/segments/:segmentKey
 * @desc Delete a segment
 */
router.delete('/:agentId/segments/:segmentKey', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        await IVRService.deleteSegment(req.params.agentId, req.params.segmentKey);
        
        res.json({ success: true, message: 'Segment deleted successfully' });
    } catch (error) {
        console.error('Delete segment error:', error);
        res.status(500).json({ error: 'Failed to delete segment' });
    }
});

// =============================================================================
// CACHE ENDPOINTS
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/cache/stats
 * @desc Get cache statistics
 */
router.get('/:agentId/cache/stats', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const stats = await IVRService.getCacheStats(req.params.agentId);
        
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Get cache stats error:', error);
        res.status(500).json({ error: 'Failed to get cache statistics' });
    }
});

/**
 * @route POST /api/ivr/:agentId/cache/clear
 * @desc Clear cache for an agent
 */
router.post('/:agentId/cache/clear', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const { type } = req.body;
        
        let result;
        
        if (type === 'expired') {
            result = await IVRService.clearExpiredCache(req.params.agentId);
        } else {
            await IVRService.clearAllCache(req.params.agentId);
            result = { message: 'All cache cleared' };
        }
        
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Clear cache error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

/**
 * @route GET /api/ivr/:agentId/cache/responses
 * @desc List cached responses
 */
router.get('/:agentId/cache/responses', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const db = require('../config/database');
        
        const [responses] = await db.query(
            `SELECT id, cache_key, response_text, hit_count, last_used_at, duration_ms, created_at
             FROM yovo_tbl_aiva_ivr_response_cache
             WHERE agent_id = ?
             ORDER BY hit_count DESC
             LIMIT ? OFFSET ?`,
            [req.params.agentId, limit, offset]
        );
        
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM yovo_tbl_aiva_ivr_response_cache WHERE agent_id = ?',
            [req.params.agentId]
        );
        
        res.json({ 
            success: true, 
            data: responses,
            pagination: {
                total: countResult[0].total,
                limit,
                offset
            }
        });
    } catch (error) {
        console.error('List cached responses error:', error);
        res.status(500).json({ error: 'Failed to list cached responses' });
    }
});

/**
 * @route GET /api/ivr/:agentId/cache/variables
 * @desc List cached variables
 */
router.get('/:agentId/cache/variables', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const variableType = req.query.type;
        
        const db = require('../config/database');
        
        let query = `SELECT id, variable_type, variable_value, hit_count, last_used_at, duration_ms, created_at
             FROM yovo_tbl_aiva_ivr_variable_cache
             WHERE agent_id = ?`;
        const params = [req.params.agentId];
        
        if (variableType) {
            query += ' AND variable_type = ?';
            params.push(variableType);
        }
        
        query += ' ORDER BY hit_count DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const [variables] = await db.query(query, params);
        
        let countQuery = 'SELECT COUNT(*) as total FROM yovo_tbl_aiva_ivr_variable_cache WHERE agent_id = ?';
        const countParams = [req.params.agentId];
        
        if (variableType) {
            countQuery += ' AND variable_type = ?';
            countParams.push(variableType);
        }
        
        const [countResult] = await db.query(countQuery, countParams);
        
        res.json({ 
            success: true, 
            data: variables,
            pagination: {
                total: countResult[0].total,
                limit,
                offset
            }
        });
    } catch (error) {
        console.error('List cached variables error:', error);
        res.status(500).json({ error: 'Failed to list cached variables' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/cache/responses/:cacheId
 * @desc Delete a specific cached response
 */
router.delete('/:agentId/cache/responses/:cacheId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const db = require('../config/database');
        
        const [existing] = await db.query(
            'SELECT id, audio_file_path FROM yovo_tbl_aiva_ivr_response_cache WHERE id = ? AND agent_id = ?',
            [req.params.cacheId, req.params.agentId]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Cached response not found' });
        }
        
        if (existing[0].audio_file_path && fs.existsSync(existing[0].audio_file_path)) {
            fs.unlinkSync(existing[0].audio_file_path);
        }
        
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_response_cache WHERE id = ?', [req.params.cacheId]);
        
        res.json({ success: true, message: 'Cached response deleted' });
    } catch (error) {
        console.error('Delete cached response error:', error);
        res.status(500).json({ error: 'Failed to delete cached response' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/cache/variables/:cacheId
 * @desc Delete a specific cached variable
 */
router.delete('/:agentId/cache/variables/:cacheId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const db = require('../config/database');
        
        const [existing] = await db.query(
            'SELECT id, audio_file_path FROM yovo_tbl_aiva_ivr_variable_cache WHERE id = ? AND agent_id = ?',
            [req.params.cacheId, req.params.agentId]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Cached variable not found' });
        }
        
        if (existing[0].audio_file_path && fs.existsSync(existing[0].audio_file_path)) {
            fs.unlinkSync(existing[0].audio_file_path);
        }
        
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_variable_cache WHERE id = ?', [req.params.cacheId]);
        
        res.json({ success: true, message: 'Cached variable deleted' });
    } catch (error) {
        console.error('Delete cached variable error:', error);
        res.status(500).json({ error: 'Failed to delete cached variable' });
    }
});

// =============================================================================
// UNMATCHED QUERIES ENDPOINTS (Analytics/Reporting)
// =============================================================================

/**
 * @route POST /api/ivr/:agentId/unmatched-queries
 * @desc Log an unmatched query for analytics
 */
router.post('/:agentId/unmatched-queries', authenticate, async (req, res) => {
    try {
        const db = require('../config/database');
        const { 
            transcript, 
            session_id, 
            caller_id, 
            closest_intents, 
            suggested_intent,
            suggested_description,
            timestamp 
        } = req.body;
        
        if (!transcript) {
            return res.status(400).json({ error: 'Transcript is required' });
        }
        
        const id = uuidv4();
        
        // Convert ISO timestamp to MySQL datetime format
        let queryTimestamp = null;
        if (timestamp) {
            const date = new Date(timestamp);
            queryTimestamp = date.toISOString().slice(0, 19).replace('T', ' ');
        }
        
        // Try with suggested_intent columns first, fallback to basic insert
        try {
            await db.query(
                `INSERT INTO yovo_tbl_aiva_ivr_unmatched_queries 
                 (id, agent_id, transcript, session_id, caller_id, closest_intents, suggested_intent, suggested_description, query_timestamp, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    id,
                    req.params.agentId,
                    transcript,
                    session_id || null,
                    caller_id || null,
                    JSON.stringify(closest_intents || []),
                    suggested_intent || null,
                    suggested_description || null,
                    queryTimestamp
                ]
            );
        } catch (columnError) {
            // If suggested_intent columns don't exist, use basic insert
            if (columnError.code === 'ER_BAD_FIELD_ERROR') {
                console.warn('suggested_intent columns not found, using basic insert');
                await db.query(
                    `INSERT INTO yovo_tbl_aiva_ivr_unmatched_queries 
                     (id, agent_id, transcript, session_id, caller_id, closest_intents, query_timestamp, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        id,
                        req.params.agentId,
                        transcript,
                        session_id || null,
                        caller_id || null,
                        JSON.stringify(closest_intents || []),
                        queryTimestamp
                    ]
                );
            } else {
                throw columnError;
            }
        }
        
        res.json({ success: true, data: { id } });
    } catch (error) {
        console.error('Log unmatched query error:', error);
        res.status(500).json({ error: 'Failed to log unmatched query' });
    }
});

/**
 * @route GET /api/ivr/:agentId/unmatched-queries
 * @desc Get unmatched queries for analysis
 */
router.get('/:agentId/unmatched-queries', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const db = require('../config/database');
        const { limit = 100, offset = 0, start_date, end_date, group_similar } = req.query;
        
        let query = `
            SELECT 
                id, transcript, session_id, caller_id, closest_intents, 
                query_timestamp, created_at
            FROM yovo_tbl_aiva_ivr_unmatched_queries 
            WHERE agent_id = ?
        `;
        const params = [req.params.agentId];
        
        if (start_date) {
            query += ' AND query_timestamp >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND query_timestamp <= ?';
            params.push(end_date);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [queries] = await db.query(query, params);
        
        // Parse JSON fields
        const parsedQueries = queries.map(q => ({
            ...q,
            closest_intents: typeof q.closest_intents === 'string' 
                ? JSON.parse(q.closest_intents) 
                : q.closest_intents
        }));
        
        // Get total count
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM yovo_tbl_aiva_ivr_unmatched_queries WHERE agent_id = ?',
            [req.params.agentId]
        );
        
        // If grouping similar queries requested
        if (group_similar === 'true') {
            const [grouped] = await db.query(`
                SELECT 
                    transcript,
                    COUNT(*) as occurrence_count,
                    MAX(created_at) as last_occurrence,
                    MIN(created_at) as first_occurrence
                FROM yovo_tbl_aiva_ivr_unmatched_queries 
                WHERE agent_id = ?
                GROUP BY transcript
                ORDER BY occurrence_count DESC
                LIMIT ?
            `, [req.params.agentId, parseInt(limit)]);
            
            return res.json({ 
                success: true, 
                data: {
                    grouped: grouped,
                    total_unique: grouped.length,
                    total_queries: countResult[0].total
                }
            });
        }
        
        res.json({ 
            success: true, 
            data: {
                queries: parsedQueries,
                total: countResult[0].total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get unmatched queries error:', error);
        res.status(500).json({ error: 'Failed to get unmatched queries' });
    }
});

/**
 * @route GET /api/ivr/:agentId/analytics/intent-gaps
 * @desc Get analytics on potential missing intents
 */
router.get('/:agentId/analytics/intent-gaps', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const db = require('../config/database');
        const { days = 7 } = req.query;
        
        // Get frequently unmatched queries
        const [frequentUnmatched] = await db.query(`
            SELECT 
                transcript,
                COUNT(*) as count,
                MAX(closest_intents) as sample_closest_intents,
                MIN(query_timestamp) as first_seen,
                MAX(query_timestamp) as last_seen
            FROM yovo_tbl_aiva_ivr_unmatched_queries 
            WHERE agent_id = ? 
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY transcript
            HAVING count >= 2
            ORDER BY count DESC
            LIMIT 20
        `, [req.params.agentId, parseInt(days)]);
        
        // Get intent usage stats
        const [intentStats] = await db.query(`
            SELECT 
                i.id,
                i.name,
                i.intent_type,
                COUNT(DISTINCT uq.id) as near_miss_count
            FROM yovo_tbl_aiva_ivr_intents i
            LEFT JOIN yovo_tbl_aiva_ivr_unmatched_queries uq 
                ON uq.agent_id = i.agent_id 
                AND uq.closest_intents LIKE CONCAT('%', i.id, '%')
                AND uq.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            WHERE i.agent_id = ? AND i.is_active = 1
            GROUP BY i.id, i.name, i.intent_type
            ORDER BY near_miss_count DESC
        `, [parseInt(days), req.params.agentId]);
        
        // Summary stats
        const [summary] = await db.query(`
            SELECT 
                COUNT(*) as total_unmatched,
                COUNT(DISTINCT transcript) as unique_queries,
                COUNT(DISTINCT session_id) as affected_sessions
            FROM yovo_tbl_aiva_ivr_unmatched_queries 
            WHERE agent_id = ? 
              AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        `, [req.params.agentId, parseInt(days)]);
        
        res.json({ 
            success: true, 
            data: {
                summary: summary[0],
                frequent_unmatched: frequentUnmatched.map(q => ({
                    ...q,
                    sample_closest_intents: typeof q.sample_closest_intents === 'string'
                        ? JSON.parse(q.sample_closest_intents)
                        : q.sample_closest_intents
                })),
                intent_near_misses: intentStats,
                period_days: parseInt(days)
            }
        });
    } catch (error) {
        console.error('Get intent gaps error:', error);
        res.status(500).json({ error: 'Failed to get intent gap analytics' });
    }
});

/**
 * @route POST /api/ivr/:agentId/unmatched-queries/:queryId/create-intent
 * @desc Create a new intent from an unmatched query
 */
router.post('/:agentId/unmatched-queries/:queryId/create-intent', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const db = require('../config/database');
        
        // Get the unmatched query
        const [queries] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_unmatched_queries WHERE id = ? AND agent_id = ?',
            [req.params.queryId, req.params.agentId]
        );
        
        if (queries.length === 0) {
            return res.status(404).json({ error: 'Unmatched query not found' });
        }
        
        const query = queries[0];
        const { intent_name, intent_type = 'static', response_text } = req.body;
        
        if (!intent_name) {
            return res.status(400).json({ error: 'Intent name is required' });
        }
        
        // Create the new intent
        const intentId = uuidv4();
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_intents 
             (id, agent_id, name, intent_type, trigger_phrases, response_text, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
            [
                intentId,
                req.params.agentId,
                intent_name,
                intent_type,
                JSON.stringify([query.transcript]),
                response_text || null
            ]
        );
        
        // Mark the unmatched query as resolved
        await db.query(
            'UPDATE yovo_tbl_aiva_ivr_unmatched_queries SET resolved_intent_id = ?, resolved_at = NOW() WHERE id = ?',
            [intentId, req.params.queryId]
        );
        
        // Also resolve similar unmatched queries
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_unmatched_queries 
             SET resolved_intent_id = ?, resolved_at = NOW() 
             WHERE agent_id = ? AND transcript = ? AND resolved_intent_id IS NULL`,
            [intentId, req.params.agentId, query.transcript]
        );
        
        res.json({ 
            success: true, 
            data: { 
                intent_id: intentId,
                intent_name: intent_name,
                trigger_phrases: [query.transcript]
            }
        });
    } catch (error) {
        console.error('Create intent from query error:', error);
        res.status(500).json({ error: 'Failed to create intent' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/unmatched-queries/:queryId
 * @desc Delete/dismiss an unmatched query
 */
router.delete('/:agentId/unmatched-queries/:queryId', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const db = require('../config/database');
        
        await db.query(
            'DELETE FROM yovo_tbl_aiva_ivr_unmatched_queries WHERE id = ? AND agent_id = ?',
            [req.params.queryId, req.params.agentId]
        );
        
        res.json({ success: true, message: 'Unmatched query deleted' });
    } catch (error) {
        console.error('Delete unmatched query error:', error);
        res.status(500).json({ error: 'Failed to delete unmatched query' });
    }
});

// =============================================================================
// RESPONSE CACHE ROUTES
// =============================================================================

/**
 * @route GET /api/ivr/:agentId/cache/:cacheKey
 * @desc Get cached audio response
 */
router.get('/:agentId/cache/:cacheKey', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const cached = await IVRService.getCachedResponse(
            req.params.agentId,
            decodeURIComponent(req.params.cacheKey)
        );
        
        if (!cached) {
            return res.status(404).json({ error: 'Cache not found' });
        }
        
        res.json({ success: true, data: cached });
    } catch (error) {
        console.error('Get cache error:', error);
        res.status(500).json({ error: 'Failed to get cache' });
    }
});

/**
 * @route POST /api/ivr/:agentId/cache
 * @desc Save audio response to cache
 */
router.post('/:agentId/cache', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { cache_key, audio_data, text, ttl_days } = req.body;
        
        if (!cache_key || !audio_data) {
            return res.status(400).json({ error: 'cache_key and audio_data required' });
        }
        
        const success = await IVRService.setCachedResponse(
            req.params.agentId,
            cache_key,
            audio_data,
            text || '',
            ttl_days || 30
        );
        
        if (!success) {
            return res.status(500).json({ error: 'Failed to save cache' });
        }
        
        res.json({ success: true, message: 'Cache saved' });
    } catch (error) {
        console.error('Set cache error:', error);
        res.status(500).json({ error: 'Failed to save cache' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/cache/:cacheKey
 * @desc Delete cached response
 */
router.delete('/:agentId/cache/:cacheKey', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        await IVRService.deleteCachedResponse(
            req.params.agentId,
            decodeURIComponent(req.params.cacheKey)
        );
        
        res.json({ success: true, message: 'Cache deleted' });
    } catch (error) {
        console.error('Delete cache error:', error);
        res.status(500).json({ error: 'Failed to delete cache' });
    }
});

/**
 * @route DELETE /api/ivr/:agentId/cache
 * @desc Clear all cached responses for an agent
 */
router.delete('/:agentId/cache', authenticate, verifyAgentAccess, checkPermission('agents.update'), async (req, res) => {
    try {
        const count = await IVRService.clearAgentCache(req.params.agentId);
        
        res.json({ success: true, message: `Cleared ${count} cached responses` });
    } catch (error) {
        console.error('Clear cache error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

/**
 * GET /api/ivr/:agentId/intents/:intentId/i18n
 * Get all i18n content for an intent
 */
router.get('/:agentId/intents/:intentId/i18n', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { intentId } = req.params;
        
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = 'intent' AND entity_id = ?
        `, [intentId]);
        
        // Group by field and language
        const content = {};
        for (const row of rows) {
            if (!content[row.field_name]) {
                content[row.field_name] = {};
            }
            content[row.field_name][row.language_code] = {
                text_content: row.text_content,
                audio_id: row.audio_id,
                audio_url: row.audio_url
            };
        }
        
        res.json({
            success: true,
            data: content
        });
    } catch (error) {
        console.error('Get intent i18n error:', error);
        res.status(500).json({ error: 'Failed to get i18n content' });
    }
});

/**
 * PUT /api/ivr/:agentId/intents/:intentId/i18n/:fieldName/:languageCode
 * Set i18n content for an intent field
 */
router.put('/:agentId/intents/:intentId/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { agentId, intentId, fieldName, languageCode } = req.params;
        const { text_content, audio_id, audio_url } = req.body;
        
        const id = require('uuid').v4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_i18n_content 
            (id, agent_id, entity_type, entity_id, field_name, language_code, text_content, audio_id, audio_url)
            VALUES (?, ?, 'intent', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text_content = VALUES(text_content),
                audio_id = VALUES(audio_id),
                audio_url = VALUES(audio_url),
                updated_at = NOW()
        `, [
            id,
            agentId,
            intentId,
            fieldName,
            languageCode,
            text_content || null,
            audio_id || null,
            audio_url || null
        ]);
        
        res.json({
            success: true,
            message: 'Content saved'
        });
    } catch (error) {
        console.error('Set intent i18n error:', error);
        res.status(500).json({ error: 'Failed to set i18n content' });
    }
});

/**
 * DELETE /api/ivr/:agentId/intents/:intentId/i18n/:fieldName/:languageCode
 * Delete i18n content for an intent field
 */
router.delete('/:agentId/intents/:intentId/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { intentId, fieldName, languageCode } = req.params;
        
        await db.query(`
            DELETE FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = 'intent' AND entity_id = ? AND field_name = ? AND language_code = ?
        `, [intentId, fieldName, languageCode]);
        
        res.json({
            success: true,
            message: 'Content deleted'
        });
    } catch (error) {
        console.error('Delete intent i18n error:', error);
        res.status(500).json({ error: 'Failed to delete i18n content' });
    }
});

// ============================================================================
// IVR CONFIG I18N ENDPOINTS
// ============================================================================

/**
 * GET /api/ivr/:agentId/config/i18n
 * Get all i18n content for IVR config
 */
router.get('/:agentId/config/i18n', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const db = require('../config/database');
        const { agentId } = req.params;
        
        // Get config to get its ID
        const config = await IVRService.getConfig(agentId);
        
        if (!config) {
            return res.json({ success: true, data: {} });
        }
        
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = 'config' AND entity_id = ?
        `, [config.id]);
        
        // Group by field and language
        const content = {};
        for (const row of rows) {
            if (!content[row.field_name]) {
                content[row.field_name] = {};
            }
            content[row.field_name][row.language_code] = {
                text_content: row.text_content,
                audio_id: row.audio_id,
                audio_url: row.audio_url
            };
        }
        
        res.json({ success: true, data: content });
    } catch (error) {
        console.error('Get config i18n error:', error);
        res.status(500).json({ error: 'Failed to get i18n content' });
    }
});

/**
 * PUT /api/ivr/:agentId/config/i18n/:fieldName/:languageCode
 * Set i18n content for IVR config field
 */
router.put('/:agentId/config/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const db = require('../config/database');
        const { agentId, fieldName, languageCode } = req.params;
        const { text_content, audio_id, audio_url } = req.body;
        
        // Get or create config
        let config = await IVRService.getConfig(agentId);
        if (!config) {
            config = await IVRService.createConfig(agentId, req.agent.tenant_id, {});
        }
        
        const id = uuidv4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_i18n_content 
            (id, agent_id, entity_type, entity_id, field_name, language_code, text_content, audio_id, audio_url)
            VALUES (?, ?, 'config', ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text_content = VALUES(text_content),
                audio_id = VALUES(audio_id),
                audio_url = VALUES(audio_url),
                updated_at = NOW()
        `, [
            id,
            agentId,
            config.id,
            fieldName,
            languageCode,
            text_content || null,
            audio_id || null,
            audio_url || null
        ]);
        
        res.json({ success: true, message: 'Content saved' });
    } catch (error) {
        console.error('Set config i18n error:', error);
        res.status(500).json({ error: 'Failed to set i18n content' });
    }
});

/**
 * DELETE /api/ivr/:agentId/config/i18n/:fieldName/:languageCode
 * Delete i18n content for IVR config field
 */
router.delete('/:agentId/config/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const db = require('../config/database');
        const { agentId, fieldName, languageCode } = req.params;
        
        const config = await IVRService.getConfig(agentId);
        if (!config) {
            return res.status(404).json({ error: 'Config not found' });
        }
        
        await db.query(`
            DELETE FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = 'config' AND entity_id = ? AND field_name = ? AND language_code = ?
        `, [config.id, fieldName, languageCode]);
        
        res.json({ success: true, message: 'Content deleted' });
    } catch (error) {
        console.error('Delete config i18n error:', error);
        res.status(500).json({ error: 'Failed to delete i18n content' });
    }
});

module.exports = router;