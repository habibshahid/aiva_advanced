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
 * @desc Initialize chat session
 */
router.post('/init', async (req, res) => {
  try {
    const { agent_id, visitor_info } = req.body;

    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: 'agent_id is required'
      });
    }

    const agent = await AgentService.getAgent(agent_id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    if (!agent.enable_chat_integration) {
      return res.status(403).json({
        success: false,
        error: 'Chat integration is not enabled for this agent'
      });
    }

    // Check tenant credits
    const balance = await CreditService.getBalance(agent.tenant_id);
    if (balance < 0.01) {
      return res.status(402).json({
        success: false,
        error: 'Service temporarily unavailable'
      });
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

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        agent: {
          name: agent.name,
          greeting: agent.greeting || 'Hello! How can I help you today?',
          //avatar: agent.avatar_url
        }
      }
    });

  } catch (error) {
    console.error('Init chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize chat'
    });
  }
});

/**
 * @route POST /api/public/chat/message
 * @desc Send message (no auth required)
 * @access Public
 */
router.post('/message', async (req, res) => {
  try {
    const { session_id, message, image, agent_id } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message is required'
      });
    }

    let session = null;
    let sessionId = session_id;

    // Try to get existing session
    if (sessionId) {
      session = await ChatService.getSession(sessionId);
    }

    // If session not found, create a new one
    if (!session) {
      // Need agent_id to create new session
      if (!agent_id) {
        return res.status(400).json({
          success: false,
          error: 'session_id or agent_id is required'
        });
      }

      // Get agent
      const agent = await AgentService.getAgentForPublicChat(agent_id);
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }

      // Check if agent has chat integration enabled
      if (!agent.enable_chat_integration && !agent.chat_page_enabled) {
        return res.status(403).json({
          success: false,
          error: 'Chat integration is not enabled for this agent'
        });
      }

      // Check tenant credits
      const balance = await CreditService.getBalance(agent.tenant_id);
      if (balance < 0.01) {
        return res.status(402).json({
          success: false,
          error: 'Service temporarily unavailable'
        });
      }

      // Create new session
      console.log('Creating new session for agent:', agent_id);
      session = await ChatService.createSession({
        tenantId: agent.tenant_id,
        agentId: agent.id,
        userId: null,
        sessionName: 'Public Chat Session',
        metadata: {
          type: 'public_chat',
          visitor_info: {},
          user_agent: req.headers['user-agent'],
          ip_address: req.ip,
          referrer: req.headers.referer,
          auto_created: true
        }
      });

      sessionId = session.id;
      console.log('New session created:', sessionId);
    }

    // Check tenant credits
    const balance = await CreditService.getBalance(session.tenant_id);
    if (balance < 0.01) {
      return res.status(402).json({
        success: false,
        error: 'Service temporarily unavailable'
      });
    }

    // Send message using ChatService.sendMessage()
    const result = await ChatService.sendMessage({
      sessionId: sessionId,
      agentId: session.agent_id,
      message: message,
      image: image,
      userId: null
    });

    // Deduct credits
    if (result.cost > 0) {
      await CreditService.deductCredits(
        session.tenant_id,
        result.cost,
        'public_chat_message',
        {
          session_id: sessionId,
          message_id: result.message_id,
          agent_id: session.agent_id,
          public_chat: true
        },
        sessionId
      );
    }

    res.json({
	  success: true,
	  data: {
		session_id: sessionId,
		message_id: result.message_id,
		agent_transfer: result.agent_transfer || false,
		response: result.response,
		formatted_html: result.formatted_html || null,  // ✅ ADD THIS
		formatted_markdown: result.formatted_markdown || null,  // ✅ ADD THIS
		formatted_text: result.formatted_text || null,  // ✅ ADD THIS
		sources: result.sources || [],
		images: result.images || [],
		products: result.products || [],
		function_calls: result.function_calls || [],
		llm_decision: result.llm_decision || {},
		context_used: result.context_used || {},
		agent_metadata: {
		  agent_id: result.agent_metadata?.agent_id,
		  agent_name: result.agent_metadata?.agent_name,
		  provider: result.agent_metadata?.provider,
		  model: result.agent_metadata?.model,
		  temperature: result.agent_metadata?.temperature
		},
		created_at: new Date().toISOString(),
		new_session_created: session_id !== sessionId
	  }
	});

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message'
    });
  }
});

/**
 * @route GET /api/public/chat/history/:session_id
 * @desc Get chat history
 */
router.get('/history/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    const messages = await ChatService.getConversationHistory(session_id);

    const formattedMessages = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      content_html: m.content_html,
      content_markdown: m.content_markdown,
      // ✅ INCLUDE SOURCES, IMAGES, PRODUCTS
      sources: m.sources || [],
      images: m.images || [],
      products: m.products || [],
      function_calls: m.function_calls || [],
      agent_transfer_requested: m.agent_transfer_requested || false,
      created_at: m.created_at
    }));

    res.json({
      success: true,
      data: {
        session_id: session_id,
        messages: formattedMessages
      }
    });

  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get history'
    });
  }
});

/**
 * @route GET /api/public/chat/page/:slug
 * @desc Get public chat page data by slug
 * @access Public
 */
router.get('/page/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Use AgentService to get agent by slug
    const agent = await AgentService.getAgentBySlug(slug);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Chat page not found'
      });
    }

    res.json({
      success: true,
      data: {
        agent_id: agent.id,
        name: agent.name,
        greeting: agent.greeting,
        //avatar_url: agent.avatar_url,
        widget_config: agent.widget_config || {
          primary_color: '#6366f1',
          position: 'bottom-right'
        }
      }
    });

  } catch (error) {
    console.error('Get public page error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load chat page'
    });
  }
});

/**
 * @route GET /api/public/chat/agent/:identifier/config
 * @desc Get agent widget configuration (works with both agent_id and custom_slug)
 * @access Public
 */
router.get('/agent/:identifier/config', async (req, res) => {
  try {
    const { identifier } = req.params;
    let agent;
    
    // Check if identifier looks like a UUID (agent_id) or a slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
    
    if (isUUID) {
      // It's an agent ID
      agent = await AgentService.getAgent(identifier);
      
      if (!agent){
        return res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
      }
	  
	  if(!agent.enable_chat_integration && !agent.chat_page_enabled) {
		  return res.status(404).json({
            success: false,
            error: 'chat integration not enabled'
          });
	  }
    } else {
      // It's a slug
      agent = await AgentService.getAgentBySlug(identifier);
      
      if (!agent) {
        return res.status(404).json({
          success: false,
          error: 'Chat page not found'
        });
      }
    }

    res.json({
      success: true,
      data: {
        name: agent.name,
        greeting: agent.greeting,
        //avatar: agent.avatar_url,
        widget_config: agent.widget_config || {
          primary_color: '#6366f1',
          position: 'bottom-right'
        }
      }
    });

  } catch (error) {
    console.error('Get agent config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration'
    });
  }
});

module.exports = router;