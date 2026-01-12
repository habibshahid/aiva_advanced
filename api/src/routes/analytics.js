/**
 * Analytics & Reporting Routes
 * Advanced analytics endpoints for dashboards and reporting
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const db = require('../config/database');
const ResponseBuilder = require('../utils/response-builder');
const TranscriptionService = require('../services/TranscriptionService');

/**
 * @route POST /api/analytics/call/:callLogId/generate
 * @desc Generate session-level analytics for a call
 * @access Private (called by bridge service)
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

/**
 * @route GET /api/reports/dashboard
 * @desc Get overview dashboard data
 * @access Private
 */
router.get('/dashboard', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { tenant_id } = req.user;
    const { start_date, end_date, agent_id } = req.query;

    // Build date filter
    let dateFilter = '';
    const params = [tenant_id];

    if (start_date && end_date) {
      dateFilter = 'AND cl.start_time BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // Agent filter
    let agentFilter = '';
    if (agent_id) {
      agentFilter = 'AND cl.agent_id = ?';
      params.push(agent_id);
    }

    // Get call statistics
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        AVG(duration_seconds) as avg_duration,
        SUM(final_cost) as total_cost
      FROM yovo_tbl_aiva_call_logs cl
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    // Get sentiment distribution from analytics
    const [sentimentStats] = await db.query(`
      SELECT 
        overall_sentiment,
        COUNT(*) as count,
        AVG(overall_sentiment_score) as avg_score
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
      GROUP BY overall_sentiment
    `, params);

    // Get satisfaction metrics
    const [satisfactionStats] = await db.query(`
      SELECT 
        customer_satisfaction_indicator,
        COUNT(*) as count
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
      GROUP BY customer_satisfaction_indicator
    `, params);

    // Get top intents
    const [intents] = await db.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(intent_categories, '$.*')) as intent_data
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
      LIMIT 100
    `, params);

    // Process intents (aggregate from JSON)
    const intentMap = {};
    intents.forEach(row => {
      try {
        if (row.intent_data) {
          const intentObj = JSON.parse(row.intent_data);
          Object.entries(intentObj).forEach(([intent, count]) => {
            intentMap[intent] = (intentMap[intent] || 0) + count;
          });
        }
      } catch (e) {}
    });

    const topIntents = Object.entries(intentMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([intent, count]) => ({ intent, count }));

    // Get profanity statistics
    const [profanityStats] = await db.query(`
      SELECT 
        SUM(profanity_incidents) as total_incidents,
        SUM(CASE WHEN profanity_severity = 'high' THEN 1 ELSE 0 END) as high_severity,
        SUM(CASE WHEN profanity_severity = 'medium' THEN 1 ELSE 0 END) as medium_severity,
        SUM(CASE WHEN profanity_severity = 'low' THEN 1 ELSE 0 END) as low_severity
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    res.json(
      rb.success({
        call_stats: callStats[0],
        sentiment_distribution: sentimentStats,
        satisfaction_metrics: satisfactionStats,
        top_intents: topIntents,
        profanity_stats: profanityStats[0]
      })
    );

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json(
      rb.error('Failed to fetch dashboard data', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/reports/agent-performance
 * @desc Get agent performance metrics
 * @access Private
 */
router.get('/agent-performance', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { tenant_id } = req.user;
    const { start_date, end_date, agent_id, limit = 10 } = req.query;

    let dateFilter = '';
    const params = [tenant_id];

    if (start_date && end_date) {
      dateFilter = 'AND date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    let agentFilter = '';
    if (agent_id) {
      agentFilter = 'AND agent_id = ?';
      params.push(agent_id);
    }

    params.push(parseInt(limit));

    const [performance] = await db.query(`
      SELECT 
        ap.*,
        a.name as agent_name,
        a.type as agent_type
      FROM yovo_tbl_aiva_agent_performance ap
      JOIN yovo_tbl_aiva_agents a ON ap.agent_id = a.id
      WHERE ap.tenant_id = ? ${dateFilter} ${agentFilter}
      ORDER BY ap.date DESC, ap.satisfaction_rate DESC
      LIMIT ?
    `, params);

    // Parse JSON fields
    const processedPerformance = performance.map(p => ({
      ...p,
      top_intents: p.top_intents ? JSON.parse(p.top_intents) : [],
      top_topics: p.top_topics ? JSON.parse(p.top_topics) : []
    }));

    res.json(
      rb.success({ performance: processedPerformance, count: processedPerformance.length })
    );

  } catch (error) {
    console.error('Error fetching agent performance:', error);
    res.status(500).json(
      rb.error('Failed to fetch agent performance', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/reports/sentiment-trends
 * @desc Get sentiment trends over time
 * @access Private
 */
router.get('/sentiment-trends', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { tenant_id } = req.user;
    const { start_date, end_date, agent_id, granularity = 'day' } = req.query;

    let dateFilter = '';
    const params = [tenant_id];

    if (start_date && end_date) {
      dateFilter = 'AND cl.start_time BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    let agentFilter = '';
    if (agent_id) {
      agentFilter = 'AND cl.agent_id = ?';
      params.push(agent_id);
    }

    // Determine date grouping
    let dateGroup = 'DATE(cl.start_time)';
    if (granularity === 'hour') {
      dateGroup = 'DATE_FORMAT(cl.start_time, "%Y-%m-%d %H:00:00")';
    } else if (granularity === 'week') {
      dateGroup = 'YEARWEEK(cl.start_time)';
    } else if (granularity === 'month') {
      dateGroup = 'DATE_FORMAT(cl.start_time, "%Y-%m")';
    }

    const [trends] = await db.query(`
      SELECT 
        ${dateGroup} as period,
        COUNT(*) as total_interactions,
        AVG(ca.overall_sentiment_score) as avg_sentiment_score,
        SUM(CASE WHEN ca.overall_sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN ca.overall_sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN ca.overall_sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN ca.customer_satisfaction_indicator = 'likely_satisfied' THEN 1 ELSE 0 END) as satisfied_count,
        SUM(CASE WHEN ca.customer_satisfaction_indicator = 'likely_unsatisfied' THEN 1 ELSE 0 END) as unsatisfied_count
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter} ${agentFilter}
      GROUP BY period
      ORDER BY period ASC
    `, params);

    res.json(
      rb.success({ trends, count: trends.length })
    );

  } catch (error) {
    console.error('Error fetching sentiment trends:', error);
    res.status(500).json(
      rb.error('Failed to fetch sentiment trends', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/reports/detailed-calls
 * @desc Get detailed call reports with analytics
 * @access Private
 */
router.get('/detailed-calls', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { tenant_id } = req.user;
    const { 
      start_date, 
      end_date, 
      agent_id,
      sentiment,
      satisfaction,
      min_duration,
      max_duration,
      has_profanity,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereConditions = ['cl.tenant_id = ?'];
    const params = [tenant_id];

    if (start_date && end_date) {
      whereConditions.push('cl.start_time BETWEEN ? AND ?');
      params.push(start_date, end_date);
    }

    if (agent_id) {
      whereConditions.push('cl.agent_id = ?');
      params.push(agent_id);
    }

    if (sentiment) {
      whereConditions.push('ca.overall_sentiment = ?');
      params.push(sentiment);
    }

    if (satisfaction) {
      whereConditions.push('ca.customer_satisfaction_indicator = ?');
      params.push(satisfaction);
    }

    if (min_duration) {
      whereConditions.push('cl.duration_seconds >= ?');
      params.push(parseInt(min_duration));
    }

    if (max_duration) {
      whereConditions.push('cl.duration_seconds <= ?');
      params.push(parseInt(max_duration));
    }

    if (has_profanity === 'true') {
      whereConditions.push('ca.profanity_incidents > 0');
    }

    const whereClause = whereConditions.join(' AND ');

    // Get total count
    const [countResult] = await db.query(`
      SELECT COUNT(*) as total
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      WHERE ${whereClause}
    `, params);

    const total = countResult[0].total;

    // Get calls
    params.push(parseInt(limit), offset);

    const [calls] = await db.query(`
      SELECT 
        cl.*,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.customer_satisfaction_indicator,
        ca.profanity_incidents,
        ca.profanity_severity,
        ca.primary_intents,
        ca.main_topics,
        ca.issue_resolved,
        ca.transfer_requested,
        a.name as agent_name,
        a.type as agent_type
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      WHERE ${whereClause}
      ORDER BY cl.start_time DESC
      LIMIT ? OFFSET ?
    `, params);

    // Parse JSON fields
    const processedCalls = calls.map(c => ({
      ...c,
      primary_intents: c.primary_intents ? JSON.parse(c.primary_intents) : [],
      main_topics: c.main_topics ? JSON.parse(c.main_topics) : []
    }));

    res.json(
      rb.success({
        calls: processedCalls,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      })
    );

  } catch (error) {
    console.error('Error fetching detailed calls:', error);
    res.status(500).json(
      rb.error('Failed to fetch detailed calls', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/reports/call-details/:callLogId
 * @desc Get complete call details with transcriptions and analytics
 * @access Private
 */
router.get('/call-details/:callLogId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { callLogId } = req.params;

    // Get call log
    const [callLogs] = await db.query(`
      SELECT 
        cl.*,
        a.name as agent_name,
        a.type as agent_type,
        a.instructions as agent_instructions
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      WHERE cl.id = ?
    `, [callLogId]);

    if (callLogs.length === 0) {
      return res.status(404).json(
        rb.error('Call not found', 'NOT_FOUND')
      );
    }

    const call = callLogs[0];

    // Get analytics
    const [analytics] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_call_analytics WHERE call_log_id = ?',
      [callLogId]
    );

    // Get transcriptions
    const [transcriptions] = await db.query(`
      SELECT * FROM yovo_tbl_aiva_call_transcriptions 
      WHERE call_log_id = ? 
      ORDER BY sequence_number ASC
    `, [callLogId]);

    // Process analytics
    const processedAnalytics = analytics.length > 0 ? {
      ...analytics[0],
      sentiment_progression: analytics[0].sentiment_progression ? JSON.parse(analytics[0].sentiment_progression) : [],
      primary_intents: analytics[0].primary_intents ? JSON.parse(analytics[0].primary_intents) : [],
      intent_categories: analytics[0].intent_categories ? JSON.parse(analytics[0].intent_categories) : {},
      main_topics: analytics[0].main_topics ? JSON.parse(analytics[0].main_topics) : [],
      keywords_frequency: analytics[0].keywords_frequency ? JSON.parse(analytics[0].keywords_frequency) : {},
      emotion_timeline: analytics[0].emotion_timeline ? JSON.parse(analytics[0].emotion_timeline) : [],
      peak_emotions: analytics[0].peak_emotions ? JSON.parse(analytics[0].peak_emotions) : [],
      languages_detected: analytics[0].languages_detected ? JSON.parse(analytics[0].languages_detected) : []
    } : null;

    // Process transcriptions
    const processedTranscriptions = transcriptions.map(t => ({
      ...t,
      profane_words: t.profane_words ? JSON.parse(t.profane_words) : [],
      intents: t.intents ? JSON.parse(t.intents) : [],
      topics: t.topics ? JSON.parse(t.topics) : [],
      keywords: t.keywords ? JSON.parse(t.keywords) : [],
      emotion_tags: t.emotion_tags ? JSON.parse(t.emotion_tags) : []
    }));

    res.json(
      rb.success({
        call,
        analytics: processedAnalytics,
        transcriptions: processedTranscriptions
      })
    );

  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json(
      rb.error('Failed to fetch call details', 'SERVER_ERROR')
    );
  }
});

/**
 * @route GET /api/reports/profanity-report
 * @desc Get profanity incidents report
 * @access Private
 */
router.get('/profanity-report', verifyToken, checkPermission('view_analytics'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { tenant_id } = req.user;
    const { start_date, end_date, severity, limit = 50 } = req.query;

    let dateFilter = '';
    const params = [tenant_id];

    if (start_date && end_date) {
      dateFilter = 'AND cl.start_time BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    let severityFilter = '';
    if (severity) {
      severityFilter = 'AND ca.profanity_severity = ?';
      params.push(severity);
    }

    params.push(parseInt(limit));

    const [incidents] = await db.query(`
      SELECT 
        cl.id as call_log_id,
        cl.session_id,
        cl.caller_id,
        cl.start_time,
        cl.duration_seconds,
        ca.profanity_incidents,
        ca.profanity_severity,
        ca.profanity_by_customer,
        ca.profanity_by_agent,
        a.name as agent_name
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      WHERE cl.tenant_id = ? 
        AND ca.profanity_incidents > 0
        ${dateFilter}
        ${severityFilter}
      ORDER BY ca.profanity_incidents DESC, cl.start_time DESC
      LIMIT ?
    `, params);

    res.json(
      rb.success({ incidents, count: incidents.length })
    );

  } catch (error) {
    console.error('Error fetching profanity report:', error);
    res.status(500).json(
      rb.error('Failed to fetch profanity report', 'SERVER_ERROR')
    );
  }
});


/**
 * @route GET /api/analytics/overview
 * @desc Get overview dashboard metrics
 * @access Private
 */
router.get('/overview', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, agent_id } = req.query;

    // Default to last 30 days if no dates provided
    const dateFrom = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateTo = date_to || new Date().toISOString().split('T')[0];

    // Build WHERE clause
    let whereClause = 'WHERE tenant_id = ?';
    let params = [tenantId];

    if (agent_id) {
      whereClause += ' AND agent_id = ?';
      params.push(agent_id);
    }

    // 1. Get Call Metrics
    const [callMetrics] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        SUM(duration_seconds) as total_duration_seconds,
        AVG(duration_seconds) as avg_duration_seconds,
        SUM(final_cost) as total_call_cost
      FROM yovo_tbl_aiva_call_logs
      ${whereClause}
      AND DATE(start_time) BETWEEN ? AND ?
    `, [...params, dateFrom, dateTo]);

    // 2. Get Chat Metrics
    const [chatMetrics] = await db.query(`
      SELECT 
        COUNT(*) as total_chats,
        SUM(total_messages) as total_messages,
        SUM(total_cost) as total_chat_cost,
        AVG(total_messages) as avg_messages_per_session
      FROM yovo_tbl_aiva_chat_sessions
      ${whereClause}
      AND DATE(start_time) BETWEEN ? AND ?
    `, [...params, dateFrom, dateTo]);

    // 3. Get Sentiment Overview
    const [sentimentData] = await db.query(`
      SELECT 
        AVG(overall_sentiment_score) as avg_sentiment,
        AVG(positive_percentage) as avg_positive,
        AVG(negative_percentage) as avg_negative,
        AVG(neutral_percentage) as avg_neutral
      FROM (
        SELECT overall_sentiment_score, positive_percentage, negative_percentage, neutral_percentage
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ?
        ${agent_id ? 'AND cl.agent_id = ?' : ''}
        AND DATE(cl.start_time) BETWEEN ? AND ?
        
        UNION ALL
        
        SELECT overall_sentiment_score, positive_percentage, negative_percentage, neutral_percentage
        FROM yovo_tbl_aiva_chat_analytics cha
        JOIN yovo_tbl_aiva_chat_sessions cs ON cha.session_id = cs.id
        WHERE cs.tenant_id = ?
        ${agent_id ? 'AND cs.agent_id = ?' : ''}
        AND DATE(cs.start_time) BETWEEN ? AND ?
      ) combined_analytics
    `, agent_id 
      ? [tenantId, agent_id, dateFrom, dateTo, tenantId, agent_id, dateFrom, dateTo]
      : [tenantId, dateFrom, dateTo, tenantId, dateFrom, dateTo]
    );

    // 4. Get Customer Satisfaction
    const [satisfactionData] = await db.query(`
      SELECT 
        AVG(CASE 
          WHEN customer_satisfaction_indicator = 'satisfied' THEN 1.0
          WHEN customer_satisfaction_indicator = 'neutral' THEN 0.5
          ELSE 0.0
        END) * 100 as satisfaction_percentage,
        SUM(CASE WHEN issue_resolved = 1 THEN 1 ELSE 0 END) as resolved_count,
        COUNT(*) as total_with_indicator
      FROM (
        SELECT customer_satisfaction_indicator, issue_resolved
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ?
        ${agent_id ? 'AND cl.agent_id = ?' : ''}
        AND DATE(cl.start_time) BETWEEN ? AND ?
        
        UNION ALL
        
        SELECT customer_satisfaction_indicator, issue_resolved
        FROM yovo_tbl_aiva_chat_analytics cha
        JOIN yovo_tbl_aiva_chat_sessions cs ON cha.session_id = cs.id
        WHERE cs.tenant_id = ?
        ${agent_id ? 'AND cs.agent_id = ?' : ''}
        AND DATE(cs.start_time) BETWEEN ? AND ?
      ) combined_satisfaction
    `, agent_id 
      ? [tenantId, agent_id, dateFrom, dateTo, tenantId, agent_id, dateFrom, dateTo]
      : [tenantId, dateFrom, dateTo, tenantId, dateFrom, dateTo]
    );

    // 5. Get Active Agents Count
    const [agentData] = await db.query(`
      SELECT COUNT(DISTINCT agent_id) as active_agents
      FROM (
        SELECT agent_id FROM yovo_tbl_aiva_call_logs 
        WHERE tenant_id = ? AND DATE(start_time) BETWEEN ? AND ?
        UNION
        SELECT agent_id FROM yovo_tbl_aiva_chat_sessions 
        WHERE tenant_id = ? AND DATE(start_time) BETWEEN ? AND ?
      ) combined_agents
      WHERE agent_id IS NOT NULL
    `, [tenantId, dateFrom, dateTo, tenantId, dateFrom, dateTo]);

    // 6. Get Daily Trend Data - FIXED
    const [dailyTrends] = await db.query(`
      SELECT 
        DATE(date_time) as date,
        SUM(call_count) as calls,
        SUM(chat_count) as chats,
        SUM(total_cost) as cost
      FROM (
        SELECT 
          start_time as date_time,
          1 as call_count,
          0 as chat_count,
          final_cost as total_cost
        FROM yovo_tbl_aiva_call_logs
        WHERE tenant_id = ?
        ${agent_id ? 'AND agent_id = ?' : ''}
        AND DATE(start_time) BETWEEN ? AND ?
        
        UNION ALL
        
        SELECT 
          start_time as date_time,
          0 as call_count,
          1 as chat_count,
          total_cost
        FROM yovo_tbl_aiva_chat_sessions
        WHERE tenant_id = ?
        ${agent_id ? 'AND agent_id = ?' : ''}
        AND DATE(start_time) BETWEEN ? AND ?
      ) combined_activity
      GROUP BY DATE(date_time)
      ORDER BY date ASC
    `, agent_id 
      ? [tenantId, agent_id, dateFrom, dateTo, tenantId, agent_id, dateFrom, dateTo]
      : [tenantId, dateFrom, dateTo, tenantId, dateFrom, dateTo]
    );

    // 7. Get Top Agents
    const [topAgents] = await db.query(`
      SELECT 
        a.id,
        a.name,
        COUNT(*) as total_interactions,
        AVG(sentiment_score) as avg_sentiment,
        SUM(total_cost) as total_cost
      FROM (
        SELECT 
          cl.agent_id,
          ca.overall_sentiment_score as sentiment_score,
          cl.final_cost as total_cost
        FROM yovo_tbl_aiva_call_logs cl
        LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
        WHERE cl.tenant_id = ? AND DATE(cl.start_time) BETWEEN ? AND ?
        
        UNION ALL
        
        SELECT 
          cs.agent_id,
          cha.overall_sentiment_score as sentiment_score,
          cs.total_cost
        FROM yovo_tbl_aiva_chat_sessions cs
        LEFT JOIN yovo_tbl_aiva_chat_analytics cha ON cs.id = cha.session_id
        WHERE cs.tenant_id = ? AND DATE(cs.start_time) BETWEEN ? AND ?
      ) combined
      JOIN yovo_tbl_aiva_agents a ON combined.agent_id = a.id
      WHERE combined.agent_id IS NOT NULL
      GROUP BY a.id, a.name
      ORDER BY total_interactions DESC
      LIMIT 5
    `, [tenantId, dateFrom, dateTo, tenantId, dateFrom, dateTo]);

    // 8. Get Credit Balance
    const [tenantInfo] = await db.query(
      'SELECT credit_balance FROM yovo_tbl_aiva_tenants WHERE id = ?',
      [tenantId]
    );

    // Build response
    const response = {
      summary: {
        // Calls
        total_calls: callMetrics[0].total_calls || 0,
        completed_calls: callMetrics[0].completed_calls || 0,
        failed_calls: callMetrics[0].failed_calls || 0,
        total_call_duration_seconds: callMetrics[0].total_duration_seconds || 0,
        avg_call_duration_seconds: parseFloat(callMetrics[0].avg_duration_seconds || 0),
        
        // Chats
        total_chats: chatMetrics[0].total_chats || 0,
        total_messages: chatMetrics[0].total_messages || 0,
        avg_messages_per_session: parseFloat(chatMetrics[0].avg_messages_per_session || 0),
        
        // Total interactions
        total_interactions: (callMetrics[0].total_calls || 0) + (chatMetrics[0].total_chats || 0),
        
        // Sentiment
        avg_sentiment_score: parseFloat(sentimentData[0].avg_sentiment || 0),
        positive_percentage: parseFloat(sentimentData[0].avg_positive || 0),
        negative_percentage: parseFloat(sentimentData[0].avg_negative || 0),
        neutral_percentage: parseFloat(sentimentData[0].avg_neutral || 0),
        
        // Satisfaction
        satisfaction_percentage: parseFloat(satisfactionData[0].satisfaction_percentage || 0),
        resolved_count: satisfactionData[0].resolved_count || 0,
        resolution_rate: satisfactionData[0].total_with_indicator > 0 
          ? (satisfactionData[0].resolved_count / satisfactionData[0].total_with_indicator * 100)
          : 0,
        
        // Agents
        active_agents: agentData[0].active_agents || 0,
        
        // Cost
        total_cost: parseFloat((callMetrics[0].total_call_cost || 0) + (chatMetrics[0].total_chat_cost || 0)),
        total_call_cost: parseFloat(callMetrics[0].total_call_cost || 0),
        total_chat_cost: parseFloat(chatMetrics[0].total_chat_cost || 0),
        
        // Credits
        credit_balance: parseFloat(tenantInfo[0]?.credit_balance || 0)
      },
      
      daily_trends: dailyTrends.map(row => ({
        date: row.date,
        calls: row.calls || 0,
        chats: row.chats || 0,
        cost: parseFloat(row.cost || 0)
      })),
      
      top_agents: topAgents.map(agent => ({
        id: agent.id,
        name: agent.name,
        total_interactions: agent.total_interactions,
        avg_sentiment: parseFloat(agent.avg_sentiment || 0),
        total_cost: parseFloat(agent.total_cost || 0)
      })),
      
      filters: {
        date_from: dateFrom,
        date_to: dateTo,
        agent_id: agent_id || null
      }
    };

    res.json(rb.success(response));

  } catch (error) {
    console.error('Get overview analytics error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch analytics')
    );
  }
});

/**
 * @route GET /api/analytics/agents
 * @desc Get list of agents for filter dropdown
 * @access Private
 */
router.get('/agents', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;

    // FIXED: Removed 'status' column since it doesn't exist
    const [agents] = await db.query(
      `SELECT id, name, type 
       FROM yovo_tbl_aiva_agents 
       WHERE tenant_id = ?
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json(rb.success({ agents }));

  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch agents')
    );
  }
});

/**
 * @route GET /api/analytics/calls
 * @desc Get calls report with stats and pagination
 * @access Private
 */
router.get('/calls', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const {
      page = 1,
      limit = 20,
      date_from,
      date_to,
      agent_id,
      status,
      sentiment,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = ['cl.tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    if (agent_id) {
      whereConditions.push('cl.agent_id = ?');
      params.push(agent_id);
    }

    if (status) {
      whereConditions.push('cl.status = ?');
      params.push(status);
    }

    if (sentiment) {
      whereConditions.push('ca.overall_sentiment = ?');
      params.push(sentiment);
    }

    if (search) {
      whereConditions.push('(cl.session_id LIKE ? OR cl.caller_id LIKE ? OR a.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get stats for the filtered results
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        AVG(cl.duration_seconds) as avg_duration_seconds,
        SUM(cl.duration_seconds) as total_duration_seconds,
        SUM(CASE WHEN cl.status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN cl.status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        AVG(CASE 
          WHEN ca.customer_satisfaction_indicator = 'satisfied' THEN 100
          WHEN ca.customer_satisfaction_indicator = 'neutral' THEN 50
          WHEN ca.customer_satisfaction_indicator = 'dissatisfied' THEN 0
          ELSE NULL
        END) as avg_satisfaction
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      WHERE ${whereClause}
    `, params);

    const totalCalls = stats[0].total_calls || 0;
    const avgDuration = parseFloat(stats[0].avg_duration_seconds || 0);
    const totalMinutes = Math.round((stats[0].total_duration_seconds || 0) / 60);
    const successRate = totalCalls > 0 
      ? ((stats[0].completed_calls / totalCalls) * 100).toFixed(1)
      : 0;
    const avgSatisfaction = parseFloat(stats[0].avg_satisfaction || 0).toFixed(1);

    // Get calls with analytics
    const [calls] = await db.query(`
      SELECT 
        cl.*,
        a.name as agent_name,
        a.type as agent_type,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.customer_satisfaction_indicator,
        ca.issue_resolved,
        ca.primary_intents,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_call_transcriptions WHERE call_log_id = cl.id) as message_count
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      WHERE ${whereClause}
      ORDER BY cl.start_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Parse primary_intents
    const processedCalls = calls.map(call => ({
      ...call,
      primary_intent: call.primary_intents 
        ? (call.primary_intents)[0] || 'N/A'
        : 'N/A'
    }));

    res.json(rb.success({
      stats: {
        total_calls: totalCalls,
        avg_duration_seconds: avgDuration,
        total_minutes: totalMinutes,
        success_rate: parseFloat(successRate),
        avg_satisfaction: parseFloat(avgSatisfaction)
      },
      calls: processedCalls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCalls,
        pages: Math.ceil(totalCalls / parseInt(limit))
      }
    }));

  } catch (error) {
    console.error('Get calls report error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch calls report')
    );
  }
});

/**
 * @route GET /api/analytics/calls/:callId/details
 * @desc Get complete call details with cost breakdown
 * @access Private
 */
router.get('/calls/:callId/details', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { callId } = req.params;

    // Get call details
    const [calls] = await db.query(`
      SELECT 
        cl.*,
        a.name as agent_name,
        a.type as agent_type
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      WHERE cl.id = ? AND cl.tenant_id = ?
    `, [callId, tenantId]);

    if (calls.length === 0) {
      return res.status(404).json(ResponseBuilder.notFound('Call'));
    }

    const call = calls[0];

    // Get analytics
    const [analytics] = await db.query(`
      SELECT *
      FROM yovo_tbl_aiva_call_analytics
      WHERE call_log_id = ?
    `, [callId]);

    let processedAnalytics = null;
    if (analytics.length > 0) {
      processedAnalytics = {
        ...analytics[0],
        primary_intents: analytics[0].primary_intents ? (analytics[0].primary_intents) : [],
        languages_detected: analytics[0].languages_detected ? (analytics[0].languages_detected) : []
      };
    }

    // Calculate cost breakdown (estimate based on usage)
    const costBreakdown = {
      llm_completion: call.base_cost ? parseFloat(call.base_cost * 0.6).toFixed(4) : '0.0000',
      transcription: call.audio_input_seconds ? parseFloat((call.audio_input_seconds + call.audio_output_seconds || 0) * 0.0006).toFixed(4) : '0.0000',
      analysis: call.base_cost ? parseFloat(call.base_cost * 0.2).toFixed(4) : '0.0000',
      knowledge_search: call.base_cost ? parseFloat(call.base_cost * 0.1).toFixed(4) : '0.0000'
    };

    res.json(rb.success({
      call,
      analytics: processedAnalytics,
      cost_breakdown: costBreakdown
    }));

  } catch (error) {
    console.error('Get call details error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch call details')
    );
  }
});

/**
 * @route GET /api/analytics/calls/:callId/transcript
 * @desc Get call transcript with message-level analytics
 * @access Private
 */
router.get('/calls/:callId/transcript', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { callId } = req.params;

    // Verify ownership
    const [call] = await db.query(
      'SELECT id FROM yovo_tbl_aiva_call_logs WHERE id = ? AND tenant_id = ?',
      [callId, tenantId]
    );

    if (call.length === 0) {
      return res.status(404).json(ResponseBuilder.notFound('Call'));
    }

    // Get transcription with analytics
    const [messages] = await db.query(`
      SELECT 
        id,
        speaker,
        speaker_id,
        sequence_number,
        original_message,
        translated_message,
        language_detected,
        sentiment,
        sentiment_score,
        primary_intent,
        keywords,
        profanity_detected,
        timestamp,
        created_at
      FROM yovo_tbl_aiva_call_transcriptions
      WHERE call_log_id = ?
      ORDER BY sequence_number ASC
    `, [callId]);

    // Process keywords
    const processedMessages = messages.map(msg => ({
      ...msg,
      keywords: msg.keywords ? (msg.keywords) : []
    }));

    res.json(rb.success({
      call_id: callId,
      message_count: messages.length,
      messages: processedMessages
    }));

  } catch (error) {
    console.error('Get call transcript error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch transcript')
    );
  }
});

/**
 * @route GET /api/analytics/calls/export/csv
 * @desc Export calls report as CSV
 * @access Private
 */
router.get('/calls/export/csv', verifyToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const {
      date_from,
      date_to,
      agent_id,
      status,
      sentiment
    } = req.query;

    // Build WHERE clause
    let whereConditions = ['cl.tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    if (agent_id) {
      whereConditions.push('cl.agent_id = ?');
      params.push(agent_id);
    }

    if (status) {
      whereConditions.push('cl.status = ?');
      params.push(status);
    }

    if (sentiment) {
      whereConditions.push('ca.overall_sentiment = ?');
      params.push(sentiment);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get calls
    const [calls] = await db.query(`
      SELECT 
        cl.start_time,
        cl.caller_id,
        a.name as agent_name,
        cl.duration_seconds,
        cl.status,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.primary_intents,
        cl.final_cost,
        ca.customer_satisfaction_indicator,
        ca.issue_resolved
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      WHERE ${whereClause}
      ORDER BY cl.start_time DESC
    `, params);

    // Generate CSV
    const csvHeaders = [
      'Date/Time',
      'Phone Number',
      'Agent',
      'Duration (seconds)',
      'Status',
      'Sentiment',
      'Sentiment Score',
      'Intent',
      'Cost ($)',
      'Satisfaction',
      'Issue Resolved'
    ];

    const csvRows = calls.map(call => {
      const primaryIntent = call.primary_intents 
        ? (call.primary_intents)[0] || 'N/A'
        : 'N/A';

      return [
        new Date(call.start_time).toISOString(),
        call.caller_id || 'Unknown',
        call.agent_name || 'N/A',
        call.duration_seconds || 0,
        call.status,
        call.overall_sentiment || 'N/A',
        call.overall_sentiment_score ? parseFloat(call.overall_sentiment_score).toFixed(2) : 'N/A',
        primaryIntent,
        parseFloat(call.final_cost || 0).toFixed(4),
        call.customer_satisfaction_indicator || 'N/A',
        call.issue_resolved !== null ? (call.issue_resolved ? 'Yes' : 'No') : 'N/A'
      ];
    });

    // Build CSV content
    let csvContent = csvHeaders.join(',') + '\n';
    csvRows.forEach(row => {
      csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    // Send as file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="calls_report_${Date.now()}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export calls CSV error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to export calls report')
    );
  }
});

/**
 * @route GET /api/analytics/chats
 * @desc Get chat sessions report with stats and pagination
 * @access Private
 */
router.get('/chats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const {
      page = 1,
      limit = 20,
      date_from,
      date_to,
      agent_id,
      status,
      sentiment,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereConditions = ['cs.tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    if (agent_id) {
      whereConditions.push('cs.agent_id = ?');
      params.push(agent_id);
    }

    if (status) {
      whereConditions.push('cs.status = ?');
      params.push(status);
    }

    if (sentiment) {
      whereConditions.push('ca.overall_sentiment = ?');
      params.push(sentiment);
    }

    if (search) {
      whereConditions.push('(cs.id LIKE ? OR cs.session_name LIKE ? OR a.name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get stats for the filtered results
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_chats,
        AVG(cs.total_messages) as avg_messages,
        SUM(cs.total_messages) as total_messages,
        SUM(CASE WHEN cs.status = 'ended' THEN 1 ELSE 0 END) as ended_chats,
        SUM(CASE WHEN cs.status = 'active' THEN 1 ELSE 0 END) as active_chats,
        AVG(CASE 
          WHEN ca.customer_satisfaction_indicator = 'satisfied' THEN 100
          WHEN ca.customer_satisfaction_indicator = 'neutral' THEN 50
          WHEN ca.customer_satisfaction_indicator = 'dissatisfied' THEN 0
          ELSE NULL
        END) as avg_satisfaction
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_chat_analytics ca ON cs.id = ca.session_id
      WHERE ${whereClause}
    `, params);

    const totalChats = stats[0].total_chats || 0;
    const avgMessages = parseFloat(stats[0].avg_messages || 0);
    const totalMessages = stats[0].total_messages || 0;
    const successRate = totalChats > 0 
      ? ((stats[0].ended_chats / totalChats) * 100).toFixed(1)
      : 0;
    const avgSatisfaction = parseFloat(stats[0].avg_satisfaction || 0).toFixed(1);

    // Get chat sessions with analytics
    const [chats] = await db.query(`
      SELECT 
        cs.id,
		cs.tenant_id,
		cs.agent_id,
		cs.user_id,
		cs.session_name,
		cs.status,
		cs.start_time,
		cs.end_time,
		cs.total_messages,
		cs.total_cost,
		cs.channel,
		cs.channel_user_id,
		cs.channel_user_name,
		cs.model_provider,
        a.name as agent_name,
        a.type as agent_type,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.customer_satisfaction_indicator,
        ca.issue_resolved,
        ca.primary_intents
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_chat_analytics ca ON cs.id = ca.session_id
      WHERE ${whereClause}
      ORDER BY cs.start_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Parse primary_intents
    const processedChats = chats.map(chat => ({
      ...chat,
      primary_intent: chat.primary_intents 
        ? (chat.primary_intents)[0] || 'N/A'
        : 'N/A'
    }));

    res.json(rb.success({
      stats: {
        total_chats: totalChats,
        avg_messages: avgMessages,
        total_messages: totalMessages,
        success_rate: parseFloat(successRate),
        avg_satisfaction: parseFloat(avgSatisfaction)
      },
      chats: processedChats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalChats,
        pages: Math.ceil(totalChats / parseInt(limit))
      }
    }));

  } catch (error) {
    console.error('Get chat sessions error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch chat sessions')
    );
  }
});

/**
 * @route GET /api/analytics/chats/:sessionId/details
 * @desc Get complete chat session details with cost breakdown
 * @access Private
 */
router.get('/chats/:sessionId/details', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { sessionId } = req.params;

    // Get session details
    const [sessions] = await db.query(`
      SELECT 
        cs.*,
        a.name as agent_name,
        a.type as agent_type
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      WHERE cs.id = ? AND cs.tenant_id = ?
    `, [sessionId, tenantId]);

    if (sessions.length === 0) {
      return res.status(404).json(ResponseBuilder.notFound('Chat session'));
    }

    const session = sessions[0];

    // Get analytics
    const [analytics] = await db.query(`
      SELECT *
      FROM yovo_tbl_aiva_chat_analytics
      WHERE session_id = ?
    `, [sessionId]);

    let processedAnalytics = null;
    if (analytics.length > 0) {
      processedAnalytics = {
        ...analytics[0],
        primary_intents: analytics[0].primary_intents ? (analytics[0].primary_intents) : [],
        languages_detected: analytics[0].languages_detected ? (analytics[0].languages_detected) : []
      };
    }

    // Calculate cost breakdown (estimate based on usage)
    const costBreakdown = {
      llm_completion: session.total_cost ? parseFloat(session.total_cost * 0.65).toFixed(4) : '0.0000',
      analysis: session.total_cost ? parseFloat(session.total_cost * 0.20).toFixed(4) : '0.0000',
      knowledge_search: session.total_cost ? parseFloat(session.total_cost * 0.10).toFixed(4) : '0.0000',
      image_processing: session.total_cost ? parseFloat(session.total_cost * 0.05).toFixed(4) : '0.0000'
    };

    res.json(rb.success({
      session,
      analytics: processedAnalytics,
      cost_breakdown: costBreakdown
    }));

  } catch (error) {
    console.error('Get chat session details error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch session details')
    );
  }
});

/**
 * @route GET /api/analytics/calls/:callId/details
 * @desc Get complete call details with cost breakdown
 * @access Private
 */
router.get('/calls/:callId/details', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { callId } = req.params;

    // Get call details
    const [calls] = await db.query(`
      SELECT 
        cl.*,
        a.name as agent_name,
        a.type as agent_type
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_agents a ON cl.agent_id = a.id
      WHERE cl.id = ? AND cl.tenant_id = ?
    `, [callId, tenantId]);

    if (calls.length === 0) {
      return res.status(404).json(ResponseBuilder.notFound('Call'));
    }

    const call = calls[0];

    // Get analytics
    const [analytics] = await db.query(`
      SELECT *
      FROM yovo_tbl_aiva_call_analytics
      WHERE call_log_id = ?
    `, [callId]);

    let processedAnalytics = null;
    if (analytics.length > 0) {
      processedAnalytics = {
        ...analytics[0],
        primary_intents: analytics[0].primary_intents ? (analytics[0].primary_intents) : [],
        languages_detected: analytics[0].languages_detected ? (analytics[0].languages_detected) : []
      };
    }

    // Calculate cost breakdown
    // For custom/intent-ivr providers, use actual costs from provider_metadata
    // For other providers, estimate from base_cost
    let costBreakdown;
    
    // Parse provider_metadata if it's a string
    let providerMetadata = call.provider_metadata;
    if (typeof providerMetadata === 'string') {
      try {
        providerMetadata = JSON.parse(providerMetadata);
      } catch (e) {
        providerMetadata = null;
      }
    }
    
    if ((call.provider === 'intent-ivr' || call.provider === 'custom') && providerMetadata) {
      // Use actual costs from provider_metadata
      costBreakdown = {
        llm_completion: providerMetadata.llm_cost 
          ? parseFloat(providerMetadata.llm_cost).toFixed(4) 
          : '0.0000',
        transcription: providerMetadata.stt_cost 
          ? parseFloat(providerMetadata.stt_cost).toFixed(4) 
          : '0.0000',
        tts: providerMetadata.tts_cost 
          ? parseFloat(providerMetadata.tts_cost).toFixed(4) 
          : '0.0000',
        analysis: processedAnalytics?.total_analysis_cost 
          ? parseFloat(processedAnalytics.total_analysis_cost).toFixed(4) 
          : '0.0000',
        knowledge_search: '0.0000' // KB search cost tracked separately if any
      };
    } else {
      // Estimate costs for openai/deepgram providers
      const baseCost = parseFloat(call.base_cost) || 0;
      const audioInputSec = parseFloat(call.audio_input_seconds) || 0;
      const audioOutputSec = parseFloat(call.audio_output_seconds) || 0;
      
      costBreakdown = {
        llm_completion: baseCost ? (baseCost * 0.6).toFixed(4) : '0.0000',
        transcription: audioInputSec ? ((audioInputSec + audioOutputSec) * 0.0006).toFixed(4) : '0.0000',
        analysis: baseCost ? (baseCost * 0.2).toFixed(4) : '0.0000',
        knowledge_search: baseCost ? (baseCost * 0.1).toFixed(4) : '0.0000'
      };
    }

    res.json(rb.success({
      call,
      analytics: processedAnalytics,
      cost_breakdown: costBreakdown
    }));

  } catch (error) {
    console.error('Get call details error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch call details')
    );
  }
});

/**
 * @route GET /api/analytics/chats/:sessionId/messages
 * @desc Get chat messages with message-level analytics
 * @access Private
 */
router.get('/chats/:sessionId/messages', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { sessionId } = req.params;

    // Verify ownership
    const [session] = await db.query(
      'SELECT id FROM yovo_tbl_aiva_chat_sessions WHERE id = ? AND tenant_id = ?',
      [sessionId, tenantId]
    );

    if (session.length === 0) {
      return res.status(404).json(ResponseBuilder.notFound('Chat session'));
    }

    // Get messages
    const [messages] = await db.query(`
      SELECT 
        id,
        role,
        content,
        content_html,
        sources,
        images,
        products,
        cost,
        tokens_input,
        tokens_output,
        agent_transfer_requested,
        created_at
      FROM yovo_tbl_aiva_chat_messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `, [sessionId]);

    // Process JSON fields
    const processedMessages = messages.map(msg => ({
      ...msg,
      sources: msg.sources ? (msg.sources) : [],
      images: msg.images ? (msg.images) : [],
      products: msg.products ? (msg.products) : []
    }));

    res.json(rb.success({
      session_id: sessionId,
      message_count: messages.length,
      messages: processedMessages
    }));

  } catch (error) {
    console.error('Get chat messages error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch messages')
    );
  }
});

/**
 * @route GET /api/analytics/chats/export/csv
 * @desc Export chat sessions as CSV
 * @access Private
 */
router.get('/chats/export/csv', verifyToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const {
      date_from,
      date_to,
      agent_id,
      status,
      sentiment
    } = req.query;

    // Build WHERE clause
    let whereConditions = ['cs.tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    if (agent_id) {
      whereConditions.push('cs.agent_id = ?');
      params.push(agent_id);
    }

    if (status) {
      whereConditions.push('cs.status = ?');
      params.push(status);
    }

    if (sentiment) {
      whereConditions.push('ca.overall_sentiment = ?');
      params.push(sentiment);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get chats
    const [chats] = await db.query(`
      SELECT 
        cs.start_time,
        cs.end_time,
        cs.session_name,
        a.name as agent_name,
        cs.total_messages,
        cs.status,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.primary_intents,
        cs.total_cost,
        ca.customer_satisfaction_indicator,
        ca.issue_resolved
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_chat_analytics ca ON cs.id = ca.session_id
      WHERE ${whereClause}
      ORDER BY cs.start_time DESC
    `, params);

    // Generate CSV
    const csvHeaders = [
      'Start Time',
      'End Time',
      'Session Name',
      'Agent',
      'Total Messages',
      'Status',
      'Sentiment',
      'Sentiment Score',
      'Intent',
      'Cost ($)',
      'Satisfaction',
      'Issue Resolved'
    ];

    const csvRows = chats.map(chat => {
      const primaryIntent = chat.primary_intents 
        ? (chat.primary_intents)[0] || 'N/A'
        : 'N/A';

      return [
        new Date(chat.start_time).toISOString(),
        chat.end_time ? new Date(chat.end_time).toISOString() : 'N/A',
        chat.session_name || 'N/A',
        chat.agent_name || 'N/A',
        chat.total_messages || 0,
        chat.status,
        chat.overall_sentiment || 'N/A',
        chat.overall_sentiment_score ? parseFloat(chat.overall_sentiment_score).toFixed(2) : 'N/A',
        primaryIntent,
        parseFloat(chat.total_cost || 0).toFixed(4),
        chat.customer_satisfaction_indicator || 'N/A',
        chat.issue_resolved !== null ? (chat.issue_resolved ? 'Yes' : 'No') : 'N/A'
      ];
    });

    // Build CSV content
    let csvContent = csvHeaders.join(',') + '\n';
    csvRows.forEach(row => {
      csvContent += row.map(cell => `"${cell}"`).join(',') + '\n';
    });

    // Send as file
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chat_sessions_${Date.now()}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export chats CSV error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to export chat sessions')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/sentiment-trends
 * @desc Get sentiment trends over time (daily breakdown)
 * @access Private
 */
router.get('/advanced/sentiment-trends', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, channel, agent_id } = req.query;

    let whereConditions = ['tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    if (agent_id) {
      whereConditions.push('agent_id = ?');
      params.push(agent_id);
    }

    // Build WHERE clauses with proper table prefixes
    let callWhereConditions = ['cl.tenant_id = ?'];
    let callParams = [tenantId];
    
    if (date_from && date_to) {
      callWhereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      callParams.push(date_from, date_to);
    }
    
    if (agent_id) {
      callWhereConditions.push('cl.agent_id = ?');
      callParams.push(agent_id);
    }

    let chatWhereConditions = ['cs.tenant_id = ?'];
    let chatParams = [tenantId];
    
    if (date_from && date_to) {
      chatWhereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      chatParams.push(date_from, date_to);
    }
    
    if (agent_id) {
      chatWhereConditions.push('cs.agent_id = ?');
      chatParams.push(agent_id);
    }

    // Get daily sentiment distribution from both calls and chats
    const [callSentiments] = await db.query(`
      SELECT 
        DATE(cl.start_time) as date,
        ca.overall_sentiment as sentiment,
        COUNT(*) as count
      FROM yovo_tbl_aiva_call_logs cl
      LEFT JOIN yovo_tbl_aiva_call_analytics ca ON cl.id = ca.call_log_id
      WHERE ${callWhereConditions.join(' AND ')}
      GROUP BY DATE(cl.start_time), ca.overall_sentiment
      ORDER BY DATE(cl.start_time) DESC
    `, callParams);

    const [chatSentiments] = await db.query(`
      SELECT 
        DATE(cs.start_time) as date,
        ca.overall_sentiment as sentiment,
        COUNT(*) as count
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_chat_analytics ca ON cs.id = ca.session_id
      WHERE ${chatWhereConditions.join(' AND ')}
      GROUP BY DATE(cs.start_time), ca.overall_sentiment
      ORDER BY DATE(cs.start_time) DESC
    `, chatParams);

    // Combine and aggregate
    const sentimentMap = new Map();
    
    [...callSentiments, ...chatSentiments].forEach(row => {
      const dateKey = row.date;
      if (!sentimentMap.has(dateKey)) {
        sentimentMap.set(dateKey, {
          date: dateKey,
          positive: 0,
          negative: 0,
          neutral: 0,
          mixed: 0,
          total: 0
        });
      }
      
      const data = sentimentMap.get(dateKey);
      const sentiment = row.sentiment || 'neutral';
      data[sentiment] = (data[sentiment] || 0) + parseInt(row.count);
      data.total += parseInt(row.count);
    });

    // Convert to array and calculate percentages
    const trends = Array.from(sentimentMap.values()).map(day => ({
      date: day.date,
      positive: day.positive,
      negative: day.negative,
      neutral: day.neutral,
      mixed: day.mixed,
      total: day.total,
      positive_pct: day.total > 0 ? ((day.positive / day.total) * 100).toFixed(1) : 0,
      negative_pct: day.total > 0 ? ((day.negative / day.total) * 100).toFixed(1) : 0,
      neutral_pct: day.total > 0 ? ((day.neutral / day.total) * 100).toFixed(1) : 0,
      mixed_pct: day.total > 0 ? ((day.mixed / day.total) * 100).toFixed(1) : 0
    })).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(rb.success({ trends }));

  } catch (error) {
    console.error('Get sentiment trends error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch sentiment trends')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/top-intents
 * @desc Get top customer intents aggregated from all interactions
 * @access Private
 */
router.get('/advanced/top-intents', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, limit = 10 } = req.query;

    let whereConditions = ['tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    // Build WHERE clauses with proper table prefixes
    let callWhereConditions = ['cl.tenant_id = ?'];
    let callParams = [tenantId];
    
    if (date_from && date_to) {
      callWhereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      callParams.push(date_from, date_to);
    }

    let chatWhereConditions = ['cs.tenant_id = ?'];
    let chatParams = [tenantId];
    
    if (date_from && date_to) {
      chatWhereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      chatParams.push(date_from, date_to);
    }

    // Get intents from call analytics
    const [callIntents] = await db.query(`
      SELECT 
        ca.primary_intents
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE ${callWhereConditions.join(' AND ')}
      AND ca.primary_intents IS NOT NULL
    `, callParams);

    // Get intents from chat analytics
    const [chatIntents] = await db.query(`
      SELECT 
        ca.primary_intents
      FROM yovo_tbl_aiva_chat_analytics ca
      JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
      WHERE ${chatWhereConditions.join(' AND ')}
      AND ca.primary_intents IS NOT NULL
    `, chatParams);

    // Aggregate intents
    const intentCounts = new Map();
    
    [...callIntents, ...chatIntents].forEach(row => {
      try {
        const intents = (row.primary_intents);
        intents.forEach(intent => {
          intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });

    const totalIntents = Array.from(intentCounts.values()).reduce((sum, count) => sum + count, 0);

    // Convert to array and sort
    const topIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: totalIntents > 0 ? ((count / totalIntents) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json(rb.success({ intents: topIntents, total: totalIntents }));

  } catch (error) {
    console.error('Get top intents error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch top intents')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/profanity-stats
 * @desc Get profanity tracking statistics
 * @access Private
 */
router.get('/advanced/profanity-stats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let whereConditions = ['tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    // Build WHERE clauses with proper table prefixes
    let callWhereConditions = ['cl.tenant_id = ?'];
    let callParams = [tenantId];
    
    if (date_from && date_to) {
      callWhereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      callParams.push(date_from, date_to);
    }

    let chatWhereConditions = ['cs.tenant_id = ?'];
    let chatParams = [tenantId];
    
    if (date_from && date_to) {
      chatWhereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      chatParams.push(date_from, date_to);
    }

    // Get profanity from call analytics
    const [callProfanity] = await db.query(`
      SELECT 
        ca.profanity_incidents,
        ca.profanity_severity,
        ca.profanity_by_customer,
        ca.profanity_by_agent
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE ${callWhereConditions.join(' AND ')}
      AND ca.profanity_incidents > 0
    `, callParams);

    // Get profanity from chat analytics (note: uses profanity_by_user, not profanity_by_customer)
    const [chatProfanity] = await db.query(`
      SELECT 
        ca.profanity_incidents,
        ca.profanity_severity,
        ca.profanity_by_user as profanity_by_customer,
        0 as profanity_by_agent
      FROM yovo_tbl_aiva_chat_analytics ca
      JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
      WHERE ${chatWhereConditions.join(' AND ')}
      AND ca.profanity_incidents > 0
    `, chatParams);

    const allProfanity = [...callProfanity, ...chatProfanity];

    const stats = {
      total_incidents: allProfanity.reduce((sum, row) => sum + (row.profanity_incidents || 0), 0),
      by_severity: {
        low: 0,
        medium: 0,
        high: 0
      },
      by_speaker: {
        customer: 0,
        agent: 0
      },
      sessions_with_profanity: allProfanity.length
    };

    // Aggregate by severity
    allProfanity.forEach(row => {
      const severity = row.profanity_severity || 'low';
      stats.by_severity[severity] = (stats.by_severity[severity] || 0) + 1;
      
      // Aggregate by speaker
      stats.by_speaker.customer += (row.profanity_by_customer || 0);
      stats.by_speaker.agent += (row.profanity_by_agent || 0);
    });

    // Calculate estimated average score based on severity
    // Low = 0.3, Medium = 0.6, High = 0.9
    let totalScore = 0;
    allProfanity.forEach(row => {
      const severity = row.profanity_severity || 'low';
      if (severity === 'low') totalScore += 0.3;
      else if (severity === 'medium') totalScore += 0.6;
      else if (severity === 'high') totalScore += 0.9;
    });
    stats.avg_score = allProfanity.length > 0 ? (totalScore / allProfanity.length).toFixed(2) : '0.00';

    res.json(rb.success(stats));

  } catch (error) {
    console.error('Get profanity stats error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch profanity stats')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/top-keywords
 * @desc Get most frequent keywords extracted from conversations
 * @access Private
 */
router.get('/advanced/top-keywords', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, limit = 20 } = req.query;

    let whereConditions = ['tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    // Build WHERE clauses with proper table prefixes
    let callWhereConditions = ['cl.tenant_id = ?'];
    let callParams = [tenantId];
    
    if (date_from && date_to) {
      callWhereConditions.push('DATE(ct.created_at) BETWEEN ? AND ?');
      callParams.push(date_from, date_to);
    }

    // Get keywords from call transcriptions
    const [callKeywords] = await db.query(`
      SELECT ct.keywords
      FROM yovo_tbl_aiva_call_transcriptions ct
      JOIN yovo_tbl_aiva_call_logs cl ON ct.call_log_id = cl.id
      WHERE ${callWhereConditions.join(' AND ')}
      AND ct.keywords IS NOT NULL
    `, callParams);

    // Aggregate keywords
    const keywordCounts = new Map();
    
    callKeywords.forEach(row => {
      try {
        const keywords = (row.keywords);
        keywords.forEach(keyword => {
          const normalized = keyword.toLowerCase().trim();
          if (normalized.length > 2) { // Skip very short keywords
            keywordCounts.set(normalized, (keywordCounts.get(normalized) || 0) + 1);
          }
        });
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Convert to array and sort
    const topKeywords = Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json(rb.success({ keywords: topKeywords }));

  } catch (error) {
    console.error('Get top keywords error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch top keywords')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/topics
 * @desc Get top topics AND keywords from conversations
 * @access Private
 */
router.get('/advanced/topics', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, limit = 10 } = req.query;

    let callParams = [tenantId];
    let chatParams = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(cl.start_time) BETWEEN ? AND ?';
      callParams.push(date_from, date_to);
      chatParams.push(date_from, date_to);
    }

    // Get topics AND keywords from call analytics
    const [callData] = await db.query(`
      SELECT ca.main_topics, ca.keywords_frequency
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter}
        AND (ca.main_topics IS NOT NULL OR ca.keywords_frequency IS NOT NULL)
    `, callParams);

    // Get topics AND keywords from chat analytics
    const [chatData] = await db.query(`
      SELECT ca.main_topics, ca.keywords_frequency
      FROM yovo_tbl_aiva_chat_analytics ca
      JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
      WHERE cs.tenant_id = ? ${dateFilter.replace('cl.start_time', 'cs.start_time')}
        AND (ca.main_topics IS NOT NULL OR ca.keywords_frequency IS NOT NULL)
    `, chatParams);

    // Aggregate topics
    const topicCounts = new Map();
    const keywordCounts = new Map();
    
    [...callData, ...chatData].forEach(row => {
      // Process topics
      if (row.main_topics) {
        try {
          const topics = (row.main_topics);
          if (Array.isArray(topics)) {
            topics.forEach(topic => {
              const topicName = typeof topic === 'string' ? topic : (topic.topic || topic.name || 'Unknown');
              topicCounts.set(topicName, (topicCounts.get(topicName) || 0) + 1);
            });
          }
        } catch (e) {
          console.error('Error parsing main_topics:', e);
        }
      }
      
      // Process keywords
      if (row.keywords_frequency) {
        try {
          const keywords = (row.keywords_frequency);
          if (typeof keywords === 'object') {
            Object.entries(keywords).forEach(([keyword, count]) => {
              keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + parseInt(count));
            });
          }
        } catch (e) {
          console.error('Error parsing keywords_frequency:', e);
        }
      }
    });

    // Convert topics to array and sort
    const topics = Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    // Convert keywords to array and sort
    const keywords = Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json(rb.success({ 
      topics, 
      keywords,
      total_analyzed: callData.length + chatData.length
    }));

  } catch (error) {
    console.error('Get topics error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch topics')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/keywords
 * @desc Get top keywords from all interactions
 * @access Private
 */
router.get('/advanced/keywords', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, limit = 20 } = req.query;

    let callParams = [tenantId];
    let chatParams = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(cl.start_time) BETWEEN ? AND ?';
      callParams.push(date_from, date_to);
      chatParams.push(date_from, date_to);
    }

    // Get keywords from call analytics
    const [callKeywords] = await db.query(`
      SELECT ca.keywords_frequency
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE cl.tenant_id = ? ${dateFilter}
        AND ca.keywords_frequency IS NOT NULL
    `, callParams);

    // Get keywords from chat analytics
    const [chatKeywords] = await db.query(`
      SELECT ca.keywords_frequency
      FROM yovo_tbl_aiva_chat_analytics ca
      JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
      WHERE cs.tenant_id = ? ${dateFilter.replace('cl.start_time', 'cs.start_time')}
        AND ca.keywords_frequency IS NOT NULL
    `, chatParams);

    // Aggregate keywords
    const keywordCounts = new Map();
    
    [...callKeywords, ...chatKeywords].forEach(row => {
      try {
        const keywords = JSON.parse(row.keywords_frequency);
        if (typeof keywords === 'object') {
          Object.entries(keywords).forEach(([keyword, count]) => {
            keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + parseInt(count));
          });
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    // Convert to array and sort
    const keywords = Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, parseInt(limit));

    res.json(rb.success({ keywords }));

  } catch (error) {
    console.error('Get keywords error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch keywords')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/language-distribution
 * @desc Get language usage distribution
 * @access Private
 */
router.get('/advanced/language-distribution', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let whereConditions = ['tenant_id = ?'];
    let params = [tenantId];

    if (date_from && date_to) {
      whereConditions.push('DATE(created_at) BETWEEN ? AND ?');
      params.push(date_from, date_to);
    }

    // Build WHERE clauses with proper table prefixes
    let callWhereConditions = ['cl.tenant_id = ?'];
    let callParams = [tenantId];
    
    if (date_from && date_to) {
      callWhereConditions.push('DATE(cl.start_time) BETWEEN ? AND ?');
      callParams.push(date_from, date_to);
    }

    let chatWhereConditions = ['cs.tenant_id = ?'];
    let chatParams = [tenantId];
    
    if (date_from && date_to) {
      chatWhereConditions.push('DATE(cs.start_time) BETWEEN ? AND ?');
      chatParams.push(date_from, date_to);
    }

    // Get languages from call analytics
    const [callLanguages] = await db.query(`
      SELECT 
        ca.languages_detected
      FROM yovo_tbl_aiva_call_analytics ca
      JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
      WHERE ${callWhereConditions.join(' AND ')}
      AND ca.languages_detected IS NOT NULL
    `, callParams);

    // Get languages from chat analytics
    const [chatLanguages] = await db.query(`
      SELECT 
        ca.languages_detected
      FROM yovo_tbl_aiva_chat_analytics ca
      JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
      WHERE ${chatWhereConditions.join(' AND ')}
      AND ca.languages_detected IS NOT NULL
    `, chatParams);

    // Aggregate languages
    const languageCounts = new Map();
    
    [...callLanguages, ...chatLanguages].forEach(row => {
      try {
        const languages = (row.languages_detected);
        // Take the first language (primary)
        if (languages.length > 0) {
          const lang = languages[0].toLowerCase();
          languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
        }
      } catch (e) {
        // Skip invalid JSON
      }
    });

    const totalInteractions = Array.from(languageCounts.values()).reduce((sum, count) => sum + count, 0);

    // Convert to array and sort
    const distribution = Array.from(languageCounts.entries())
      .map(([language, count]) => ({
        language,
        count,
        percentage: totalInteractions > 0 ? ((count / totalInteractions) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.count - a.count);

    res.json(rb.success({ distribution, total: totalInteractions }));

  } catch (error) {
    console.error('Get language distribution error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch language distribution')
    );
  }
});

/**
 * @route GET /api/analytics/advanced/summary
 * @desc Get complete advanced analytics summary
 * @access Private
 */
router.get('/advanced/summary', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, channel, agent_id } = req.query;

    // Make parallel requests to all endpoints
    const baseParams = { date_from, date_to, channel, agent_id };
    
    const [
      sentimentTrends,
      topIntents,
      profanityStats,
      topKeywords,
      languageDistribution
    ] = await Promise.all([
      // These would normally call the other route handlers
      // For simplicity, we'll return a flag to call them separately from frontend
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: {} }),
      Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] })
    ]);

    res.json(rb.success({
      message: 'Use individual endpoints for each analytics section',
      endpoints: {
        sentiment_trends: '/api/analytics/advanced/sentiment-trends',
        top_intents: '/api/analytics/advanced/top-intents',
        profanity_stats: '/api/analytics/advanced/profanity-stats',
        top_keywords: '/api/analytics/advanced/top-keywords',
        language_distribution: '/api/analytics/advanced/language-distribution'
      }
    }));

  } catch (error) {
    console.error('Get advanced analytics summary error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch analytics summary')
    );
  }
});

/**
 * @route GET /api/analytics/costs/overview
 * @desc Get cost overview with credit balance and breakdown
 * @access Private
 */
router.get('/costs/overview', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    // Build date filter
    let dateFilter = '';
    let params = [tenantId];
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Get tenant credit balance
    const [tenants] = await db.query(
      'SELECT credit_balance FROM yovo_tbl_aiva_tenants WHERE id = ?',
      [tenantId]
    );
    
    const tenant = tenants[0] || { credit_balance: 0 };

    // Calculate total purchased from transactions (if table exists)
    let creditsPurchased = 0;
    try {
      const [transactions] = await db.query(`
        SELECT COALESCE(SUM(amount), 0) as total_purchased
        FROM yovo_tbl_aiva_credit_transactions
        WHERE tenant_id = ? AND transaction_type = 'purchase'
      `, [tenantId]);
      creditsPurchased = parseFloat(transactions[0].total_purchased) || 0;
    } catch (err) {
      // Table might not exist, use balance as estimate
      creditsPurchased = parseFloat(tenant.credit_balance) || 0;
    }

    // Get total costs for current period
    const [periodCosts] = await db.query(`
      SELECT 
        SUM(cost) as period_cost,
        COUNT(*) as period_interactions
      FROM (
        SELECT final_cost as cost FROM yovo_tbl_aiva_call_logs WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
        UNION ALL
        SELECT total_cost as cost FROM yovo_tbl_aiva_chat_sessions WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
      ) as combined
    `, [...params, ...params]);

    // Get total costs ever
    const [totalCosts] = await db.query(`
      SELECT 
        SUM(cost) as total_cost_ever
      FROM (
        SELECT final_cost as cost FROM yovo_tbl_aiva_call_logs WHERE tenant_id = ?
        UNION ALL
        SELECT total_cost as cost FROM yovo_tbl_aiva_chat_sessions WHERE tenant_id = ?
      ) as combined
    `, [tenantId, tenantId]);

    const creditsBalance = parseFloat(tenant.credit_balance) || 0;
    const totalUsedEver = parseFloat(totalCosts[0].total_cost_ever) || 0;
    const periodCost = parseFloat(periodCosts[0].period_cost) || 0;
    const periodInteractions = parseInt(periodCosts[0].period_interactions) || 0;

    // Calculate estimated days remaining (based on daily average)
    const dailyAverage = periodInteractions > 0 ? periodCost / 21 : 0; // Assuming 21 days in period
    const estimatedDaysRemaining = dailyAverage > 0 ? Math.floor(creditsBalance / dailyAverage) : 999;

    // Get breakdown by category
    const [callBaseCosts] = await db.query(`
      SELECT 
        SUM(base_cost) as base_cost,
        SUM(final_cost) as total_cost,
        COUNT(*) as call_count
      FROM yovo_tbl_aiva_call_logs 
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
    `, params);

    const [chatCosts] = await db.query(`
      SELECT 
        SUM(total_cost) as total_cost,
        COUNT(*) as chat_count
      FROM yovo_tbl_aiva_chat_sessions 
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
    `, params);

    // Estimate call cost breakdown (50% LLM, 30% transcription, 20% analysis)
    const callBaseTotal = parseFloat(callBaseCosts[0].base_cost) || 0;
    const callFinalTotal = parseFloat(callBaseCosts[0].total_cost) || 0;
    const callLlmEstimate = callBaseTotal * 0.50;
    const callTranscriptionEstimate = callBaseTotal * 0.30;
    const callAnalysisEstimate = callBaseTotal * 0.20;

    // Chat costs - estimate from total_cost (70% LLM, 30% analysis)
    const chatTotal = parseFloat(chatCosts[0].total_cost) || 0;
    const chatLlmEstimate = chatTotal * 0.70;
    const chatAnalysisEstimate = chatTotal * 0.30;

    // Combined totals
    const llmTotal = callLlmEstimate + chatLlmEstimate;
    const transcriptionTotal = callTranscriptionEstimate;
    const analysisTotal = callAnalysisEstimate + chatAnalysisEstimate;

    const overview = {
      credits: {
        balance: creditsBalance.toFixed(2),
        purchased: creditsPurchased.toFixed(2),
        used_total: totalUsedEver.toFixed(2),
        used_period: periodCost.toFixed(2),
        estimated_days_remaining: estimatedDaysRemaining,
        usage_percentage: creditsPurchased > 0 ? ((totalUsedEver / creditsPurchased) * 100).toFixed(1) : 0
      },
      period: {
        total_cost: periodCost.toFixed(2),
        total_interactions: periodInteractions,
        llm_cost: llmTotal.toFixed(2),
        llm_percentage: periodCost > 0 ? ((llmTotal / periodCost) * 100).toFixed(1) : 0,
        transcription_cost: transcriptionTotal.toFixed(2),
        transcription_percentage: periodCost > 0 ? ((transcriptionTotal / periodCost) * 100).toFixed(1) : 0,
        analysis_cost: analysisTotal.toFixed(2),
        analysis_percentage: periodCost > 0 ? ((analysisTotal / periodCost) * 100).toFixed(1) : 0
      }
    };

    res.json(rb.success(overview));

  } catch (error) {
    console.error('Get cost overview error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch cost overview')
    );
  }
});

/**
 * @route GET /api/analytics/costs/trends
 * @desc Get daily cost trends by category
 * @access Private
 */
router.get('/costs/trends', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Get daily costs from calls (using base_cost and final_cost)
    const [callCosts] = await db.query(`
      SELECT 
        DATE(start_time) as date,
        SUM(base_cost) as base_cost,
        SUM(final_cost) as total_cost,
        COUNT(*) as call_count
      FROM yovo_tbl_aiva_call_logs
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
      GROUP BY DATE(start_time)
      ORDER BY DATE(start_time) ASC
    `, params);

    // Get daily costs from chats
    const [chatCosts] = await db.query(`
      SELECT 
        DATE(start_time) as date,
        SUM(total_cost) as total_cost,
        COUNT(*) as chat_count
      FROM yovo_tbl_aiva_chat_sessions
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
      GROUP BY DATE(start_time)
      ORDER BY DATE(start_time) ASC
    `, params);

    // Combine and aggregate by date
    const trendsMap = new Map();
    
    // Process call costs (estimate breakdown: 50% LLM, 30% transcription, 20% analysis)
    callCosts.forEach(row => {
      const dateKey = row.date;
      if (!trendsMap.has(dateKey)) {
        trendsMap.set(dateKey, {
          date: dateKey,
          llm_cost: 0,
          transcription_cost: 0,
          analysis_cost: 0,
          total_cost: 0
        });
      }
      
      const data = trendsMap.get(dateKey);
      const baseAmount = parseFloat(row.base_cost) || 0;
      data.llm_cost += baseAmount * 0.50;
      data.transcription_cost += baseAmount * 0.30;
      data.analysis_cost += baseAmount * 0.20;
      data.total_cost += parseFloat(row.total_cost) || 0;
    });

    // Process chat costs (estimate from total_cost: 70% LLM, 30% analysis)
    chatCosts.forEach(row => {
      const dateKey = row.date;
      if (!trendsMap.has(dateKey)) {
        trendsMap.set(dateKey, {
          date: dateKey,
          llm_cost: 0,
          transcription_cost: 0,
          analysis_cost: 0,
          total_cost: 0
        });
      }
      
      const data = trendsMap.get(dateKey);
      const totalAmount = parseFloat(row.total_cost) || 0;
      data.llm_cost += totalAmount * 0.70;
      data.analysis_cost += totalAmount * 0.30;
      data.total_cost += totalAmount;
    });

    const trends = Array.from(trendsMap.values()).map(day => ({
      date: day.date,
      llm_cost: parseFloat(day.llm_cost.toFixed(6)),
      transcription_cost: parseFloat(day.transcription_cost.toFixed(6)),
      analysis_cost: parseFloat(day.analysis_cost.toFixed(6)),
      total_cost: parseFloat(day.total_cost.toFixed(6))
    }));

    res.json(rb.success({ trends }));

  } catch (error) {
    console.error('Get cost trends error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch cost trends')
    );
  }
});

/**
 * @route GET /api/analytics/costs/breakdown
 * @desc Get detailed cost breakdown by service type
 * @access Private
 */
router.get('/costs/breakdown', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Since we don't have individual cost columns, estimate from base_cost
    
    // Get total costs from calls and chats
    const [callCosts] = await db.query(`
      SELECT 
        SUM(base_cost) as base_cost,
        SUM(final_cost) as total_cost,
        COUNT(*) as call_count
      FROM yovo_tbl_aiva_call_logs
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
    `, params);

    const [chatCosts] = await db.query(`
      SELECT 
        SUM(total_cost) as total_cost,
        COUNT(*) as chat_count
      FROM yovo_tbl_aiva_chat_sessions
      WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')}
    `, params);

    const callBase = parseFloat(callCosts[0].base_cost) || 0;
    const callTotal = parseFloat(callCosts[0].total_cost) || 0;
    const callCount = parseInt(callCosts[0].call_count) || 0;
    
    const chatTotal = parseFloat(chatCosts[0].total_cost) || 0;
    const chatCount = parseInt(chatCosts[0].chat_count) || 0;

    const totalCost = callTotal + chatTotal;

    // Estimated breakdown based on typical usage patterns
    // Call costs: 50% LLM, 30% transcription, 20% analysis
    const callLlmCost = callBase * 0.50;
    const callTranscriptionCost = callBase * 0.30;
    const callAnalysisCost = callBase * 0.20;

    // Chat costs: 70% LLM, 30% analysis
    const chatLlmCost = chatTotal * 0.70;
    const chatAnalysisCost = chatTotal * 0.30;

    // Total LLM costs (calls + chats)
    const totalLlmCost = callLlmCost + chatLlmCost;
    
    // Analysis breakdown (44% sentiment, 33% intent, 23% language)
    const totalAnalysisCost = callAnalysisCost + chatAnalysisCost;
    const sentimentCost = totalAnalysisCost * 0.44;
    const intentCost = totalAnalysisCost * 0.33;
    const languageCost = totalAnalysisCost * 0.23;

    const breakdown = [
      {
        name: 'LLM Completions',
        description: 'GPT-4o-mini API calls',
        icon: '🤖',
        cost: totalLlmCost,
        percentage: totalCost > 0 ? ((totalLlmCost / totalCost) * 100).toFixed(1) : 0
      },
      {
        name: 'Voice Transcription',
        description: 'Call audio to text',
        icon: '🎤',
        cost: callTranscriptionCost,
        percentage: totalCost > 0 ? ((callTranscriptionCost / totalCost) * 100).toFixed(1) : 0
      },
      {
        name: 'Sentiment Analysis',
        description: 'Emotion & sentiment detection',
        icon: '🔬',
        cost: sentimentCost,
        percentage: totalCost > 0 ? ((sentimentCost / totalCost) * 100).toFixed(1) : 0
      },
      {
        name: 'Intent Detection',
        description: 'Purpose identification',
        icon: '🎯',
        cost: intentCost,
        percentage: totalCost > 0 ? ((intentCost / totalCost) * 100).toFixed(1) : 0
      },
      {
        name: 'Language Processing',
        description: 'Detection & translation',
        icon: '🌍',
        cost: languageCost,
        percentage: totalCost > 0 ? ((languageCost / totalCost) * 100).toFixed(1) : 0
      },
      {
        name: 'Other Services',
        description: 'Additional API calls',
        icon: '⚙️',
        cost: totalCost - (totalLlmCost + callTranscriptionCost + totalAnalysisCost),
        percentage: totalCost > 0 ? (((totalCost - (totalLlmCost + callTranscriptionCost + totalAnalysisCost)) / totalCost) * 100).toFixed(1) : 0
      }
    ];

    // Sort by cost descending and format
    breakdown.sort((a, b) => b.cost - a.cost);
    breakdown.forEach(item => {
      item.cost = parseFloat(item.cost.toFixed(2));
    });

    res.json(rb.success({ breakdown, total: totalCost.toFixed(2) }));

  } catch (error) {
    console.error('Get cost breakdown error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch cost breakdown')
    );
  }
});

/**
 * @route GET /api/analytics/agents/performance
 * @desc Get agent performance metrics with costs
 * @access Private
 */
router.get('/agents/performance', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let dateFilter = '';
    let callParams = [tenantId];
    let chatParams = [tenantId];
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      callParams.push(date_from, date_to);
      chatParams.push(date_from, date_to);
    }

    // Get agents
    const [agents] = await db.query(
      'SELECT id, name FROM yovo_tbl_aiva_agents WHERE tenant_id = ? AND is_active = 1',
      [tenantId]
    );

    const performance = [];

    for (const agent of agents) {
      // Get call metrics
      const [callMetrics] = await db.query(`
        SELECT 
          COUNT(*) as call_count,
          AVG(duration_seconds) as avg_duration,
          SUM(final_cost) as call_cost
        FROM yovo_tbl_aiva_call_logs
        WHERE tenant_id = ? AND agent_id = ? ${dateFilter}
      `, [tenantId, agent.id, ...callParams.slice(1)]);

      // Get chat metrics
      const [chatMetrics] = await db.query(`
        SELECT 
          COUNT(*) as chat_count,
          SUM(total_cost) as chat_cost
        FROM yovo_tbl_aiva_chat_sessions
        WHERE tenant_id = ? AND agent_id = ? ${dateFilter.replace('created_at', 'start_time')}
      `, [tenantId, agent.id, ...chatParams.slice(1)]);

      // Get sentiment from analytics
      const [sentiment] = await db.query(`
        SELECT AVG(overall_sentiment_score) as avg_sentiment
        FROM (
          SELECT ca.overall_sentiment_score
          FROM yovo_tbl_aiva_call_analytics ca
          JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
          WHERE cl.tenant_id = ? AND cl.agent_id = ? ${dateFilter.replace('created_at', 'cl.start_time')}
          UNION ALL
          SELECT ca.overall_sentiment_score
          FROM yovo_tbl_aiva_chat_analytics ca
          JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
          WHERE cs.tenant_id = ? AND cs.agent_id = ? ${dateFilter.replace('created_at', 'cs.start_time')}
        ) as combined
      `, [tenantId, agent.id, ...callParams.slice(1), tenantId, agent.id, ...chatParams.slice(1)]);

      // Get resolution rate
      const [resolutionRate] = await db.query(`
        SELECT 
          AVG(CASE WHEN issue_resolved = 1 THEN 1 ELSE 0 END) as resolution_rate
        FROM (
          SELECT ca.issue_resolved
          FROM yovo_tbl_aiva_call_analytics ca
          JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
          WHERE cl.tenant_id = ? AND cl.agent_id = ? ${dateFilter.replace('created_at', 'cl.start_time')}
          UNION ALL
          SELECT ca.issue_resolved
          FROM yovo_tbl_aiva_chat_analytics ca
          JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
          WHERE cs.tenant_id = ? AND cs.agent_id = ? ${dateFilter.replace('created_at', 'cs.start_time')}
        ) as combined
      `, [tenantId, agent.id, ...callParams.slice(1), tenantId, agent.id, ...chatParams.slice(1)]);

      const callCount = parseInt(callMetrics[0].call_count) || 0;
      const chatCount = parseInt(chatMetrics[0].chat_count) || 0;
      const totalInteractions = callCount + chatCount;
      
      const callCost = parseFloat(callMetrics[0].call_cost) || 0;
      const chatCost = parseFloat(chatMetrics[0].chat_cost) || 0;
      const totalCost = callCost + chatCost;

      const avgSentiment = parseFloat(sentiment[0].avg_sentiment) || 0;
      const resolutionRateValue = parseFloat(resolutionRate[0].resolution_rate) || 0;
      const avgDuration = parseInt(callMetrics[0].avg_duration) || 0;

      // Calculate performance score (weighted average)
      const sentimentScore = avgSentiment * 100; // 0-100
      const resolutionScore = resolutionRateValue * 100; // 0-100
      const performanceScore = (sentimentScore * 0.5) + (resolutionScore * 0.5);

      performance.push({
        agent_id: agent.id,
        agent_name: agent.name,
        agent_email: agent.name, // Use name since email doesn't exist
        total_interactions: totalInteractions,
        call_interactions: callCount,
        chat_interactions: chatCount,
        avg_sentiment: avgSentiment.toFixed(2),
        resolution_rate: (resolutionRateValue * 100).toFixed(1),
        avg_duration_seconds: avgDuration,
        avg_duration_formatted: `${Math.floor(avgDuration / 60)}:${String(avgDuration % 60).padStart(2, '0')}`,
        total_cost: totalCost.toFixed(2),
        cost_per_interaction: totalInteractions > 0 ? (totalCost / totalInteractions).toFixed(3) : '0.000',
        performance_score: performanceScore.toFixed(1),
        performance_grade: performanceScore >= 90 ? 'good' : performanceScore >= 75 ? 'average' : 'poor'
      });
    }

    // Sort by performance score descending
    performance.sort((a, b) => parseFloat(b.performance_score) - parseFloat(a.performance_score));

    res.json(rb.success({ agents: performance }));

  } catch (error) {
    console.error('Get agent performance error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch agent performance')
    );
  }
});

/**
 * @route GET /api/analytics/satisfaction/overview
 * @desc Get overall satisfaction metrics
 * @access Private
 */
router.get('/satisfaction/overview', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, agent_id } = req.query;

    // Build filters
    let dateFilter = '';
    let params = [tenantId];
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    let agentFilter = '';
    if (agent_id) {
      agentFilter = 'AND agent_id = ?';
      params.push(agent_id);
    }

    // Get session feedback stats
    const [sessionFeedback] = await db.query(`
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN rating = 'GOOD' THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN rating = 'BAD' THEN 1 ELSE 0 END) as bad_count
      FROM yovo_tbl_aiva_session_feedback
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    // Get message feedback stats
    const [messageFeedback] = await db.query(`
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN rating = 'USEFUL' THEN 1 ELSE 0 END) as useful_count,
        SUM(CASE WHEN rating = 'NOT_USEFUL' THEN 1 ELSE 0 END) as not_useful_count
      FROM yovo_tbl_aiva_message_feedback
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    // Get resolution stats from both calls and chats
    const [resolutionStats] = await db.query(`
      SELECT 
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_count,
        COUNT(*) as total_interactions
      FROM (
        SELECT 
          CASE 
            WHEN ca.resolution_intent IN ('issue_resolved', 'query_answered', 'task_completed') THEN 1 
            ELSE 0 
          END as resolved
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ? ${dateFilter.replace('created_at', 'cl.start_time')} ${agentFilter.replace('agent_id', 'cl.agent_id')}
        UNION ALL
        SELECT issue_resolved as resolved
        FROM yovo_tbl_aiva_chat_analytics ca
        JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
        WHERE cs.tenant_id = ? ${dateFilter.replace('created_at', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
      ) as combined
    `, [...params, ...params]);

    // Get escalation stats from chat messages
    const [escalationStats] = await db.query(`
      SELECT 
        COUNT(DISTINCT cm.session_id) as escalated_sessions,
        (SELECT COUNT(DISTINCT session_id) FROM yovo_tbl_aiva_chat_messages 
         WHERE session_id IN (
           SELECT id FROM yovo_tbl_aiva_chat_sessions 
           WHERE tenant_id = ? ${dateFilter.replace('created_at', 'start_time')} ${agentFilter}
         )
        ) as total_sessions
      FROM yovo_tbl_aiva_chat_messages cm
      JOIN yovo_tbl_aiva_chat_sessions cs ON cm.session_id = cs.id
      WHERE cs.tenant_id = ? ${dateFilter.replace('created_at', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
        AND cm.agent_transfer_requested = 1
    `, [...params, ...params]);

    // Get average response time
    const [responseTime] = await db.query(`
      SELECT AVG(response_time) as avg_response_time
      FROM (
        SELECT 
          TIMESTAMPDIFF(SECOND, 
            LAG(cm.created_at) OVER (PARTITION BY cm.session_id ORDER BY cm.created_at),
            cm.created_at
          ) as response_time
        FROM yovo_tbl_aiva_chat_messages cm
        JOIN yovo_tbl_aiva_chat_sessions cs ON cm.session_id = cs.id
        WHERE cs.tenant_id = ? ${dateFilter.replace('created_at', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
          AND cm.role = 'assistant'
      ) as times
      WHERE response_time IS NOT NULL AND response_time > 0 AND response_time < 300
    `, params);

    const totalFeedback = parseInt(sessionFeedback[0].total_feedback) || 0;
    const goodCount = parseInt(sessionFeedback[0].good_count) || 0;
    const badCount = parseInt(sessionFeedback[0].bad_count) || 0;
    
    const totalMessageFeedback = parseInt(messageFeedback[0].total_feedback) || 0;
    const usefulCount = parseInt(messageFeedback[0].useful_count) || 0;
    const notUsefulCount = parseInt(messageFeedback[0].not_useful_count) || 0;

    const resolvedCount = parseInt(resolutionStats[0].resolved_count) || 0;
    const totalInteractions = parseInt(resolutionStats[0].total_interactions) || 0;

    const escalatedSessions = parseInt(escalationStats[0].escalated_sessions) || 0;
    const totalSessions = parseInt(escalationStats[0].total_sessions) || 1;

    const avgResponseTime = parseFloat(responseTime[0].avg_response_time) || 0;

    const overview = {
      satisfaction: {
        total_feedback: totalFeedback,
        good_count: goodCount,
        bad_count: badCount,
        satisfaction_rate: totalFeedback > 0 ? ((goodCount / totalFeedback) * 100).toFixed(1) : '0.0'
      },
      message_usefulness: {
        total_feedback: totalMessageFeedback,
        useful_count: usefulCount,
        not_useful_count: notUsefulCount,
        usefulness_rate: totalMessageFeedback > 0 ? ((usefulCount / totalMessageFeedback) * 100).toFixed(1) : '0.0'
      },
      resolution: {
        resolved_count: resolvedCount,
        total_interactions: totalInteractions,
        resolution_rate: totalInteractions > 0 ? ((resolvedCount / totalInteractions) * 100).toFixed(1) : '0.0'
      },
      escalation: {
        escalated_sessions: escalatedSessions,
        total_sessions: totalSessions,
        escalation_rate: ((escalatedSessions / totalSessions) * 100).toFixed(1),
        first_contact_resolution_rate: (((totalSessions - escalatedSessions) / totalSessions) * 100).toFixed(1)
      },
      response_time: {
        avg_seconds: Math.round(avgResponseTime),
        avg_formatted: `${Math.floor(avgResponseTime / 60)}:${String(Math.round(avgResponseTime % 60)).padStart(2, '0')}`
      }
    };

    res.json(rb.success(overview));

  } catch (error) {
    console.error('Get satisfaction overview error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch satisfaction overview')
    );
  }
});

/**
 * @route GET /api/analytics/satisfaction/trends
 * @desc Get daily satisfaction trends
 * @access Private
 */
router.get('/satisfaction/trends', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Get daily satisfaction trends
    const [trends] = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as total_feedback,
        SUM(CASE WHEN rating = 'GOOD' THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN rating = 'BAD' THEN 1 ELSE 0 END) as bad_count
      FROM yovo_tbl_aiva_session_feedback
      WHERE tenant_id = ? ${dateFilter}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `, params);

    const formattedTrends = trends.map(row => ({
      date: row.date,
      total: parseInt(row.total_feedback),
      good: parseInt(row.good_count),
      bad: parseInt(row.bad_count),
      satisfaction_rate: parseInt(row.total_feedback) > 0 ? 
        ((parseInt(row.good_count) / parseInt(row.total_feedback)) * 100).toFixed(1) : '0.0'
    }));

    res.json(rb.success({ trends: formattedTrends }));

  } catch (error) {
    console.error('Get satisfaction trends error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch satisfaction trends')
    );
  }
});

/**
 * @route GET /api/analytics/satisfaction/feedback
 * @desc Get detailed feedback with comments
 * @access Private
 */
router.get('/satisfaction/feedback', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, rating, limit = 20 } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    let ratingFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(sf.created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    if (rating && (rating === 'GOOD' || rating === 'BAD')) {
      ratingFilter = 'AND sf.rating = ?';
      params.push(rating);
    }

    params.push(parseInt(limit));

    // Get session feedback with session details
    const [feedback] = await db.query(`
      SELECT 
        sf.id,
        sf.session_id,
        sf.agent_id,
        sf.rating,
        sf.comment,
        sf.created_at,
        a.name as agent_name,
        cs.start_time as session_start,
        ca.overall_sentiment,
        ca.overall_sentiment_score,
        ca.primary_intents
      FROM yovo_tbl_aiva_session_feedback sf
      JOIN yovo_tbl_aiva_chat_sessions cs ON sf.session_id = cs.id
      LEFT JOIN yovo_tbl_aiva_agents a ON sf.agent_id = a.id
      LEFT JOIN yovo_tbl_aiva_chat_analytics ca ON ca.session_id = cs.id
      WHERE sf.tenant_id = ? ${dateFilter} ${ratingFilter}
      ORDER BY sf.created_at DESC
      LIMIT ?
    `, params);

    const formattedFeedback = feedback.map(row => ({
      id: row.id,
      session_id: row.session_id,
      agent_id: row.agent_id,
      agent_name: row.agent_name || 'Unknown',
      rating: row.rating,
      comment: row.comment,
      sentiment: row.overall_sentiment,
      sentiment_score: parseFloat(row.overall_sentiment_score) || 0,
      intents: row.primary_intents ? (row.primary_intents) : [],
      created_at: row.created_at,
      session_start: row.session_start
    }));

    res.json(rb.success({ feedback: formattedFeedback }));

  } catch (error) {
    console.error('Get satisfaction feedback error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch satisfaction feedback')
    );
  }
});

/**
 * @route GET /api/analytics/satisfaction/by-agent
 * @desc Get satisfaction breakdown by agent
 * @access Private
 */
router.get('/satisfaction/by-agent', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(sf.created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    const [agentStats] = await db.query(`
      SELECT 
        sf.agent_id,
        a.name as agent_name,
        COUNT(*) as total_feedback,
        SUM(CASE WHEN sf.rating = 'GOOD' THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN sf.rating = 'BAD' THEN 1 ELSE 0 END) as bad_count
      FROM yovo_tbl_aiva_session_feedback sf
      LEFT JOIN yovo_tbl_aiva_agents a ON sf.agent_id = a.id
      WHERE sf.tenant_id = ? ${dateFilter}
      GROUP BY sf.agent_id, a.name
      ORDER BY good_count DESC
    `, params);

    const formattedStats = agentStats.map(row => ({
      agent_id: row.agent_id,
      agent_name: row.agent_name || 'Unknown',
      total_feedback: parseInt(row.total_feedback),
      good_count: parseInt(row.good_count),
      bad_count: parseInt(row.bad_count),
      satisfaction_rate: parseInt(row.total_feedback) > 0 ? 
        ((parseInt(row.good_count) / parseInt(row.total_feedback)) * 100).toFixed(1) : '0.0'
    }));

    res.json(rb.success({ agents: formattedStats }));

  } catch (error) {
    console.error('Get satisfaction by agent error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch satisfaction by agent')
    );
  }
});

/**
 * @route GET /api/analytics/satisfaction/by-intent
 * @desc Get satisfaction breakdown by intent
 * @access Private
 */
router.get('/satisfaction/by-intent', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(sf.created_at) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Get satisfaction by primary intent from chat analytics
    const [intentStats] = await db.query(`
      SELECT 
        JSON_UNQUOTE(JSON_EXTRACT(ca.primary_intents, '$[0]')) as intent,
        COUNT(*) as total_feedback,
        SUM(CASE WHEN sf.rating = 'GOOD' THEN 1 ELSE 0 END) as good_count,
        SUM(CASE WHEN sf.rating = 'BAD' THEN 1 ELSE 0 END) as bad_count
      FROM yovo_tbl_aiva_session_feedback sf
      JOIN yovo_tbl_aiva_chat_analytics ca ON sf.session_id = ca.session_id
      WHERE sf.tenant_id = ? ${dateFilter}
        AND ca.primary_intents IS NOT NULL
      GROUP BY intent
      HAVING intent IS NOT NULL
      ORDER BY good_count DESC
      LIMIT 10
    `, params);

    const formattedStats = intentStats.map(row => ({
      intent: row.intent || 'unknown',
      total_feedback: parseInt(row.total_feedback),
      good_count: parseInt(row.good_count),
      bad_count: parseInt(row.bad_count),
      satisfaction_rate: parseInt(row.total_feedback) > 0 ? 
        ((parseInt(row.good_count) / parseInt(row.total_feedback)) * 100).toFixed(1) : '0.0'
    }));

    res.json(rb.success({ intents: formattedStats }));

  } catch (error) {
    console.error('Get satisfaction by intent error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch satisfaction by intent')
    );
  }
});

/**
 * @route GET /api/analytics/overview/summary
 * @desc Get comprehensive summary metrics for overview dashboard
 * @access Private
 */
router.get('/overview/summary', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, agent_id } = req.query;

    let dateFilter = '';
    let params = [tenantId];
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(start_time) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    let agentFilter = '';
    if (agent_id) {
      agentFilter = 'AND agent_id = ?';
      params.push(agent_id);
    }

    // Get call stats - FIXED: use duration_seconds instead of duration
    const [callStats] = await db.query(`
      SELECT 
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_calls,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds ELSE NULL END) as avg_call_duration,
        SUM(final_cost) as total_call_cost
      FROM yovo_tbl_aiva_call_logs
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    // Get chat stats
    const [chatStats] = await db.query(`
      SELECT 
        COUNT(*) as total_chats,
        SUM(total_cost) as total_chat_cost,
        AVG(total_messages) as avg_messages_per_session
      FROM yovo_tbl_aiva_chat_sessions
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
    `, params);

    // Get sentiment stats from both calls and chats
    const [sentimentStats] = await db.query(`
      SELECT 
        SUM(CASE WHEN overall_sentiment = 'positive' THEN 1 ELSE 0 END) as positive_count,
        SUM(CASE WHEN overall_sentiment = 'negative' THEN 1 ELSE 0 END) as negative_count,
        SUM(CASE WHEN overall_sentiment = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
        SUM(CASE WHEN overall_sentiment = 'mixed' THEN 1 ELSE 0 END) as mixed_count,
        AVG(overall_sentiment_score) as avg_sentiment_score,
        COUNT(*) as total_with_sentiment
      FROM (
        SELECT overall_sentiment, overall_sentiment_score
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ? ${dateFilter.replace('start_time', 'cl.start_time')} ${agentFilter.replace('agent_id', 'cl.agent_id')}
        UNION ALL
        SELECT overall_sentiment, overall_sentiment_score
        FROM yovo_tbl_aiva_chat_analytics ca
        JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
        WHERE cs.tenant_id = ? ${dateFilter.replace('start_time', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
      ) as combined
    `, [...params, ...params]);

    // Get profanity stats
    const [profanityStats] = await db.query(`
      SELECT SUM(profanity_incidents) as total_profanity
      FROM (
        SELECT profanity_incidents
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ? ${dateFilter.replace('start_time', 'cl.start_time')} ${agentFilter.replace('agent_id', 'cl.agent_id')}
        UNION ALL
        SELECT profanity_incidents
        FROM yovo_tbl_aiva_chat_analytics ca
        JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
        WHERE cs.tenant_id = ? ${dateFilter.replace('start_time', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
      ) as combined
    `, [...params, ...params]);

    // Get satisfaction stats
    const [satisfactionStats] = await db.query(`
      SELECT 
        COUNT(*) as total_feedback,
        SUM(CASE WHEN rating = 'GOOD' THEN 1 ELSE 0 END) as good_count
      FROM yovo_tbl_aiva_session_feedback
      WHERE tenant_id = ? ${dateFilter.replace('start_time', 'created_at')} ${agentFilter}
    `, params);

    // Get resolution stats
    const [resolutionStats] = await db.query(`
      SELECT 
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_count,
        COUNT(*) as total_interactions
      FROM (
        SELECT 
          CASE 
            WHEN ca.resolution_intent IN ('issue_resolved', 'query_answered', 'task_completed') THEN 1 
            ELSE 0 
          END as resolved
        FROM yovo_tbl_aiva_call_analytics ca
        JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
        WHERE cl.tenant_id = ? ${dateFilter.replace('start_time', 'cl.start_time')} ${agentFilter.replace('agent_id', 'cl.agent_id')}
        UNION ALL
        SELECT issue_resolved as resolved
        FROM yovo_tbl_aiva_chat_analytics ca
        JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
        WHERE cs.tenant_id = ? ${dateFilter.replace('start_time', 'cs.start_time')} ${agentFilter.replace('agent_id', 'cs.agent_id')}
      ) as combined
    `, [...params, ...params]);

    // Get active agents count
    const [agentCount] = await db.query(`
      SELECT COUNT(DISTINCT agent_id) as active_agents
      FROM (
        SELECT agent_id FROM yovo_tbl_aiva_call_logs 
        WHERE tenant_id = ? ${dateFilter} ${agentFilter}
        UNION
        SELECT agent_id FROM yovo_tbl_aiva_chat_sessions 
        WHERE tenant_id = ? ${dateFilter} ${agentFilter}
      ) as combined
    `, [...params, ...params]);

    // Get tenant credit balance
    const [tenantInfo] = await db.query(
      'SELECT credit_balance FROM yovo_tbl_aiva_tenants WHERE id = ?',
      [tenantId]
    );

    const totalCalls = parseInt(callStats[0].total_calls) || 0;
    const totalChats = parseInt(chatStats[0].total_chats) || 0;
    const totalInteractions = totalCalls + totalChats;

    const totalCost = parseFloat(callStats[0].total_call_cost || 0) + parseFloat(chatStats[0].total_chat_cost || 0);

    const totalWithSentiment = parseInt(sentimentStats[0].total_with_sentiment) || 1;
    const positiveCount = parseInt(sentimentStats[0].positive_count) || 0;
    const negativeCount = parseInt(sentimentStats[0].negative_count) || 0;
    const neutralCount = parseInt(sentimentStats[0].neutral_count) || 0;
    const mixedCount = parseInt(sentimentStats[0].mixed_count) || 0;

    const totalFeedback = parseInt(satisfactionStats[0].total_feedback) || 1;
    const goodCount = parseInt(satisfactionStats[0].good_count) || 0;

    const resolvedCount = parseInt(resolutionStats[0].resolved_count) || 0;
    const totalResolvable = parseInt(resolutionStats[0].total_interactions) || 1;

    const summary = {
      // Core metrics
      total_interactions: totalInteractions,
      total_calls: totalCalls,
      total_chats: totalChats,
      completed_calls: parseInt(callStats[0].completed_calls) || 0,
      failed_calls: parseInt(callStats[0].failed_calls) || 0,
      
      // Performance metrics
      avg_call_duration: parseFloat(callStats[0].avg_call_duration) || 0,
      avg_messages_per_session: parseFloat(chatStats[0].avg_messages_per_session) || 0,
      active_agents: parseInt(agentCount[0].active_agents) || 0,
      
      // Sentiment metrics
      avg_sentiment_score: parseFloat(sentimentStats[0].avg_sentiment_score) || 0,
      positive_count: positiveCount,
      negative_count: negativeCount,
      neutral_count: neutralCount,
      mixed_count: mixedCount,
      positive_percentage: (positiveCount / totalWithSentiment) * 100,
      negative_percentage: (negativeCount / totalWithSentiment) * 100,
      neutral_percentage: (neutralCount / totalWithSentiment) * 100,
      mixed_percentage: (mixedCount / totalWithSentiment) * 100,
      
      // Quality metrics
      profanity_incidents: parseInt(profanityStats[0].total_profanity) || 0,
      satisfaction_rate: (goodCount / totalFeedback) * 100,
      resolution_rate: (resolvedCount / totalResolvable) * 100,
      
      // Financial metrics
      total_cost: totalCost,
      call_costs: parseFloat(callStats[0].total_call_cost) || 0,
      chat_costs: parseFloat(chatStats[0].total_chat_cost) || 0,
      credit_balance: parseFloat(tenantInfo[0]?.credit_balance) || 0
    };

    res.json(rb.success(summary));

  } catch (error) {
    console.error('Get overview summary error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch overview summary')
    );
  }
});

/**
 * @route GET /api/analytics/overview/trends
 * @desc Get daily trends for calls and chats
 * @access Private
 */
router.get('/overview/trends', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to, agent_id } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    let agentFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(start_time) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    if (agent_id) {
      agentFilter = 'AND agent_id = ?';
      params.push(agent_id);
    }

    // Get daily call trends
    const [callTrends] = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as calls,
        SUM(final_cost) as call_cost
      FROM yovo_tbl_aiva_call_logs
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
      GROUP BY DATE(start_time)
      ORDER BY DATE(start_time) ASC
    `, params);

    // Get daily chat trends
    const [chatTrends] = await db.query(`
      SELECT 
        DATE(start_time) as date,
        COUNT(*) as chats,
        SUM(total_cost) as chat_cost
      FROM yovo_tbl_aiva_chat_sessions
      WHERE tenant_id = ? ${dateFilter} ${agentFilter}
      GROUP BY DATE(start_time)
      ORDER BY DATE(start_time) ASC
    `, params);

    // Merge call and chat trends
    const trendsMap = new Map();

    callTrends.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      trendsMap.set(dateStr, {
        date: dateStr,
        calls: parseInt(row.calls),
        chats: 0,
        call_cost: parseFloat(row.call_cost) || 0,
        chat_cost: 0
      });
    });

    chatTrends.forEach(row => {
      const dateStr = row.date.toISOString().split('T')[0];
      const existing = trendsMap.get(dateStr) || {
        date: dateStr,
        calls: 0,
        chats: 0,
        call_cost: 0,
        chat_cost: 0
      };
      existing.chats = parseInt(row.chats);
      existing.chat_cost = parseFloat(row.chat_cost) || 0;
      trendsMap.set(dateStr, existing);
    });

    const trends = Array.from(trendsMap.values()).map(trend => ({
      ...trend,
      total: trend.calls + trend.chats,
      total_cost: trend.call_cost + trend.chat_cost
    }));

    res.json(rb.success({ trends }));

  } catch (error) {
    console.error('Get overview trends error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch trends')
    );
  }
});

/**
 * @route GET /api/analytics/overview/agents
 * @desc Get top performing agents
 * @access Private
 */
router.get('/overview/agents', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { date_from, date_to } = req.query;

    let params = [tenantId];
    let dateFilter = '';
    
    if (date_from && date_to) {
      dateFilter = 'AND DATE(start_time) BETWEEN ? AND ?';
      params.push(date_from, date_to);
    }

    // Combined agent stats from calls and chats
    const [agents] = await db.query(`
      SELECT 
        a.id,
        a.name,
        COALESCE(call_stats.calls, 0) + COALESCE(chat_stats.chats, 0) as total_interactions,
        COALESCE(call_stats.calls, 0) as calls,
        COALESCE(chat_stats.chats, 0) as chats,
        COALESCE(call_stats.call_cost, 0) + COALESCE(chat_stats.chat_cost, 0) as total_cost,
        COALESCE(sentiment_stats.avg_sentiment, 0) as avg_sentiment
      FROM yovo_tbl_aiva_agents a
      LEFT JOIN (
        SELECT 
          agent_id,
          COUNT(*) as calls,
          SUM(final_cost) as call_cost
        FROM yovo_tbl_aiva_call_logs
        WHERE tenant_id = ? ${dateFilter}
        GROUP BY agent_id
      ) call_stats ON a.id = call_stats.agent_id
      LEFT JOIN (
        SELECT 
          agent_id,
          COUNT(*) as chats,
          SUM(total_cost) as chat_cost
        FROM yovo_tbl_aiva_chat_sessions
        WHERE tenant_id = ? ${dateFilter}
        GROUP BY agent_id
      ) chat_stats ON a.id = chat_stats.agent_id
      LEFT JOIN (
        SELECT 
          agent_id,
          AVG(sentiment_score) as avg_sentiment
        FROM (
          SELECT cl.agent_id, ca.overall_sentiment_score as sentiment_score
          FROM yovo_tbl_aiva_call_analytics ca
          JOIN yovo_tbl_aiva_call_logs cl ON ca.call_log_id = cl.id
          WHERE cl.tenant_id = ? ${dateFilter.replace('start_time', 'cl.start_time')}
          UNION ALL
          SELECT cs.agent_id, ca.overall_sentiment_score as sentiment_score
          FROM yovo_tbl_aiva_chat_analytics ca
          JOIN yovo_tbl_aiva_chat_sessions cs ON ca.session_id = cs.id
          WHERE cs.tenant_id = ? ${dateFilter.replace('start_time', 'cs.start_time')}
        ) combined
        GROUP BY agent_id
      ) sentiment_stats ON a.id = sentiment_stats.agent_id
      WHERE a.tenant_id = ?
        AND (call_stats.calls > 0 OR chat_stats.chats > 0)
      ORDER BY total_interactions DESC
      LIMIT 10
    `, [...params, ...params, ...params, ...params, tenantId]);

    const formattedAgents = agents.map(row => ({
      id: row.id,
      name: row.name,
      total_interactions: parseInt(row.total_interactions),
      calls: parseInt(row.calls),
      chats: parseInt(row.chats),
      total_cost: parseFloat(row.total_cost),
      avg_sentiment: parseFloat(row.avg_sentiment)
    }));

    res.json(rb.success({ agents: formattedAgents }));

  } catch (error) {
    console.error('Get overview agents error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to fetch agents')
    );
  }
});

module.exports = router;
