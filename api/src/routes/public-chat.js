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
const multer = require('multer');
const path = require('path');
const AudioService = require('../services/AudioService');

// Configure multer for audio uploads
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm', '.ogg', '.flac', '.oga'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowedExtensions.includes(ext));
    }
});

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
router.post('/message', audioUpload.single('audio'), async (req, res) => {
  try {
    let { session_id, message, image, agent_id, voice, generate_audio_response, stt_provider, language } = req.body;

    // Validate - need message, image, OR audio
    if (!message && !image && !req.file) {
      return res.status(400).json({
        success: false,
        error: 'message, image, or audio is required'
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
	
	// ============================================
    // 🎤 AUDIO HANDLING
    // ============================================
    let audioTranscription = null;
    let audioCost = 0;
    let audioConfig = null;
    
    if (req.file) {
      console.log('🎤 [PUBLIC] Audio file detected, processing...');
      
      // Get agent for audio config
      const agent = await AgentService.getAgent(session.agent_id);
      
      // Get effective audio configuration
      audioConfig = AudioService.getConfigFromAgent(agent, {
        stt_provider: stt_provider,
        voice: voice,
        language: language
      });
      
      // Transcribe audio
      const transcription = await AudioService.transcribe({
        audio: req.file.buffer,
        filename: req.file.originalname,
        config: audioConfig
      });
      
      if (!transcription.success || !transcription.text) {
        return res.status(400).json({
          success: false,
          error: 'Failed to transcribe audio or audio was empty'
        });
      }
      
      // Use transcribed text as the message
      message = transcription.text;
      audioCost += transcription.cost.final_cost;
      
      audioTranscription = {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration,
        provider: transcription.provider
      };
      
      console.log(`📝 [PUBLIC] Transcribed: "${message.substring(0, 100)}..."`);
    }

    // Send message using ChatService.sendMessage()
    const result = await ChatService.sendMessage({
      sessionId: sessionId,
      agentId: session.agent_id,
      message: message,
      image: image,
      userId: null,
      channelInfo: session_id ? null : {
		channel: 'public_chat',
		channelUserId: null,
		channelUserName: null,
		channelMetadata: null,
		contextData: {},
		llmContextHints: null
	  }
    });

	// ============================================
    // 🔊 TTS GENERATION
    // ============================================
    let audioResponse = null;
    
    // Generate audio if: explicitly requested OR audio was sent (and not disabled)
    const shouldGenerateAudio = (generate_audio_response === 'true' || generate_audio_response === true) 
                                || (req.file && generate_audio_response !== 'false' && generate_audio_response !== false);
    
    if (shouldGenerateAudio && result.response?.text) {
      try {
        // Get audio config if not already fetched
        if (!audioConfig) {
          const agent = await AgentService.getAgent(session.agent_id);
          audioConfig = AudioService.getConfigFromAgent(agent, { voice, language });
        }
        
        // Only generate if agent has audio response enabled
        if (audioConfig.autoGenerateAudio) {
          const ttsResult = await AudioService.synthesize({
            text: result.response.text,
            config: audioConfig,
            sessionId: sessionId
          });
          
          audioCost += ttsResult.cost.final_cost;
          
          audioResponse = {
            url: ttsResult.audio_url,
            audio_id: ttsResult.audio_id,
            format: ttsResult.format,
            voice: ttsResult.voice,
            estimated_duration: ttsResult.estimated_duration
          };
          
          console.log(`🔊 [PUBLIC] TTS generated: ${ttsResult.audio_url}`);
        }
      } catch (ttsError) {
        console.error('TTS generation failed:', ttsError.message);
        // Continue without audio - don't fail the whole request
      }
    }
	
    console.log('🔍 [PUBLIC CHAT] Result received:', {
      cost: result.cost,
      has_cost_breakdown: !!result.cost_breakdown,
      operations_count: result.cost_breakdown?.operations?.length || 0,
      user_analysis_cost: result.user_analysis_cost
    });

    // ============================================
    // 💰 DEDUCT CREDITS (LLM + ANALYSIS)
    // ============================================

    // 1. Check for KB search cost (if any)
    if (result.cost_breakdown && result.cost_breakdown.operations) {
      const kbOperation = result.cost_breakdown?.operations?.find(
		  op => op?.operation === 'knowledge_search' || 
				op?.operation === 'knowledge_retrieval' ||
				op?.operation === 'embedding'
		);
      
      if (kbOperation && kbOperation.total_cost > 0) {
        console.log('💰 [PUBLIC CHAT] Deducting KB search cost:', kbOperation.total_cost);
        await CreditService.deductCredits(
          session.tenant_id,
          kbOperation.total_cost,
          'knowledge_search',
          {
            session_id: sessionId,
            message_id: result.message_id,
            agent_id: session.agent_id,
            public_chat: true,
            query: message.substring(0, 100),
            kb_id: result.agent_metadata?.kb_id || 'unknown',
            chunks_retrieved: result.context_used?.knowledge_base_chunks || 0
          },
          sessionId
        );
      }
    }

    // 2. Calculate total cost (LLM + Analysis)
    const llmOperation = result.cost_breakdown?.operations?.find(
	  op => op?.operation === 'llm_completion' || op?.operation === 'llm_generation' || op?.operation === 'chat_completion'
	);

    const analysisOperation = result.cost_breakdown?.operations?.find(
	  op => op?.operation === 'message_analysis'
	);

    const llmCost = llmOperation?.total_cost || result.cost;
    const analysisCost = analysisOperation?.total_cost || result.user_analysis_cost || 0.0;
    const totalCost = llmCost + analysisCost;

    console.log('💰 [PUBLIC CHAT] Cost breakdown:', {
      llm_cost: llmCost,
      analysis_cost: analysisCost,
      total_cost: totalCost,
      llm_operation_found: !!llmOperation,
      analysis_operation_found: !!analysisOperation
    });

    console.log('💰 [PUBLIC CHAT] Deducting total cost:', totalCost);

    // 3. Deduct combined cost
    await CreditService.deductCredits(
      session.tenant_id,
      totalCost,
      'public_chat_message',
      {
        session_id: sessionId,
        message_id: result.message_id,
        agent_id: session.agent_id,
        public_chat: true,
        model: result.agent_metadata?.model || 'gpt-4o-mini',
        message_length: message.length,
        response_length: result.response?.text?.length || 0,
        input_tokens: result.context_used?.total_context_tokens || 0,
        output_tokens: result.response?.text?.length || 0,
        analysis_cost: analysisCost,
        includes_analysis: analysisCost > 0
      },
      sessionId
    );

    console.log('✅ [PUBLIC CHAT] Credit deduction complete');

	if (audioCost > 0) {
      console.log('💰 [PUBLIC CHAT] Deducting audio cost:', audioCost);
      await CreditService.deductCredits(
        session.tenant_id,
        audioCost,
        'audio_processing',
        {
          session_id: sessionId,
          message_id: result.message_id,
          has_transcription: !!audioTranscription,
          has_tts: !!audioResponse,
          stt_provider: audioTranscription?.provider,
          tts_voice: audioResponse?.voice
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
		interaction_closed: result.interaction_closed || false,  // ✅ ADD THIS LINE
        show_feedback_prompt: result.show_feedback_prompt || false,
        response: result.response,
		transcription: audioTranscription,
        // Audio response (if generated)
        audio_response: audioResponse,
        formatted_html: result.formatted_html || null,
        formatted_markdown: result.formatted_markdown || null,
        formatted_text: result.formatted_text || null,
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

/**
 * @route POST /api/public/chat/feedback/session
 * @desc Submit session feedback (public)
 * @access Public
 */
router.post('/feedback/session', async (req, res) => {
  try {
    const { session_id, rating, comment } = req.body;

    if (!session_id || !rating) {
      return res.status(400).json({
        success: false,
        error: 'session_id and rating are required'
      });
    }

    if (!['good', 'bad'].includes(rating)) {
      return res.status(400).json({
        success: false,
        error: 'rating must be "good" or "bad"'
      });
    }

    // Import FeedbackService
    const FeedbackService = require('../services/FeedbackService');

    const feedback = await FeedbackService.submitSessionFeedback({
      sessionId: session_id,
      rating,
      comment
    });

    res.json({
      success: true,
      data: feedback
    });

  } catch (error) {
    console.error('Submit session feedback error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit feedback'
    });
  }
});

/**
 * @route POST /api/public/chat/feedback/message
 * @desc Submit message feedback (public)
 * @access Public
 */
router.post('/feedback/message', async (req, res) => {
  try {
    const { message_id, rating, comment } = req.body;

    if (!message_id || !rating) {
      return res.status(400).json({
        success: false,
        error: 'message_id and rating are required'
      });
    }

    if (!['useful', 'not_useful'].includes(rating)) {
      return res.status(400).json({
        success: false,
        error: 'rating must be "useful" or "not_useful"'
      });
    }

    const FeedbackService = require('../services/FeedbackService');

    const feedback = await FeedbackService.submitMessageFeedback({
      messageId: message_id,
      rating,
      comment
    });

    res.json({
      success: true,
      data: feedback
    });

  } catch (error) {
    console.error('Submit message feedback error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to submit feedback'
    });
  }
});

module.exports = router;
