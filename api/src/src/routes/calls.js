const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const CallService = require('../services/CallService');

const router = express.Router();

// Middleware that accepts either JWT token OR API key
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        return verifyApiKey(req, res, next);
    } else {
        return verifyToken(req, res, next);
    }
};

// Create call log (internal use by bridge) - API Key only
router.post('/create', verifyApiKey, async (req, res) => {
    try {
        const { session_id, tenant_id, agent_id, caller_id, asterisk_port } = req.body;
        
        const callLogId = await CallService.createCallLog(
            session_id,
            tenant_id,
            agent_id,
            caller_id,
            asterisk_port
        );
        
        res.json({ id: callLogId });
    } catch (error) {
        console.error('Create call log error:', error);
        res.status(500).json({ error: 'Failed to create call log' });
    }
});

// Update call log (internal use by bridge) - API Key only
router.put('/:sessionId', verifyApiKey, async (req, res) => {
    try {
        await CallService.updateCallLog(req.params.sessionId, req.body);
        res.json({ message: 'Call log updated' });
    } catch (error) {
        console.error('Update call log error:', error);
        res.status(500).json({ error: 'Failed to update call log' });
    }
});

// Log function call (internal use by bridge) - API Key only
router.post('/:callLogId/functions', verifyApiKey, async (req, res) => {
    try {
        const { function_name, arguments: args, result, execution_time_ms, status, error_message } = req.body;
        
        await CallService.logFunctionCall(
            req.params.callLogId,
            function_name,
            args,
            result,
            execution_time_ms,
            status,
            error_message
        );
        
        res.json({ message: 'Function call logged' });
    } catch (error) {
        console.error('Log function call error:', error);
        res.status(500).json({ error: 'Failed to log function call' });
    }
});

// List calls
router.get('/', authenticate, checkPermission('calls.view'), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        
        const calls = await CallService.listCalls(
            req.user.id,
            req.query,
            limit,
            offset
        );
        
        res.json({ calls });
    } catch (error) {
        console.error('List calls error:', error);
        res.status(500).json({ error: 'Failed to list calls' });
    }
});

// Get call details
router.get('/:sessionId', authenticate, checkPermission('calls.view'), async (req, res) => {
    try {
        const call = await CallService.getCallLog(req.params.sessionId);
        
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }
        
        if (call.tenant_id !== req.user.id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json({ call });
    } catch (error) {
        console.error('Get call error:', error);
        res.status(500).json({ error: 'Failed to get call' });
    }
});

// Get call statistics
router.get('/stats/summary', authenticate, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const stats = await CallService.getCallStats(req.user.id, days);
        res.json(stats);
    } catch (error) {
        console.error('Get call stats error:', error);
        res.status(500).json({ error: 'Failed to get call stats' });
    }
});

module.exports = router;