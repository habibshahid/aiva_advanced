/**
 * Template Routes
 * API endpoints for managing dynamic audio templates
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const TemplateService = require('../services/TemplateService');
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
// TEMPLATE ENDPOINTS
// ============================================================================

/**
 * GET /api/templates/:agentId
 * List all templates for an agent
 */
router.get('/:agentId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { search, include_global } = req.query;
        
        const templates = await TemplateService.listTemplates(req.params.agentId, {
            search,
            includeGlobal: include_global !== 'false'
        });
        
        res.json({
            success: true,
            data: templates
        });
    } catch (error) {
        console.error('List templates error:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

/**
 * GET /api/templates/:agentId/:templateId
 * Get a single template
 */
router.get('/:agentId/:templateId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const template = await TemplateService.getTemplate(req.params.templateId);
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Get template error:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
});

/**
 * GET /api/templates/:agentId/key/:templateKey
 * Get template by key
 */
router.get('/:agentId/key/:templateKey', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const template = await TemplateService.getTemplateByKey(
            req.params.agentId,
            req.params.templateKey
        );
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Get template by key error:', error);
        res.status(500).json({ error: 'Failed to get template' });
    }
});

/**
 * POST /api/templates/:agentId
 * Create a new template
 */
router.post('/:agentId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { template_name, template_key, description, template_structure, is_global } = req.body;
        
        if (!template_name) {
            return res.status(400).json({ error: 'template_name is required' });
        }
        
        if (!template_key) {
            return res.status(400).json({ error: 'template_key is required' });
        }
        
        if (!template_structure) {
            return res.status(400).json({ error: 'template_structure is required' });
        }
        
        // Validate structure
        const errors = TemplateService.validateStructure(template_structure);
        if (errors.length > 0) {
            return res.status(400).json({ 
                error: 'Invalid template structure',
                details: errors
            });
        }
        
        const template = await TemplateService.createTemplate(
            req.params.agentId,
            req.agent.tenant_id,
            { template_name, template_key, description, template_structure, is_global }
        );
        
        res.status(201).json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Create template error:', error);
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create template' });
    }
});

/**
 * PUT /api/templates/:agentId/:templateId
 * Update a template
 */
router.put('/:agentId/:templateId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        // Validate structure if provided
        if (req.body.template_structure) {
            const errors = TemplateService.validateStructure(req.body.template_structure);
            if (errors.length > 0) {
                return res.status(400).json({ 
                    error: 'Invalid template structure',
                    details: errors
                });
            }
        }
        
        const template = await TemplateService.updateTemplate(req.params.templateId, req.body);
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Update template error:', error);
        res.status(500).json({ error: 'Failed to update template' });
    }
});

/**
 * DELETE /api/templates/:agentId/:templateId
 * Delete a template
 */
router.delete('/:agentId/:templateId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await TemplateService.deleteTemplate(req.params.templateId);
        
        res.json({
            success: true,
            message: 'Template deleted'
        });
    } catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

/**
 * POST /api/templates/:agentId/:templateId/duplicate
 * Duplicate a template
 */
router.post('/:agentId/:templateId/duplicate', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { new_key } = req.body;
        
        const template = await TemplateService.duplicateTemplate(
            req.params.templateId,
            new_key
        );
        
        res.status(201).json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Duplicate template error:', error);
        res.status(500).json({ error: 'Failed to duplicate template' });
    }
});

// ============================================================================
// PREVIEW/RENDER ENDPOINTS
// ============================================================================

/**
 * POST /api/templates/:agentId/:templateId/preview
 * Preview template with sample variables
 */
router.post('/:agentId/:templateId/preview', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { variables, language } = req.body;
        
        const text = await TemplateService.renderText(
            req.params.agentId,
            req.params.templateId,
            variables || {},
            language || 'en'
        );
        
        res.json({
            success: true,
            data: {
                rendered_text: text
            }
        });
    } catch (error) {
        console.error('Preview template error:', error);
        res.status(500).json({ error: 'Failed to preview template' });
    }
});

/**
 * GET /api/templates/:agentId/:templateId/resolved
 * Get template with resolved segments for a language
 */
router.get('/:agentId/:templateId/resolved', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { language } = req.query;
        
        const template = await TemplateService.getResolvedTemplate(
            req.params.agentId,
            req.params.templateId,
            language || 'en'
        );
        
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        
        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        console.error('Get resolved template error:', error);
        res.status(500).json({ error: 'Failed to get resolved template' });
    }
});

// ============================================================================
// VALIDATION ENDPOINT
// ============================================================================

/**
 * POST /api/templates/:agentId/validate
 * Validate template structure
 */
router.post('/:agentId/validate', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { template_structure } = req.body;
        
        if (!template_structure) {
            return res.status(400).json({ error: 'template_structure is required' });
        }
        
        const errors = TemplateService.validateStructure(template_structure);
        
        res.json({
            success: true,
            data: {
                valid: errors.length === 0,
                errors: errors,
                variables: TemplateService.extractVariables(template_structure)
            }
        });
    } catch (error) {
        console.error('Validate template error:', error);
        res.status(500).json({ error: 'Failed to validate template' });
    }
});

module.exports = router;
