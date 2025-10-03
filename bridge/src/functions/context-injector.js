/**
 * Context Injector - Inject function call results into agent's context
 */

const logger = require('../utils/logger');

class ContextInjector {
    constructor() {
        this.contextHistory = new Map();
        this.maxHistorySize = 10;
    }
    
    /**
     * Initialize context for a session
     */
    initSession(sessionId) {
        this.contextHistory.set(sessionId, {
            items: [],
            summary: {},
            lastUpdated: Date.now()
        });
    }
    
    /**
     * Add function result to context
     */
    addFunctionResult(sessionId, functionName, args, result) {
        const context = this.contextHistory.get(sessionId);
        if (!context) {
            logger.warn(`Context not initialized for session: ${sessionId}`);
            return null;
        }
        
        const contextItem = {
            type: 'function_result',
            function: functionName,
            arguments: args,
            result: result,
            timestamp: Date.now()
        };
        
        context.items.push(contextItem);
        
        // Keep only recent items
        if (context.items.length > this.maxHistorySize) {
            context.items.shift();
        }
        
        // Update summary
        this.updateSummary(sessionId, functionName, result);
        
        context.lastUpdated = Date.now();
        
        logger.debug(`Added function result to context: ${functionName}`, { sessionId });
        
        return contextItem;
    }
    
    /**
     * Update context summary with key information
     */
    updateSummary(sessionId, functionName, result) {
        const context = this.contextHistory.get(sessionId);
        if (!context) return;
        
        // Extract key information based on function type
        switch (functionName) {
            case 'collect_customer_info':
                context.summary.customer = {
                    ...context.summary.customer,
                    ...result.data
                };
                break;
                
            case 'check_balance':
                if (result.success && result.data) {
                    context.summary.lastBalance = {
                        account: result.data.accountNumber,
                        balance: result.data.balance,
                        currency: result.data.currency
                    };
                }
                break;
                
            case 'validate_cnic':
                if (result.success && result.data) {
                    context.summary.verification = {
                        cnicVerified: result.data.cnic_verified,
                        dob: result.data.dob
                    };
                }
                break;
                
            case 'schedule_demo':
                if (result.success && result.data) {
                    context.summary.scheduledDemo = {
                        product: result.data.product,
                        confirmationId: result.data.confirmationId
                    };
                }
                break;
                
            case 'send_company_profile':
                if (result.success && result.data) {
                    context.summary.profileSent = {
                        method: result.data.method,
                        recipient: result.data.recipient
                    };
                }
                break;
        }
    }
    
    /**
     * Generate context injection string for agent instructions
     */
    generateContextString(sessionId) {
        const context = this.contextHistory.get(sessionId);
        if (!context || context.items.length === 0) {
            return '';
        }
        
        const parts = ['\n\n--- CURRENT CONVERSATION CONTEXT ---'];
        
        // Add summary information
        if (Object.keys(context.summary).length > 0) {
            parts.push('\nKnown Information:');
            
            if (context.summary.customer) {
                const c = context.summary.customer;
                parts.push(`- Customer: ${c.name || 'Unknown'}`);
                if (c.company) parts.push(`  Company: ${c.company}`);
                if (c.phone) parts.push(`  Phone: ${c.phone}`);
                if (c.email) parts.push(`  Email: ${c.email}`);
            }
            
            if (context.summary.lastBalance) {
                const b = context.summary.lastBalance;
                parts.push(`- Last balance check: ${b.currency} ${b.balance} (Account: ${b.account})`);
            }
            
            if (context.summary.verification) {
                const v = context.summary.verification;
                if (v.cnicVerified) {
                    parts.push(`- CNIC verified successfully`);
                    if (v.dob) parts.push(`  Date of Birth: ${v.dob}`);
                }
            }
            
            if (context.summary.scheduledDemo) {
                const d = context.summary.scheduledDemo;
                parts.push(`- Demo scheduled for ${d.product} (Confirmation: ${d.confirmationId})`);
            }
            
            if (context.summary.profileSent) {
                const p = context.summary.profileSent;
                parts.push(`- Company profile sent via ${p.method} to ${p.recipient}`);
            }
        }
        
        parts.push('--- END CONTEXT ---\n');
        
        return parts.join('\n');
    }
    
    /**
     * Get formatted context for display/monitoring
     */
    getFormattedContext(sessionId) {
        const context = this.contextHistory.get(sessionId);
        if (!context) return null;
        
        return {
            sessionId,
            itemCount: context.items.length,
            summary: context.summary,
            recentItems: context.items.slice(-5).map(item => ({
                function: item.function,
                timestamp: new Date(item.timestamp).toISOString(),
                success: item.result?.success
            })),
            lastUpdated: new Date(context.lastUpdated).toISOString()
        };
    }
    
    /**
     * Clear context for a session
     */
    clearSession(sessionId) {
        this.contextHistory.delete(sessionId);
        logger.debug(`Cleared context for session: ${sessionId}`);
    }
    
    /**
     * Get all items for a session
     */
    getSessionItems(sessionId) {
        const context = this.contextHistory.get(sessionId);
        return context ? context.items : [];
    }
}

module.exports = ContextInjector;