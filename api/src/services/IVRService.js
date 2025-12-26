/**
 * IVR Service
 * Manages Intent IVR configuration, intents, audio files, and caching
 */

const db = require('../config/database');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Audio storage path
const IVR_AUDIO_PATH = process.env.IVR_AUDIO_PATH || '/var/aiva/ivr-audio';

class IVRService {
    
    // =========================================================================
    // IVR CONFIG METHODS
    // =========================================================================
    
    /**
     * Get or create IVR config for an agent
     */
    async getConfig(agentId) {
        const cacheKey = `ivr_config:${agentId}`;
        
        // Try cache first
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
        
        const [configs] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_config WHERE agent_id = ?',
            [agentId]
        );
        
        if (configs.length === 0) {
            return null;
        }
        
        const config = this._parseConfig(configs[0]);
        
        // Cache for 5 minutes
        await redisClient.setEx(cacheKey, 300, JSON.stringify(config));
        
        return config;
    }
    
    /**
     * Create IVR config for an agent
     */
    async createConfig(agentId, tenantId, configData = {}) {
        const configId = uuidv4();
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_config (
                id, agent_id, tenant_id,
                stt_provider, stt_model, language_hints,
                classifier_type, classifier_provider, classifier_model, classifier_temperature, confidence_threshold,
                tts_provider, tts_voice, tts_model, tts_output_format,
                enable_response_cache, cache_ttl_days, cache_max_size_mb, enable_variable_cache,
                max_fallback_count, not_found_message, default_transfer_queue,
                enable_kb_lookup, kb_response_provider, kb_response_model
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                configId,
                agentId,
                tenantId,
                configData.stt_provider || 'soniox',
                configData.stt_model || 'stt-rt-preview',
                JSON.stringify(configData.language_hints || ['ur', 'en']),
                configData.classifier_type || 'llm',
                configData.classifier_provider || 'groq',
                configData.classifier_model || 'llama-3.3-70b-versatile',
                configData.classifier_temperature || 0.3,
                configData.confidence_threshold || 0.70,
                configData.tts_provider || 'uplift',
                configData.tts_voice || 'ur-PK-female',
                configData.tts_model || null,
                configData.tts_output_format || 'mulaw_8000',
                configData.enable_response_cache !== false ? 1 : 0,
                configData.cache_ttl_days || 30,
                configData.cache_max_size_mb || 500,
                configData.enable_variable_cache !== false ? 1 : 0,
                configData.max_fallback_count || 3,
                configData.not_found_message || 'معذرت، میں آپ کی بات نہیں سمجھ سکا۔ براہ کرم دوبارہ کوشش کریں۔',
                configData.default_transfer_queue || 'support',
                configData.enable_kb_lookup !== false ? 1 : 0,
                configData.kb_response_provider || 'openai',
                configData.kb_response_model || 'gpt-4o-mini'
            ]
        );
        
        // Invalidate cache
        await redisClient.del(`ivr_config:${agentId}`);
        
        return this.getConfig(agentId);
    }
    
    /**
     * Update IVR config
     */
    async updateConfig(agentId, updates) {
        const allowedFields = [
            'stt_provider', 'stt_model', 'language_hints',
            'classifier_type', 'classifier_provider', 'classifier_model', 'classifier_temperature', 'confidence_threshold',
            'tts_provider', 'tts_voice', 'tts_model', 'tts_output_format',
            'enable_response_cache', 'cache_ttl_days', 'cache_max_size_mb', 'enable_variable_cache',
            'max_fallback_count', 'fallback_audio_id', 'not_found_message', 'transfer_audio_id', 'default_transfer_queue',
            'greeting_audio_id', 'closing_audio_id', 'please_wait_audio_id',
            'enable_kb_lookup', 'kb_response_provider', 'kb_response_model', 'kb_lookup_prefix_audio_id', 'kb_no_result_audio_id'
        ];
        
        // Foreign key fields - must be NULL instead of empty string
        const foreignKeyFields = [
            'fallback_audio_id', 'transfer_audio_id', 'greeting_audio_id', 
            'closing_audio_id', 'please_wait_audio_id',
            'kb_lookup_prefix_audio_id', 'kb_no_result_audio_id'
        ];
        
        const fields = [];
        const values = [];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                
                let value = updates[field];
                
                // Convert empty strings to NULL for foreign key fields
                if (foreignKeyFields.includes(field) && (value === '' || value === null)) {
                    value = null;
                } else if (field === 'language_hints') {
                    value = JSON.stringify(value);
                }
                
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            return this.getConfig(agentId);
        }
        
        values.push(agentId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_config SET ${fields.join(', ')} WHERE agent_id = ?`,
            values
        );
        
        // Invalidate cache
        await redisClient.del(`ivr_config:${agentId}`);
        
        return this.getConfig(agentId);
    }
    
    // =========================================================================
    // INTENT METHODS
    // =========================================================================
    
    /**
     * List intents for an agent
     */
    async listIntents(agentId, includeInactive = false) {
        let query = `
            SELECT i.*, a.name as audio_name, a.duration_ms as audio_duration
            FROM yovo_tbl_aiva_ivr_intents i
            LEFT JOIN yovo_tbl_aiva_ivr_audio a ON i.response_audio_id = a.id
            WHERE i.agent_id = ?
        `;
        
        if (!includeInactive) {
            query += ' AND i.is_active = 1';
        }
        
        query += ' ORDER BY i.priority DESC, i.created_at ASC';
        const [intents] = await db.query(query, [agentId]);
        
        return intents.map(intent => this._parseIntent(intent));
    }
    
    /**
     * Get a single intent
     */
    async getIntent(intentId) {
        const [intents] = await db.query(
            `SELECT i.*, a.name as audio_name, a.duration_ms as audio_duration
             FROM yovo_tbl_aiva_ivr_intents i
             LEFT JOIN yovo_tbl_aiva_ivr_audio a ON i.response_audio_id = a.id
             WHERE i.id = ?`,
            [intentId]
        );
        
        if (intents.length === 0) {
            return null;
        }
        
        return this._parseIntent(intents[0]);
    }
    
    /**
     * Create an intent
     */
    async createIntent(agentId, tenantId, intentData) {
        const intentId = uuidv4();
        
        // Helper to convert empty strings to null for foreign key fields
        const nullIfEmpty = (val) => (val === '' || val === null || val === undefined) ? null : val;
        
		await db.query(
			`INSERT INTO yovo_tbl_aiva_ivr_intents (
				id, agent_id, tenant_id,
				intent_name, intent_type, description,
				trigger_phrases, trigger_keywords, confidence_threshold,
				response_text, response_audio_id, auto_regenerate,
				template_id,
				kb_search_query_template, kb_response_prefix_audio_id, kb_response_suffix_audio_id, kb_no_result_audio_id,
				action_type, action_config,
				transfer_queue, transfer_audio_id,
				function_name, function_id,
				follow_up_intent_id, flow_id, collect_input_config,
				priority, is_active
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
				intentId,
				agentId,
				tenantId,
				intentData.intent_name,
				intentData.intent_type || 'static',
				intentData.description || null,
				JSON.stringify(intentData.trigger_phrases || []),
				intentData.trigger_keywords ? JSON.stringify(intentData.trigger_keywords) : null,
				intentData.confidence_threshold || 0.70,
				intentData.response_text || null,
				nullIfEmpty(intentData.response_audio_id),
				intentData.auto_regenerate !== false ? 1 : 0,
				nullIfEmpty(intentData.template_id),
				intentData.kb_search_query_template || null,
				nullIfEmpty(intentData.kb_response_prefix_audio_id),
				nullIfEmpty(intentData.kb_response_suffix_audio_id),
				nullIfEmpty(intentData.kb_no_result_audio_id),
				intentData.action_type || 'respond',
				intentData.action_config ? JSON.stringify(intentData.action_config) : null,
				intentData.transfer_queue || null,
				nullIfEmpty(intentData.transfer_audio_id),
				intentData.function_name || null,
				nullIfEmpty(intentData.function_id),
				nullIfEmpty(intentData.follow_up_intent_id),
				nullIfEmpty(intentData.flow_id),
				intentData.collect_input_config ? JSON.stringify(intentData.collect_input_config) : null,
				intentData.priority || 0,
				intentData.is_active !== false ? 1 : 0
			]
        );
        
        // Invalidate agent intents cache
        await redisClient.del(`ivr_intents:${agentId}`);
        
        return this.getIntent(intentId);
    }
    
    /**
     * Update an intent
     */
    async updateIntent(intentId, updates) {
        const allowedFields = [
			'intent_name', 'intent_type', 'description',
			'trigger_phrases', 'trigger_keywords', 'confidence_threshold',
			'response_text', 'response_audio_id', 'auto_regenerate',
			'template_id',
			'kb_search_query_template', 'kb_response_prefix_audio_id', 'kb_response_suffix_audio_id', 'kb_no_result_audio_id',
			'action_type', 'action_config',
			'transfer_queue', 'transfer_audio_id',
			'function_name', 'function_id',
			'follow_up_intent_id', 'flow_id', 'collect_input_config',
			'priority', 'is_active'
		];
        
        const jsonFields = ['trigger_phrases', 'trigger_keywords', 'action_config', 'collect_input_config'];
        const booleanFields = ['is_active', 'auto_regenerate'];
        
        // Foreign key fields - must be NULL instead of empty string
        const foreignKeyFields = [
			'response_audio_id', 'template_id', 
			'kb_response_prefix_audio_id', 'kb_response_suffix_audio_id', 'kb_no_result_audio_id',
			'transfer_audio_id', 'function_id', 'follow_up_intent_id', 'flow_id'
		];
        
        const fields = [];
        const values = [];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                
                let value = updates[field];
                
                // Convert empty strings to NULL for foreign key fields
                if (foreignKeyFields.includes(field) && (value === '' || value === null)) {
                    value = null;
                } else if (jsonFields.includes(field)) {
                    value = JSON.stringify(value);
                } else if (booleanFields.includes(field)) {
                    value = value ? 1 : 0;
                }
                
                values.push(value);
            }
        }
        
        if (fields.length === 0) {
            return this.getIntent(intentId);
        }
        
        values.push(intentId);
        
        // Get agent_id for cache invalidation
        const [intent] = await db.query('SELECT agent_id FROM yovo_tbl_aiva_ivr_intents WHERE id = ?', [intentId]);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_intents SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        if (intent.length > 0) {
            await redisClient.del(`ivr_intents:${intent[0].agent_id}`);
        }
        
        return this.getIntent(intentId);
    }
    
    /**
     * Delete an intent
     */
    async deleteIntent(intentId) {
        // Get agent_id for cache invalidation
        const [intent] = await db.query('SELECT agent_id FROM yovo_tbl_aiva_ivr_intents WHERE id = ?', [intentId]);
        
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_intents WHERE id = ?', [intentId]);
        
        if (intent.length > 0) {
            await redisClient.del(`ivr_intents:${intent[0].agent_id}`);
        }
    }
    
    /**
     * Reorder intents (update priorities)
     */
    async reorderIntents(agentId, intentIds) {
        // intentIds is an array in desired order (first = highest priority)
        for (let i = 0; i < intentIds.length; i++) {
            const priority = intentIds.length - i; // Higher priority for earlier items
            await db.query(
                'UPDATE yovo_tbl_aiva_ivr_intents SET priority = ? WHERE id = ? AND agent_id = ?',
                [priority, intentIds[i], agentId]
            );
        }
        
        await redisClient.del(`ivr_intents:${agentId}`);
    }
    
    // =========================================================================
    // AUDIO METHODS
    // =========================================================================
    
    /**
     * List audio files for an agent
     */
    async listAudio(agentId, filters = {}) {
        let query = 'SELECT * FROM yovo_tbl_aiva_ivr_audio WHERE agent_id = ?';
        const params = [agentId];
        
        if (filters.source_type) {
            query += ' AND source_type = ?';
            params.push(filters.source_type);
        }
        
        if (filters.language) {
            query += ' AND language = ?';
            params.push(filters.language);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [audioFiles] = await db.query(query, params);
        
        return audioFiles.map(audio => this._parseAudio(audio));
    }
    
    /**
     * Get a single audio file
     */
    async getAudio(audioId) {
        const [audioFiles] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_audio WHERE id = ?',
            [audioId]
        );
        
        if (audioFiles.length === 0) {
            return null;
        }
        
        return this._parseAudio(audioFiles[0]);
    }
    
    /**
     * Create audio file record
     */
    async createAudio(agentId, tenantId, audioData) {
        const audioId = uuidv4();
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_audio (
                id, agent_id, tenant_id,
                name, description,
                source_type, source_text,
                file_path, file_format, file_size_bytes, duration_ms,
                tts_provider, tts_voice, tts_model, tts_cost,
                language, tags
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                audioId,
                agentId,
                tenantId,
                audioData.name,
                audioData.description || null,
                audioData.source_type,
                audioData.source_text || null,
                audioData.file_path,
                audioData.file_format || 'mulaw_8000',
                audioData.file_size_bytes || null,
                audioData.duration_ms || null,
                audioData.tts_provider || null,
                audioData.tts_voice || null,
                audioData.tts_model || null,
                audioData.tts_cost || null,
                audioData.language || 'ur',
                audioData.tags ? JSON.stringify(audioData.tags) : null
            ]
        );
        
        return this.getAudio(audioId);
    }
    
    /**
     * Update audio file record
     */
    async updateAudio(audioId, updates) {
        const allowedFields = [
            'name', 'description', 'source_text',
            'file_path', 'file_format', 'file_size_bytes', 'duration_ms',
            'language', 'tags'
        ];
        
        const fields = [];
        const values = [];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                if (field === 'tags') {
                    values.push(JSON.stringify(updates[field]));
                } else {
                    values.push(updates[field]);
                }
            }
        }
        
        if (fields.length === 0) {
            return this.getAudio(audioId);
        }
        
        values.push(audioId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_audio SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        return this.getAudio(audioId);
    }
    
    /**
     * Delete audio file
     */
    async deleteAudio(audioId) {
        // Get file path to delete physical file
        const audio = await this.getAudio(audioId);
        
        if (audio && audio.file_path) {
            try {
                if (fs.existsSync(audio.file_path)) {
                    fs.unlinkSync(audio.file_path);
                }
            } catch (error) {
                console.error(`Failed to delete audio file: ${audio.file_path}`, error);
            }
        }
        
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_audio WHERE id = ?', [audioId]);
    }
    
    /**
     * Increment audio usage count
     */
    async incrementAudioUsage(audioId) {
        await db.query(
            'UPDATE yovo_tbl_aiva_ivr_audio SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id = ?',
            [audioId]
        );
    }
    
    // =========================================================================
    // TEMPLATE METHODS
    // =========================================================================
    
    /**
     * List templates for an agent
     */
    async listTemplates(agentId) {
        const [templates] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_templates WHERE agent_id = ? ORDER BY template_name',
            [agentId]
        );
        
        return templates.map(template => this._parseTemplate(template));
    }
    
    /**
     * Get a single template
     */
    async getTemplate(templateId) {
        const [templates] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_templates WHERE id = ?',
            [templateId]
        );
        
        if (templates.length === 0) {
            return null;
        }
        
        return this._parseTemplate(templates[0]);
    }
    
    /**
     * Get template by name
     */
    async getTemplateByName(agentId, templateName) {
        const [templates] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_templates WHERE agent_id = ? AND template_name = ?',
            [agentId, templateName]
        );
        
        if (templates.length === 0) {
            return null;
        }
        
        return this._parseTemplate(templates[0]);
    }
    
    /**
     * Create a template
     */
    async createTemplate(agentId, tenantId, templateData) {
        const templateId = uuidv4();
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_templates (
                id, agent_id, tenant_id,
                template_name, description,
                template_structure, required_variables,
                data_source_function, data_source_function_id,
                prefix_audio_id, suffix_audio_id,
                is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                templateId,
                agentId,
                tenantId,
                templateData.template_name,
                templateData.description || null,
                JSON.stringify(templateData.template_structure),
                JSON.stringify(templateData.required_variables),
                templateData.data_source_function || null,
                templateData.data_source_function_id || null,
                templateData.prefix_audio_id || null,
                templateData.suffix_audio_id || null,
                templateData.is_active !== false ? 1 : 0
            ]
        );
        
        return this.getTemplate(templateId);
    }
    
    /**
     * Update a template
     */
    async updateTemplate(templateId, updates) {
        const allowedFields = [
            'template_name', 'description',
            'template_structure', 'required_variables',
            'data_source_function', 'data_source_function_id',
            'prefix_audio_id', 'suffix_audio_id',
            'is_active'
        ];
        
        const jsonFields = ['template_structure', 'required_variables'];
        
        const fields = [];
        const values = [];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = ?`);
                if (jsonFields.includes(field)) {
                    values.push(JSON.stringify(updates[field]));
                } else {
                    values.push(updates[field]);
                }
            }
        }
        
        if (fields.length === 0) {
            return this.getTemplate(templateId);
        }
        
        values.push(templateId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_templates SET ${fields.join(', ')} WHERE id = ?`,
            values
        );
        
        return this.getTemplate(templateId);
    }
    
    /**
     * Delete a template
     */
    async deleteTemplate(templateId) {
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_templates WHERE id = ?', [templateId]);
    }
    
    // =========================================================================
    // SEGMENT METHODS
    // =========================================================================
    
    /**
     * List segments for an agent
     */
    async listSegments(agentId) {
        const [segments] = await db.query(
            `SELECT s.*, a.file_path as audio_path, a.duration_ms as audio_duration
             FROM yovo_tbl_aiva_ivr_segments s
             LEFT JOIN yovo_tbl_aiva_ivr_audio a ON s.audio_id = a.id
             WHERE s.agent_id = ?
             ORDER BY s.segment_key`,
            [agentId]
        );
        
        return segments.map(segment => this._parseSegment(segment));
    }
    
    /**
     * Get segment by key
     */
    async getSegmentByKey(agentId, segmentKey) {
        const [segments] = await db.query(
            `SELECT s.*, a.file_path as audio_path, a.duration_ms as audio_duration
             FROM yovo_tbl_aiva_ivr_segments s
             LEFT JOIN yovo_tbl_aiva_ivr_audio a ON s.audio_id = a.id
             WHERE s.agent_id = ? AND s.segment_key = ?`,
            [agentId, segmentKey]
        );
        
        if (segments.length === 0) {
            return null;
        }
        
        return this._parseSegment(segments[0]);
    }
    
    /**
     * Create or update a segment
     */
    async upsertSegment(agentId, tenantId, segmentData) {
        const existing = await this.getSegmentByKey(agentId, segmentData.segment_key);
        
        if (existing) {
            // Update
            await db.query(
                `UPDATE yovo_tbl_aiva_ivr_segments SET
                    segment_type = ?, text_content = ?, audio_id = ?, audio_source = ?, language = ?, duration_ms = ?
                 WHERE id = ?`,
                [
                    segmentData.segment_type,
                    segmentData.text_content,
                    segmentData.audio_id || null,
                    segmentData.audio_source || 'generated',
                    segmentData.language || 'ur',
                    segmentData.duration_ms || null,
                    existing.id
                ]
            );
            return this.getSegmentByKey(agentId, segmentData.segment_key);
        } else {
            // Insert
            const segmentId = uuidv4();
            
            await db.query(
                `INSERT INTO yovo_tbl_aiva_ivr_segments (
                    id, agent_id, tenant_id,
                    segment_key, segment_type, text_content, audio_id, audio_source, language, duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    segmentId,
                    agentId,
                    tenantId,
                    segmentData.segment_key,
                    segmentData.segment_type,
                    segmentData.text_content,
                    segmentData.audio_id || null,
                    segmentData.audio_source || 'generated',
                    segmentData.language || 'ur',
                    segmentData.duration_ms || null
                ]
            );
            
            return this.getSegmentByKey(agentId, segmentData.segment_key);
        }
    }
    
    /**
     * Delete a segment
     */
    async deleteSegment(agentId, segmentKey) {
        await db.query(
            'DELETE FROM yovo_tbl_aiva_ivr_segments WHERE agent_id = ? AND segment_key = ?',
            [agentId, segmentKey]
        );
    }
    
    // =========================================================================
    // CACHE METHODS
    // =========================================================================
    
    /**
     * Get cached response by text hash
     */
    async getCachedResponse(agentId, responseText) {
        const cacheKey = this._generateCacheKey(responseText);
        
        const [cached] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_response_cache 
             WHERE agent_id = ? AND cache_key = ?
             AND (expires_at IS NULL OR expires_at > NOW())`,
            [agentId, cacheKey]
        );
        
        if (cached.length === 0) {
            return null;
        }
        
        // Update hit count
        await db.query(
            'UPDATE yovo_tbl_aiva_ivr_response_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = ?',
            [cached[0].id]
        );
        
        return cached[0];
    }
    
    /**
     * Cache a response
     */
    async cacheResponse(agentId, tenantId, responseText, audioFilePath, metadata = {}) {
        const cacheId = uuidv4();
        const cacheKey = this._generateCacheKey(responseText);
        const normalized = this._normalizeText(responseText);
        
        // Calculate expiry
        const config = await this.getConfig(agentId);
        const ttlDays = config?.cache_ttl_days || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + ttlDays);
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_response_cache (
                id, agent_id, tenant_id,
                cache_key, response_text, response_text_normalized,
                intent_id, audio_file_path, audio_format, duration_ms, file_size_bytes,
                tts_provider, tts_voice, tts_cost,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                audio_file_path = VALUES(audio_file_path),
                duration_ms = VALUES(duration_ms),
                file_size_bytes = VALUES(file_size_bytes),
                hit_count = hit_count + 1,
                last_used_at = NOW()`,
            [
                cacheId,
                agentId,
                tenantId,
                cacheKey,
                responseText,
                normalized,
                metadata.intent_id || null,
                audioFilePath,
                metadata.audio_format || 'mulaw_8000',
                metadata.duration_ms || null,
                metadata.file_size_bytes || null,
                metadata.tts_provider || null,
                metadata.tts_voice || null,
                metadata.tts_cost || null,
                expiresAt
            ]
        );
        
        return { cache_key: cacheKey, expires_at: expiresAt };
    }
    
    /**
     * Get cached variable audio
     */
    async getCachedVariable(agentId, variableType, variableValue) {
        const normalized = this._normalizeText(variableValue);
        
        const [cached] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_variable_cache 
             WHERE agent_id = ? AND variable_type = ? AND variable_value_normalized = ?
             AND (expires_at IS NULL OR expires_at > NOW())`,
            [agentId, variableType, normalized]
        );
        
        if (cached.length === 0) {
            return null;
        }
        
        // Update hit count
        await db.query(
            'UPDATE yovo_tbl_aiva_ivr_variable_cache SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = ?',
            [cached[0].id]
        );
        
        return cached[0];
    }
    
    /**
     * Cache a variable
     */
    async cacheVariable(agentId, tenantId, variableType, variableValue, audioFilePath, metadata = {}) {
        const cacheId = uuidv4();
        const normalized = this._normalizeText(variableValue);
        
        // Calculate expiry
        const config = await this.getConfig(agentId);
        const ttlDays = config?.cache_ttl_days || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + ttlDays);
        
        await db.query(
            `INSERT INTO yovo_tbl_aiva_ivr_variable_cache (
                id, agent_id, tenant_id,
                variable_type, variable_value, variable_value_normalized,
                audio_file_path, audio_format, duration_ms, file_size_bytes,
                tts_provider, tts_voice, tts_cost,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                audio_file_path = VALUES(audio_file_path),
                duration_ms = VALUES(duration_ms),
                file_size_bytes = VALUES(file_size_bytes),
                hit_count = hit_count + 1,
                last_used_at = NOW()`,
            [
                cacheId,
                agentId,
                tenantId,
                variableType,
                variableValue,
                normalized,
                audioFilePath,
                metadata.audio_format || 'mulaw_8000',
                metadata.duration_ms || null,
                metadata.file_size_bytes || null,
                metadata.tts_provider || null,
                metadata.tts_voice || null,
                metadata.tts_cost || null,
                expiresAt
            ]
        );
        
        return { variable_type: variableType, variable_value: variableValue, expires_at: expiresAt };
    }
    
    /**
     * Get cache statistics
     */
    async getCacheStats(agentId) {
        const [responseStats] = await db.query(
            `SELECT 
                COUNT(*) as total_entries,
                SUM(hit_count) as total_hits,
                SUM(file_size_bytes) as total_size_bytes,
                SUM(tts_cost) as total_tts_cost
             FROM yovo_tbl_aiva_ivr_response_cache
             WHERE agent_id = ?`,
            [agentId]
        );
        
        const [variableStats] = await db.query(
            `SELECT 
                COUNT(*) as total_entries,
                SUM(hit_count) as total_hits,
                SUM(file_size_bytes) as total_size_bytes,
                SUM(tts_cost) as total_tts_cost
             FROM yovo_tbl_aiva_ivr_variable_cache
             WHERE agent_id = ?`,
            [agentId]
        );
        
        const responseData = responseStats[0];
        const variableData = variableStats[0];
        
        // Estimate cost saved (hits * average TTS cost)
        const avgTTSCostPerResponse = 0.003; // ~$0.003 per response
        const avgTTSCostPerVariable = 0.0005; // ~$0.0005 per variable
        
        const responseCostSaved = (responseData.total_hits || 0) * avgTTSCostPerResponse;
        const variableCostSaved = (variableData.total_hits || 0) * avgTTSCostPerVariable;
        
        return {
            response_cache: {
                total_entries: parseInt(responseData.total_entries) || 0,
                total_hits: parseInt(responseData.total_hits) || 0,
                total_size_mb: ((responseData.total_size_bytes || 0) / 1024 / 1024).toFixed(2),
                total_tts_cost: parseFloat(responseData.total_tts_cost) || 0,
                cost_saved: responseCostSaved
            },
            variable_cache: {
                total_entries: parseInt(variableData.total_entries) || 0,
                total_hits: parseInt(variableData.total_hits) || 0,
                total_size_mb: ((variableData.total_size_bytes || 0) / 1024 / 1024).toFixed(2),
                total_tts_cost: parseFloat(variableData.total_tts_cost) || 0,
                cost_saved: variableCostSaved
            },
            total_cost_saved: responseCostSaved + variableCostSaved
        };
    }
    
    /**
     * Clear expired cache entries
     */
    async clearExpiredCache(agentId = null) {
        let responseQuery = 'DELETE FROM yovo_tbl_aiva_ivr_response_cache WHERE expires_at < NOW() AND is_pinned = 0';
        let variableQuery = 'DELETE FROM yovo_tbl_aiva_ivr_variable_cache WHERE expires_at < NOW() AND is_pinned = 0';
        const params = [];
        
        if (agentId) {
            responseQuery += ' AND agent_id = ?';
            variableQuery += ' AND agent_id = ?';
            params.push(agentId);
        }
        
        const [responseResult] = await db.query(responseQuery, params);
        const [variableResult] = await db.query(variableQuery, params);
        
        return {
            response_entries_deleted: responseResult.affectedRows,
            variable_entries_deleted: variableResult.affectedRows
        };
    }
    
    /**
     * Clear all cache for an agent
     */
    async clearAllCache(agentId) {
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_response_cache WHERE agent_id = ?', [agentId]);
        await db.query('DELETE FROM yovo_tbl_aiva_ivr_variable_cache WHERE agent_id = ?', [agentId]);
    }
    
    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    
    _parseConfig(config) {
        return {
            ...config,
            language_hints: this._parseJSON(config.language_hints, ['ur', 'en']),
            enable_response_cache: config.enable_response_cache === 1,
            enable_variable_cache: config.enable_variable_cache === 1,
            enable_kb_lookup: config.enable_kb_lookup === 1
        };
    }
    
    _parseIntent(intent) {
        return {
            ...intent,
            // Map database column names to API-friendly names
            name: intent.intent_name,
            type: intent.intent_type,
            trigger_phrases: this._parseJSON(intent.trigger_phrases, []),
            trigger_keywords: this._parseJSON(intent.trigger_keywords, null),
            action_config: this._parseJSON(intent.action_config, null),
            collect_input_config: this._parseJSON(intent.collect_input_config, null),
            is_active: intent.is_active === 1,
            auto_regenerate: intent.auto_regenerate === 1
        };
    }
    
    _parseAudio(audio) {
        return {
            ...audio,
            tags: this._parseJSON(audio.tags, [])
        };
    }
    
    _parseTemplate(template) {
        return {
            ...template,
            template_structure: this._parseJSON(template.template_structure, []),
            required_variables: this._parseJSON(template.required_variables, []),
            is_active: template.is_active === 1
        };
    }
    
    _parseSegment(segment) {
        return {
            ...segment
        };
    }
    
    _parseJSON(value, defaultValue) {
        if (value === null || value === undefined) {
            return defaultValue;
        }
        if (typeof value === 'object') {
            return value;
        }
        try {
            return JSON.parse(value);
        } catch (e) {
            return defaultValue;
        }
    }
    
    _generateCacheKey(text) {
        const normalized = this._normalizeText(text);
        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 64);
    }
    
    _normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\u0600-\u06FF]/g, ''); // Keep alphanumeric and Urdu characters
    }
    
    // =========================================================================
    // RESPONSE CACHE METHODS
    // =========================================================================
    
    /**
     * Get cached audio response by cache key
     */
    async getCachedResponse(agentId, cacheKey) {
        const redisKey = `ivr_audio_cache:${agentId}:${cacheKey}`;
        
        try {
            const cached = await redisClient.get(redisKey);
            if (cached) {
                const data = JSON.parse(cached);
                return {
                    audio_data: data.audio_data,
                    text: data.text,
                    created_at: data.created_at
                };
            }
        } catch (error) {
            console.warn('[IVRService] Cache get error:', error.message);
        }
        
        return null;
    }
    
    /**
     * Save audio response to cache
     */
    async setCachedResponse(agentId, cacheKey, audioData, text, ttlDays = 30) {
        const redisKey = `ivr_audio_cache:${agentId}:${cacheKey}`;
        const ttlSeconds = ttlDays * 24 * 60 * 60;
        
        try {
            const data = {
                audio_data: audioData, // base64 string
                text: text,
                created_at: new Date().toISOString()
            };
            
            await redisClient.setEx(redisKey, ttlSeconds, JSON.stringify(data));
            console.log('[IVRService] Cached response:', cacheKey.substring(0, 50), `(TTL: ${ttlDays} days)`);
            return true;
        } catch (error) {
            console.error('[IVRService] Cache set error:', error.message);
            return false;
        }
    }
    
    /**
     * Delete cached response
     */
    async deleteCachedResponse(agentId, cacheKey) {
        const redisKey = `ivr_audio_cache:${agentId}:${cacheKey}`;
        
        try {
            await redisClient.del(redisKey);
            return true;
        } catch (error) {
            console.error('[IVRService] Cache delete error:', error.message);
            return false;
        }
    }
    
    /**
     * Clear all cached responses for an agent
     */
    async clearAgentCache(agentId) {
        const pattern = `ivr_audio_cache:${agentId}:*`;
        
        try {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(...keys);
                console.log('[IVRService] Cleared', keys.length, 'cached responses for agent:', agentId);
            }
            return keys.length;
        } catch (error) {
            console.error('[IVRService] Cache clear error:', error.message);
            return 0;
        }
    }
	
    // =========================================================================
    // I18N CONTENT METHODS
    // =========================================================================
    
    /**
     * Get all i18n content for an entity
     **/
    async getI18nContent(entityType, entityId) {
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_i18n_content
            WHERE entity_type = ? AND entity_id = ?
        `, [entityType, entityId]);
        
        // Group by field and language
        const content = {};
        for (const row of rows) {
            if (!content[row.field_name]) {
                content[row.field_name] = {};
            }
            content[row.field_name][row.language_code] = {
                text_content: row.text_content,
                audio_id: row.audio_id,
                template_id: row.template_id
            };
        }
        
        return content;
    }
    
    /**
     * Set i18n content for an entity field
     **/
    async setI18nContent(agentId, entityType, entityId, fieldName, languageCode, data) {
        const id = uuidv4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_i18n_content 
            (id, agent_id, entity_type, entity_id, field_name, language_code, text_content, audio_id, template_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text_content = VALUES(text_content),
                audio_id = VALUES(audio_id),
                template_id = VALUES(template_id),
                updated_at = CURRENT_TIMESTAMP
        `, [
            id,
            agentId,
            entityType,
            entityId,
            fieldName,
            languageCode,
            data.text_content || null,
            data.audio_id || null,
            data.template_id || null
        ]);
    }
    
    /**
     * Delete i18n content for an entity
     **/
    async deleteI18nContent(entityType, entityId, fieldName = null, languageCode = null) {
        let query = `DELETE FROM yovo_tbl_aiva_ivr_i18n_content WHERE entity_type = ? AND entity_id = ?`;
        const params = [entityType, entityId];
        
        if (fieldName) {
            query += ` AND field_name = ?`;
            params.push(fieldName);
        }
        
        if (languageCode) {
            query += ` AND language_code = ?`;
            params.push(languageCode);
        }
        
        await db.query(query, params);
    }
}

module.exports = new IVRService();