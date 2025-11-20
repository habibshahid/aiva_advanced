/**
 * Transcription & Analytics Routes
 * API endpoints for managing transcriptions and generating analytics
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const TranscriptionService = require('../services/TranscriptionService');
const ResponseBuilder = require('../utils/response-builder');

/**
 * @route POST /api/transcriptions/call
 * @desc Save call transcription (called by bridge service)
 * @access Private (internal service call)
 */
router.post('/call', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const {
      session_id,
      speaker,
      speaker_id,
      sequence_number,
      original_message,
      timestamp,
      analyze_now = true
    } = req.body;

    // Validate required fields
    if (!session_id || !speaker || !speaker_id || !sequence_number || !original_message || !timestamp) {
      return res.status(400).json(
        rb.error('Missing required fields', 'VALIDATION_ERROR', {
          required: ['session_id', 'speaker', 'speaker_id', 'sequence_number', 'original_message', 'timestamp']
        })
      );
    }

	const mappedSpeaker = speaker === 'user' ? 'customer' : speaker;
	
    // Get call_log_id from session_id
    const db = require('../config/database');
    const [callLogs] = await db.query(
      'SELECT id FROM yovo_tbl_aiva_call_logs WHERE session_id = ?',
      [session_id]
    );

    if (callLogs.length === 0) {
      return res.status(404).json(
        rb.error('Call log not found for session', 'NOT_FOUND')
      );
    }

    const callLogId = callLogs[0].id;

    // Save transcription
    const transcriptionId = await TranscriptionService.saveCallTranscription({
      sessionId: session_id,
      callLogId: callLogId,
      speaker: mappedSpeaker,
      speakerId: speaker_id,
      sequenceNumber: sequence_number,
      originalMessage: original_message,
      timestamp: timestamp,
      analyzeNow: analyze_now
    });

    res.status(201).json(
      rb.success({ transcription_id: transcriptionId }, 'Transcription saved')
    );

  } catch (error) {
    console.error('Error saving call transcription:', error);
    res.status(500).json(
      rb.error('Failed to save transcription', 'SERVER_ERROR')
    );
  }
});

/**
 * @route POST /api/transcriptions/chat/:messageId/analyze
 * @desc Analyze existing chat message
 * @access Private
 */
router.post('/chat/:messageId/analyze', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { messageId } = req.params;

    // Get message
    const db = require('../config/database');
    const [messages] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_chat_messages WHERE id = ?',
      [messageId]
    );

    if (messages.length === 0) {
      return res.status(404).json(
        rb.error('Message not found', 'NOT_FOUND')
      );
    }

    const message = messages[0];

    // Only analyze user messages
    if (message.role !== 'user') {
      return res.status(400).json(
        rb.error('Can only analyze user messages', 'INVALID_REQUEST')
      );
    }

    // Analyze
    const TranscriptionAnalysisService = require('../services/TranscriptionAnalysisService');
    const analysis = await TranscriptionAnalysisService.analyzeMessage(
      message.content,
      'customer'
    );

    // Check if translation needed
    let translatedMessage = null;
    if (analysis.language_detected && analysis.language_detected !== 'en') {
      const translation = await TranscriptionAnalysisService.translateToEnglish(
        message.content,
        analysis.language_detected
      );
      translatedMessage = translation.translated_text;
    }

    // Update message
    await TranscriptionService.updateChatMessageAnalysis(messageId, {
      ...analysis,
      translated_message: translatedMessage
    });

    res.json(
      rb.success({ analysis, translated_message: translatedMessage }, 'Message analyzed')
    );

  } catch (error) {
    console.error('Error analyzing chat message:', error);
    res.status(500).json(
      rb.error('Failed to analyze message', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/transcriptions/call/:callLogId
 * @desc Get all transcriptions for a call
 * @access Private
 */
router.get('/call/:callLogId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { callLogId } = req.params;

    const transcriptions = await TranscriptionService.getCallTranscriptions(callLogId);

    res.json(
      rb.success({ transcriptions, count: transcriptions.length })
    );

  } catch (error) {
    console.error('Error fetching call transcriptions:', error);
    res.status(500).json(
      rb.error('Failed to fetch transcriptions', 'SERVER_ERROR')
    );
  }
});

/**
 * @route POST /api/analytics/call/:callLogId/generate
 * @desc Generate session-level analytics for a call
 * @access Private
 */
router.post('/call/:callLogId/generate', async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { callLogId } = req.params;

    const analyticsId = await TranscriptionService.generateCallAnalytics(callLogId);

    if (!analyticsId) {
      return res.status(404).json(
        rb.error('No transcriptions found for this call', 'NOT_FOUND')
      );
    }

    res.status(201).json(
      rb.success({ analytics_id: analyticsId }, 'Analytics generated')
    );

  } catch (error) {
    console.error('Error generating call analytics:', error);
    res.status(500).json(
      rb.error('Failed to generate analytics', 'SERVER_ERROR')
    );
  }
});

/**
 * @route POST /api/analytics/chat/:sessionId/generate
 * @desc Generate session-level analytics for a chat
 * @access Private
 */
router.post('/chat/:sessionId/generate', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { sessionId } = req.params;

    const analyticsId = await TranscriptionService.generateChatAnalytics(sessionId);

    if (!analyticsId) {
      return res.status(404).json(
        rb.error('No messages found for this session', 'NOT_FOUND')
      );
    }

    res.status(201).json(
      rb.success({ analytics_id: analyticsId }, 'Analytics generated')
    );

  } catch (error) {
    console.error('Error generating chat analytics:', error);
    res.status(500).json(
      rb.error('Failed to generate analytics', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/analytics/call/:callLogId
 * @desc Get analytics for a call
 * @access Private
 */
router.get('/call/:callLogId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { callLogId } = req.params;

    const analytics = await TranscriptionService.getCallAnalytics(callLogId);

    if (!analytics) {
      return res.status(404).json(
        rb.error('Analytics not found', 'NOT_FOUND')
      );
    }

    res.json(
      rb.success({ analytics })
    );

  } catch (error) {
    console.error('Error fetching call analytics:', error);
    res.status(500).json(
      rb.error('Failed to fetch analytics', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/analytics/chat/:sessionId
 * @desc Get analytics for a chat session
 * @access Private
 */
router.get('/chat/:sessionId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { sessionId } = req.params;

    const analytics = await TranscriptionService.getChatAnalytics(sessionId);

    if (!analytics) {
      return res.status(404).json(
        rb.error('Analytics not found', 'NOT_FOUND')
      );
    }

    res.json(
      rb.success({ analytics })
    );

  } catch (error) {
    console.error('Error fetching chat analytics:', error);
    res.status(500).json(
      rb.error('Failed to fetch analytics', 'SERVER_ERROR')
    );
  }
});

module.exports = router;
