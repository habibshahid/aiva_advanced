require('dotenv').config();

const logger = require('../utils/logger');
const axios = require('axios');
const DEBUG_FUNCTIONS = process.env.DEBUG_FUNCTION_CALLS === 'true';

class FunctionExecutor {
    constructor() {
        this.functions = new Map();
        this.functionMetadata = new Map(); // Store function metadata
    }
    
    /**
     * Register a function handler with metadata
     */
    registerFunction(name, handler, metadata = {}) {
        logger.info(`Registering function: ${name}`);
        this.functions.set(name, handler);
        this.functionMetadata.set(name, {
            execution_mode: metadata.execution_mode || 'sync',
            timeout_ms: metadata.timeout_ms || 30000,
            retries: metadata.retries || 2,
            ...metadata
        });
    }
	
	/**
	 * Register an API function with full metadata
	 */
	registerApiFunction(functionDef, additionalMetadata = {}) {
		const { name, api_endpoint, api_method, api_headers, api_body, timeout_ms, retries, execution_mode } = functionDef;
		
		const handler = async (args, context) => {
			const callId = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			
			try {
				// Replace template variables in endpoint
				let endpoint = api_endpoint;
				for (const [key, value] of Object.entries(args)) {
					endpoint = endpoint.replace(`{{${key}}}`, value);
				}
				
				// Prepare request config
				const config = {
					method: api_method || 'POST',
					url: endpoint,
					timeout: timeout_ms || 30000,
					headers: api_headers || {}
				};
				
				// Add body if not GET request
				let processedBody = null;
				if (api_method !== 'GET' && api_body) {
					// Replace template variables in body
					let body = JSON.parse(JSON.stringify(api_body));
					for (const [key, value] of Object.entries(args)) {
						const replaceInObject = (obj) => {
							for (const k in obj) {
								if (typeof obj[k] === 'string') {
									obj[k] = obj[k].replace(`{{${key}}}`, value);
								} else if (typeof obj[k] === 'object') {
									replaceInObject(obj[k]);
								}
							}
						};
						replaceInObject(body);
					}
					config.data = body;
					processedBody = body;
				}
				else{
					let body = args;
					config.body = body;
					config.data = body;
				}
				
				if (DEBUG_FUNCTIONS) {
					// ============================================
					// DETAILED DEBUG LOGGING - START
					// ============================================
					console.log('\n' + '='.repeat(80));
					console.log(`FUNCTION CALL DEBUG - ${name}`);
					console.log('='.repeat(80));
					console.log(`Call ID: ${callId}`);
					console.log(`Timestamp: ${new Date().toISOString()}`);
					console.log(`Execution Mode: ${execution_mode || 'sync'}`);
					console.log(`Session ID: ${context.sessionId || 'N/A'}`);
					console.log(`Caller ID: ${context.callerId || 'N/A'}`);
					console.log('-'.repeat(80));
					console.log('REQUEST DETAILS:');
					console.log(`  Method: ${config.method}`);
					console.log(`  URL: ${config.url}`);
					console.log(`  Timeout: ${config.timeout}ms`);
					console.log(`  Max Retries: ${retries || 2}`);
					console.log('-'.repeat(80));
					console.log('HEADERS:');
					console.log(JSON.stringify(config.headers, null, 2));
					console.log('-'.repeat(80));
					console.log('FUNCTION ARGUMENTS (from AI):');
					console.log(JSON.stringify(args, null, 2));
					console.log('-'.repeat(80));
					if (processedBody) {
						console.log('REQUEST BODY (after template replacement):');
						console.log(JSON.stringify(processedBody, null, 2));
						console.log('-'.repeat(80));
					}
					// ============================================
					// DETAILED DEBUG LOGGING - END
					// ============================================
				}
				// Execute with retries
				let lastError;
				const maxRetries = retries || 2;
				const startTime = Date.now();
				
				for (let attempt = 0; attempt <= maxRetries; attempt++) {
					try {
						const attemptStartTime = Date.now();
						
						// Log attempt
						if (attempt > 0) {
							console.log(`\n[RETRY ${attempt}/${maxRetries}] Attempting function call: ${name}`);
						}
						
						console.log('*************', config)
						const response = await axios(config);
						const attemptDuration = Date.now() - attemptStartTime;
						const totalDuration = Date.now() - startTime;
						
						if (DEBUG_FUNCTIONS) {
							// ============================================
							// SUCCESS RESPONSE LOGGING
							// ============================================
							console.log('\n' + '='.repeat(80));
							console.log(`✅ FUNCTION CALL SUCCESS - ${name}`);
							console.log('='.repeat(80));
							console.log(`Call ID: ${callId}`);
							console.log(`Status Code: ${response.status} ${response.statusText}`);
							console.log(`Attempt: ${attempt + 1}/${maxRetries + 1}`);
							console.log(`Attempt Duration: ${attemptDuration}ms`);
							console.log(`Total Duration: ${totalDuration}ms`);
							console.log('-'.repeat(80));
							console.log('RESPONSE HEADERS:');
							console.log(JSON.stringify(response.headers, null, 2));
							console.log('-'.repeat(80));
							console.log('RESPONSE BODY:');
							console.log(JSON.stringify(response.data, null, 2));
							console.log('='.repeat(80) + '\n');
							// ============================================
						}
						logger.info(`API function ${name} succeeded`, { 
							callId,
							status: response.status,
							duration: totalDuration,
							attempt: attempt + 1
						});
						
						return {
							success: true,
							data: response.data,
							status: response.status,
							duration: totalDuration,
							callId: callId
						};
						
					} catch (error) {
						lastError = error;
						const attemptDuration = Date.now() - attemptStartTime;
						
						if (DEBUG_FUNCTIONS) {
							// ============================================
							// ERROR LOGGING
							// ============================================
							console.log('\n' + '='.repeat(80));
							console.log(`❌ FUNCTION CALL ATTEMPT FAILED - ${name}`);
							console.log('='.repeat(80));
							console.log(`Call ID: ${callId}`);
							console.log(`Attempt: ${attempt + 1}/${maxRetries + 1}`);
							console.log(`Duration: ${attemptDuration}ms`);
							console.log('-'.repeat(80));
							console.log('ERROR DETAILS:');
							console.log(`  Message: ${error.message}`);
							console.log(`  Code: ${error.code || 'N/A'}`);
							if (error.response) {
								console.log(`  Status: ${error.response.status} ${error.response.statusText}`);
								console.log(`  Response Body:`);
								console.log(JSON.stringify(error.response.data, null, 2));
							}
							console.log('='.repeat(80) + '\n');
							// ============================================
						}
						logger.warn(`API function ${name} attempt ${attempt + 1} failed:`, {
							callId,
							error: error.message,
							attempt: attempt + 1
						});
						
						if (attempt < maxRetries) {
							const waitTime = Math.pow(2, attempt) * 1000;
							console.log(`⏳ Waiting ${waitTime}ms before retry...`);
							await new Promise(resolve => setTimeout(resolve, waitTime));
						}
					}
				}
				
				throw lastError;
				
			} catch (error) {
				if (DEBUG_FUNCTIONS) {
					// ============================================
					// FINAL FAILURE LOGGING
					// ============================================
					console.log('\n' + '='.repeat(80));
					console.log(`💀 FUNCTION CALL FINAL FAILURE - ${name}`);
					console.log('='.repeat(80));
					console.log(`Call ID: ${callId}`);
					console.log(`All ${retries + 1} attempts exhausted`);
					console.log('-'.repeat(80));
					console.log('FINAL ERROR:');
					console.log(`  Message: ${error.message}`);
					console.log(`  Stack: ${error.stack}`);
					console.log('='.repeat(80) + '\n');
					// ============================================
				}
				logger.error(`API function ${name} failed after all retries:`, {
					callId,
					error: error.message
				});
				
				return {
					success: false,
					error: error.message,
					callId: callId
				};
			}
		};
		
		// Register with metadata
		this.registerFunction(name, handler, {
			execution_mode: execution_mode || 'sync',
			timeout_ms: timeout_ms || 30000,
			retries: retries || 2,
			handler_type: 'api',
			...additionalMetadata
		});
	}
    
    /**
     * Get handler for a function
     */
    getHandler(name) {
        return this.functions.get(name);
    }
    
    /**
     * Get function mode (sync/async)
     */
    getFunctionMode(name) {
        const metadata = this.functionMetadata.get(name);
        return metadata ? metadata.execution_mode : 'sync';
    }
    
    /**
     * Get function metadata
     */
    getMetadata(name) {
        return this.functionMetadata.get(name);
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
    async execute(functionName, args, context = {}) {
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
            
            const result = await handler(args, context);
            
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
        this.functionMetadata.clear();
    }
}

module.exports = FunctionExecutor;