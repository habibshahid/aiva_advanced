const express = require('express');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const FunctionService = require('../services/FunctionService');
const AgentService = require('../services/AgentService');

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

// List functions for agent
router.get('/agent/:agentId', authenticate, checkPermission('functions.view'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.agentId);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const functions = await FunctionService.listFunctions(req.params.agentId);
        res.json({ functions });
    } catch (error) {
        console.error('List functions error:', error);
        res.status(500).json({ error: 'Failed to list functions' });
    }
});

// Create function
router.post('/agent/:agentId', authenticate, checkPermission('functions.create'), async (req, res) => {
    try {
        const agent = await AgentService.getAgent(req.params.agentId);
        
        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const func = await FunctionService.createFunction(req.params.agentId, req.body);
        res.status(201).json({ function: func });
    } catch (error) {
        console.error('Create function error:', error);
        res.status(500).json({ error: 'Failed to create function' });
    }
});

// Update function
router.put('/:id', authenticate, checkPermission('functions.update'), async (req, res) => {
    try {
        const func = await FunctionService.getFunction(req.params.id);
        
        if (!func) {
            return res.status(404).json({ error: 'Function not found' });
        }
        
        // Check agent ownership
        const agent = await AgentService.getAgent(func.agent_id);
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const updated = await FunctionService.updateFunction(req.params.id, req.body);
        res.json({ function: updated });
    } catch (error) {
        console.error('Update function error:', error);
        res.status(500).json({ error: 'Failed to update function' });
    }
});

// Delete function
router.delete('/:id', authenticate, checkPermission('functions.delete'), async (req, res) => {
    try {
        const func = await FunctionService.getFunction(req.params.id);
        
        if (!func) {
            return res.status(404).json({ error: 'Function not found' });
        }
        
        // Check agent ownership
        const agent = await AgentService.getAgent(func.agent_id);
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await FunctionService.deleteFunction(req.params.id);
        res.json({ message: 'Function deleted successfully' });
    } catch (error) {
        console.error('Delete function error:', error);
        res.status(500).json({ error: 'Failed to delete function' });
    }
});

// Test function execution
router.post('/:id/test', authenticate, checkPermission('functions.update'), async (req, res) => {
    try {
        const func = await FunctionService.getFunction(req.params.id);
        
        if (!func) {
            return res.status(404).json({ error: 'Function not found' });
        }
        
        // Check agent ownership
        const agent = await AgentService.getAgent(func.agent_id);
        if (agent.tenant_id !== req.user.tenant_id && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Only API functions can be tested
        if (func.handler_type !== 'api') {
            return res.status(400).json({ 
                error: 'Only API functions can be tested',
                message: 'Inline functions are handled by the voice bridge and cannot be tested from here.'
            });
        }
        
        if (!func.api_endpoint) {
            return res.status(400).json({ 
                error: 'No API endpoint configured',
                message: 'Please configure an API endpoint for this function.'
            });
        }
        
        const testArgs = req.body.arguments || {};
        const startTime = Date.now();
        
        try {
            const axios = require('axios');
            const https = require('https');
            
            // Replace parameters in URL
            let url = func.api_endpoint;
            for (const [key, value] of Object.entries(testArgs)) {
                url = url.replace(`{{${key}}}`, encodeURIComponent(value));
            }
            
            // Prepare headers
            let headers = {};
            if (func.api_headers) {
                headers = typeof func.api_headers === 'string' 
                    ? JSON.parse(func.api_headers) 
                    : { ...func.api_headers };
            }
            
            // Prepare body
            let body = null;
            if (func.api_method !== 'GET') {
                if (func.api_body) {
                    body = JSON.parse(JSON.stringify(
                        typeof func.api_body === 'string' ? JSON.parse(func.api_body) : func.api_body
                    ));
                    
                    // Replace template variables in body
                    const replaceInObject = (obj) => {
                        for (const key in obj) {
                            if (typeof obj[key] === 'string') {
                                for (const [argKey, argValue] of Object.entries(testArgs)) {
                                    obj[key] = obj[key].replace(`{{${argKey}}}`, argValue);
                                }
                            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                replaceInObject(obj[key]);
                            }
                        }
                    };
                    replaceInObject(body);
                } else {
                    body = testArgs;
                }
            }
            
            // Build axios config
            const axiosConfig = {
                method: func.api_method || 'POST',
                url: url,
                headers: headers,
                timeout: func.timeout_ms || 30000,
                validateStatus: () => true
            };
            
            if (func.api_method !== 'GET' && body) {
                axiosConfig.data = body;
            }
            
            // Skip SSL verification if configured
            if (func.skip_ssl_verify && url.startsWith('https://')) {
                axiosConfig.httpsAgent = new https.Agent({
                    rejectUnauthorized: false
                });
            }
            
            console.log(`🧪 Testing function: ${func.name}`);
            
            const response = await axios(axiosConfig);
            const duration = Date.now() - startTime;
            
            // Sanitize headers
            const safeResponseHeaders = {};
            const allowedHeaders = ['content-type', 'content-length', 'date', 'server', 'x-request-id'];
            for (const [key, value] of Object.entries(response.headers)) {
                if (allowedHeaders.includes(key.toLowerCase())) {
                    safeResponseHeaders[key] = value;
                }
            }
            
            res.json({
                success: response.status >= 200 && response.status < 300,
                test_result: {
                    status_code: response.status,
                    status_text: response.statusText,
                    headers: safeResponseHeaders,
                    data: response.data,
                    duration_ms: duration
                },
                request_info: {
                    method: axiosConfig.method,
                    url: url,
                    headers_sent: Object.keys(headers),
                    body: body
                }
            });
            
        } catch (error) {
            const duration = Date.now() - startTime;
            
            res.json({
                success: false,
                test_result: {
                    error: error.message,
                    code: error.code || 'UNKNOWN',
                    duration_ms: duration,
                    response_data: error.response?.data || null,
                    response_status: error.response?.status || null
                },
                request_info: {
                    method: func.api_method || 'POST',
                    url: func.api_endpoint,
                    error_details: error.cause?.message || error.message
                }
            });
        }
        
    } catch (error) {
        console.error('Test function error:', error);
        res.status(500).json({ error: 'Failed to test function', message: error.message });
    }
});

module.exports = router;