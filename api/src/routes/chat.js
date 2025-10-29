/**
 * Chat Routes
 * API endpoints for chat sessions and messages
 */
require('dotenv').config();

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const ChatService = require('../services/ChatService');
const CreditService = require('../services/CreditService');
const ResponseBuilder = require('../utils/response-builder');
const { validate, validateChatMessage, validatePagination } = require('../utils/validators');

/**
 * @route POST /api/chat/sessions
 * @desc Create new chat session
 * @access Private
 */
router.post('/sessions', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { agent_id, session_name, metadata } = req.body;

    // Validate
    if (!agent_id) {
      return res.status(400).json(
        ResponseBuilder.badRequest('agent_id is required')
      );
    }

    // Create session
    const session = await ChatService.createSession({
      tenantId: req.user.tenant_id || req.user.id,
      agentId: agent_id,
      userId: req.user.id,
      sessionName: session_name,
      metadata: metadata || {}
    });

    res.status(201).json(rb.success(session, null, 201));

  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/chat/sessions
 * @desc List chat sessions
 * @access Private
 */
router.get('/sessions', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { page, limit, errors } = validatePagination(req.query);
    
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    const result = await ChatService.listSessions(
      req.user.tenant_id || req.user.id,
      {
        page,
        limit,
        agentId: req.query.agent_id,
        status: req.query.status
      }
    );

    res.json(rb.paginated(result.sessions, result.total, page, limit));

  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/chat/sessions/:sessionId
 * @desc Get chat session details
 * @access Private
 */
router.get('/sessions/:sessionId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const session = await ChatService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json(
        ResponseBuilder.notFound('Session')
      );
    }

    // Check ownership
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    res.json(rb.success(session));

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/chat/sessions/:sessionId/history
 * @desc Get conversation history
 * @access Private
 */
router.get('/sessions/:sessionId/history', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const session = await ChatService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json(
        ResponseBuilder.notFound('Session')
      );
    }

    // Check ownership
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const limit = parseInt(req.query.limit) || 50;
    const history = await ChatService.getConversationHistory(req.params.sessionId, limit);

    res.json(rb.success({ messages: history }));

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/chat/sessions/:sessionId/stats
 * @desc Get session statistics
 * @access Private
 */
router.get('/sessions/:sessionId/stats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const session = await ChatService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json(
        ResponseBuilder.notFound('Session')
      );
    }

    // Check ownership
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const stats = await ChatService.getSessionStats(req.params.sessionId);

    res.json(rb.success(stats));

  } catch (error) {
    console.error('Get session stats error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/chat/sessions/:sessionId/end
 * @desc End chat session
 * @access Private
 */
router.post('/sessions/:sessionId/end', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const session = await ChatService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json(
        ResponseBuilder.notFound('Session')
      );
    }

    // Check ownership
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    await ChatService.endSession(req.params.sessionId);

    res.json(rb.success({ message: 'Session ended successfully' }));

  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route DELETE /api/chat/sessions/:sessionId
 * @desc Delete chat session
 * @access Private
 */
router.delete('/sessions/:sessionId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const session = await ChatService.getSession(req.params.sessionId);

    if (!session) {
      return res.status(404).json(
        ResponseBuilder.notFound('Session')
      );
    }

    // Check ownership
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    await ChatService.deleteSession(req.params.sessionId);

    res.json(rb.success({ message: 'Session deleted successfully' }));

  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/chat/message
 * @desc Send message and get AI response
 * @access Private
 */
router.post('/message', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { session_id, agent_id, message, image } = req.body;

    // Validate
    const errors = validateChatMessage(req.body);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    // Check credits
    const tenantId = req.user.tenant_id || req.user.id;
    const balance = await CreditService.getBalance(tenantId);

    if (balance < 0.001) {
      return res.status(402).json(
        ResponseBuilder.insufficientCredits(balance)
      );
    }

    // Send message
    const result = await ChatService.sendMessage({
      sessionId: session_id,
      agentId: agent_id,
      message: message,
      image: image,
      userId: req.user.id
    });

    if (result.cost_breakdown && result.cost_breakdown.operations) {
      const kbOperation = result.cost_breakdown.operations.find(
        op => op.operation === 'knowledge_search' || 
              op.operation === 'knowledge_retrieval' ||
              op.operation === 'embedding'
      );
      
      if (kbOperation && kbOperation.total_cost > 0) {
        await CreditService.deductCredits(
          tenantId,
          kbOperation.total_cost,
          'knowledge_search',
          {
            session_id: result.session_id,
            message_id: result.message_id,
            query: message.substring(0, 100),
            kb_id: result.kb_id || 'unknown',
            chunks_retrieved: result.context_used?.knowledge_base_chunks || 0,
            search_type: 'text'
          },
          result.session_id
        );
      }
    }
    
    // 2. Deduct LLM generation cost
    const llmOperation = result.cost_breakdown?.operations?.find(
      op => op.operation === 'llm_generation' || op.operation === 'chat_completion'
    );
    
    const llmCost = llmOperation?.total_cost || result.cost;
    
    await CreditService.deductCredits(
      tenantId,
      llmCost,
      'chat_message',
      {
        session_id: result.session_id,
        message_id: result.message_id,
        agent_id: agent_id,
        model: result.agent_metadata?.model || 'gpt-4o-mini',
        message_length: message.length,
        response_length: result.response.text.length,
        input_tokens: result.agent_metadata?.input_tokens || 0,
        output_tokens: result.agent_metadata?.output_tokens || 0
      },
      result.session_id
    );

    // Get new balance
    const newBalance = await CreditService.getBalance(tenantId);

    // Build credits info
    const creditsInfo = rb.buildCreditsInfo(
      'chat_message',
      result.cost,
      newBalance,
      result.cost_breakdown
    );

    res.json(rb.success(result, creditsInfo));

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/chat/messages/:messageId
 * @desc Get message details
 * @access Private
 */
router.get('/messages/:messageId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const message = await ChatService.getMessage(req.params.messageId);

    if (!message) {
      return res.status(404).json(
        ResponseBuilder.notFound('Message')
      );
    }

    // Get session to check ownership
    const session = await ChatService.getSession(message.session_id);
    
    if (session.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    res.json(rb.success(message));

  } catch (error) {
    console.error('Get message error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

module.exports = router;