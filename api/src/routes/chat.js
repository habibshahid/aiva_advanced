/**
 * Chat Routes
 * API endpoints for chat sessions and messages
 */
require('dotenv').config();

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const ChatService = require('../services/ChatService');
const CreditService = require('../services/CreditService');
const ResponseBuilder = require('../utils/response-builder');
const { validate, validateChatMessage, validatePagination } = require('../utils/validators');
const multer = require('multer');
const path = require('path');
const AudioService = require('../services/AudioService');
const AgentService = require('../services/AgentService');

// Configure multer for audio uploads
const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // ✅ Added .oga (WhatsApp voice notes), .opus, .amr, .3gp
        const allowedExtensions = [
            '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', 
            '.webm', '.ogg', '.oga', '.opus', '.flac', '.amr', '.3gp'
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Also accept by mimetype if extension check fails
        const allowedMimes = [
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
            'audio/wav', 'audio/webm', 'audio/ogg', 'audio/opus',
            'audio/flac', 'audio/amr', 'audio/3gpp', 'audio/x-m4a'
        ];
        
        const isAllowed = allowedExtensions.includes(ext) || 
                          allowedMimes.includes(file.mimetype) ||
                          file.mimetype?.startsWith('audio/');
        
        if (!isAllowed) {
            console.log(`⚠️ [AUDIO] Rejected file: ${file.originalname} (${file.mimetype})`);
        } else {
            console.log(`✅ [AUDIO] Accepted file: ${file.originalname} (${file.mimetype})`);
        }
        
        cb(null, isAllowed);
    }
});

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
 * @route POST /api/chat/sessions
 * @desc Create new chat session
 * @access Private
 */
 /**
 * @swagger
 * /chat/sessions:
 *   post:
 *     summary: Create new chat session
 *     tags: [Chat]
 *     security:
 *       security:        
 *       - BearerAuth: [] 
 *       - ApiKeyAuth: [] 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent_id
 *             properties:
 *               agent_id:
 *                 type: string
 *                 format: uuid
 *               session_name:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ChatSession'
 */
router.post('/sessions', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { 
      agent_id, 
      session_name, 
      metadata,
      // New channel fields
      channel,
      channel_user_id,
      channel_user_name,
      channel_metadata,
      context_data,
      llm_context_hints
    } = req.body;

    // Validate
    if (!agent_id) {
      return res.status(400).json(
        ResponseBuilder.badRequest('agent_id is required')
      );
    }

    // Validate channel if provided
    const validChannels = [
      'whatsapp', 'web_chat', 'public_chat', 'fb_pages', 'fb_messenger',
      'instagram', 'instagram_dm', 'twitter', 'twitter_dm', 'email',
      'linkedin_feed', 'sms', 'voice', 'api'
    ];
    
    if (channel && !validChannels.includes(channel)) {
      return res.status(400).json(
        ResponseBuilder.badRequest(`Invalid channel. Must be one of: ${validChannels.join(', ')}`)
      );
    }

    // Create session
    const session = await ChatService.createSession({
      tenantId: req.user.tenant_id || req.user.id,
      agentId: agent_id,
      userId: req.user.id,
      sessionName: session_name,
      metadata: metadata || {},
      // New channel fields
      channel: channel || 'public_chat',
      channelUserId: channel_user_id || null,
      channelUserName: channel_user_name || null,
      channelMetadata: channel_metadata || null,
      contextData: context_data || null,
      llmContextHints: llm_context_hints || null
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
router.get('/sessions', authenticate, async (req, res) => {
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
router.get('/sessions/:sessionId', authenticate, async (req, res) => {
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
router.get('/sessions/:sessionId/history', authenticate, async (req, res) => {
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
router.get('/sessions/:sessionId/stats', authenticate, async (req, res) => {
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
router.post('/sessions/:sessionId/end', authenticate, async (req, res) => {
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
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
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
 /**
 * @swagger
 * /chat/message:
 *   post:
 *     summary: Send message and get AI response
 *     tags: [Chat]
 *     security:          
 *       - BearerAuth: []  
 *       - ApiKeyAuth: []  
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agent_id
 *               - message
 *             properties:
 *               session_id:
 *                 type: string
 *                 format: uuid
 *                 description: Existing session ID (optional for first message)
 *               agent_id:
 *                 type: string
 *                 format: uuid
 *               message:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 4000
 *               image:
 *                 type: string
 *                 description: Base64 encoded image (optional)
 *     responses:
 *       200:
 *         description: AI response
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
 *                     session_id:
 *                       type: string
 *                       format: uuid
 *                     message_id:
 *                       type: string
 *                       format: uuid
 *                     agent_transfer:
 *                       type: boolean
 *                       description: True if agent transfer requested
 *                     response:
 *                       type: object
 *                       properties:
 *                         text:
 *                           type: string
 *                         html:
 *                           type: string
 *                         markdown:
 *                           type: string
 *                     sources:
 *                       type: array
 *                       items:
 *                         type: object
 *                     cost:
 *                       type: number
 *                 credits:
 *                   type: object
 *                   properties:
 *                     cost:
 *                       type: number
 *                     remaining_balance:
 *                       type: number
 *       402:
 *         description: Insufficient credits
 */
router.post('/message', authenticate, audioUpload.single('audio'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { 
      session_id, 
      agent_id, 
      image,
      // New channel fields
      channel,
      channel_user_id,
      channel_user_name,
      channel_metadata,
      context_data,
      llm_context_hints,
      // Audio options
      voice,
      generate_audio_response,
      stt_provider,
      language
    } = req.body;

    // ✅ FIX: Use let for message since we may override it
    let message = req.body.message;
    
    let audioTranscription = null;
    let audioCost = 0;
    let audioConfig = null;

    // ============================================
    // 🎤 AUDIO HANDLING - Process BEFORE validation
    // ============================================
    const hasAudio = req.file && req.file.buffer && req.file.buffer.length > 0;
    
    if (hasAudio) {
      console.log('🎤 [CHAT] Audio file detected:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.buffer.length
      });
      
      // Validate agent_id for audio requests
      if (!agent_id) {
        return res.status(400).json(
          ResponseBuilder.badRequest('agent_id is required')
        );
      }
      
      // Get agent for audio config
      const agent = await AgentService.getAgent(agent_id);
      if (!agent) {
        return res.status(404).json(ResponseBuilder.notFound('Agent'));
      }
      
      // Get effective audio configuration
      audioConfig = AudioService.getConfigFromAgent(agent, {
        stt_provider: stt_provider,
        voice: voice,
        language: language
      });
      
      console.log(`🎤 Transcribing: ${req.file.originalname} (${audioConfig.stt.provider}/${audioConfig.stt.model})`);
      
      try {
        // Transcribe audio
        const transcription = await AudioService.transcribe({
          audio: req.file.buffer,
          filename: req.file.originalname,
          config: audioConfig
        });
        
        if (transcription.success && transcription.text) {
          // ✅ Use transcribed text as the message
          message = transcription.text;
          audioCost += transcription.cost?.final_cost || 0;
          
          audioTranscription = {
            text: transcription.text,
            language: transcription.language,
            duration: transcription.duration,
            provider: transcription.provider
          };
          
          console.log(`✅ Transcribed: "${message.substring(0, 100)}..." (${transcription.duration}s, $${audioCost.toFixed(6)})`);
        } else {
          console.error('❌ Transcription returned empty or failed');
          return res.status(400).json(
            ResponseBuilder.badRequest('Failed to transcribe audio or audio was empty')
          );
        }
      } catch (transcribeError) {
        console.error('❌ Transcription error:', transcribeError.message);
        return res.status(400).json(
          ResponseBuilder.badRequest(`Transcription failed: ${transcribeError.message}`)
        );
      }
    }
    
    // ============================================
    // ✅ VALIDATION - After audio processing
    // ============================================
    if (!hasAudio) {
      // Only validate message if no audio was provided
      const errors = validateChatMessage(req.body);
      if (errors.length > 0) {
        return res.status(422).json(ResponseBuilder.validationError(errors));
      }
    } else {
      // For audio requests, just ensure we have a message now (from transcription)
      if (!message || message.trim() === '') {
        return res.status(400).json(
          ResponseBuilder.badRequest('No message provided and audio transcription was empty')
        );
      }
    }

    // Check credits
    const tenantId = req.user.tenant_id || req.user.id;
    const balance = await CreditService.getBalance(tenantId);

    if (balance < 0.001) {
      return res.status(402).json(
        ResponseBuilder.insufficientCredits(balance)
      );
    }

    const sessId = (session_id === 'null' || session_id === '') ? null : session_id;

    // Send message
    const result = await ChatService.sendMessage({
      sessionId: sessId,
      agentId: agent_id,
      message: message,  // ✅ Now contains transcribed text if audio was sent
      image: image,
      userId: req.user.id,
      channelInfo: sessId ? null : {
        channel: channel || 'api',
        channelUserId: channel_user_id,
        channelUserName: channel_user_name,
        channelMetadata: channel_metadata,
        contextData: context_data,
        llmContextHints: llm_context_hints
      }
    });
    
    // ============================================
    // 🔊 TTS GENERATION
    // ============================================
    let audioResponse = null;
    
    const shouldGenerateAudio = 
      (generate_audio_response === 'true' || generate_audio_response === true) ||
      (hasAudio && generate_audio_response !== 'false' && generate_audio_response !== false);
    
    if (shouldGenerateAudio && result.response?.text) {
      try {
        // Get audio config if not already fetched
        if (!audioConfig) {
          const agent = await AgentService.getAgent(agent_id);
          audioConfig = AudioService.getConfigFromAgent(agent, { voice, language });
        }
        
        if (audioConfig.autoGenerateAudio !== false) {
          console.log(`🔊 Synthesizing: "${result.response.text.substring(0, 50)}..." (${audioConfig.tts.provider}/${audioConfig.tts.voice})`);
          
          const ttsResult = await AudioService.synthesize({
            text: result.response.text,
            config: audioConfig,
            sessionId: result.session_id
          });
          
          audioCost += ttsResult.cost?.final_cost || 0;
          
          audioResponse = {
            url: ttsResult.audio_url,
            audio_id: ttsResult.audio_id,
            format: ttsResult.format,
            voice: ttsResult.voice,
            estimated_duration: ttsResult.estimated_duration
          };
          
          console.log(`✅ TTS complete: ${ttsResult.audio_url} ($${ttsResult.cost?.final_cost?.toFixed(6) || 0})`);
        }
      } catch (ttsError) {
        console.error('TTS generation failed:', ttsError.message);
        // Don't fail the request, just skip TTS
      }
    }

    console.log('🔍 [CHAT] Result received:', {
      cost: result.cost,
      has_cost_breakdown: !!result.cost_breakdown,
      operations_count: result.cost_breakdown?.operations?.length || 0
    });

    // Deduct costs (existing logic)
    // ... [keep existing cost deduction code]

    // Deduct audio processing costs
    if (audioCost > 0) {
      console.log('💰 [CHAT] Deducting audio cost:', audioCost);
      await CreditService.deductCredits(
        tenantId,
        audioCost,
        'audio_processing',
        {
          session_id: result.session_id,
          message_id: result.message_id,
          has_transcription: !!audioTranscription,
          has_tts: !!audioResponse,
          stt_provider: audioConfig?.stt?.provider,
          tts_provider: audioConfig?.tts?.provider
        },
        result.session_id
      );
    }
    
    // Get new balance
    const newBalance = await CreditService.getBalance(tenantId);

    // Build credits info
    const creditsInfo = rb.buildCreditsInfo(
      'chat_message',
      result.cost,
      newBalance,
      result.cost_breakdown
    );

    // ✅ Add audio data to response
    if (audioTranscription || audioResponse) {
      result.transcription = audioTranscription;
      result.audio_response = audioResponse;
      result.audio_cost = audioCost;
    }
    
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
router.get('/messages/:messageId', authenticate, async (req, res) => {
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