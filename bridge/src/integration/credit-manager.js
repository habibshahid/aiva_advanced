/**
 * Credit Manager - Checks and manages credits via API
 */

const axios = require('axios');
const logger = require('../utils/logger');

class CreditManager {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl || process.env.MANAGEMENT_API_URL || 'http://localhost:4000/api';
        this.apiKey = apiKey || process.env.MANAGEMENT_API_KEY;
    }
    
    /**
     * Check if tenant has sufficient credits
     */
    async checkCredits(tenantId, minimumRequired = 0.10) {
        try {
            logger.info(`Checking credits for tenant: ${tenantId}`);
            
            const response = await axios.get(
                `${this.apiUrl}/credits/balance`,
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 3000
                }
            );
            
            const balance = response.data.balance;
            
            logger.info(`Credit balance: $${balance.toFixed(4)} (minimum: $${minimumRequired.toFixed(4)})`);
            
            if (balance < minimumRequired) {
                logger.warn(`Insufficient credits: $${balance.toFixed(4)} < $${minimumRequired.toFixed(4)}`);
                return {
                    allowed: false,
                    balance: balance,
                    required: minimumRequired
                };
            }
            
            return {
                allowed: true,
                balance: balance
            };
            
        } catch (error) {
            logger.error(`Credit check failed: ${error.message}`);
            
            // Fail open - allow call if API is down (you can change this to fail closed)
            logger.warn('Credit check failed, allowing call (fail-open mode)');
            return {
                allowed: true,
                balance: 0,
                error: error.message
            };
        }
    }
    
    /**
     * Deduct credits after call (called from API via webhook/direct call)
     */
    async deductCredits(tenantId, amount, callLogId) {
        try {
            logger.info(`Deducting credits: $${amount.toFixed(4)} for tenant ${tenantId}`);
            
            const response = await axios.post(
                `${this.apiUrl}/credits/deduct`,
                {
                    tenant_id: tenantId,
                    amount: amount,
                    call_log_id: callLogId
                },
                {
                    headers: {
                        'X-API-Key': this.apiKey
                    },
                    timeout: 5000
                }
            );
            
            logger.info(`Credits deducted. New balance: $${response.data.balance_after.toFixed(4)}`);
            
            return true;
            
        } catch (error) {
            logger.error(`Credit deduction failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = CreditManager;