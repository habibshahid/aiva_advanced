/**
 * Internal Flow Routes
 * API endpoints for FlowManager (bridge) to communicate with management server
 * These routes don't require user authentication - they use internal API token
 */

const express = require('express');
const router = express.Router();
const FlowService = require('../services/FlowService');

// Internal token authentication
const internalAuth = (req, res, next) => {
    const token = req.headers['x-internal-token'] || req.headers['authorization']?.replace('Bearer ', '');
    const expectedToken = process.env.INTERNAL_API_TOKEN;
    
    if (!expectedToken) {
        // If no internal token configured, allow (dev mode)
        return next();
    }
    
    if (token !== expectedToken) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
};

// =============================================================================
// FLOW ENDPOINTS
// =============================================================================

/**
 * @route GET /api/internal/flows/:flowId
 * @desc Get flow by ID
 */
router.get('/flows/:flowId', internalAuth, async (req, res) => {
    try {
        const flow = await FlowService.getFlow(req.params.flowId);
        res.json({ success: true, data: flow });
    } catch (error) {
        console.error('Internal get flow error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /api/internal/flows/:flowId/steps
 * @desc Get flow steps
 */
router.get('/flows/:flowId/steps', internalAuth, async (req, res) => {
    try {
        const steps = await FlowService.listSteps(req.params.flowId);
        res.json({ success: true, data: steps });
    } catch (error) {
        console.error('Internal list steps error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/internal/flows/:flowId/stats
 * @desc Update flow statistics
 */
router.post('/flows/:flowId/stats', internalAuth, async (req, res) => {
    try {
        const { stat } = req.body;
        await FlowService.incrementFlowStats(req.params.flowId, stat);
        res.json({ success: true });
    } catch (error) {
        console.error('Internal update flow stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /api/internal/flows/by-key/:agentId/:flowKey
 * @desc Get flow by key
 */
router.get('/flows/by-key/:agentId/:flowKey', internalAuth, async (req, res) => {
    try {
        const flow = await FlowService.getFlowByKey(req.params.agentId, req.params.flowKey);
        res.json({ success: true, data: flow });
    } catch (error) {
        console.error('Internal get flow by key error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /api/internal/flows/by-intent/:intentId
 * @desc Get flow by trigger intent ID
 */
router.get('/flows/by-intent/:intentId', internalAuth, async (req, res) => {
    try {
        const db = require('../config/database');
        const [flows] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_ivr_flows WHERE trigger_intent_id = ? AND is_active = 1',
            [req.params.intentId]
        );
        
        if (flows.length === 0) {
            return res.json({ success: true, data: null });
        }
        
        const flow = await FlowService.getFlowWithSteps(flows[0].id);
        res.json({ success: true, data: flow });
    } catch (error) {
        console.error('Internal get flow by intent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// STEP ENDPOINTS
// =============================================================================

/**
 * @route POST /api/internal/flow-steps/:stepId/stats
 * @desc Update step statistics
 */
router.post('/flow-steps/:stepId/stats', internalAuth, async (req, res) => {
    try {
        const { stat } = req.body;
        await FlowService.incrementStepStats(req.params.stepId, stat);
        res.json({ success: true });
    } catch (error) {
        console.error('Internal update step stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// SESSION ENDPOINTS
// =============================================================================

/**
 * @route GET /api/internal/flow-sessions/active/:sessionId
 * @desc Get active session by call session ID
 */
router.get('/flow-sessions/active/:sessionId', internalAuth, async (req, res) => {
    try {
        const session = await FlowService.getActiveSessionByCallId(req.params.sessionId);
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal get active session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route GET /api/internal/flow-sessions/:sessionId
 * @desc Get session by ID
 */
router.get('/flow-sessions/:sessionId', internalAuth, async (req, res) => {
    try {
        const session = await FlowService.getSession(req.params.sessionId);
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal get session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/internal/flow-sessions
 * @desc Create or update session
 */
router.post('/flow-sessions', internalAuth, async (req, res) => {
    try {
        const sessionData = req.body;
        
        // Check if session exists
        let session;
        if (sessionData.id) {
            session = await FlowService.getSession(sessionData.id);
        }
        
        if (session) {
            // Update existing
            session = await FlowService.updateSession(sessionData.id, sessionData);
        } else {
            // Create new
            session = await FlowService.createSession(sessionData);
        }
        
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal save session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route PUT /api/internal/flow-sessions/:sessionId
 * @desc Update session
 */
router.put('/flow-sessions/:sessionId', internalAuth, async (req, res) => {
    try {
        const session = await FlowService.updateSession(req.params.sessionId, req.body);
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal update session error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/internal/flow-sessions/:sessionId/log
 * @desc Add to conversation log
 */
router.post('/flow-sessions/:sessionId/log', internalAuth, async (req, res) => {
    try {
        const session = await FlowService.addToConversationLog(req.params.sessionId, req.body);
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal add to log error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * @route POST /api/internal/flow-sessions/:sessionId/slot
 * @desc Set slot value
 */
router.post('/flow-sessions/:sessionId/slot', internalAuth, async (req, res) => {
    try {
        const { slot_name, value } = req.body;
        const session = await FlowService.setSlotValue(req.params.sessionId, slot_name, value);
        res.json({ success: true, data: session });
    } catch (error) {
        console.error('Internal set slot error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// FUNCTION EXECUTION
// =============================================================================

/**
 * @route POST /api/internal/functions/execute
 * @desc Execute a function
 */
router.post('/functions/execute', internalAuth, async (req, res) => {
    try {
        const { function_name, arguments: args, context } = req.body;
        
        // Get function definition
        const db = require('../config/database');
        const [functions] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_functions WHERE name = ? AND is_active = 1',
            [function_name]
        );
        
        if (functions.length === 0) {
            return res.status(404).json({ error: `Function ${function_name} not found` });
        }
        
        const func = functions[0];
        
        // Execute based on handler type
        if (func.handler_type === 'api') {
            const axios = require('axios');
            
            // Replace template variables in endpoint
            let endpoint = func.api_endpoint;
            for (const [key, value] of Object.entries(args || {})) {
                endpoint = endpoint.replace(`{{${key}}}`, value);
            }
            
            // Replace template variables in body
            let body = func.api_body ? JSON.parse(func.api_body) : args;
            if (typeof body === 'object') {
                const replaceVars = (obj) => {
                    for (const key in obj) {
                        if (typeof obj[key] === 'string') {
                            for (const [argKey, argValue] of Object.entries(args || {})) {
                                obj[key] = obj[key].replace(`{{${argKey}}}`, argValue);
                            }
                        } else if (typeof obj[key] === 'object') {
                            replaceVars(obj[key]);
                        }
                    }
                };
                replaceVars(body);
            }
            
            const headers = func.api_headers ? JSON.parse(func.api_headers) : {};
            
            const response = await axios({
                method: func.api_method || 'POST',
                url: endpoint,
                headers,
                data: body,
                timeout: func.timeout_ms || 30000
            });
            
            res.json({ success: true, data: response.data });
            
        } else {
            // Inline function - would need custom handling
            res.json({ 
                success: true, 
                data: { message: `Inline function ${function_name} executed`, args } 
            });
        }
        
    } catch (error) {
        console.error('Internal function execution error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            data: null
        });
    }
});

module.exports = router;
