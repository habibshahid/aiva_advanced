const logger = require('../utils/logger');
const axios = require('axios');

class FunctionExecutor {
    constructor() {
        this.functions = new Map();
    }
    
    /**
     * Register a function handler
     */
    registerFunction(name, handler) {
        logger.info(`Registering function: ${name}`);
        this.functions.set(name, handler);
    }
    
    /**
     * Get handler for a function
     */
    getHandler(name) {
        return this.functions.get(name);
    }
    
    /**
     * Check if function exists
     */
    hasFunction(name) {
        return this.functions.has(name);
    }
    
    /**
     * Execute a function
     */
    async execute(functionName, args, sessionId) {
        const handler = this.functions.get(functionName);
        
        if (!handler) {
            logger.error(`Function not found: ${functionName}`);
            return {
                success: false,
                error: `Function ${functionName} not registered`
            };
        }
        
        try {
            logger.info(`Executing function: ${functionName}`, args);
            const startTime = Date.now();
            
            const result = await handler(args, sessionId);
            
            const executionTime = Date.now() - startTime;
            logger.info(`Function ${functionName} completed in ${executionTime}ms`);
            
            return result;
            
        } catch (error) {
            logger.error(`Function execution error: ${functionName}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Clear all registered functions
     */
    clearAll() {
        this.functions.clear();
        logger.info('All functions cleared');
    }
    
    /**
     * Register API-based function dynamically
     */
    registerApiFunction(func) {
        const handler = async (args) => {
            try {
                logger.info(`Calling API function: ${func.name}`, args);
                
                // Replace {{parameter}} placeholders in URL
                let url = func.api_endpoint;
                Object.keys(args).forEach(key => {
                    url = url.replace(new RegExp(`{{${key}}}`, 'g'), encodeURIComponent(args[key]));
                });
                
                // Prepare headers
                const headers = { ...func.api_headers };
                
                // Prepare body based on body type
                let body = null;
                let bodyData = func.api_body;
                
                if (bodyData && func.api_method !== 'GET') {
                    if (func.api_body_type === 'json') {
                        // Replace placeholders in JSON body
                        let bodyStr = JSON.stringify(bodyData);
                        Object.keys(args).forEach(key => {
                            bodyStr = bodyStr.replace(new RegExp(`{{${key}}}`, 'g'), args[key]);
                        });
                        body = JSON.parse(bodyStr);
                    } else if (func.api_body_type === 'urlencoded' || func.api_body_type === 'form-data') {
                        // Replace placeholders in form data
                        const formData = {};
                        Object.keys(bodyData).forEach(key => {
                            let value = bodyData[key];
                            Object.keys(args).forEach(argKey => {
                                value = value.replace(new RegExp(`{{${argKey}}}`, 'g'), args[argKey]);
                            });
                            formData[key] = value;
                        });
                        
                        if (func.api_body_type === 'urlencoded') {
                            const params = new URLSearchParams(formData);
                            body = params.toString();
                        } else {
                            body = formData;
                        }
                    }
                }
                
                // Make API call
                const response = await axios({
                    method: func.api_method,
                    url: url,
                    headers: headers,
                    data: body,
                    timeout: func.timeout_ms || 30000
                });
                
                logger.info(`API function ${func.name} succeeded`);
                
                return {
                    success: true,
                    data: response.data
                };
                
            } catch (error) {
                logger.error(`API function ${func.name} failed:`, error.message);
                
                // Retry logic
                if (func.retries && func.retries > 0) {
                    // Implement retry if needed
                    logger.info(`Retrying function ${func.name}...`);
                }
                
                return {
                    success: false,
                    error: error.response?.data?.message || error.message
                };
            }
        };
        
        this.registerFunction(func.name, handler);
    }
}

module.exports = FunctionExecutor;