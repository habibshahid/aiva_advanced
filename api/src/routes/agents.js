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
 * /agents:
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
		console.log('##########', req.user)
        const agents = await AgentService.listAgents(req.user.tenant_id, req.query);
        res.json({ agents });
    } catch (error) {
        console.error('List agents error:', error);
        res.status(500).json({ error: 'Failed to list agents' });
    }
});

/**
 * @swagger
 * /agents/{id}:
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
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
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
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
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
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
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

router.put('/:id/chat-integration', authenticate, checkPermission('agents.update'), async (req, res) => {

  try {
    const { id } = req.params;
    const settings = req.body;
    const config = await AgentService.updateChatIntegration(
      id,
      settings
    );

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Update chat integration error:', error);
    
    // Handle specific errors
    if (error.message === 'Agent not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Access denied') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message.includes('slug')) {
      return res.status(400).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to update chat integration' });
  }
});

/**
 * @route GET /api/agents/:id/chat-integration
 * @desc Get chat integration settings
 * @access Private
 */
router.get('/:id/chat-integration', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Get agent first to verify tenant access
    const agent = await AgentService.getAgent(id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Verify tenant access
    if (agent.tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const config = await AgentService.getChatIntegration(id);

    res.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Get chat integration error:', error);
    
    if (error.message === 'Agent not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to get chat integration' });
  }
});

/**
 * @route GET /api/agents/:id/widget-code
 * @desc Get widget embed code
 * @access Private
 */
router.get('/:id/widget-code', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify agent exists and user has access
    const agent = await AgentService.getAgent(id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (agent.tenant_id !== req.user.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get chat integration config
    const config = await AgentService.getChatIntegration(id);

    // Generate widget code
    const widgetCode = AgentService.generateWidgetCode(id, {
      base_url: `${req.protocol}://${req.get('host')}`,
      ...config.widget_config
    });

    res.json({
      success: true,
      data: {
        widget_code: widgetCode,
        config: config
      }
    });

  } catch (error) {
    console.error('Get widget code error:', error);
    res.status(500).json({ error: 'Failed to get widget code' });
  }
});

module.exports = router;