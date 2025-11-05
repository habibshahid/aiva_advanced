const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const AgentService = require('../services/AgentService');
const { validateProvider } = require('../middleware/provider-validation');

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

/**
 * @swagger
 * /api/agents:
 *   get:
 *     summary: List all agents
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *     responses:
 *       200:
 *         description: List of agents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     agents:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Agent'
 *                     total:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/', authenticate, checkPermission('agents.view'), async (req, res) => {
    try {
        const agents = await AgentService.listAgents(req.user.tenant_id, req.query);
        res.json({ agents });
    } catch (error) {
        console.error('List agents error:', error);
        res.status(500).json({ error: 'Failed to list agents' });
    }
});

/**
 * @swagger
 * /api/agents/{id}:
 *   get:
 *     summary: Get agent by ID
 *     tags: [Agents]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Agent details
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
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
router.post('/', authenticate, checkPermission('agents.create'), validateProvider, async (req, res) => {
    try {
        const agent = await AgentService.createAgent(req.user.tenant_id, req.body);
        res.status(201).json({ agent });
    } catch (error) {
        console.error('Create agent error:', error);
        res.status(500).json({ error: 'Failed to create agent' });
    }
});

// Update agent
router.put('/:id', authenticate, checkPermission('agents.update'), validateProvider, async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.id);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        // Check ownership
        if (agent.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const updatedAgent = await AgentService.updateAgent(req.params.id, req.body);
        res.json({ agent: updatedAgent });
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

/**
 * @route PUT /api/agents/:id/chat-integration
 * @desc Update chat integration settings
 * @access Private
 */
router.put('/:id/chat-integration', verifyToken, checkPermission('agents.update'), async (req, res) => {
  try {
    const agent = await AgentService.getAgent(req.params.id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Check ownership
    if (agent.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await AgentService.updateChatIntegration(req.params.id, req.body);
    
    const updatedAgent = await AgentService.getAgent(req.params.id);
    res.json({ agent: updatedAgent });
    
  } catch (error) {
    console.error('Update chat integration error:', error);
    res.status(500).json({ error: 'Failed to update chat integration' });
  }
});

/**
 * @route GET /api/agents/:id/chat-integration/code
 * @desc Get embed code for agent
 * @access Private
 */
router.get('/:id/chat-integration/code', verifyToken, async (req, res) => {
  try {
    const agent = await AgentService.getAgent(req.params.id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Check ownership
    if (agent.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const widgetCode = AgentService.generateWidgetCode(req.params.id, agent.widget_config || {});
    const chatPageUrl = AgentService.generateChatPageUrl(req.params.id, agent.chat_page_slug);
    
    res.json({
      widget_code: widgetCode,
      chat_page_url: chatPageUrl,
      agent: {
        name: agent.name,
        enable_chat_integration: agent.enable_chat_integration,
        chat_page_enabled: agent.chat_page_enabled
      }
    });
    
  } catch (error) {
    console.error('Get embed code error:', error);
    res.status(500).json({ error: 'Failed to get embed code' });
  }
});

module.exports = router;