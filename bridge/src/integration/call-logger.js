/**
 * Call Logger - Logs calls to management API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class CallLogger {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl || process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api';
        this.apiKey = apiKey || process.env.MANAGEMENT_API_KEY;
    }
    
    /**
     * Create call log entry
     */
    async createCallLog(sessionId, tenantId, agentId, callerId, asteriskPort) {
        try {
            const response = await axios.post(
                `${this.apiUrl}/calls/create`,
                {
                    session_id: sessionId,
                    tenant_id: tenantId,
                    agent_id: agentId,
                    caller_id: callerId,
                    asterisk_port: asteriskPort
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
            logger.info(`Call log created: ${response.data.id}`);
            return response.data.id;
            
        } catch (error) {
            logger.error(`Call log creation failed: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Update call log
     */
    async updateCallLog(sessionId, updates) {
        try {
            await axios.put(
                `${this.apiUrl}/calls/${sessionId}`,
                updates,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
            logger.debug(`Call log updated: ${sessionId}`);
            
        } catch (error) {
            logger.error(`Call log update failed: ${error.message}`);
        }
    }
    
    /**
     * Log function call
     */
    async logFunctionCall(callLogId, functionName, args, result, executionTime, status, error = null) {
        try {
            await axios.post(
                `${this.apiUrl}/calls/${callLogId}/functions`,
                {
                    function_name: functionName,
                    arguments: args,
                    result: result,
                    execution_time_ms: executionTime,
                    status: status,
                    error_message: error
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
        } catch (error) {
            logger.error(`Function call logging failed: ${error.message}`);
        }
    }
}

module.exports = CallLogger;