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

module.exports = router;
