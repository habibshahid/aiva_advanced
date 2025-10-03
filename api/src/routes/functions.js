const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const FunctionService = require('../services/FunctionService');
const AgentService = require('../services/AgentService');

const router = express.Router();

// List functions for agent
router.get('/agent/:agentId', verifyToken, checkPermission('functions.view'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.agentId);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const functions = await FunctionService.listFunctions(req.params.agentId);
        res.json({ functions });
    } catch (error) {
        console.error('List functions error:', error);
        res.status(500).json({ error: 'Failed to list functions' });
    }
});

// Create function
router.post('/agent/:agentId', verifyToken, checkPermission('functions.create'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.agentId);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const func = await FunctionService.createFunction(req.params.agentId, req.body);
        res.status(201).json({ function: func });
    } catch (error) {
        console.error('Create function error:', error);
        res.status(500).json({ error: 'Failed to create function' });
    }
});

// Update function
router.put('/:id', verifyToken, checkPermission('functions.update'), async (req, res) => {
    try {
        const func = await FunctionService.getFunction(req.params.id);
        
        if (!func) {
            return res.status(404).json({ error: 'Function not found' });
        }
        
        // Check agent ownership
        const agent = await AgentService.getAgent(func.agent_id);
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const updated = await FunctionService.updateFunction(req.params.id, req.body);
        res.json({ function: updated });
    } catch (error) {
        console.error('Update function error:', error);
        res.status(500).json({ error: 'Failed to update function' });
    }
});

// Delete function
router.delete('/:id', verifyToken, checkPermission('functions.delete'), async (req, res) => {
    try {
        const func = await FunctionService.getFunction(req.params.id);
        
        if (!func) {
            return res.status(404).json({ error: 'Function not found' });
        }
        
        // Check agent ownership
        const agent = await AgentService.getAgent(func.agent_id);
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await FunctionService.deleteFunction(req.params.id);
        res.json({ message: 'Function deleted successfully' });
    } catch (error) {
        console.error('Delete function error:', error);
        res.status(500).json({ error: 'Failed to delete function' });
    }
});

module.exports = router;