/**
 * Function Executor - Execute functions with external API calls
 */

const axios = require('axios');
const logger = require('../utils/logger');

class FunctionExecutor {
    constructor() {
        this.functions = new Map();
        this.apiCallTimeout = 30000; // 30 seconds
    }
    
    /**
     * Register a function with optional API endpoint
     */
    registerFunction(name, handler, config = {}) {
		this.functions.set(name, {
			name: name,
			handler: handler,
			config: {
				timeout: config.timeout || this.apiCallTimeout,
				retries: config.retries || 0,
				requiresAuth: config.requiresAuth || false,
				authToken: config.authToken || null,
				mode: config.mode || 'sync',  // ADDED
				...config
			}
		});
		
		logger.info(`Registered function: ${name} (${config.mode || 'sync'})`);
	}

	getFunctionMode(name) {
		const func = this.functions.get(name);
		return func ? func.config.mode : 'sync';
	}
    
    /**
     * Execute a function by name with arguments
     */
    async execute(functionName, args, context = {}) {
        const func = this.functions.get(functionName);
        
        if (!func) {
            logger.error(`Function not found: ${functionName}`);
            throw new Error(`Function ${functionName} not found`);
        }
        
        try {
            logger.info(`Executing function: ${functionName}`, { args });
            
            const result = await func.handler(args, context, this);
            
            logger.info(`Function executed successfully: ${functionName}`, { result });
            
            return {
                success: true,
                data: result,
                executedAt: new Date().toISOString()
            };
            
        } catch (error) {
            logger.error(`Function execution failed: ${functionName}`, { error: error.message });
            
            return {
                success: false,
                error: error.message,
                executedAt: new Date().toISOString()
            };
        }
    }
    
    /**
     * Make HTTP API call with retry logic
     */
    async apiCall(config) {
        const {
            url,
            method = 'GET',
            data = null,
            headers = {},
            timeout = this.apiCallTimeout,
            retries = 2
        } = config;
        
        let lastError;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                logger.debug(`API call attempt ${attempt + 1}/${retries + 1}: ${method} ${url}`);
                
                const response = await axios({
                    url,
                    method,
                    data,
                    headers,
                    timeout
                });
                
                logger.debug(`API call successful: ${method} ${url}`, { status: response.status });
                
                return response.data;
                
            } catch (error) {
                lastError = error;
                logger.warn(`API call attempt ${attempt + 1} failed: ${method} ${url}`, { 
                    error: error.message 
                });
                
                if (attempt < retries) {
                    // Wait before retry (exponential backoff)
                    const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        logger.error(`API call failed after ${retries + 1} attempts: ${method} ${url}`, {
            error: lastError.message
        });
        
        throw new Error(`API call failed: ${lastError.message}`);
    }
    
    /**
     * Batch execute multiple functions
     */
    async executeBatch(functionCalls, context = {}) {
        const results = await Promise.allSettled(
            functionCalls.map(({ name, args }) => this.execute(name, args, context))
        );
        
        return results.map((result, index) => ({
            functionName: functionCalls[index].name,
            status: result.status,
            data: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason : null
        }));
    }
    
    /**
     * Get list of registered functions
     */
    listFunctions() {
        return Array.from(this.functions.keys());
    }
    
    /**
     * Check if function exists
     */
    hasFunction(name) {
        return this.functions.has(name);
    }
}

module.exports = FunctionExecutor;