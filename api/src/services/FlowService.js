/**
 * Flow Service
 * CRUD operations for IVR Conversation Flows with multi-language support
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class FlowService {
    
    // ========================================================================
    // FLOW CRUD
    // ========================================================================
    
    /**
     * List all flows for an agent
     */
    static async listFlows(agentId, includeInactive = false) {
        let query = `
            SELECT 
                f.*,
                COUNT(DISTINCT s.id) AS step_count,
                COUNT(DISTINCT sess.id) AS total_sessions,
                SUM(CASE WHEN sess.status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions
            FROM yovo_tbl_aiva_ivr_flows f
            LEFT JOIN yovo_tbl_aiva_ivr_flow_steps s ON f.id = s.flow_id
            LEFT JOIN yovo_tbl_aiva_ivr_flow_sessions sess ON f.id = sess.flow_id
            WHERE f.agent_id = ?
        `;
        
        if (!includeInactive) {
            query += ` AND f.is_active = 1`;
        }
        
        query += ` GROUP BY f.id ORDER BY f.created_at DESC`;
        
        const [flows] = await db.query(query, [agentId]);
        
        // Parse JSON fields
        for (const flow of flows) {
            this._parseJsonFields(flow);
        }
        
        return flows;
    }
    
    /**
     * Get a flow by ID with steps
     */
    static async getFlow(flowId, includeSteps = true) {
        const [flows] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_flows WHERE id = ?`,
            [flowId]
        );
        
        if (flows.length === 0) {
            return null;
        }
        
        const flow = flows[0];
        this._parseJsonFields(flow);
        
        if (includeSteps) {
            flow.steps = await this.getFlowSteps(flowId);
        }
        
        return flow;
    }
    
    /**
     * Get flow by key
     */
    static async getFlowByKey(agentId, flowKey) {
        const [flows] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_flows WHERE agent_id = ? AND flow_key = ? AND is_active = 1`,
            [agentId, flowKey]
        );
        
        if (flows.length === 0) {
            return null;
        }
        
        const flow = flows[0];
        this._parseJsonFields(flow);
        flow.steps = await this.getFlowSteps(flow.id);
        
        return flow;
    }
    
    /**
     * Create a new flow
     */
    static async createFlow(agentId, tenantId, data) {
        const id = uuidv4();
        
        // Check for duplicate key
        const [existing] = await db.query(
            `SELECT id FROM yovo_tbl_aiva_ivr_flows WHERE agent_id = ? AND flow_key = ?`,
            [agentId, data.flow_key]
        );
        
        if (existing.length > 0) {
            throw new Error(`Flow with key "${data.flow_key}" already exists`);
        }
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_flows (
                id, agent_id, tenant_id, flow_name, flow_key, description,
                trigger_phrases, intro_text, intro_audio_id,
                on_complete_action, on_complete_function_name, on_complete_function_id,
                on_complete_args_mapping, on_complete_response_text, on_complete_audio_id,
                on_complete_template_id, on_complete_transfer_queue,
                send_whatsapp_on_complete, whatsapp_template_name,
                cancel_phrases, on_cancel_response_text, on_cancel_audio_id,
                on_timeout_text, on_timeout_audio_id, on_timeout_action,
                ask_anything_else, anything_else_text, anything_else_audio_id,
                closing_text, closing_audio_id,
                on_error_text, on_error_audio_id, on_error_transfer_queue,
                step_timeout_seconds, max_retries_per_step, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            agentId,
            tenantId,
            data.flow_name,
            data.flow_key,
            data.description || null,
            JSON.stringify(data.trigger_phrases || []),
            data.intro_text || null,
            data.intro_audio_id || null,
            data.on_complete_action || 'respond',
            data.on_complete_function_name || null,
            data.on_complete_function_id || null,
            JSON.stringify(data.on_complete_args_mapping || {}),
            data.on_complete_response_text || null,
            data.on_complete_audio_id || null,
            data.on_complete_template_id || null,
            data.on_complete_transfer_queue || null,
            data.send_whatsapp_on_complete ? 1 : 0,
            data.whatsapp_template_name || null,
            JSON.stringify(data.cancel_phrases || ['cancel']),
            data.on_cancel_response_text || null,
            data.on_cancel_audio_id || null,
            data.on_timeout_text || null,
            data.on_timeout_audio_id || null,
            data.on_timeout_action || 'retry',
            data.ask_anything_else !== false ? 1 : 0,
            data.anything_else_text || 'Is there anything else I can help you with?',
            data.anything_else_audio_id || null,
            data.closing_text || 'Thank you for calling. Goodbye!',
            data.closing_audio_id || null,
            data.on_error_text || null,
            data.on_error_audio_id || null,
            data.on_error_transfer_queue || null,
            data.step_timeout_seconds || 30,
            data.max_retries_per_step || 3,
            data.is_active !== false ? 1 : 0
        ]);
        
        return this.getFlow(id);
    }
    
    /**
     * Update a flow
     */
    static async updateFlow(flowId, data) {
        const allowedFields = [
            'flow_name', 'flow_key', 'description', 'trigger_phrases',
            // Intro
            'intro_text', 'intro_audio_id',
            // Completion
            'on_complete_action', 'on_complete_function_name', 'on_complete_function_id',
            'on_complete_args_mapping', 'on_complete_response_text', 'on_complete_audio_id',
            'on_complete_template_id', 'on_complete_transfer_queue',
            'send_whatsapp_on_complete', 'whatsapp_template_name',
            // Cancel
            'cancel_phrases', 'on_cancel_response_text', 'on_cancel_audio_id',
            // Timeout (ADDED)
            'on_timeout_text', 'on_timeout_audio_id', 'on_timeout_action',
            // Anything else & Closing
            'ask_anything_else', 'anything_else_text', 'anything_else_audio_id',
            'closing_text', 'closing_audio_id',
            // Error
            'on_error_text', 'on_error_audio_id', 'on_error_transfer_queue',
            // Settings
            'step_timeout_seconds', 'max_retries_per_step', 'is_active'
        ];
        
        const updates = [];
        const params = [];
        
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updates.push(`${field} = ?`);
                
                // Handle JSON fields
                if (['trigger_phrases', 'cancel_phrases', 'on_complete_args_mapping'].includes(field)) {
                    params.push(JSON.stringify(data[field]));
                } else if (['send_whatsapp_on_complete', 'ask_anything_else', 'is_active'].includes(field)) {
                    params.push(data[field] ? 1 : 0);
                } else {
                    params.push(data[field]);
                }
            }
        }
        
        if (updates.length === 0) {
            return this.getFlow(flowId);
        }
        
        params.push(flowId);
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_flows SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
        
        return this.getFlow(flowId);
    }
    
    /**
     * Delete a flow (soft delete)
     */
    static async deleteFlow(flowId) {
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_flows SET is_active = 0 WHERE id = ?`,
            [flowId]
        );
    }
    
    // ========================================================================
    // STEP CRUD
    // ========================================================================
    
    /**
     * Get all steps for a flow
     */
    static async getFlowSteps(flowId) {
        const [steps] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_flow_steps WHERE flow_id = ? ORDER BY step_order`,
            [flowId]
        );
        
        for (const step of steps) {
            this._parseStepJsonFields(step);
        }
        
        return steps;
    }
    
    /**
     * Get a step by ID
     */
    static async getStep(stepId) {
        const [steps] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_flow_steps WHERE id = ?`,
            [stepId]
        );
        
        if (steps.length === 0) {
            return null;
        }
        
        const step = steps[0];
        this._parseStepJsonFields(step);
        return step;
    }
    
	/**
	 * Create a flow step
	 */
	static async createStep(flowId, stepData) {
		const stepId = uuidv4();
		
		// Helper to convert empty strings to null
		const nullIfEmpty = (val) => (val === '' || val === null || val === undefined) ? null : val;
		
		await db.query(`
			INSERT INTO yovo_tbl_aiva_ivr_flow_steps (
				id, flow_id, step_order, step_key, step_name, step_type,
				prompt_text, prompt_audio_id,
				slot_name, slot_type, slot_choices,
				is_required, extraction_hints, extraction_examples,
				validation_regex, validation_min_length, validation_max_length,
				validation_min_value, validation_max_value, custom_validation_prompt,
				requires_confirmation, confirm_template, confirm_audio_id, confirm_slot,
				on_invalid_text, on_invalid_audio_id,
				on_empty_text, on_empty_audio_id,
				retry_prompt_text, retry_prompt_audio_id, retry_limit,
				on_retry_exceeded, on_retry_exceeded_transfer_queue, default_value,
				branch_on_slot, branch_conditions,
				function_id, function_name, function_args_mapping, store_result_as,
				transfer_queue, transfer_audio_id,
				response_template, response_audio_id,
				next_step_key, is_terminal, skip_if_slot_filled, skip_condition
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, [
			stepId,
			flowId,
			stepData.step_order || 1,
			stepData.step_key,
			stepData.step_name || null,
			stepData.step_type || 'collect_slot',
			stepData.prompt_text || '',
			nullIfEmpty(stepData.prompt_audio_id),
			stepData.slot_name || null,
			stepData.slot_type || 'freeform',
			stepData.slot_choices ? JSON.stringify(stepData.slot_choices) : null,
			stepData.is_required !== false ? 1 : 0,
			stepData.extraction_hints || null,
			stepData.extraction_examples ? JSON.stringify(stepData.extraction_examples) : null,
			stepData.validation_regex || null,
			stepData.validation_min_length || null,
			stepData.validation_max_length || null,
			stepData.validation_min_value || null,
			stepData.validation_max_value || null,
			stepData.custom_validation_prompt || null,
			stepData.requires_confirmation ? 1 : 0,
			stepData.confirm_template || null,
			nullIfEmpty(stepData.confirm_audio_id),
			stepData.confirm_slot || null,
			stepData.on_invalid_text || null,
			nullIfEmpty(stepData.on_invalid_audio_id),
			stepData.on_empty_text || null,
			nullIfEmpty(stepData.on_empty_audio_id),
			stepData.retry_prompt_text || null,
			nullIfEmpty(stepData.retry_prompt_audio_id),
			stepData.retry_limit || 3,
			stepData.on_retry_exceeded || 'transfer',
			stepData.on_retry_exceeded_transfer_queue || null,
			stepData.default_value || null,
			stepData.branch_on_slot || null,
			stepData.branch_conditions ? JSON.stringify(stepData.branch_conditions) : null,
			nullIfEmpty(stepData.function_id),
			stepData.function_name || null,
			stepData.function_args_mapping ? JSON.stringify(stepData.function_args_mapping) : null,
			stepData.store_result_as || null,
			stepData.transfer_queue || null,
			nullIfEmpty(stepData.transfer_audio_id),
			stepData.response_template || stepData.response_text || null,
			nullIfEmpty(stepData.response_audio_id),
			stepData.next_step_key || null,
			stepData.is_terminal ? 1 : 0,
			stepData.skip_if_slot_filled || null,
			stepData.skip_condition ? JSON.stringify(stepData.skip_condition) : null
		]);
		
		return this.getStep(stepId);
	}
    
    /**
     * Update a step
     */
    static async updateStep(stepId, stepData) {
        const allowedFields = [
            'step_order', 'step_key', 'step_name', 'step_type',
            'prompt_text', 'prompt_audio_id',
            'slot_name', 'slot_type', 'slot_choices',
            'is_required', 'extraction_hints', 'extraction_examples',
            'validation_regex', 'validation_min_length', 'validation_max_length',
            'validation_min_value', 'validation_max_value', 'custom_validation_prompt',
            'requires_confirmation', 'confirm_template', 'confirm_audio_id', 'confirm_slot',
            'on_invalid_text', 'on_invalid_audio_id',
            'on_empty_text', 'on_empty_audio_id',
            'retry_prompt_text', 'retry_prompt_audio_id', 'retry_limit',
            'on_retry_exceeded', 'on_retry_exceeded_transfer_queue', 'default_value',
            'branch_on_slot', 'branch_conditions',
            'function_id', 'function_name', 'function_args_mapping', 'store_result_as',
            'transfer_queue', 'transfer_audio_id',
            'response_template', 'response_audio_id',
            'next_step_key', 'is_terminal', 'skip_if_slot_filled', 'skip_condition'
        ];
        
        const jsonFields = [
            'slot_choices', 'extraction_examples', 'branch_conditions', 
            'function_args_mapping', 'skip_condition'
        ];
        
        const foreignKeyFields = [
            'prompt_audio_id', 'confirm_audio_id', 'on_invalid_audio_id',
            'on_empty_audio_id', 'retry_prompt_audio_id', 'transfer_audio_id',
            'response_audio_id', 'function_id'
        ];
        
        const updates = [];
        const values = [];
        
        for (const [key, value] of Object.entries(stepData)) {
            if (!allowedFields.includes(key)) continue;
            
            updates.push(`${key} = ?`);
            
            if (jsonFields.includes(key) && value !== null) {
                values.push(typeof value === 'string' ? value : JSON.stringify(value));
            } else if (foreignKeyFields.includes(key)) {
                values.push(value === '' || value === null || value === undefined ? null : value);
            } else if (typeof value === 'boolean') {
                values.push(value ? 1 : 0);
            } else {
                values.push(value);
            }
        }
        
        // Handle response_text -> response_template mapping
        if (stepData.response_text && !stepData.response_template) {
            updates.push('response_template = ?');
            values.push(stepData.response_text);
        }
        
        if (updates.length === 0) {
            return this.getStep(stepId);
        }
        
        values.push(stepId);
        
        await db.query(
            `UPDATE yovo_tbl_aiva_ivr_flow_steps SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
        
        return this.getStep(stepId);
    }
    
    /**
     * Delete a step
     */
    static async deleteStep(stepId) {
        await db.query(
            `DELETE FROM yovo_tbl_aiva_ivr_flow_steps WHERE id = ?`,
            [stepId]
        );
    }
    
    /**
     * Reorder steps
     */
    static async reorderSteps(flowId, stepIds) {
        for (let i = 0; i < stepIds.length; i++) {
            await db.query(
                `UPDATE yovo_tbl_aiva_ivr_flow_steps SET step_order = ? WHERE id = ? AND flow_id = ?`,
                [i + 1, stepIds[i], flowId]
            );
        }
    }
    
	static _parseJsonFields(flow) {
        const jsonFields = ['trigger_phrases', 'cancel_phrases', 'on_complete_args_mapping'];
        
        for (const field of jsonFields) {
            if (flow[field] && typeof flow[field] === 'string') {
                try {
                    flow[field] = JSON.parse(flow[field]);
                } catch (e) {
                    flow[field] = [];
                }
            }
        }
    }
	
	static _parseStepJsonFields(step) {
        const jsonFields = ['allowed_values', 'choice_options', 'branch_conditions', 'function_args', 'transfer_context'];
        
        for (const field of jsonFields) {
            if (step[field] && typeof step[field] === 'string') {
                try {
                    step[field] = JSON.parse(step[field]);
                } catch (e) {
                    step[field] = null;
                }
            }
        }
    }
	
    // ========================================================================
    // I18N CONTENT
    // ========================================================================
    
    /**
     * Set i18n content for a flow or step
     */
    static async setI18nContent(agentId, entityType, entityId, fieldName, languageCode, data) {
        const id = uuidv4();
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_content_i18n 
            (id, agent_id, entity_type, entity_id, field_name, language_code, text_content, audio_id, template_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                text_content = VALUES(text_content),
                audio_id = VALUES(audio_id),
                template_id = VALUES(template_id)
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
     * Get all i18n content for an entity
     */
    static async getI18nContent(entityType, entityId) {
        const [rows] = await db.query(`
            SELECT * FROM yovo_tbl_aiva_ivr_content_i18n
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
     * Delete i18n content
     */
    static async deleteI18nContent(entityType, entityId, fieldName = null, languageCode = null) {
        let query = `DELETE FROM yovo_tbl_aiva_ivr_content_i18n WHERE entity_type = ? AND entity_id = ?`;
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
    
    // ========================================================================
    // HELPERS
    // ========================================================================
    
    static _parseJsonFields(flow) {
        const jsonFields = ['trigger_phrases', 'cancel_phrases', 'on_complete_args_mapping'];
        
        for (const field of jsonFields) {
            if (flow[field] && typeof flow[field] === 'string') {
                try {
                    flow[field] = JSON.parse(flow[field]);
                } catch (e) {
                    flow[field] = [];
                }
            }
        }
    }
    
    static _parseStepJsonFields(step) {
        const jsonFields = ['allowed_values', 'choice_options', 'branch_conditions', 'function_args', 'transfer_context'];
        
        for (const field of jsonFields) {
            if (step[field] && typeof step[field] === 'string') {
                try {
                    step[field] = JSON.parse(step[field]);
                } catch (e) {
                    step[field] = null;
                }
            }
        }
    }
}

module.exports = FlowService;
