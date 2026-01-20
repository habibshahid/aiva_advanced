/**
 * Flow Executor
 * 
 * Executes flow steps sequentially:
 * - Collect: Gather information from user
 * - Function: Call API/webhook
 * - Condition: Branch based on data
 * - Message: Send a message
 * 
 * Handles parameter collection, validation, and function execution.
 */

const SessionStateService = require('./SessionStateService');
const ChatFlowService = require('./ChatFlowService');

class FlowExecutor {

    /**
     * Step type constants
     */
    static STEP_TYPES = {
        COLLECT: 'collect',
        FUNCTION: 'function',
        CONDITION: 'condition',
        MESSAGE: 'message'
    };

    /**
     * Initialize executor with function handlers
     * 
     * @param {object} functionHandlers - Map of function name to handler
     */
    constructor(functionHandlers = {}) {
        this.functionHandlers = functionHandlers;
    }

    /**
     * Register a function handler
     */
    registerFunction(name, handler) {
        this.functionHandlers[name] = handler;
    }

    /**
     * Start a flow for a session
     * 
     * @param {string} sessionId - Session ID
     * @param {string} flowId - Flow ID to start
     * @param {object} initialParams - Initial parameters (extracted by LLM)
     * @param {object} agent - Agent config (needed for function execution)
     */
    async startFlow(sessionId, flowId, initialParams = {}, agent = null) {
        try {
            const flow = await ChatFlowService.getFlow(flowId);
            if (!flow) {
                throw new Error(`Flow ${flowId} not found`);
            }

            // Determine first step
            const firstStep = flow.config?.steps?.[0];
            const pendingParams = this._getPendingParams(flow, initialParams);

            // Set active flow state
            await SessionStateService.setActiveFlow(sessionId, {
                flow_id: flowId,
                current_step: firstStep?.id || null,
                params_collected: initialParams,
                params_pending: pendingParams
            });

            console.log(`▶️ Started flow ${flowId} at step ${firstStep?.id || 'none'}`);

            // If no steps or all params collected, may be ready to complete
            if (!firstStep) {
                return {
                    status: 'completed',
                    flow_id: flowId,
                    result: initialParams
                };
            }

            // Auto-execute steps that don't need user input (condition, function, message)
            // Keep executing until we hit a 'collect' step or flow completes
            // Pass initialParams so collect steps can check for pre-extracted values
            let result = await this._autoExecuteSteps(sessionId, flow, agent, initialParams);
            
            return {
                status: result.status || 'started',
                flow_id: flowId,
                current_step: result.current_step || firstStep.id,
                params_collected: result.params_collected || initialParams,
                params_pending: result.params_pending || pendingParams,
                ...result
            };
        } catch (error) {
            console.error('Error in FlowExecutor.startFlow:', error);
            throw error;
        }
    }
    
    /**
     * Auto-execute steps that don't require user input
     * Runs condition, function, and message steps until hitting a collect step
     */
    async _autoExecuteSteps(sessionId, flow, agent, initialExtracted = {}) {
        let iterations = 0;
        const maxIterations = 10; // Prevent infinite loops
        let lastResult = {};
        
        while (iterations < maxIterations) {
            iterations++;
            
            const session = await SessionStateService.getSession(sessionId);
            if (!session?.active_flow) {
                return { status: 'no_active_flow' };
            }
            
            const flowState = session.active_flow;
            const currentStep = flow.config?.steps?.find(s => s.id === flowState.current_step);
            
            if (!currentStep) {
                return { status: 'flow_completed', ...lastResult };
            }
            
            console.log(`🔄 Auto-executing step: ${currentStep.id} (${currentStep.type})`);
            
            // If it's a collect step, check if we already have the param
            if (currentStep.type === FlowExecutor.STEP_TYPES.COLLECT) {
                const paramName = currentStep.config?.param;
                let existingValue = flowState.params_collected?.[paramName];
                
                // Smart mapping: if collecting order_identifier, check LLM extracted data
                if (!existingValue && paramName === 'order_identifier') {
                    // Check if LLM extracted order numbers, phone numbers, or email
                    const extracted = initialExtracted || flowState.params_collected || {};
                    if (extracted.order_numbers?.length > 0) {
                        existingValue = extracted.order_numbers[0];
                        console.log(`📥 [AutoExecute] Using extracted order_number as order_identifier: ${existingValue}`);
                    } else if (extracted.phone_numbers?.length > 0) {
                        existingValue = extracted.phone_numbers[0];
                        console.log(`📥 [AutoExecute] Using extracted phone_number as order_identifier: ${existingValue}`);
                    } else if (extracted.email) {
                        existingValue = extracted.email;
                        console.log(`📥 [AutoExecute] Using extracted email as order_identifier: ${existingValue}`);
                    }
                }
                
                // If we have a value, skip collecting and move to next step
                if (existingValue) {
                    console.log(`✅ [AutoExecute] Param ${paramName} already has value: ${existingValue}, skipping collect`);
                    const newParams = { [paramName]: existingValue };
                    await SessionStateService.updateFlowStep(sessionId, currentStep.id, newParams);
                    
                    const updatedFlowState = {
                        ...flowState,
                        params_collected: { ...flowState.params_collected, ...newParams }
                    };
                    
                    // Move to next step and continue auto-executing
                    const moveResult = await this._moveToNextStep(sessionId, flow, updatedFlowState, newParams);
                    lastResult = { ...lastResult, ...moveResult };
                    continue; // Continue the loop to process next step
                }
                
                // No value, need to prompt user
                return {
                    status: 'awaiting_input',
                    current_step: currentStep.id,
                    prompt: currentStep.config?.prompt,
                    param_needed: currentStep.config?.param,
                    params_collected: flowState.params_collected
                };
            }
            
            // Execute the step
            let stepResult;
            switch (currentStep.type) {
                case FlowExecutor.STEP_TYPES.CONDITION:
                    stepResult = await this._processConditionStep(sessionId, flow, flowState, currentStep);
                    break;
                    
                case FlowExecutor.STEP_TYPES.FUNCTION:
                    stepResult = await this._processFunctionStep(sessionId, flow, flowState, currentStep, agent);
                    break;
                    
                case FlowExecutor.STEP_TYPES.MESSAGE:
                    stepResult = await this._processMessageStep(sessionId, flow, flowState, currentStep);
                    break;
                    
                default:
                    // Unknown step type, move to next
                    stepResult = await this._moveToNextStep(sessionId, flow, flowState, {});
            }
            
            lastResult = { ...lastResult, ...stepResult };
            
            // If flow completed or needs LLM response, stop
            if (stepResult.status === 'flow_completed' || stepResult.needs_llm_response) {
                return lastResult;
            }
            
            // If we didn't move to a new step, break to avoid infinite loop
            const newSession = await SessionStateService.getSession(sessionId);
            if (newSession?.active_flow?.current_step === flowState.current_step) {
                console.warn('⚠️ Step did not advance, breaking auto-execute loop');
                break;
            }
        }
        
        return lastResult;
    }

    /**
     * Process user input within an active flow
     * 
     * @param {string} sessionId - Session ID
     * @param {object} input - { message, images, extracted }
     * @param {object} agent - Agent config
     */
    async processFlowInput(sessionId, input, agent) {
        try {
            const session = await SessionStateService.getSession(sessionId);
            if (!session?.active_flow) {
                return { status: 'no_active_flow' };
            }

            const flowState = session.active_flow;
            const flow = await ChatFlowService.getFlow(flowState.flow_id);
            if (!flow) {
                await SessionStateService.abandonFlow(sessionId);
                return { status: 'flow_not_found' };
            }

            // Find current step
            const currentStep = flow.config?.steps?.find(s => s.id === flowState.current_step);
            if (!currentStep) {
                // No current step, try to move to next
                return await this._moveToNextStep(sessionId, flow, flowState, input.extracted || {});
            }

            let result;

            // Process based on step type
            switch (currentStep.type) {
                case FlowExecutor.STEP_TYPES.COLLECT:
                    result = await this._processCollectStep(sessionId, flow, flowState, currentStep, input);
                    break;

                case FlowExecutor.STEP_TYPES.FUNCTION:
                    result = await this._processFunctionStep(sessionId, flow, flowState, currentStep, agent);
                    break;

                case FlowExecutor.STEP_TYPES.CONDITION:
                    result = await this._processConditionStep(sessionId, flow, flowState, currentStep);
                    break;

                case FlowExecutor.STEP_TYPES.MESSAGE:
                    result = await this._processMessageStep(sessionId, flow, flowState, currentStep);
                    break;

                default:
                    console.warn(`Unknown step type: ${currentStep.type}`);
                    result = await this._moveToNextStep(sessionId, flow, flowState, {});
            }
            
            // If step completed successfully and moved to next step, auto-execute non-input steps
            if (result.status === 'step_completed' && result.next_step) {
                console.log(`🔄 Step completed, auto-executing from: ${result.next_step}`);
                const autoResult = await this._autoExecuteSteps(sessionId, flow, agent);
                // Merge results
                result = { ...result, ...autoResult };
            }
            
            return result;
        } catch (error) {
            console.error('Error in FlowExecutor.processFlowInput:', error);
            return { status: 'error', error: error.message };
        }
    }

    /**
     * Execute a function directly (called by LLM decision)
     * 
     * @param {string} functionName - Function to execute
     * @param {object} params - Function parameters
     * @param {object} agent - Agent config
     * @param {object} session - Session object
     */
    async executeFunction(functionName, params, agent, session) {
        try {
            // First check if there's a hardcoded handler
            const handler = this.functionHandlers[functionName];
            if (handler) {
                console.log(`⚡ Executing hardcoded function: ${functionName}`, params);
                const result = await handler(params, agent, session);
                
                return {
                    success: true,
                    function: functionName,
                    result: result
                };
            }
            
            // If no hardcoded handler, check for agent-defined function in database
            const agentFunction = await this._getAgentFunction(agent.id, functionName);
            if (agentFunction) {
                console.log(`⚡ Executing agent function: ${functionName}`, params);
                const result = await this._executeAgentFunction(agentFunction, params, agent, session);
                
                return {
                    success: true,
                    function: functionName,
                    result: result
                };
            }
            
            console.warn(`No handler for function: ${functionName}`);
            return { success: false, error: `Function ${functionName} not found` };
            
        } catch (error) {
            console.error(`Error executing function ${functionName}:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get agent function from database
     */
    async _getAgentFunction(agentId, functionName) {
        try {
            const db = require('../../config/database');
            const [functions] = await db.query(
                'SELECT * FROM yovo_tbl_aiva_functions WHERE agent_id = ? AND name = ? AND is_active = 1',
                [agentId, functionName]
            );
            
            if (functions.length === 0) {
                return null;
            }
            
            const func = functions[0];
            return {
                ...func,
                parameters: typeof func.parameters === 'string' ? JSON.parse(func.parameters) : func.parameters,
                api_headers: func.api_headers ? (typeof func.api_headers === 'string' ? JSON.parse(func.api_headers) : func.api_headers) : null,
                api_body: func.api_body ? (typeof func.api_body === 'string' ? JSON.parse(func.api_body) : func.api_body) : null
            };
        } catch (error) {
            console.error('Error fetching agent function:', error);
            return null;
        }
    }
    
    /**
     * Execute an agent-defined function (API call)
     */
    async _executeAgentFunction(func, params, agent, session) {
        if (func.handler_type !== 'api' || !func.api_endpoint) {
            throw new Error(`Function ${func.name} is not configured as an API function`);
        }
        
        const axios = require('axios');
        const https = require('https');
        
        // Replace parameters in URL
        let url = func.api_endpoint;
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                url = url.replace(`{{${key}}}`, encodeURIComponent(value));
                url = url.replace(`{${key}}`, encodeURIComponent(value));
            }
        }
        
        // Prepare headers
        let headers = {
            'Content-Type': 'application/json'
        };
        if (func.api_headers) {
            headers = { ...headers, ...func.api_headers };
        }
        
        // Replace template variables in headers
        for (const [key, value] of Object.entries(headers)) {
            if (typeof value === 'string') {
                for (const [paramKey, paramValue] of Object.entries(params)) {
                    if (typeof paramValue === 'string') {
                        headers[key] = value.replace(`{{${paramKey}}}`, paramValue);
                    }
                }
            }
        }
        
        // Prepare body based on function schema or explicit body template
        let body = null;
        if (func.api_method !== 'GET') {
            if (func.api_body) {
                // Use explicit body template
                body = JSON.parse(JSON.stringify(func.api_body));
                
                // Replace template variables in body
                const replaceInObject = (obj) => {
                    for (const key in obj) {
                        if (typeof obj[key] === 'string') {
                            for (const [paramKey, paramValue] of Object.entries(params)) {
                                if (typeof paramValue === 'string') {
                                    obj[key] = obj[key].replace(`{{${paramKey}}}`, paramValue);
                                }
                            }
                        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                            replaceInObject(obj[key]);
                        }
                    }
                };
                replaceInObject(body);
            } else if (func.parameters) {
                // Build body based on function's parameter schema
                body = this._buildBodyFromSchema(func.parameters, params, func.name);
            } else {
                // No schema, no body template - send filtered essential params only
                body = this._extractEssentialParams(params);
            }
            
            // Sanitize body to handle large base64 images
            body = this._sanitizeBodyForAPI(body);
        }
        
        // Build axios config
        const axiosConfig = {
            method: func.api_method || 'POST',
            url: url,
            headers: headers,
            timeout: func.timeout_ms || 30000
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
        
        console.log(`🌐 Calling API: ${func.api_method} ${url}`);
        
        const response = await axios(axiosConfig);
        
        console.log(`✅ API response status: ${response.status}`);
        
        return response.data;
    }
    
    /**
     * Sanitize API body to handle large base64 images
     * For APIs that can't handle large payloads, we truncate or summarize image data
     */
    _sanitizeBodyForAPI(body) {
        if (!body || typeof body !== 'object') {
            return body;
        }
        
        const sanitized = Array.isArray(body) ? [] : {};
        
        for (const [key, value] of Object.entries(body)) {
            if (Array.isArray(value)) {
                // Handle arrays (like images array)
                sanitized[key] = value.map(item => {
                    if (typeof item === 'string' && item.startsWith('data:image')) {
                        // Keep only first 100 chars as a marker that an image was present
                        // External API should handle images differently (e.g., via upload endpoint)
                        return `[BASE64_IMAGE:${item.substring(0, 50)}...]`;
                    }
                    if (typeof item === 'object' && item !== null) {
                        return this._sanitizeBodyForAPI(item);
                    }
                    return item;
                });
            } else if (typeof value === 'string' && value.startsWith('data:image')) {
                // Single base64 image
                sanitized[key] = `[BASE64_IMAGE:${value.substring(0, 50)}...]`;
            } else if (typeof value === 'object' && value !== null) {
                sanitized[key] = this._sanitizeBodyForAPI(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }
    
    /**
     * Build API body based on function's parameter schema
     * Maps collected params to the expected schema properties
     */
    _buildBodyFromSchema(schema, params, functionName = 'unknown') {
        if (!schema || typeof schema !== 'object') {
            return this._extractEssentialParams(params);
        }
        
        const body = {};
        const properties = schema.properties || {};
        const required = schema.required || [];
        
        console.log(`📋 Building body from schema for ${functionName}:`, {
            schemaProps: Object.keys(properties),
            required: required,
            availableParams: Object.keys(params).filter(k => 
                !['order_details', 'complaint_images', 'customer'].includes(k)
            )
        });
        
        // Map each schema property to the corresponding param value
        for (const [propName, propSchema] of Object.entries(properties)) {
            let value = null;
            
            // 1. FIRST: Check if enum has only one value (static/fixed value)
            if (propSchema.enum && propSchema.enum.length === 1) {
                value = propSchema.enum[0];
                console.log(`  📌 ${propName}: Static enum value = "${value}"`);
            }
            // 2. Direct match from params
            else if (params[propName] !== undefined && params[propName] !== null) {
                value = params[propName];
            }
            // 3. Try common mappings for order_number
            else if (propName === 'order_number') {
                if (params.order_identifier) {
                    value = params.order_identifier;
                } else if (params.order_details?.order?.order_number) {
                    value = params.order_details.order.order_number;
                }
            }
            // 4. Map complaint_type to ticket_type
            else if (propName === 'ticket_type' && params.complaint_type) {
                const typeMap = {
                    'DAMAGED_ARTICLE': 'damaged article',
                    'MISSING_ITEMS': 'missing items',
                    'ORDER_NOT_RECEIVED': 'order not received',
                    'SIZE_ISSUE': 'size issue',
                    'SERVICE_ISSUE': 'service issue'
                };
                value = typeMap[params.complaint_type] || params.complaint_type?.toLowerCase()?.replace(/_/g, ' ');
            }
            // 5. Customer details from order_details
            else if (propName === 'customer_phone' && params.order_details?.order?.customer_phone) {
                value = params.order_details.order.customer_phone;
            }
            else if (propName === 'customer_email' && params.order_details?.order?.customer_email) {
                value = params.order_details.order.customer_email;
            }
            else if (propName === 'customer_name' && params.order_details?.order?.customer_name) {
                value = params.order_details.order.customer_name;
            }
            // 6. Handle images - provide summary instead of base64
            else if (propName === 'images' && params.complaint_images) {
                value = Array.isArray(params.complaint_images) 
                    ? `[${params.complaint_images.length} images attached]` 
                    : '[image attached]';
            }
            
            // Handle default values from schema
            if (value === null && propSchema.default !== undefined) {
                value = propSchema.default;
            }
            
            // Validate enum constraints (for multi-value enums)
            if (value !== null && propSchema.enum && propSchema.enum.length > 1 && !propSchema.enum.includes(value)) {
                const lowerValue = String(value).toLowerCase();
                const matchedEnum = propSchema.enum.find(e => 
                    String(e).toLowerCase() === lowerValue ||
                    String(e).toLowerCase().replace(/[_\s]/g, '') === lowerValue.replace(/[_\s]/g, '')
                );
                if (matchedEnum) {
                    value = matchedEnum;
                }
            }
            
            if (value !== null) {
                body[propName] = value;
            }
        }
        
        // Log mapping result
        console.log(`📋 Final API body for ${functionName}:`, body);
        
        return body;
    }
    
    /**
     * Extract essential params (exclude large objects and internal data)
     */
    _extractEssentialParams(params) {
        const essential = {};
        const excludeKeys = [
            'order_details', 'complaint_images', 'images', 'uploaded_images',
            'sentiment', 'order_numbers', 'phone_numbers', 'email',
            'customer', 'channel', 'channel_user_id'
        ];
        
        for (const [key, value] of Object.entries(params)) {
            // Skip excluded keys
            if (excludeKeys.includes(key)) continue;
            
            // Skip base64 images
            if (typeof value === 'string' && value.startsWith('data:image')) continue;
            
            // Skip arrays of base64 images
            if (Array.isArray(value) && value.length > 0 && 
                typeof value[0] === 'string' && value[0].startsWith('data:image')) continue;
            
            // Skip large nested objects
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) continue;
            
            essential[key] = value;
        }
        
        return essential;
    }

    // ========================================================================
    // STEP PROCESSORS
    // ========================================================================

    /**
     * Process a collect step with intelligent image analysis
     */
    async _processCollectStep(sessionId, flow, flowState, step, input) {
        const config = step.config || {};
        const paramName = config.param;
        const paramType = config.param_type || 'string';
        
        console.log(`📥 Processing collect step: ${step.id}`, {
            param: paramName,
            paramType: paramType,
            message: input.message,
            hasImages: input.images?.length > 0,
            extracted: input.extracted
        });
        
        // Try to extract the parameter from input
        let extractedValue = null;
        let additionalData = {}; // Store data for later steps (e.g., damage photos when collecting order)

        // Check if LLM already extracted it
        if (input.extracted && input.extracted[paramName]) {
            extractedValue = input.extracted[paramName];
            console.log(`📥 Got value from LLM extraction: ${extractedValue}`);
        }
        
        // Also check common extraction fields that map to our param
        if (!extractedValue && input.extracted) {
            // Map common extraction fields to param names
            const extractionMappings = {
                'order_identifier': ['order_numbers', 'phone_numbers', 'email'],
                'order_number': ['order_numbers'],
                'phone': ['phone_numbers'],
                'email': ['email']
            };
            
            const mappings = extractionMappings[paramName] || [];
            for (const field of mappings) {
                const value = input.extracted[field];
                if (value) {
                    if (Array.isArray(value) && value.length > 0) {
                        extractedValue = value[0];
                        console.log(`📥 Got value from mapped extraction ${field}: ${extractedValue}`);
                        break;
                    } else if (typeof value === 'string' && value.trim()) {
                        extractedValue = value;
                        console.log(`📥 Got value from mapped extraction ${field}: ${extractedValue}`);
                        break;
                    }
                }
            }
        }

        // Check if it's in the message based on patterns
        if (!extractedValue && config.patterns && config.patterns.length > 0 && input.message) {
            for (const pattern of config.patterns) {
                const regex = new RegExp(pattern, 'i');
                const match = input.message.match(regex);
                if (match) {
                    extractedValue = match[0];
                    console.log(`📥 Got value from pattern match: ${extractedValue}`);
                    break;
                }
            }
        }

        // Check if it's an image collection step
        if (!extractedValue && paramType === 'image[]' && input.images?.length > 0) {
            extractedValue = input.images;
            console.log(`📥 Got value from images: ${input.images.length} images`);
        }
        
        // Handle case where user sent images but we're not collecting images
        // Use LLM vision to analyze if accept_image_input is enabled
        if (!extractedValue && input.images?.length > 0 && paramType !== 'image[]') {
            const acceptImageInput = config.accept_image_input !== false; // Default true for backward compat
            const saveUnrelatedImages = config.save_unrelated_images !== false; // Default true
            
            if (acceptImageInput) {
                console.log(`🔍 User sent images, step accepts image input - analyzing with vision...`);
                
                const imageAnalysis = await this._analyzeImagesForStep(
                    input.images, 
                    paramName, 
                    paramType,
                    config.llm_instructions || '',
                    config.image_extraction_hints || '',
                    flowState,
                    saveUnrelatedImages
                );
                
                console.log(`🔍 Image analysis result:`, {
                    image_type: imageAnalysis.image_type,
                    found_value: imageAnalysis.found_value,
                    confidence: imageAnalysis.confidence,
                    save_for_later: imageAnalysis.save_for_later
                });
                
                if (imageAnalysis.found_value && imageAnalysis.extracted_value) {
                    // Found what we need in the image (e.g., order number from screenshot)
                    extractedValue = imageAnalysis.extracted_value;
                    console.log(`📥 Extracted ${paramName} from image: ${extractedValue}`);
                }
                
                if (imageAnalysis.save_for_later && imageAnalysis.save_as && saveUnrelatedImages) {
                    // Save images for a later step (e.g., damage photos)
                    additionalData[imageAnalysis.save_as] = input.images;
                    console.log(`📥 Saved ${input.images.length} images for later as: ${imageAnalysis.save_as}`);
                }
                
                if (!extractedValue && imageAnalysis.response_hint) {
                    // Return with a contextual prompt
                    return {
                        status: 'awaiting_input',
                        step_id: step.id,
                        param_needed: paramName,
                        prompt: imageAnalysis.response_hint,
                        param_type: paramType,
                        images_saved: Object.keys(additionalData).length > 0 ? additionalData : undefined
                    };
                }
            } else {
                console.log(`📥 Step does not accept image input, ignoring images`);
                // If images not accepted, just save them for later if enabled
                if (saveUnrelatedImages) {
                    additionalData['uploaded_images'] = input.images;
                    console.log(`📥 Saved ${input.images.length} images for later use`);
                }
            }
        }
        
        // For simple text/string params, validate the message
        if (!extractedValue && input.message && input.message.trim()) {
            const simpleTypes = ['string', 'text', 'number', 'email', 'phone', 'order_id'];
            if (!paramType || simpleTypes.includes(paramType)) {
                const rawMessage = input.message.trim();
                
                // Skip placeholder messages (from PHP when image has no caption)
                const isPlaceholder = rawMessage === '...' || rawMessage === '…' || 
                                     rawMessage === 'Image shared' || rawMessage.length < 2;
                
                if (!isPlaceholder) {
                    extractedValue = rawMessage;
                    console.log(`📥 Using raw message as value: ${extractedValue}`);
                } else {
                    console.log(`📥 Skipping placeholder message: "${rawMessage}"`);
                }
            }
        }

        // If we got the value, update state and move to next step
        if (extractedValue) {
            const newParams = { [paramName]: extractedValue, ...additionalData };
            await SessionStateService.updateFlowStep(sessionId, step.id, newParams);

            // Truncate base64 images for logging
            let logValue = extractedValue;
            if (typeof extractedValue === 'string' && extractedValue.startsWith('data:image')) {
                logValue = '[base64 image received]';
            } else if (Array.isArray(extractedValue)) {
                logValue = extractedValue.map(v => 
                    typeof v === 'string' && v.startsWith('data:image') 
                        ? '[base64 image]' 
                        : v
                );
                logValue = `[${logValue.length} items: ${logValue.join(', ')}]`;
            } else if (typeof extractedValue === 'string' && extractedValue.length > 200) {
                logValue = extractedValue.substring(0, 200) + '... [truncated]';
            }
            console.log(`✅ Collected ${paramName} = ${logValue}, moving to next step`);

            // Move to next step
            const updatedFlowState = {
                ...flowState,
                params_collected: { ...flowState.params_collected, ...newParams }
            };
            return await this._moveToNextStep(sessionId, flow, updatedFlowState, newParams);
        }

        // Value not provided, need to prompt
        console.log(`⏳ Awaiting input for ${paramName}`);
        return {
            status: 'awaiting_input',
            step_id: step.id,
            param_needed: paramName,
            prompt: config.prompt || `Please provide ${paramName}`,
            param_type: paramType
        };
    }
    
    /**
     * Analyze images using LLM vision to determine what they contain
     * and whether they're relevant to the current collection step
     */
    async _analyzeImagesForStep(images, paramName, paramType, llmInstructions, imageExtractionHints, flowState, saveUnrelatedImages) {
        try {
            const LLMService = require('../LLMService');
            
            // Build specific extraction guidance based on param type
            let extractionGuidance = '';
            switch (paramType) {
                case 'order_id':
                    extractionGuidance = `
LOOK FOR ORDER IDENTIFIERS:
- Order numbers: CZ-247020, #247020, 247020, ORD-XXXXX
- Tracking numbers
- Invoice numbers
- Reference numbers`;
                    break;
                case 'phone':
                    extractionGuidance = `
LOOK FOR PHONE NUMBERS:
- Pakistani format: 03XXXXXXXXX, +92XXXXXXXXXX, 92XXXXXXXXXX
- Any phone number format visible`;
                    break;
                case 'email':
                    extractionGuidance = `
LOOK FOR EMAIL ADDRESSES:
- Any email address format (xxx@xxx.xxx)`;
                    break;
                default:
                    extractionGuidance = `
LOOK FOR: ${paramName}
Type expected: ${paramType}`;
            }
            
            // Build analysis prompt
            let analysisPrompt = `Analyze this image to extract information for a customer service flow.

CURRENT STEP: Collecting "${paramName}" (type: ${paramType})
${extractionGuidance}

${imageExtractionHints ? `ADDITIONAL HINTS:\n${imageExtractionHints}\n` : ''}
${llmInstructions ? `STEP INSTRUCTIONS:\n${llmInstructions}\n` : ''}

FLOW CONTEXT: ${flowState.flow_name || 'Customer service flow'}

Analyze the image carefully and respond with JSON:
{
    "image_type": "order_screenshot | receipt | invoice | tracking_page | damage_photo | product_photo | contact_info | chat_screenshot | other",
    "description": "Brief description of what the image shows",
    "found_value": true or false,
    "extracted_value": "the extracted value if found (order number, phone, email, etc.) - ONLY if confident",
    "confidence": "high | medium | low",
    "save_for_later": true or false,
    "save_as": "complaint_images | receipt_images | evidence_images | uploaded_images",
    "response_hint": "Natural response to user if value not found - acknowledge what they sent and ask for what we need"
}

CRITICAL RULES:
1. If image shows order/receipt/tracking → extract the order number, invoice number, or reference number
2. If image shows damaged product → set save_for_later=true, save_as="complaint_images", ask for order details
3. If image shows contact info → extract phone or email
4. If image is a chat screenshot → look for any order numbers or identifiers mentioned
5. ONLY set found_value=true if you are CONFIDENT about the extracted value
6. For response_hint: Be helpful and acknowledge what user sent (e.g., "Thank you for the damage photo. To help you, I also need your order number...")
7. If multiple values found, return the most relevant one for "${paramName}"`;

            // Build message with images
            const content = [
                { type: 'text', text: analysisPrompt }
            ];
            
            // Add up to 3 images for analysis
            const imagesToAnalyze = images.slice(0, 3);
            for (const image of imagesToAnalyze) {
                content.push({
                    type: 'image_url',
                    image_url: { url: image, detail: 'high' }
                });
            }

            console.log(`🔍 Analyzing ${imagesToAnalyze.length} image(s) for step "${paramName}"...`);

            const completion = await LLMService.chat([
                { role: 'user', content }
            ], {
                model: 'gpt-4o-mini',
                temperature: 0.2,
                max_tokens: 600,
                json_mode: true
            });

            console.log(`💰 Image analysis cost: $${typeof completion.cost === 'number' ? completion.cost.toFixed(6) : (completion.cost || 0)}`);

            // Parse response
            let result;
            try {
                result = JSON.parse(completion.content);
            } catch (e) {
                console.warn('Failed to parse image analysis response:', completion.content);
                result = {
                    image_type: 'other',
                    found_value: false,
                    save_for_later: saveUnrelatedImages,
                    save_as: 'uploaded_images',
                    response_hint: `Thank you for the image. To help you further, could you please provide your ${paramName.replace(/_/g, ' ')}?`
                };
            }
            
            // Validate extracted value based on param type
            if (result.found_value && result.extracted_value) {
                const isValid = this._validateExtractedValue(result.extracted_value, paramType);
                if (!isValid) {
                    console.log(`⚠️ Extracted value "${result.extracted_value}" failed validation for type ${paramType}`);
                    result.found_value = false;
                    result.confidence = 'low';
                }
            }

            return result;

        } catch (error) {
            console.error('Image analysis failed:', error);
            return {
                image_type: 'unknown',
                found_value: false,
                save_for_later: saveUnrelatedImages,
                save_as: 'uploaded_images',
                response_hint: `Thank you for the image. Could you please also provide your ${paramName.replace(/_/g, ' ')}?`
            };
        }
    }
    
    /**
     * Validate extracted value matches expected type
     */
    _validateExtractedValue(value, paramType) {
        if (!value || typeof value !== 'string') return false;
        
        const trimmed = value.trim();
        if (!trimmed) return false;
        
        switch (paramType) {
            case 'phone':
                // Pakistani phone formats
                return /^(\+?92|0)?3\d{9}$/.test(trimmed.replace(/[\s-]/g, ''));
            
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
            
            case 'order_id':
                // Order number patterns (at least 4 characters, alphanumeric with optional prefix)
                return /^[A-Za-z]{0,3}-?\d{4,10}$/.test(trimmed) || /^\d{5,10}$/.test(trimmed);
            
            case 'number':
                return !isNaN(trimmed);
            
            default:
                // For string/text, just ensure it's not too short
                return trimmed.length >= 2;
        }
    }

    /**
     * Process a function step
     */
    async _processFunctionStep(sessionId, flow, flowState, step, agent) {
        const config = step.config || {};
        const functionName = config.function;

        if (!functionName) {
            console.warn('Function step missing function name');
            return await this._moveToNextStep(sessionId, flow, flowState, {});
        }

        // Get session for full context
        const session = await SessionStateService.getSession(sessionId);
        const fullContext = this._buildFullContext(flowState.params_collected, session);

        // Build params: start with all collected params + context, then apply explicit mapping
        // This ensures functions automatically receive collected params without needing explicit mapping
        let params = { ...fullContext };
        
        // If there's an explicit params_map, apply it (can override auto params)
        if (config.params_map && Object.keys(config.params_map).length > 0) {
            const mappedParams = this._buildFunctionParams(config.params_map, fullContext);
            params = { ...params, ...mappedParams };
        }

        console.log(`⚡ Executing function: ${functionName}`, { 
            params,
            collected: flowState.params_collected 
        });

        // Execute function with full context
        const result = await this.executeFunction(functionName, params, agent, session);

        if (!result.success) {
            return {
                status: 'function_error',
                step_id: step.id,
                function: functionName,
                error: result.error,
                // Include error info for LLM to explain to user
                needs_llm_response: true,
                llm_context: {
                    function_name: functionName,
                    error: result.error,
                    response_instructions: config.response_instructions || 'Apologize for the error and offer to help differently.'
                }
            };
        }

        console.log(`✅ Function ${functionName} returned:`, result.result);

        // Store result if specified
        const newParams = {};
        if (config.store_result_as) {
            newParams[config.store_result_as] = result.result;
        }

        // Update state
        await SessionStateService.updateFlowStep(sessionId, step.id, newParams);

        // Check if auto-respond is enabled (default: true)
        const autoRespond = config.auto_respond !== false;
        
        // Move to next step
        const updatedFlowState = {
            ...flowState,
            params_collected: { ...flowState.params_collected, ...newParams }
        };
        const nextStepResult = await this._moveToNextStep(sessionId, flow, updatedFlowState, newParams);

        // If auto-respond is enabled, include function result for LLM response generation
        if (autoRespond && result.result) {
            // Check if next step is a collect step - if so, include its prompt
            let nextStepPrompt = null;
            if (nextStepResult.next_step) {
                const steps = flow.config?.steps || [];
                const nextStep = steps.find(s => s.id === nextStepResult.next_step);
                if (nextStep && nextStep.type === 'collect' && nextStep.config?.prompt) {
                    nextStepPrompt = nextStep.config.prompt;
                    console.log(`📝 Next step is collect, adding prompt: "${nextStepPrompt.substring(0, 50)}..."`);
                }
            }
            
            // Build response instructions that include the next prompt
            let responseInstructions = config.response_instructions || '';
            if (nextStepPrompt) {
                responseInstructions += `\n\nIMPORTANT: After providing the information above, you MUST also ask: "${nextStepPrompt}"`;
            }
            
            return {
                ...nextStepResult,
                needs_llm_response: true,
                llm_context: {
                    function_name: functionName,
                    function_result: result.result,
                    response_instructions: responseInstructions || null,
                    next_step_prompt: nextStepPrompt
                }
            };
        }

        return nextStepResult;
    }

    /**
     * Process a condition step
     */
    async _processConditionStep(sessionId, flow, flowState, step) {
        const config = step.config || {};
        
        // Get full session for context data
        const session = await SessionStateService.getSession(sessionId);
        
        // Build full context for condition evaluation
        // Includes: collected params + session context (channel, customer info)
        const fullContext = this._buildFullContext(flowState.params_collected, session);
        
        // Evaluate condition
        const checkValue = this._resolveTemplate(config.check || '', fullContext);
        const branches = config.branches || {};

        console.log('🔀 Condition check:', {
            step: step.id,
            check: config.check,
            resolved_value: checkValue,
            available_branches: Object.keys(branches)
        });

        // Find matching branch with special handling for _hasValue and _empty
        let nextStepId = null;
        
        // Check if value is "truthy" (exists, not empty, not null, not undefined, not "null", not "undefined")
        const hasTruthyValue = checkValue && 
            checkValue !== '' && 
            checkValue !== 'null' && 
            checkValue !== 'undefined' &&
            checkValue !== config.check; // Template wasn't resolved (variable not found)
        
        if (hasTruthyValue && branches['_hasValue']) {
            // Value exists and is truthy - use _hasValue branch
            nextStepId = branches['_hasValue'];
            console.log('🔀 Using _hasValue branch:', nextStepId);
        } else if (!hasTruthyValue && branches['_empty']) {
            // Value is empty/null/undefined - use _empty branch
            nextStepId = branches['_empty'];
            console.log('🔀 Using _empty branch:', nextStepId);
        } else {
            // Standard matching: exact value or default
            nextStepId = branches[checkValue] || branches['default'] || null;
        }

        if (!nextStepId) {
            // No matching branch, continue to next step in sequence
            return await this._moveToNextStep(sessionId, flow, flowState, {});
        }

        // Jump to the specified step
        await SessionStateService.updateFlowStep(sessionId, nextStepId, {});

        return {
            status: 'branched',
            from_step: step.id,
            to_step: nextStepId,
            condition_value: checkValue
        };
    }
    
    /**
     * Build full context for template resolution
     * Combines collected params with session context
     */
    _buildFullContext(params, session) {
        // Session has 'channel' field directly (public_chat, whatsapp, etc.)
        // and 'channel_user_id' for the user identifier
        const channel = session?.channel || 'unknown';
        const channelUserId = session?.channel_user_id || null;
        
        console.log('📋 Building full context:', {
            channel,
            channelUserId,
            hasCustomerInfo: !!session?.customer_info,
            paramsKeys: Object.keys(params || {})
        });
        
        return {
            // Collected flow params
            ...params,
            
            // Session context
            channel: channel,
            channel_user_id: channelUserId,
            
            // Customer info shortcuts
            customer_phone: session?.customer_info?.phone || session?.customer_phone || channelUserId,
            customer_name: session?.customer_info?.name || session?.customer_name || null,
            customer_email: session?.customer_info?.email || null,
            
            // Nested customer object for {{customer.phone}} syntax
            customer: {
                phone: session?.customer_info?.phone || session?.customer_phone || channelUserId,
                name: session?.customer_info?.name || session?.customer_name || null,
                email: session?.customer_info?.email || null
            },
            
            // Context memory
            ...(session?.context_memory || {})
        };
    }

    /**
     * Process a message step
     */
    async _processMessageStep(sessionId, flow, flowState, step) {
        const config = step.config || {};
        
        // Get session for full context
        const session = await SessionStateService.getSession(sessionId);
        const fullContext = this._buildFullContext(flowState.params_collected, session);
        
        const messageText = this._resolveTemplate(config.text || '', fullContext);

        // Move to next step
        const result = await this._moveToNextStep(sessionId, flow, flowState, {});

        return {
            ...result,
            message_to_send: messageText
        };
    }

    // ========================================================================
    // FLOW NAVIGATION
    // ========================================================================

    /**
     * Move to next step in flow
     * Supports: explicit next_step in config, or sequential progression
     */
    async _moveToNextStep(sessionId, flow, flowState, newParams, explicitNextStep = null) {
        const steps = flow.config?.steps || [];
        const currentStepId = flowState.current_step;
        
        // If no current step but flow has steps, start at first step
        if (!currentStepId && steps.length > 0) {
            const firstStep = steps[0];
            console.log(`➡️ No current step, starting at first step: ${firstStep.id}`);
            await SessionStateService.updateFlowStep(sessionId, firstStep.id, newParams);
            
            return {
                status: 'step_completed',
                completed_step: null,
                next_step: firstStep.id,
                params_collected: { ...flowState.params_collected, ...newParams }
            };
        }
        
        // Find current step to check for explicit next_step config
        const currentStep = steps.find(s => s.id === currentStepId);
        const configNextStep = currentStep?.config?.next_step;
        
        // Priority: explicit param > config next_step > sequential
        const targetNextStep = explicitNextStep || configNextStep;

        if (targetNextStep) {
            // Jump to specific step
            const nextStep = steps.find(s => s.id === targetNextStep);
            if (nextStep) {
                console.log(`➡️ Moving to explicit next step: ${targetNextStep}`);
                await SessionStateService.updateFlowStep(sessionId, nextStep.id, newParams);
                
                return {
                    status: 'step_completed',
                    completed_step: currentStepId,
                    next_step: nextStep.id,
                    params_collected: { ...flowState.params_collected, ...newParams }
                };
            }
        }

        // Find current step index for sequential progression
        const currentIndex = steps.findIndex(s => s.id === currentStepId);

        // Check if there's a next sequential step
        if (currentIndex >= 0 && currentIndex < steps.length - 1) {
            const nextStep = steps[currentIndex + 1];
            
            console.log(`➡️ Moving to sequential next step: ${nextStep.id}`);
            await SessionStateService.updateFlowStep(sessionId, nextStep.id, newParams);

            return {
                status: 'step_completed',
                completed_step: currentStepId,
                next_step: nextStep.id,
                params_collected: { ...flowState.params_collected, ...newParams }
            };
        }

        // No more steps - flow is complete
        console.log(`✅ Flow completed, no more steps after ${currentStepId}`);
        const completionMessage = this._resolveTemplate(
            flow.config?.completion_message || '',
            { ...flowState.params_collected, ...newParams }
        );

        await SessionStateService.completeFlow(sessionId, {
            params: { ...flowState.params_collected, ...newParams }
        });

        return {
            status: 'flow_completed',
            flow_id: flow.id,
            completion_message: completionMessage,
            params_collected: { ...flowState.params_collected, ...newParams }
        };
    }

    /**
     * Get list of pending parameters for a flow
     */
    _getPendingParams(flow, collectedParams) {
        const pending = [];
        
        for (const step of flow.config?.steps || []) {
            if (step.type === FlowExecutor.STEP_TYPES.COLLECT) {
                const paramName = step.config?.param;
                if (paramName && !collectedParams[paramName]) {
                    pending.push(paramName);
                }
            }
        }

        return pending;
    }

    /**
     * Build function params from template
     */
    _buildFunctionParams(paramsMap, collectedData) {
        const params = {};

        for (const [key, template] of Object.entries(paramsMap)) {
            params[key] = this._resolveTemplate(template, collectedData);
        }

        return params;
    }

    /**
     * Resolve {{variable}} templates
     */
    _resolveTemplate(template, data) {
        if (!template || typeof template !== 'string') {
            return template;
        }

        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
            const parts = path.split('.');
            let value = data;

            for (const part of parts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    return match; // Keep original if not found
                }
            }

            return value !== undefined ? String(value) : match;
        });
    }

    // ========================================================================
    // CHECK FLOW REQUIREMENTS
    // ========================================================================

    /**
     * Check if a flow can be started (has required functions)
     */
    async canStartFlow(flowId) {
        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) {
            return { canStart: false, reason: 'Flow not found' };
        }

        const requiredFunctions = flow.config?.required_functions || [];
        const missingFunctions = requiredFunctions.filter(f => !this.functionHandlers[f]);

        if (missingFunctions.length > 0) {
            return {
                canStart: false,
                reason: `Missing function handlers: ${missingFunctions.join(', ')}`
            };
        }

        return { canStart: true };
    }
}

module.exports = FlowExecutor;