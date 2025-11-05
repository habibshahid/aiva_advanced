/**
 * Public Chat Routes
 * No authentication required - for embedded widgets and public chat pages
 */

const express = require('express');
const router = express.Router();
const ChatService = require('../services/ChatService');
const AgentService = require('../services/AgentService');
const CreditService = require('../services/CreditService');
const ResponseBuilder = require('../utils/response-builder');
const { v4: uuidv4 } = require('uuid');

/**
 * @route POST /api/public/chat/init
 * @desc Initialize chat session (no auth required)
 * @access Public
 */
router.post('/init', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { agent_id, visitor_info } = req.body;

    if (!agent_id) {
      return res.status(400).json(rb.badRequest('agent_id is required'));
    }

    // Get agent
    const agent = await AgentService.getAgent(agent_id);
    if (!agent) {
      return res.status(404).json(rb.notFound('Agent not found'));
    }

    // Check if agent has chat integration enabled
    if (!agent.enable_chat_integration) {
      return res.status(403).json(rb.forbidden('Chat integration is not enabled for this agent'));
    }

    // Check tenant credits
    const hasCredits = await CreditService.hasSufficientCredits(agent.tenant_id, 0.01);
    if (!hasCredits) {
      return res.status(402).json(
        rb.paymentRequired('Service temporarily unavailable')
      );
    }

    // Create session
    const sessionId = uuidv4();
    const session = await ChatService.createSession({
      sessionId,
      agentId: agent_id,
      tenantId: agent.tenant_id,
      metadata: {
        type: 'public_chat',
        visitor_info: visitor_info || {},
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
        referrer: req.headers.referer
      }
    });

    res.json(rb.success({
      session_id: sessionId,
      agent: {
        name: agent.name,
        greeting: agent.greeting || 'Hello! How can I help you today?',
        avatar: agent.avatar_url
      }
    }));

  } catch (error) {
    console.error('Init chat error:', error);
    res.status(500).json(
      ResponseBuilder.serverError('Failed to initialize chat')
    );
  }
});

/**
 * @route POST /api/public/chat/message
 * @desc Send message (no auth required)
 * @access Public
 */
router.post('/message', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { session_id, message, image } = req.body;

    if (!session_id || !message) {
      return res.status(400).json(rb.badRequest('session_id and message are required'));
    }

    // Get session
    const session = await ChatService.getSession(session_id);
    if (!session) {
      return res.status(404).json(rb.notFound('Session not found or expired'));
    }

    // Check tenant credits
    const hasCredits = await CreditService.hasSufficientCredits(session.tenant_id, 0.01);
    if (!hasCredits) {
      return res.status(402).json(
        rb.paymentRequired('Service temporarily unavailable')
      );
    }

    // Send message
    const result = await ChatService.sendMessage({
      sessionId: session_id,
      agentId: session.agent_id,
      message: message,
      image: image,
      userId: null // Public user
    });

    // Deduct credits
    if (result.cost > 0) {
      await CreditService.deductCredits(
        session.tenant_id,
        result.cost,
        'public_chat_message',
        {
          session_id: session_id,
          message_id: result.message_id,
          agent_id: session.agent_id,
          public_chat: true
        },
        session_id
      );
    }

    res.json(rb.success({
      message_id: result.message_id,
      response: result.response.text,
      created_at: result.created_at
    }));

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json(
      ResponseBuilder.serverError('Failed to send message')
    );
  }
});

/**
 * @route GET /api/public/chat/history/:session_id
 * @desc Get chat history (no auth required)
 * @access Public
 */
router.get('/history/:session_id', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { session_id } = req.params;

    const messages = await ChatService.getMessages(session_id);

    res.json(rb.success({
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at
      }))
    }));

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json(
      ResponseBuilder.serverError('Failed to get history')
    );
  }
});

/**
 * @route GET /api/public/chat/agent/:agent_id/config
 * @desc Get agent widget configuration (no auth required)
 * @access Public
 */
router.get('/agent/:agent_id/config', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { agent_id } = req.params;

    const agent = await AgentService.getAgent(agent_id);
    if (!agent) {
      return res.status(404).json(rb.notFound('Agent not found'));
    }

    if (!agent.enable_chat_integration) {
      return res.status(403).json(rb.forbidden('Chat integration is not enabled'));
    }

    res.json(rb.success({
      name: agent.name,
      greeting: agent.greeting,
      avatar: agent.avatar_url,
      widget_config: agent.widget_config || {
        primary_color: '#6366f1',
        position: 'bottom-right',
        button_text: 'Chat with us'
      }
    }));

  } catch (error) {
    console.error('Get agent config error:', error);
    res.status(500).json(
      ResponseBuilder.serverError('Failed to get configuration')
    );
  }
});

module.exports = router;