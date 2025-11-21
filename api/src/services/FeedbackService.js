/**
 * Feedback Service
 * Manages session and message feedback
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class FeedbackService {
    /**
     * Submit session feedback (after conversation ends)
     */
    async submitSessionFeedback({ sessionId, rating, comment = null }) {
        // Get session details
        const [sessions] = await db.query(
            `SELECT tenant_id, agent_id, start_time, total_messages 
             FROM yovo_tbl_aiva_chat_sessions 
             WHERE id = ?`,
            [sessionId]
        );

        if (sessions.length === 0) {
            throw new Error('Session not found');
        }

        const session = sessions[0];
        const feedbackId = uuidv4();

        // Calculate session duration
        const sessionDuration = session.start_time 
            ? Math.floor((Date.now() - new Date(session.start_time).getTime()) / 1000)
            : null;

        // Store feedback
        await db.query(
            `INSERT INTO yovo_tbl_aiva_session_feedback 
             (id, session_id, tenant_id, agent_id, rating, comment, feedback_metadata) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                feedbackId,
                sessionId,
                session.tenant_id,
                session.agent_id,
                rating,
                comment,
                JSON.stringify({
                    session_duration_seconds: sessionDuration,
                    total_messages: session.total_messages,
                    feedback_timestamp: new Date().toISOString()
                })
            ]
        );

        // Update session to mark feedback as submitted
        await db.query(
            `UPDATE yovo_tbl_aiva_chat_sessions 
             SET feedback_submitted = 1 
             WHERE id = ?`,
            [sessionId]
        );

        return {
            id: feedbackId,
            session_id: sessionId,
            rating,
            comment
        };
    }

    /**
     * Submit message feedback (useful/not useful)
     */
    async submitMessageFeedback({ messageId, rating, comment = null }) {
        // Get message details
        const [messages] = await db.query(
            `SELECT 
                m.session_id,
                m.cost,
                m.tokens_input,
                m.tokens_output,
                s.tenant_id,
                s.agent_id
             FROM yovo_tbl_aiva_chat_messages m
             JOIN yovo_tbl_aiva_chat_sessions s ON m.session_id = s.id
             WHERE m.id = ? AND m.role = 'assistant'`,
            [messageId]
        );

        if (messages.length === 0) {
            throw new Error('Message not found or not an AI response');
        }

        const message = messages[0];
        const feedbackId = uuidv4();

        // Check if feedback already exists
        const [existing] = await db.query(
            'SELECT id FROM yovo_tbl_aiva_message_feedback WHERE message_id = ?',
            [messageId]
        );

        if (existing.length > 0) {
            // Update existing feedback
            await db.query(
                `UPDATE yovo_tbl_aiva_message_feedback 
                 SET rating = ?, comment = ?, feedback_metadata = ?
                 WHERE message_id = ?`,
                [
                    rating,
                    comment,
                    JSON.stringify({
                        message_cost: message.cost,
                        input_tokens: message.tokens_input,
                        output_tokens: message.tokens_output,
                        updated_at: new Date().toISOString()
                    }),
                    messageId
                ]
            );

            return {
                id: existing[0].id,
                message_id: messageId,
                rating,
                comment,
                updated: true
            };
        }

        // Insert new feedback
        await db.query(
            `INSERT INTO yovo_tbl_aiva_message_feedback 
             (id, message_id, session_id, tenant_id, agent_id, rating, comment, feedback_metadata) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                feedbackId,
                messageId,
                message.session_id,
                message.tenant_id,
                message.agent_id,
                rating,
                comment,
                JSON.stringify({
                    message_cost: message.cost,
                    input_tokens: message.tokens_input,
                    output_tokens: message.tokens_output,
                    feedback_timestamp: new Date().toISOString()
                })
            ]
        );

        return {
            id: feedbackId,
            message_id: messageId,
            rating,
            comment,
            updated: false
        };
    }

    /**
     * Get session feedback
     */
    async getSessionFeedback(sessionId) {
        const [feedback] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_session_feedback 
             WHERE session_id = ?`,
            [sessionId]
        );

        return feedback.length > 0 ? {
            ...feedback[0],
            feedback_metadata: JSON.parse(feedback[0].feedback_metadata || '{}')
        } : null;
    }

    /**
     * Get message feedback
     */
    async getMessageFeedback(messageId) {
        const [feedback] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_message_feedback 
             WHERE message_id = ?`,
            [messageId]
        );

        return feedback.length > 0 ? {
            ...feedback[0],
            feedback_metadata: JSON.parse(feedback[0].feedback_metadata || '{}')
        } : null;
    }

    /**
     * Get feedback analytics for agent
     */
    async getAgentFeedbackStats(agentId, options = {}) {
        const { startDate, endDate } = options;

        let dateFilter = '';
        const params = [agentId];

        if (startDate && endDate) {
            dateFilter = 'AND sf.created_at BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Session feedback stats
        const [sessionStats] = await db.query(
            `SELECT 
                COUNT(*) as total_feedback,
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad_count,
                ROUND(SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as satisfaction_rate
             FROM yovo_tbl_aiva_session_feedback sf
             WHERE agent_id = ? ${dateFilter}`,
            params
        );

        // Message feedback stats
        const [messageStats] = await db.query(
            `SELECT 
                COUNT(*) as total_feedback,
                SUM(CASE WHEN rating = 'useful' THEN 1 ELSE 0 END) as useful_count,
                SUM(CASE WHEN rating = 'not_useful' THEN 1 ELSE 0 END) as not_useful_count,
                ROUND(SUM(CASE WHEN rating = 'useful' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as usefulness_rate
             FROM yovo_tbl_aiva_message_feedback mf
             WHERE agent_id = ? ${dateFilter}`,
            params
        );

        return {
            session_feedback: sessionStats[0],
            message_feedback: messageStats[0]
        };
    }

    /**
     * Get recent feedback with comments
     */
    async getRecentFeedbackWithComments(tenantId, options = {}) {
        const { limit = 20, agentId = null } = options;

        let agentFilter = '';
        const params = [tenantId];

        if (agentId) {
            agentFilter = 'AND sf.agent_id = ?';
            params.push(agentId);
        }

        params.push(limit);

        const [feedback] = await db.query(
            `SELECT 
                sf.id,
                sf.session_id,
                sf.rating,
                sf.comment,
                sf.created_at,
                a.name as agent_name,
                'session' as feedback_type
             FROM yovo_tbl_aiva_session_feedback sf
             JOIN yovo_tbl_aiva_agents a ON sf.agent_id = a.id
             WHERE sf.tenant_id = ? ${agentFilter}
             AND sf.comment IS NOT NULL
             ORDER BY sf.created_at DESC
             LIMIT ?`,
            params
        );

        return feedback;
    }

    /**
     * Get tenant-wide feedback statistics
     */
    async getTenantFeedbackStats(tenantId, options = {}) {
        const { startDate, endDate } = options;

        let dateFilter = '';
        const params = [tenantId];

        if (startDate && endDate) {
            dateFilter = 'AND created_at BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        // Session feedback
        const [sessionStats] = await db.query(
            `SELECT 
                COUNT(*) as total_feedback,
                SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN rating = 'bad' THEN 1 ELSE 0 END) as bad_count,
                ROUND(SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as satisfaction_rate
             FROM yovo_tbl_aiva_session_feedback
             WHERE tenant_id = ? ${dateFilter}`,
            params
        );

        // Message feedback
        const [messageStats] = await db.query(
            `SELECT 
                COUNT(*) as total_feedback,
                SUM(CASE WHEN rating = 'useful' THEN 1 ELSE 0 END) as useful_count,
                SUM(CASE WHEN rating = 'not_useful' THEN 1 ELSE 0 END) as not_useful_count,
                ROUND(SUM(CASE WHEN rating = 'useful' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as usefulness_rate
             FROM yovo_tbl_aiva_message_feedback
             WHERE tenant_id = ? ${dateFilter}`,
            params
        );

        // Per-agent breakdown
        const [agentBreakdown] = await db.query(
            `SELECT 
                a.id,
                a.name,
                COUNT(DISTINCT sf.id) as session_feedback_count,
                SUM(CASE WHEN sf.rating = 'good' THEN 1 ELSE 0 END) as good_count,
                SUM(CASE WHEN sf.rating = 'bad' THEN 1 ELSE 0 END) as bad_count,
                ROUND(SUM(CASE WHEN sf.rating = 'good' THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT sf.id), 2) as satisfaction_rate
             FROM yovo_tbl_aiva_agents a
             LEFT JOIN yovo_tbl_aiva_session_feedback sf ON a.id = sf.agent_id ${dateFilter}
             WHERE a.tenant_id = ?
             GROUP BY a.id, a.name
             HAVING session_feedback_count > 0
             ORDER BY satisfaction_rate DESC`,
            startDate && endDate ? [startDate, endDate, tenantId] : [tenantId]
        );

        return {
            session_feedback: sessionStats[0],
            message_feedback: messageStats[0],
            agent_breakdown: agentBreakdown
        };
    }
}

module.exports = new FeedbackService();