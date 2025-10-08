const logger = require('../utils/logger');

class TransferHandler {
    constructor(redisClient) {
        this.redis = redisClient;
    }
    
    /**
     * Transfer call to human agent via Redis pub/sub
     * @param {Object} args - Function arguments (queue name from instructions)
     * @param {Object} context - Connection context
     * @returns {Promise<Object>} Transfer result
     */
    async transferCall(args, context) {
        try {
            const { queue } = args;
            const { sessionId, callerId, tenantId, agentId, asteriskPort } = context;
            
            logger.info(`Transfer request for session ${sessionId} to queue: ${queue}`);
            
            // Prepare transfer event
            const transferEvent = {
                session_id: sessionId,
                caller_id: callerId || 'unknown',
                tenant_id: tenantId,
                agent_id: agentId,
                asterisk_port: asteriskPort,
                aiva_transfer_to_agent: true,
                aiva_transfer_to_agent_queue: queue,
                timestamp: new Date().toISOString()
            };
            
            // Publish to Redis channel
            await this.redis.publish('aiva_call', JSON.stringify(transferEvent));
            
            logger.info(`Transfer event published to aiva_call channel: ${JSON.stringify(transferEvent)}`);
            
            return {
                success: true,
                message: `Transferring you to ${queue}. Please hold.`,
                queue: queue
            };
            
        } catch (error) {
            logger.error('Transfer error:', error);
            return {
                success: false,
                message: 'Unable to complete transfer. Please try again.',
                error: error.message
            };
        }
    }
}

module.exports = TransferHandler;