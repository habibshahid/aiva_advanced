const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const AgentService = require('../services/AgentService');

const router = express.Router();

// Middleware that accepts either JWT token OR API key
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        // Use API key authentication
        return verifyApiKey(req, res, next);
    } else {
        // Use JWT token authentication
        return verifyToken(req, res, next);
    }
};

// List agents
router.get('/', authenticate, checkPermission('agents.view'), async (req, res) => {
    try {
        const agents = await AgentService.listAgents(req.user.id, req.query);
        res.json({ agents });
    } catch (error) {
        console.error('List agents error:', error);
        res.status(500).json({ error: 'Failed to list agents' });
    }
});

// Get agent
router.get('/:id', authenticate, checkPermission('agents.view'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.id);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        // Check ownership (super_admin can access any agent)
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json({ agent });
    } catch (error) {
        console.error('Get agent error:', error);
        res.status(500).json({ error: 'Failed to get agent' });
    }
});

// Create agent
router.post('/', authenticate, checkPermission('agents.create'), async (req, res) => {
    try {
        const agent = await AgentService.createAgent(req.user.id, req.body);
        res.status(201).json({ agent });
    } catch (error) {
        console.error('Create agent error:', error);
        res.status(500).json({ error: 'Failed to create agent' });
    }
});

// Update agent
router.put('/:id', authenticate, checkPermission('agents.update'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.id);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        // Check ownership
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const updated = await AgentService.updateAgent(req.params.id, req.body);
        res.json({ agent: updated });
    } catch (error) {
        console.error('Update agent error:', error);
        res.status(500).json({ error: 'Failed to update agent' });
    }
});

// Delete agent
router.delete('/:id', authenticate, checkPermission('agents.delete'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.id);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        // Check ownership
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await AgentService.deleteAgent(req.params.id);
        res.json({ message: 'Agent deleted successfully' });
    } catch (error) {
        console.error('Delete agent error:', error);
        res.status(500).json({ error: 'Failed to delete agent' });
    }
});

module.exports = router;