/**
 * Template Service
 * Manages audio templates for IVR system
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class TemplateService {
    
    /**
     * List templates for an agent
     */
    static async listTemplates(agentId, options = {}) {
        const { includeInactive = false, search = '' } = options;
        
        let query = `
            SELECT t.*,
                JSON_LENGTH(t.template_structure) AS part_count
            FROM yovo_tbl_aiva_ivr_templates t
            WHERE 1=1
        `;
        const params = [];
        
        if (!includeInactive) {
            query += ` AND t.is_active = 1`;
        }
        
        // Templates are agent-specific (no global templates)
        query += ` AND t.agent_id = ?`;
        params.push(agentId);
        
        if (search) {
            query += ` AND (t.template_name LIKE ? OR t.template_key LIKE ? OR t.description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        query += ` ORDER BY t.template_name`;
        
        const [templates] = await db.query(query, params);
        
        // Parse JSON fields
        for (const template of templates) {
            if (typeof template.template_structure === 'string') {
                template.template_structure = JSON.parse(template.template_structure);
            }
            if (typeof template.required_variables === 'string') {
                template.required_variables = JSON.parse(template.required_variables);
            }
        }
        
        return templates;
    }
    
    /**
     * Get a template by ID
     */
    static async getTemplate(templateId) {
        const [templates] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_templates WHERE id = ?`,
            [templateId]
        );
        
        if (templates.length === 0) {
            return null;
        }
        
        const template = templates[0];
        
        // Parse JSON fields
        if (typeof template.template_structure === 'string') {
            template.template_structure = JSON.parse(template.template_structure);
        }
        if (typeof template.required_variables === 'string') {
            template.required_variables = JSON.parse(template.required_variables);
        }
        
        return template;
    }
    
    /**
     * Get a template by key
     */
    static async getTemplateByKey(agentId, templateKey) {
        const [templates] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_ivr_templates 
             WHERE agent_id = ? AND template_key = ? AND is_active = 1`,
            [agentId, templateKey]
        );
        
        if (templates.length === 0) {
            return null;
        }
        
        const template = templates[0];
        
        // Parse JSON fields
        if (typeof template.template_structure === 'string') {
            template.template_structure = JSON.parse(template.template_structure);
        }
        if (typeof template.required_variables === 'string') {
            template.required_variables = JSON.parse(template.required_variables);
        }
        
        return template;
    }
    
    /**
     * Create a new template
     */
    static async createTemplate(agentId, tenantId, data) {
        const id = uuidv4();
        
        // Extract required variables from structure
        const requiredVariables = this.extractVariables(data.template_structure || []);
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_templates 
            (id, agent_id, tenant_id, template_name, template_key, description, 
             template_structure, required_variables, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            agentId,
            tenantId,
            data.template_name,
            data.template_key,
            data.description || null,
            JSON.stringify(data.template_structure || []),
            JSON.stringify(requiredVariables),
            data.is_active !== false ? 1 : 0
        ]);
        
        return this.getTemplate(id);
    }
    
    /**
     * Update a template
     */
    static async updateTemplate(templateId, data) {
        const updates = [];
        const params = [];
        
        if (data.template_name !== undefined) {
            updates.push('template_name = ?');
            params.push(data.template_name);
        }
        
        if (data.template_key !== undefined) {
            updates.push('template_key = ?');
            params.push(data.template_key);
        }
        
        if (data.description !== undefined) {
            updates.push('description = ?');
            params.push(data.description);
        }
        
        if (data.template_structure !== undefined) {
            updates.push('template_structure = ?');
            params.push(JSON.stringify(data.template_structure));
            
            // Update required variables
            const requiredVariables = this.extractVariables(data.template_structure);
            updates.push('required_variables = ?');
            params.push(JSON.stringify(requiredVariables));
        }
        
        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(data.is_active ? 1 : 0);
        }
        
        if (updates.length === 0) {
            return this.getTemplate(templateId);
        }
        
        params.push(templateId);
        
        await db.query(`
            UPDATE yovo_tbl_aiva_ivr_templates 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, params);
        
        return this.getTemplate(templateId);
    }
    
    /**
     * Delete a template
     */
    static async deleteTemplate(templateId) {
        await db.query(
            `DELETE FROM yovo_tbl_aiva_ivr_templates WHERE id = ?`,
            [templateId]
        );
        
        return true;
    }
    
    /**
     * Duplicate a template
     */
    static async duplicateTemplate(templateId, newKey = null) {
        const original = await this.getTemplate(templateId);
        
        if (!original) {
            throw new Error('Template not found');
        }
        
        const id = uuidv4();
        const key = newKey || `${original.template_key}_copy`;
        const name = `${original.template_name} (Copy)`;
        
        await db.query(`
            INSERT INTO yovo_tbl_aiva_ivr_templates 
            (id, agent_id, tenant_id, template_name, template_key, description, 
             template_structure, required_variables, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            original.agent_id,
            original.tenant_id,
            name,
            key,
            original.description,
            JSON.stringify(original.template_structure),
            JSON.stringify(original.required_variables),
            1
        ]);
        
        return this.getTemplate(id);
    }
    
    /**
     * Extract variable names from template structure
     */
    static extractVariables(structure) {
        const variables = new Set();
        
        for (const part of structure) {
            if (part.type === 'variable' && part.variable_name) {
                variables.add(part.variable_name);
            }
        }
        
        return Array.from(variables);
    }
    
    /**
     * Validate template structure
     */
    static validateStructure(structure) {
        if (!Array.isArray(structure)) {
            return { valid: false, error: 'Structure must be an array' };
        }
        
        if (structure.length === 0) {
            return { valid: false, error: 'Structure cannot be empty' };
        }
        
        const validTypes = ['segment', 'variable', 'text'];
        
        for (let i = 0; i < structure.length; i++) {
            const part = structure[i];
            
            if (!part.type || !validTypes.includes(part.type)) {
                return { 
                    valid: false, 
                    error: `Invalid type at position ${i}: ${part.type}` 
                };
            }
            
            if (part.type === 'segment' && !part.segment_key) {
                return { 
                    valid: false, 
                    error: `Missing segment_key at position ${i}` 
                };
            }
            
            if (part.type === 'variable' && !part.variable_name) {
                return { 
                    valid: false, 
                    error: `Missing variable_name at position ${i}` 
                };
            }
            
            if (part.type === 'text' && !part.text) {
                return { 
                    valid: false, 
                    error: `Missing text at position ${i}` 
                };
            }
        }
        
        return { valid: true };
    }
    
    /**
     * Preview template with sample variables
     */
    static async previewTemplate(templateId, variables = {}, language = 'en') {
        const template = await this.getTemplate(templateId);
        
        if (!template) {
            return null;
        }
        
        const SegmentService = require('./SegmentService');
        const parts = [];
        
        for (const part of template.template_structure) {
            if (part.type === 'segment') {
                const content = await SegmentService.getSegmentContent(
                    template.agent_id,
                    part.segment_key,
                    language
                );
                parts.push({
                    type: 'segment',
                    segment_key: part.segment_key,
                    text: content?.text_content || `[${part.segment_key}]`,
                    audio_url: content?.audio_url
                });
            } else if (part.type === 'variable') {
                const value = variables[part.variable_name] || `{${part.variable_name}}`;
                parts.push({
                    type: 'variable',
                    variable_name: part.variable_name,
                    text: String(value)
                });
            } else if (part.type === 'text') {
                parts.push({
                    type: 'text',
                    text: part.text
                });
            }
        }
        
        return {
            template_id: template.id,
            template_name: template.template_name,
            language,
            parts,
            full_text: parts.map(p => p.text).join(' ')
        };
    }
    
    /**
     * Get resolved template content for a language
     */
    static async getResolvedTemplate(templateId, language = 'en') {
        const template = await this.getTemplate(templateId);
        
        if (!template) {
            return null;
        }
        
        const SegmentService = require('./SegmentService');
        const resolvedParts = [];
        let hasAudio = true;
        
        for (const part of template.template_structure) {
            if (part.type === 'segment') {
                const content = await SegmentService.getSegmentContent(
                    template.agent_id,
                    part.segment_key,
                    language
                );
                
                resolvedParts.push({
                    type: 'segment',
                    segment_key: part.segment_key,
                    text: content?.text_content || null,
                    audio_url: content?.audio_url || null,
                    audio_id: content?.audio_id || null
                });
                
                if (!content?.audio_url) {
                    hasAudio = false;
                }
            } else {
                resolvedParts.push(part);
                // Variables and text will need TTS
                hasAudio = false;
            }
        }
        
        return {
            template,
            language,
            parts: resolvedParts,
            has_audio: hasAudio
        };
    }
}

module.exports = TemplateService;