/**
 * Transcription Service
 * Handles database operations for call and chat transcriptions
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const TranscriptionAnalysisService = require('./TranscriptionAnalysisService');
const logger = require('../utils/logger');

class TranscriptionService {
  /**
   * Save call transcription with analysis
   * @param {Object} params - Transcription parameters
   * @returns {Promise<string>} Transcription ID
   */
  async saveCallTranscription({
    sessionId,
    callLogId,
    speaker,
    speakerId,
    sequenceNumber,
    originalMessage,
    timestamp,
    languageDetected = null,
    analyzeNow = true
  }) {
    const transcriptionId = uuidv4();
   
    try {
      let analysis = null;
      let translatedMessage = null;
      
      // Analyze the message if requested
      if (analyzeNow) {
        analysis = await TranscriptionAnalysisService.analyzeMessage(
          originalMessage,
          speaker
        );
        
        // Translate if not English
        if (analysis.language_detected && analysis.language_detected !== 'en') {
          const translation = await TranscriptionAnalysisService.translateToEnglish(
            originalMessage,
            analysis.language_detected
          );
          translatedMessage = translation.translated_text;
        }
      }

      // Insert into database
      await db.query(
        `INSERT INTO yovo_tbl_aiva_call_transcriptions (
          id, session_id, call_log_id, speaker, speaker_id, sequence_number,
          original_message, translated_message, language_detected,
          sentiment, sentiment_score, sentiment_confidence,
          profanity_detected, profanity_score, profane_words,
          intents, primary_intent, intent_confidence,
          topics, keywords, emotion_tags,
          analyzed_at, analysis_model, analysis_cost, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transcriptionId,
          sessionId,
          callLogId,
          speaker,
          speakerId,
          sequenceNumber,
          originalMessage,
          translatedMessage,
          analysis?.language_detected || languageDetected,
          analysis?.sentiment || null,
          analysis?.sentiment_score || null,
          analysis?.sentiment_confidence || null,
          analysis?.profanity_detected ? 1 : 0,
          analysis?.profanity_score || 0.0,
          analysis?.profane_words ? JSON.stringify(analysis.profane_words) : null,
          analysis?.intents ? JSON.stringify(analysis.intents) : null,
          analysis?.primary_intent || null,
          analysis?.intent_confidence || null,
          analysis?.topics ? JSON.stringify(analysis.topics) : null,
          analysis?.keywords ? JSON.stringify(analysis.keywords) : null,
          analysis?.emotion_tags ? JSON.stringify(analysis.emotion_tags) : null,
          analysis ? new Date() : null,
          analysis?.analysis_metadata?.model || null,
          analysis?.analysis_metadata?.cost || 0.0,
          timestamp
        ]
      );

      logger.info(`Saved call transcription: ${transcriptionId} for session: ${sessionId}`);
      
      return transcriptionId;
      
    } catch (error) {
      logger.error('Error saving call transcription:', error);
      throw error;
    }
  }

  /**
   * Update chat message with analysis
   * @param {string} messageId - Chat message ID
   * @param {Object} analysis - Analysis results
   * @returns {Promise<void>}
   */
  async updateChatMessageAnalysis(messageId, analysis) {
    try {
      await db.query(
        `UPDATE yovo_tbl_aiva_chat_messages SET
          language_detected = ?,
          translated_message = ?,
          sentiment = ?,
          sentiment_score = ?,
          sentiment_confidence = ?,
          profanity_detected = ?,
          profanity_score = ?,
          profane_words = ?,
          intents = ?,
          primary_intent = ?,
          intent_confidence = ?,
          topics = ?,
          keywords = ?,
          emotion_tags = ?,
          analyzed_at = NOW(),
          analysis_model = ?,
          analysis_cost = ?
        WHERE id = ?`,
        [
          analysis.language_detected || null,
          analysis.translated_message || null,
          analysis.sentiment || null,
          analysis.sentiment_score || null,
          analysis.sentiment_confidence || null,
          analysis.profanity_detected ? 1 : 0,
          analysis.profanity_score || 0.0,
          analysis.profane_words ? JSON.stringify(analysis.profane_words) : null,
          analysis.intents ? JSON.stringify(analysis.intents) : null,
          analysis.primary_intent || null,
          analysis.intent_confidence || null,
          analysis.topics ? JSON.stringify(analysis.topics) : null,
          analysis.keywords ? JSON.stringify(analysis.keywords) : null,
          analysis.emotion_tags ? JSON.stringify(analysis.emotion_tags) : null,
          analysis.analysis_metadata?.model || null,
          analysis.analysis_metadata?.cost || 0.0,
          messageId
        ]
      );

      logger.debug(`Updated chat message analysis: ${messageId}`);
      
    } catch (error) {
      logger.error('Error updating chat message analysis:', error);
      throw error;
    }
  }

  /**
   * Generate session-level analytics for a call
   * @param {string} callLogId - Call log ID
   * @returns {Promise<string>} Analytics ID
   */
  async generateCallAnalytics(callLogId) {
    const analyticsId = uuidv4();
    
    try {
      // Get all transcriptions for this call
      const [transcriptions] = await db.query(
        `SELECT * FROM yovo_tbl_aiva_call_transcriptions 
         WHERE call_log_id = ? 
         ORDER BY sequence_number ASC`,
        [callLogId]
      );

      if (transcriptions.length === 0) {
        logger.warn(`No transcriptions found for call: ${callLogId}`);
        return null;
      }

      // Get session ID
      const sessionId = transcriptions[0].session_id;

      // Generate session analytics
      const analytics = await TranscriptionAnalysisService.analyzeSession(
        transcriptions,
        { callLogId, sessionId }
      );

      // Calculate message counts
      const totalMessages = transcriptions.length;
      const customerMessages = transcriptions.filter(t => t.speaker === 'customer').length;
      const agentMessages = transcriptions.filter(t => t.speaker === 'agent').length;

      // Calculate average message lengths
      const avgCustomerLength = customerMessages > 0
        ? transcriptions
            .filter(t => t.speaker === 'customer')
            .reduce((sum, t) => sum + t.original_message.length, 0) / customerMessages
        : 0;
        
      const avgAgentLength = agentMessages > 0
        ? transcriptions
            .filter(t => t.speaker === 'agent')
            .reduce((sum, t) => sum + t.original_message.length, 0) / agentMessages
        : 0;

      // Insert analytics
      await db.query(
        `INSERT INTO yovo_tbl_aiva_call_analytics (
          id, call_log_id, session_id,
          overall_sentiment, overall_sentiment_score, sentiment_progression,
          positive_percentage, negative_percentage, neutral_percentage,
          customer_sentiment, customer_sentiment_score,
          agent_sentiment, agent_sentiment_score,
          profanity_incidents, profanity_severity,
          profanity_by_customer, profanity_by_agent,
          primary_intents, intent_categories, resolution_intent,
          total_messages, customer_messages, agent_messages,
          avg_customer_message_length, avg_agent_message_length,
          main_topics, keywords_frequency,
          emotion_timeline, peak_emotions,
          escalation_detected, customer_satisfaction_indicator,
          issue_resolved, transfer_requested,
          languages_detected, primary_language,
          analysis_completed_at, total_analysis_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          analyticsId,
          callLogId,
          sessionId,
          analytics.overall_sentiment,
          analytics.overall_sentiment_score,
          JSON.stringify(analytics.sentiment_progression || []),
          analytics.positive_percentage || 0,
          analytics.negative_percentage || 0,
          analytics.neutral_percentage || 0,
          analytics.customer_sentiment,
          analytics.customer_sentiment_score,
          analytics.agent_sentiment,
          analytics.agent_sentiment_score,
          analytics.profanity_incidents || 0,
          analytics.profanity_severity || 'none',
          analytics.profanity_by_customer || 0,
          analytics.profanity_by_agent || 0,
          JSON.stringify(analytics.primary_intents || []),
          JSON.stringify(analytics.intent_categories || {}),
          analytics.resolution_intent,
          totalMessages,
          customerMessages,
          agentMessages,
          avgCustomerLength.toFixed(2),
          avgAgentLength.toFixed(2),
          JSON.stringify(analytics.main_topics || []),
          JSON.stringify(analytics.keywords_frequency || {}),
          JSON.stringify(analytics.emotion_timeline || []),
          JSON.stringify(analytics.peak_emotions || []),
          analytics.escalation_detected ? 1 : 0,
          analytics.customer_satisfaction_indicator,
          analytics.issue_resolved !== null ? (analytics.issue_resolved ? 1 : 0) : null,
          analytics.transfer_requested ? 1 : 0,
          JSON.stringify(analytics.languages_detected || ['en']),
          analytics.primary_language || 'en',
          analytics.analysis_metadata?.total_analysis_cost || 0.0
        ]
      );

      logger.info(`Generated call analytics: ${analyticsId} for call: ${callLogId}`);
      
      return analyticsId;
      
    } catch (error) {
      logger.error('Error generating call analytics:', error);
      throw error;
    }
  }

  /**
   * Generate session-level analytics for a chat
   * @param {string} sessionId - Chat session ID
   * @returns {Promise<string>} Analytics ID
   */
  async generateChatAnalytics(sessionId) {
    const analyticsId = uuidv4();
    
    try {
      // Get all messages for this session
      const [messages] = await db.query(
        `SELECT * FROM yovo_tbl_aiva_chat_messages 
         WHERE session_id = ? 
         ORDER BY created_at ASC`,
        [sessionId]
      );

      if (messages.length === 0) {
        logger.warn(`No messages found for chat session: ${sessionId}`);
        return null;
      }

      // Convert to transcription format
      const transcriptions = messages.map(msg => ({
        speaker: msg.role === 'user' ? 'customer' : 'agent',
        original_message: msg.content,
        content: msg.content
      }));

      // Generate session analytics
      const analytics = await TranscriptionAnalysisService.analyzeSession(
        transcriptions,
        { sessionId }
      );

      // Calculate metrics
      const totalMessages = messages.length;
      const userMessages = messages.filter(m => m.role === 'user').length;
      const assistantMessages = messages.filter(m => m.role === 'assistant').length;

      const avgResponseLength = assistantMessages > 0
        ? messages
            .filter(m => m.role === 'assistant')
            .reduce((sum, m) => sum + m.content.length, 0) / assistantMessages
        : 0;

	  const [existing] = await db.query(
	    'SELECT id FROM yovo_tbl_aiva_chat_analytics WHERE session_id = ?',
	    [sessionId]
	  );

	  if (existing.length > 0) {
	    console.log(`⚠️ Analytics already exist for session ${sessionId}, skipping`);
	    return existing[0];
	  }
      
	  // Insert analytics
      await db.query(
        `INSERT INTO yovo_tbl_aiva_chat_analytics (
          id, session_id,
          overall_sentiment, overall_sentiment_score, sentiment_progression,
          positive_percentage, negative_percentage, neutral_percentage,
          user_sentiment, user_sentiment_score,
          assistant_sentiment, assistant_sentiment_score,
          profanity_incidents, profanity_severity, profanity_by_user,
          primary_intents, intent_categories, resolution_intent,
          total_messages, user_messages, assistant_messages,
          avg_response_length,
          main_topics, keywords_frequency,
          customer_satisfaction_indicator, issue_resolved, transfer_requested,
          languages_detected, primary_language,
          analysis_completed_at, total_analysis_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
        [
          analyticsId,
          sessionId,
          analytics.overall_sentiment,
          analytics.overall_sentiment_score,
          JSON.stringify(analytics.sentiment_progression || []),
          analytics.positive_percentage || 0,
          analytics.negative_percentage || 0,
          analytics.neutral_percentage || 0,
          analytics.customer_sentiment, // Map to user
          analytics.customer_sentiment_score,
          analytics.agent_sentiment, // Map to assistant
          analytics.agent_sentiment_score,
          analytics.profanity_incidents || 0,
          analytics.profanity_severity || 'none',
          analytics.profanity_by_customer || 0,
          JSON.stringify(analytics.primary_intents || []),
          JSON.stringify(analytics.intent_categories || {}),
          analytics.resolution_intent,
          totalMessages,
          userMessages,
          assistantMessages,
          avgResponseLength.toFixed(2),
          JSON.stringify(analytics.main_topics || []),
          JSON.stringify(analytics.keywords_frequency || {}),
          analytics.customer_satisfaction_indicator,
          analytics.issue_resolved !== null ? (analytics.issue_resolved ? 1 : 0) : null,
          analytics.transfer_requested ? 1 : 0,
          JSON.stringify(analytics.languages_detected || ['en']),
          analytics.primary_language || 'en',
          analytics.analysis_metadata?.total_analysis_cost || 0.0
        ]
      );

      logger.info(`Generated chat analytics: ${analyticsId} for session: ${sessionId}`);
      
      return analyticsId;
      
    } catch (error) {
      logger.error('Error generating chat analytics:', error);
      throw error;
    }
  }

  /**
   * Get call transcriptions
   * @param {string} callLogId - Call log ID
   * @returns {Promise<Array>} Array of transcriptions
   */
  async getCallTranscriptions(callLogId) {
    const [transcriptions] = await db.query(
      `SELECT * FROM yovo_tbl_aiva_call_transcriptions 
       WHERE call_log_id = ? 
       ORDER BY sequence_number ASC`,
      [callLogId]
    );

    return transcriptions.map(t => ({
      ...t,
      profane_words: t.profane_words ? JSON.parse(t.profane_words) : [],
      intents: t.intents ? JSON.parse(t.intents) : [],
      topics: t.topics ? JSON.parse(t.topics) : [],
      keywords: t.keywords ? JSON.parse(t.keywords) : [],
      emotion_tags: t.emotion_tags ? JSON.parse(t.emotion_tags) : []
    }));
  }

  /**
   * Get call analytics
   * @param {string} callLogId - Call log ID
   * @returns {Promise<Object>} Analytics data
   */
  async getCallAnalytics(callLogId) {
    const [analytics] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_call_analytics WHERE call_log_id = ?',
      [callLogId]
    );

    if (analytics.length === 0) {
      return null;
    }

    const data = analytics[0];
    
    return {
      ...data,
      sentiment_progression: data.sentiment_progression ? JSON.parse(data.sentiment_progression) : [],
      primary_intents: data.primary_intents ? JSON.parse(data.primary_intents) : [],
      intent_categories: data.intent_categories ? JSON.parse(data.intent_categories) : {},
      main_topics: data.main_topics ? JSON.parse(data.main_topics) : [],
      keywords_frequency: data.keywords_frequency ? JSON.parse(data.keywords_frequency) : {},
      emotion_timeline: data.emotion_timeline ? JSON.parse(data.emotion_timeline) : [],
      peak_emotions: data.peak_emotions ? JSON.parse(data.peak_emotions) : [],
      languages_detected: data.languages_detected ? JSON.parse(data.languages_detected) : []
    };
  }

  /**
   * Get chat analytics
   * @param {string} sessionId - Chat session ID
   * @returns {Promise<Object>} Analytics data
   */
  async getChatAnalytics(sessionId) {
    const [analytics] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_chat_analytics WHERE session_id = ?',
      [sessionId]
    );

    if (analytics.length === 0) {
      return null;
    }

    const data = analytics[0];
    
    return {
      ...data,
      sentiment_progression: data.sentiment_progression ? JSON.parse(data.sentiment_progression) : [],
      primary_intents: data.primary_intents ? JSON.parse(data.primary_intents) : [],
      intent_categories: data.intent_categories ? JSON.parse(data.intent_categories) : {},
      main_topics: data.main_topics ? JSON.parse(data.main_topics) : [],
      keywords_frequency: data.keywords_frequency ? JSON.parse(data.keywords_frequency) : {},
      languages_detected: data.languages_detected ? JSON.parse(data.languages_detected) : []
    };
  }
}

module.exports = new TranscriptionService();
