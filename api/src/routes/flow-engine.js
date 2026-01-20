/**
 * Flow Engine Routes
 * 
 * API endpoints for Flow Engine v2:
 * - Flow management (CRUD)
 * - Agent flow configuration
 * - Session state inspection
 * - Cleanup jobs
 */

const express = require('express');
const router = express.Router();
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { ChatFlowService, SessionStateService, MessageBufferService } = require('../services/flow-engine');
const FlowEngineIntegration = require('../services/FlowEngineIntegration');
const AgentService = require('../services/AgentService');
const db = require('../config/database');

// Authentication middleware
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        return verifyApiKey(req, res, next);
    }
    return verifyToken(req, res, next);
};

// ============================================================================
// FLOW MANAGEMENT
// ============================================================================

/**
 * @route GET /api/flow-engine/agents/:agentId/flows
 * @desc List all flows for an agent
 */
router.get('/agents/:agentId/flows', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { include_inactive } = req.query;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const flows = await ChatFlowService.listFlows(agentId, include_inactive === 'true');

        res.json({
            success: true,
            data: flows
        });

    } catch (error) {
        console.error('List flows error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route GET /api/flow-engine/flows/:flowId
 * @desc Get a single flow
 */
router.get('/flows/:flowId', authenticate, async (req, res) => {
    try {
        const { flowId } = req.params;

        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return res.status(404).json({ success: false, error: 'Flow not found' });
        }

        // Verify ownership through agent
        const agent = await AgentService.getAgent(flow.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        res.json({
            success: true,
            data: flow
        });

    } catch (error) {
        console.error('Get flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/agents/:agentId/flows
 * @desc Create a new flow
 */
router.post('/agents/:agentId/flows', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { name, description, config } = req.body;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        if (!name || !description) {
            return res.status(400).json({ 
                success: false, 
                error: 'name and description are required' 
            });
        }

        const flow = await ChatFlowService.createFlow(agentId, {
            name,
            description,
            config: config || {}
        });

        res.status(201).json({
            success: true,
            data: flow
        });

    } catch (error) {
        console.error('Create flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route PUT /api/flow-engine/flows/:flowId
 * @desc Update a flow
 */
router.put('/flows/:flowId', authenticate, async (req, res) => {
    try {
        const { flowId } = req.params;
        const updates = req.body;

        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return res.status(404).json({ success: false, error: 'Flow not found' });
        }

        // Verify ownership
        const agent = await AgentService.getAgent(flow.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const updatedFlow = await ChatFlowService.updateFlow(flowId, updates);

        res.json({
            success: true,
            data: updatedFlow
        });

    } catch (error) {
        console.error('Update flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route DELETE /api/flow-engine/flows/:flowId
 * @desc Delete a flow
 */
router.delete('/flows/:flowId', authenticate, async (req, res) => {
    try {
        const { flowId } = req.params;

        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return res.status(404).json({ success: false, error: 'Flow not found' });
        }

        // Verify ownership
        const agent = await AgentService.getAgent(flow.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        await ChatFlowService.deleteFlow(flowId);

        res.json({
            success: true,
            message: 'Flow deleted'
        });

    } catch (error) {
        console.error('Delete flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/flows/:flowId/toggle
 * @desc Toggle flow active status
 */
router.post('/flows/:flowId/toggle', authenticate, async (req, res) => {
    try {
        const { flowId } = req.params;
        const { is_active } = req.body;

        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return res.status(404).json({ success: false, error: 'Flow not found' });
        }

        // Verify ownership
        const agent = await AgentService.getAgent(flow.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const updatedFlow = await ChatFlowService.toggleFlow(flowId, is_active);

        res.json({
            success: true,
            data: updatedFlow
        });

    } catch (error) {
        console.error('Toggle flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/flows/:flowId/duplicate
 * @desc Duplicate a flow
 */
router.post('/flows/:flowId/duplicate', authenticate, async (req, res) => {
    try {
        const { flowId } = req.params;
        const { name } = req.body;

        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return res.status(404).json({ success: false, error: 'Flow not found' });
        }

        // Verify ownership
        const agent = await AgentService.getAgent(flow.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        const newFlow = await ChatFlowService.duplicateFlow(flowId, name);

        res.status(201).json({
            success: true,
            data: newFlow
        });

    } catch (error) {
        console.error('Duplicate flow error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// FLOW ENGINE STATUS & CONTROL
// ============================================================================

/**
 * @route GET /api/flow-engine/agents/:agentId/status
 * @desc Get FlowEngine status for an agent
 */
router.get('/agents/:agentId/status', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        const status = await FlowEngineIntegration.getStatus(agentId);

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route GET /api/flow-engine/agents/:agentId/analytics
 * @desc Get FlowEngine analytics for an agent
 */
router.get('/agents/:agentId/analytics', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { range = '7d' } = req.query;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        // Calculate date range
        const now = new Date();
        let startDate;
        switch (range) {
            case '24h':
                startDate = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        }

        // Get session statistics
        const [summaryRows] = await db.query(`
            SELECT 
                COUNT(*) as total_sessions,
                SUM(CASE WHEN session_status = 'closed' AND active_flow IS NULL THEN 1 ELSE 0 END) as completed_flows,
                SUM(CASE WHEN session_status = 'closed' AND active_flow IS NOT NULL THEN 1 ELSE 0 END) as abandoned_flows,
                SUM(CASE WHEN session_status = 'active' THEN 1 ELSE 0 END) as active_sessions,
                AVG(TIMESTAMPDIFF(SECOND, start_time, COALESCE(soft_closed_at, last_activity_at))) as avg_completion_time
            FROM yovo_tbl_aiva_chat_sessions
            WHERE agent_id = ? AND start_time >= ?
        `, [agentId, startDate]);

        const summary = summaryRows[0] || {};
        summary.completion_rate = summary.total_sessions > 0 
            ? ((summary.completed_flows / summary.total_sessions) * 100) 
            : 0;

        // Get daily trend
        const [dailyTrend] = await db.query(`
            SELECT 
                DATE(start_time) as date,
                COUNT(*) as sessions,
                SUM(CASE WHEN session_status = 'closed' AND active_flow IS NULL THEN 1 ELSE 0 END) as completed
            FROM yovo_tbl_aiva_chat_sessions
            WHERE agent_id = ? AND start_time >= ?
            GROUP BY DATE(start_time)
            ORDER BY date ASC
        `, [agentId, startDate]);

        // Get flow-specific stats
        const [flowStats] = await db.query(`
            SELECT 
                f.id as flow_id,
                f.name as flow_name,
                COUNT(DISTINCT s.id) as triggered,
                SUM(CASE WHEN s.session_status = 'closed' AND s.active_flow IS NULL THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN s.session_status = 'closed' AND s.active_flow IS NOT NULL THEN 1 ELSE 0 END) as abandoned,
                AVG(TIMESTAMPDIFF(SECOND, s.start_time, COALESCE(s.soft_closed_at, s.last_activity_at))) as avg_time
            FROM yovo_tbl_aiva_flows f
            LEFT JOIN yovo_tbl_aiva_chat_sessions s ON s.agent_id = f.agent_id AND s.start_time >= ?
            WHERE f.agent_id = ?
            GROUP BY f.id, f.name
        `, [startDate, agentId]);

        res.json({
            success: true,
            data: {
                summary: {
                    total_sessions: parseInt(summary.total_sessions) || 0,
                    completed_flows: parseInt(summary.completed_flows) || 0,
                    abandoned_flows: parseInt(summary.abandoned_flows) || 0,
                    active_sessions: parseInt(summary.active_sessions) || 0,
                    completion_rate: parseFloat(summary.completion_rate) || 0,
                    avg_completion_time: parseInt(summary.avg_completion_time) || 0
                },
                daily_trend: dailyTrend,
                flow_stats: flowStats,
                top_drop_offs: [] // Would require more complex query tracking step progression
            }
        });

    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/agents/:agentId/enable
 * @desc Enable FlowEngine for an agent
 */
router.post('/agents/:agentId/enable', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        await FlowEngineIntegration.enableFlowEngine(agentId);

        res.json({
            success: true,
            message: 'FlowEngine enabled'
        });

    } catch (error) {
        console.error('Enable FlowEngine error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/agents/:agentId/disable
 * @desc Disable FlowEngine for an agent (fallback to ChatService)
 */
router.post('/agents/:agentId/disable', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        await FlowEngineIntegration.disableFlowEngine(agentId);

        res.json({
            success: true,
            message: 'FlowEngine disabled'
        });

    } catch (error) {
        console.error('Disable FlowEngine error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/agents/:agentId/initialize
 * @desc Initialize system flows for an agent
 */
router.post('/agents/:agentId/initialize', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        await FlowEngineIntegration.initializeAgentFlows(agentId);

        const flows = await ChatFlowService.listFlows(agentId);

        res.json({
            success: true,
            message: 'Flows initialized',
            data: { flows }
        });

    } catch (error) {
        console.error('Initialize flows error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * @route GET /api/flow-engine/agents/:agentId/sessions
 * @desc List sessions for an agent
 */
router.get('/agents/:agentId/sessions', authenticate, async (req, res) => {
    try {
        const { agentId } = req.params;
        const { status, limit = 50, offset = 0 } = req.query;

        // Verify agent ownership
        const agent = await AgentService.getAgent(agentId);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(404).json({ success: false, error: 'Agent not found' });
        }

        // Build query
        let query = `
            SELECT 
                id, agent_id, channel, channel_user_id,
                session_status, active_flow, paused_flows,
                context_memory, start_time, last_activity_at, soft_closed_at
            FROM yovo_tbl_aiva_chat_sessions 
            WHERE agent_id = ?
        `;
        const params = [agentId];

        if (status) {
            query += ` AND session_status = ?`;
            params.push(status);
        }

        query += ` ORDER BY last_activity_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [sessions] = await db.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM yovo_tbl_aiva_chat_sessions WHERE agent_id = ?`;
        const countParams = [agentId];
        if (status) {
            countQuery += ` AND session_status = ?`;
            countParams.push(status);
        }
        const [[{ total }]] = await db.query(countQuery, countParams);

        // Parse JSON fields
        const parsedSessions = sessions.map(s => ({
            ...s,
            active_flow: typeof s.active_flow === 'string' ? JSON.parse(s.active_flow || 'null') : s.active_flow,
            paused_flows: typeof s.paused_flows === 'string' ? JSON.parse(s.paused_flows || '[]') : s.paused_flows,
            context_memory: typeof s.context_memory === 'string' ? JSON.parse(s.context_memory || '{}') : s.context_memory
        }));

        res.json({
            success: true,
            data: {
                sessions: parsedSessions,
                pagination: {
                    total,
                    limit: parseInt(limit),
                    offset: parseInt(offset)
                }
            }
        });

    } catch (error) {
        console.error('List sessions error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route GET /api/flow-engine/sessions/:sessionId
 * @desc Get session state
 */
router.get('/sessions/:sessionId', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const session = await SessionStateService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Verify ownership through agent
        const agent = await AgentService.getAgent(session.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        res.json({
            success: true,
            data: {
                id: session.id,
                status: session.session_status,
                active_flow: session.active_flow,
                paused_flows: session.paused_flows,
                context_memory: session.context_memory,
                last_activity_at: session.last_activity_at,
                soft_closed_at: session.soft_closed_at
            }
        });

    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route POST /api/flow-engine/sessions/:sessionId/close
 * @desc Force close a session
 */
router.post('/sessions/:sessionId/close', authenticate, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { hard } = req.body;

        const session = await SessionStateService.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }

        // Verify ownership
        const agent = await AgentService.getAgent(session.agent_id);
        if (!agent || agent.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }

        if (hard) {
            await SessionStateService.closeSession(sessionId);
        } else {
            await SessionStateService.softCloseSession(sessionId);
        }

        res.json({
            success: true,
            message: hard ? 'Session closed' : 'Session soft-closed'
        });

    } catch (error) {
        console.error('Close session error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// CLEANUP & MAINTENANCE
// ============================================================================

/**
 * @route POST /api/flow-engine/cleanup
 * @desc Run cleanup job (internal/admin only)
 */
router.post('/cleanup', authenticate, async (req, res) => {
    try {
        const { timeout_minutes } = req.body;

        // This should be admin-only in production
        // For now, just run it
        const result = await FlowEngineIntegration.runCleanup(timeout_minutes || 30);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route GET /api/flow-engine/health
 * @desc Health check
 */
router.get('/health', async (req, res) => {
    try {
        // Quick DB check
        await db.query('SELECT 1');

        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

module.exports = router;