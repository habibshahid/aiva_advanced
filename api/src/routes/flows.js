/**
 * Flow Routes
 * API endpoints for managing conversation flows
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const FlowService = require('../services/FlowService');
const db = require('../config/database');

// Authentication middleware
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
// FLOW ENDPOINTS
// ============================================================================

/**
 * GET /api/flows/:agentId
 * List all flows for an agent
 */
router.get('/:agentId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const { include_inactive } = req.query;
        
        const flows = await FlowService.listFlows(
            req.params.agentId,
            include_inactive === 'true'
        );
        
        res.json({
            success: true,
            data: flows
        });
    } catch (error) {
        console.error('List flows error:', error);
        res.status(500).json({ error: 'Failed to list flows' });
    }
});

/**
 * GET /api/flows/:agentId/:flowId
 * Get a single flow with steps
 */
router.get('/:agentId/:flowId', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const flow = await FlowService.getFlow(req.params.flowId, true);
        
        if (!flow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        res.json({
            success: true,
            data: flow
        });
    } catch (error) {
        console.error('Get flow error:', error);
        res.status(500).json({ error: 'Failed to get flow' });
    }
});

/**
 * POST /api/flows/:agentId
 * Create a new flow
 */
router.post('/:agentId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const flow = await FlowService.createFlow(
            req.params.agentId,
            req.agent.tenant_id,
            req.body
        );
        
        res.status(201).json({
            success: true,
            data: flow
        });
    } catch (error) {
        console.error('Create flow error:', error);
        if (error.message.includes('already exists')) {
            return res.status(409).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create flow' });
    }
});

/**
 * PUT /api/flows/:agentId/:flowId
 * Update a flow
 */
router.put('/:agentId/:flowId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const flow = await FlowService.updateFlow(req.params.flowId, req.body);
        
        if (!flow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        res.json({
            success: true,
            data: flow
        });
    } catch (error) {
        console.error('Update flow error:', error);
        res.status(500).json({ error: 'Failed to update flow' });
    }
});

/**
 * DELETE /api/flows/:agentId/:flowId
 * Delete a flow (soft delete)
 */
router.delete('/:agentId/:flowId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await FlowService.deleteFlow(req.params.flowId);
        
        res.json({
            success: true,
            message: 'Flow deleted'
        });
    } catch (error) {
        console.error('Delete flow error:', error);
        res.status(500).json({ error: 'Failed to delete flow' });
    }
});

/**
 * POST /api/flows/:agentId/:flowId/duplicate
 * Duplicate a flow
 */
router.post('/:agentId/:flowId/duplicate', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const originalFlow = await FlowService.getFlow(req.params.flowId, true);
        
        if (!originalFlow) {
            return res.status(404).json({ error: 'Flow not found' });
        }
        
        // Create new flow with modified key
        const newFlowData = {
            ...originalFlow,
            flow_name: `${originalFlow.flow_name} (Copy)`,
            flow_key: `${originalFlow.flow_key}_copy_${Date.now()}`,
            is_active: false
        };
        delete newFlowData.id;
        delete newFlowData.steps;
        delete newFlowData.created_at;
        delete newFlowData.updated_at;
        
        const newFlow = await FlowService.createFlow(
            req.params.agentId,
            req.agent.tenant_id,
            newFlowData
        );
        
        // Copy steps
        for (const step of originalFlow.steps || []) {
            const stepData = { ...step };
            delete stepData.id;
            delete stepData.flow_id;
            delete stepData.created_at;
            delete stepData.updated_at;
            
            await FlowService.createStep(newFlow.id, stepData);
        }
        
        const result = await FlowService.getFlow(newFlow.id, true);
        
        res.status(201).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Duplicate flow error:', error);
        res.status(500).json({ error: 'Failed to duplicate flow' });
    }
});

// ============================================================================
// STEP ENDPOINTS
// ============================================================================

/**
 * GET /api/flows/:agentId/:flowId/steps
 * Get all steps for a flow
 */
router.get('/:agentId/:flowId/steps', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const steps = await FlowService.getFlowSteps(req.params.flowId);
        
        res.json({
            success: true,
            data: steps
        });
    } catch (error) {
        console.error('Get steps error:', error);
        res.status(500).json({ error: 'Failed to get steps' });
    }
});

/**
 * POST /api/flows/:agentId/:flowId/steps
 * Create a new step
 */
router.post('/:agentId/:flowId/steps', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const step = await FlowService.createStep(req.params.flowId, req.body);
        
        res.status(201).json({
            success: true,
            data: step
        });
    } catch (error) {
        console.error('Create step error:', error);
        res.status(500).json({ error: 'Failed to create step' });
    }
});

/**
 * PUT /api/flows/:agentId/:flowId/steps/:stepId
 * Update a step
 */
router.put('/:agentId/:flowId/steps/:stepId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const step = await FlowService.updateStep(req.params.stepId, req.body);
        
        if (!step) {
            return res.status(404).json({ error: 'Step not found' });
        }
        
        res.json({
            success: true,
            data: step
        });
    } catch (error) {
        console.error('Update step error:', error);
        res.status(500).json({ error: 'Failed to update step' });
    }
});

/**
 * DELETE /api/flows/:agentId/:flowId/steps/:stepId
 * Delete a step
 */
router.delete('/:agentId/:flowId/steps/:stepId', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await FlowService.deleteStep(req.params.stepId);
        
        res.json({
            success: true,
            message: 'Step deleted'
        });
    } catch (error) {
        console.error('Delete step error:', error);
        res.status(500).json({ error: 'Failed to delete step' });
    }
});

/**
 * POST /api/flows/:agentId/:flowId/steps/reorder
 * Reorder steps
 */
router.post('/:agentId/:flowId/steps/reorder', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        const { step_ids } = req.body;
        
        if (!step_ids || !Array.isArray(step_ids)) {
            return res.status(400).json({ error: 'step_ids array required' });
        }
        
        await FlowService.reorderSteps(req.params.flowId, step_ids);
        
        const steps = await FlowService.getFlowSteps(req.params.flowId);
        
        res.json({
            success: true,
            data: steps
        });
    } catch (error) {
        console.error('Reorder steps error:', error);
        res.status(500).json({ error: 'Failed to reorder steps' });
    }
});

// ============================================================================
// I18N ENDPOINTS
// ============================================================================

/**
 * GET /api/flows/:agentId/:flowId/i18n
 * Get all i18n content for a flow
 */
router.get('/:agentId/:flowId/i18n', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const content = await FlowService.getI18nContent('flow', req.params.flowId);
        
        res.json({
            success: true,
            data: content
        });
    } catch (error) {
        console.error('Get flow i18n error:', error);
        res.status(500).json({ error: 'Failed to get i18n content' });
    }
});

/**
 * PUT /api/flows/:agentId/:flowId/i18n/:fieldName/:languageCode
 * Set i18n content for a flow field
 */
router.put('/:agentId/:flowId/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await FlowService.setI18nContent(
            req.params.agentId,
            'flow',
            req.params.flowId,
            req.params.fieldName,
            req.params.languageCode,
            req.body
        );
        
        res.json({
            success: true,
            message: 'Content saved'
        });
    } catch (error) {
        console.error('Set flow i18n error:', error);
        res.status(500).json({ error: 'Failed to set i18n content' });
    }
});

/**
 * GET /api/flows/:agentId/:flowId/steps/:stepId/i18n
 * Get all i18n content for a step
 */
router.get('/:agentId/:flowId/steps/:stepId/i18n', authenticate, verifyAgentAccess, async (req, res) => {
    try {
        const content = await FlowService.getI18nContent('step', req.params.stepId);
        
        res.json({
            success: true,
            data: content
        });
    } catch (error) {
        console.error('Get step i18n error:', error);
        res.status(500).json({ error: 'Failed to get i18n content' });
    }
});

/**
 * PUT /api/flows/:agentId/:flowId/steps/:stepId/i18n/:fieldName/:languageCode
 * Set i18n content for a step field
 */
router.put('/:agentId/:flowId/steps/:stepId/i18n/:fieldName/:languageCode', authenticate, verifyAgentAccess, checkPermission('agents.edit'), async (req, res) => {
    try {
        await FlowService.setI18nContent(
            req.params.agentId,
            'step',
            req.params.stepId,
            req.params.fieldName,
            req.params.languageCode,
            req.body
        );
        
        res.json({
            success: true,
            message: 'Content saved'
        });
    } catch (error) {
        console.error('Set step i18n error:', error);
        res.status(500).json({ error: 'Failed to set i18n content' });
    }
});

module.exports = router;
