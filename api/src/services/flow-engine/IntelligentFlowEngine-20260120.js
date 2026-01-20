/**
 * Intelligent Flow Engine
 * 
 * Enhanced flow engine that addresses key limitations:
 * 
 * Phase 1: Flow-Aware LLM Context
 * - Sends full flow blueprint to LLM on trigger
 * - LLM understands what data is needed and what steps exist
 * 
 * Phase 2: Intelligent Flow Mode
 * - LLM can skip/combine steps based on context
 * - Adaptive flow that follows customer intent
 * 
 * Phase 3: Message Consolidation for Sync API
 * - Server-side buffering for rapid messages
 * - Works with WhatsApp/public chat sync endpoints
 * 
 * Phase 4: Image → Flow Integration
 * - Image classification can trigger flow functions
 * - Pass extracted data directly to flows
 */

// Import the CLASS, not the singleton instance
const { FlowEngine } = require('./FlowEngine');
const SessionStateService = require('./SessionStateService');
const ChatFlowService = require('./ChatFlowService');
const LLMService = require('../LLMService');
const db = require('../../config/database');

class IntelligentFlowEngine extends FlowEngine {

    /**
     * Flow execution modes
     */
    static FLOW_MODES = {
        GUIDED: 'guided',           // Strict step-by-step execution
        INTELLIGENT: 'intelligent', // LLM can skip/combine steps
        ADAPTIVE: 'adaptive'        // LLM can pause, handle tangent, resume
    };

    constructor() {
        super();
        this.defaultMode = IntelligentFlowEngine.FLOW_MODES.INTELLIGENT;
    }

    /**
     * Override _buildLLMContext to include flow blueprint
     * PHASE 1: Flow-Aware LLM Context
     */
    async _buildLLMContext(session, agent, bufferedData) {
        // Get base context from parent
        const baseContext = await super._buildLLMContext(session, agent, bufferedData);
        
        // Enhance with flow blueprints
        baseContext.flow_blueprints = await this._buildFlowBlueprints(agent.id);
        
        // Add execution mode
        baseContext.flow_mode = agent.flow_mode || this.defaultMode;
        
        // Load agent-specific functions from database
        const agentFunctions = await this._loadAgentFunctions(agent.id);
        baseContext.agent_functions = agentFunctions;
        
        // Combine hardcoded + agent functions for registered list
        const hardcodedFunctions = this._getRegisteredFunctionNames();
        const agentFunctionNames = agentFunctions.map(f => f.name);
        baseContext.registered_functions = [...new Set([...hardcodedFunctions, ...agentFunctionNames])];
        
        // If there's an active flow, include detailed blueprint
        if (session.active_flow) {
            const activeFlowBlueprint = await this._getDetailedFlowBlueprint(
                session.active_flow.flow_id,
                session.active_flow.current_step,
                session.active_flow.params_collected
            );
            baseContext.active_flow_blueprint = activeFlowBlueprint;
        }
        
        // Include paused flows context for resume capability
        if (session.paused_flows && session.paused_flows.length > 0) {
            baseContext.paused_flow_blueprints = await Promise.all(
                session.paused_flows.map(pf => this._getDetailedFlowBlueprint(
                    pf.flow_id,
                    pf.current_step,
                    pf.params_collected
                ))
            );
        }
        
        return baseContext;
    }
    
    /**
     * Load agent-specific functions from database
     */
    async _loadAgentFunctions(agentId) {
        try {
            const db = require('../../config/database');
            const [functions] = await db.query(
                'SELECT * FROM yovo_tbl_aiva_functions WHERE agent_id = ? AND is_active = 1',
                [agentId]
            );
            
            return functions.map(f => ({
                name: f.name,
                description: f.description,
                parameters: typeof f.parameters === 'string' ? JSON.parse(f.parameters) : f.parameters,
                handler_type: f.handler_type,
                api_endpoint: f.api_endpoint,
                execution_mode: f.execution_mode
            }));
        } catch (error) {
            console.error('Error loading agent functions:', error);
            return [];
        }
    }
    
    /**
     * Get list of registered function names (hardcoded handlers only)
     */
    _getRegisteredFunctionNames() {
        return Object.keys(this.executor.functionHandlers || {});
    }

    /**
     * Build flow blueprints for LLM understanding
     */
    async _buildFlowBlueprints(agentId) {
        // Use listFlows to get full flow data including config
        const flows = await ChatFlowService.listFlows(agentId, true);
        
        return flows.map(flow => ({
            id: flow.id,
            name: flow.name,
            description: flow.description,
            purpose: flow.config?.purpose || flow.description,
            trigger_keywords: flow.config?.trigger_examples || flow.config?.triggers || [],
            required_data: this._extractRequiredData(flow),
            steps_summary: this._summarizeSteps(flow),
            steps: flow.config?.steps || [],  // Include full steps for function analysis
            can_handle: flow.config?.capabilities || [],
            required_functions: flow.config?.required_functions || []
        }));
    }

    /**
     * Get detailed flow blueprint for active/paused flow
     */
    async _getDetailedFlowBlueprint(flowId, currentStep, collectedParams) {
        const flow = await ChatFlowService.getFlow(flowId);
        if (!flow) return null;

        const steps = flow.config?.steps || [];
        const currentStepIndex = steps.findIndex(s => s.id === currentStep);
        
        return {
            flow_id: flowId,
            flow_name: flow.name,
            purpose: flow.config?.purpose || flow.description,
            
            // Current state
            current_step: currentStep,
            current_step_index: currentStepIndex,
            total_steps: steps.length,
            
            // What's been collected
            collected_params: collectedParams,
            
            // What's still needed
            remaining_steps: steps.slice(currentStepIndex + 1).map(s => ({
                id: s.id,
                type: s.type,
                purpose: s.config?.description || this._inferStepPurpose(s),
                required_params: s.config?.params || [],
                can_skip_if: s.config?.skip_condition || null
            })),
            
            // Full step details for intelligent decisions - now includes LLM guidance
            all_steps: steps.map((s, i) => ({
                id: s.id,
                type: s.type,
                purpose: s.config?.description || this._inferStepPurpose(s),
                is_current: s.id === currentStep,
                is_completed: i < currentStepIndex,
                params_needed: this._getStepParams(s),
                function_name: s.type === 'function' ? s.config?.function : null,
                next_step: s.config?.next || s.config?.next_step || steps[i + 1]?.id || null,
                branches: s.type === 'condition' ? s.config?.branches : null,
                // LLM Guidance fields
                llm_instructions: s.config?.llm_instructions || null,
                validation_rules: s.config?.validation_rules || null,
                error_messages: s.config?.error_messages || null,
                response_instructions: s.config?.response_instructions || null
            })),
            
            // What the flow ultimately needs to complete
            completion_requirements: this._getCompletionRequirements(flow),
            
            // Functions available in this flow
            available_functions: this._extractFlowFunctions(flow)
        };
    }

    /**
     * Extract required data from flow definition
     */
    _extractRequiredData(flow) {
        const required = [];
        const steps = flow.config?.steps || [];
        
        for (const step of steps) {
            if (step.type === 'collect') {
                const params = step.config?.params || [];
                params.forEach(p => {
                    if (!required.find(r => r.name === p.name)) {
                        required.push({
                            name: p.name,
                            type: p.type || 'string',
                            required: p.required !== false,
                            description: p.prompt || p.description || p.name
                        });
                    }
                });
            }
            
            if (step.type === 'function' && step.config?.params_map) {
                Object.entries(step.config.params_map).forEach(([param, mapping]) => {
                    // Extract variable names from {{variable}} patterns
                    const matches = mapping.match(/\{\{([^}]+)\}\}/g);
                    if (matches) {
                        matches.forEach(m => {
                            const varName = m.replace(/[{}]/g, '').split('.')[0];
                            if (!required.find(r => r.name === varName)) {
                                required.push({
                                    name: varName,
                                    source: 'function_param',
                                    used_by: step.config.function
                                });
                            }
                        });
                    }
                });
            }
        }
        
        return required;
    }

    /**
     * Summarize flow steps for LLM understanding
     */
    _summarizeSteps(flow) {
        const steps = flow.config?.steps || [];
        return steps.map(s => {
            let summary = `${s.id} (${s.type})`;
            
            if (s.type === 'collect') {
                const params = (s.config?.params || []).map(p => p.name);
                summary += `: collect ${params.join(', ')}`;
            } else if (s.type === 'function') {
                summary += `: call ${s.config?.function}`;
            } else if (s.type === 'condition') {
                summary += `: check ${s.config?.check}`;
            } else if (s.type === 'message') {
                summary += `: send message`;
            }
            
            return summary;
        });
    }

    /**
     * Infer step purpose from configuration
     */
    _inferStepPurpose(step) {
        if (step.type === 'collect') {
            const params = (step.config?.params || []).map(p => p.name);
            return `Collect: ${params.join(', ')}`;
        }
        if (step.type === 'function') {
            return `Execute: ${step.config?.function}`;
        }
        if (step.type === 'condition') {
            return `Check: ${step.config?.check}`;
        }
        if (step.type === 'message') {
            return 'Send response message';
        }
        return step.type;
    }

    /**
     * Get parameters needed by a step
     */
    _getStepParams(step) {
        if (step.type === 'collect') {
            // Handle both formats: 
            // 1. Single param: {param: "name", param_type: "string"}
            // 2. Array params: {params: [{name: "x", type: "string"}]}
            if (step.config?.param) {
                return [{
                    name: step.config.param,
                    type: step.config.param_type || 'string',
                    required: true,
                    prompt: step.config.prompt
                }];
            }
            return (step.config?.params || []).map(p => ({
                name: p.name,
                type: p.type || 'string',
                required: p.required !== false
            }));
        }
        if (step.type === 'function' && step.config?.params_map) {
            return Object.keys(step.config.params_map);
        }
        return [];
    }
    
    /**
     * Get full step info including LLM instructions
     */
    _getFullStepInfo(step, index, currentStep, totalSteps) {
        const baseInfo = {
            id: step.id,
            type: step.type,
            purpose: step.config?.description || this._inferStepPurpose(step),
            is_current: step.id === currentStep,
            is_completed: index < totalSteps.findIndex(s => s.id === currentStep),
            params_needed: this._getStepParams(step),
            function_name: step.type === 'function' ? step.config?.function : null,
            next_step: step.config?.next || step.config?.next_step || null,
            branches: step.type === 'condition' ? step.config?.branches : null,
            // New fields for LLM guidance
            llm_instructions: step.config?.llm_instructions || null,
            validation_rules: step.config?.validation_rules || null,
            error_messages: step.config?.error_messages || null,
            response_instructions: step.config?.response_instructions || null
        };
        
        return baseInfo;
    }

    /**
     * Get flow completion requirements
     */
    _getCompletionRequirements(flow) {
        const requirements = [];
        const steps = flow.config?.steps || [];
        
        // Find all function steps and their required params
        for (const step of steps) {
            if (step.type === 'function') {
                requirements.push({
                    step: step.id,
                    function: step.config?.function,
                    needs: step.config?.params_map ? Object.keys(step.config.params_map) : []
                });
            }
        }
        
        return requirements;
    }

    /**
     * Extract functions available in flow
     */
    _extractFlowFunctions(flow) {
        const functions = [];
        const steps = flow.config?.steps || [];
        
        for (const step of steps) {
            if (step.type === 'function' && step.config?.function) {
                functions.push({
                    name: step.config.function,
                    step_id: step.id,
                    params_map: step.config.params_map,
                    auto_respond: step.config.auto_respond
                });
            }
        }
        
        return functions;
    }

    /**
     * Override system prompt builder
     * PHASE 2: Intelligent Flow Mode
     */
    _buildSystemPrompt(context) {
        const basePrompt = super._buildSystemPrompt(context);
        
        // Add intelligent flow instructions based on mode
        const modeInstructions = this._getModeInstructions(context.flow_mode);
        
        // Add flow blueprint context
        let blueprintContext = '';
        if (context.active_flow_blueprint) {
            blueprintContext = this._formatActiveFlowContext(context.active_flow_blueprint);
        }
        
        // Add registered functions info
        const registeredFunctionsInfo = this._getRegisteredFunctionsInfo(context);
        
        // Add image-to-flow instructions
        const imageFlowInstructions = this._getImageFlowInstructions(context);
        
        return basePrompt + '\n\n' + 
               modeInstructions + '\n\n' + 
               registeredFunctionsInfo + '\n\n' +
               blueprintContext + '\n\n' +
               imageFlowInstructions;
    }
    
    /**
     * Get registered functions info for LLM - dynamically determines what can be called directly
     */
    _getRegisteredFunctionsInfo(context) {
        const functions = context.registered_functions || [];
        const flowBlueprints = context.flow_blueprints || [];
        const agentFunctions = context.agent_functions || [];
        
        if (functions.length === 0 && agentFunctions.length === 0) {
            return '';
        }
        
        // Analyze which functions require flow context
        const directCallable = [];
        const requiresFlow = [];
        
        for (const funcName of functions) {
            if (this._functionRequiresFlowContext(funcName, flowBlueprints)) {
                requiresFlow.push(funcName);
            } else {
                directCallable.push(funcName);
            }
        }
        
        let info = `=== AVAILABLE FUNCTIONS ===\n`;
        
        // Agent-specific functions (from database)
        if (agentFunctions.length > 0) {
            info += `\nAGENT FUNCTIONS:\n`;
            for (const func of agentFunctions) {
                // Parameters can be JSON Schema format {properties: {}, required: []} or array format
                let paramsList = '';
                if (func.parameters) {
                    if (func.parameters.properties) {
                        // JSON Schema format
                        paramsList = Object.keys(func.parameters.properties).join(', ');
                    } else if (Array.isArray(func.parameters)) {
                        // Array format
                        paramsList = func.parameters.map(p => p.name || p).join(', ');
                    }
                }
                info += `- ${func.name}(${paramsList})`;
                if (func.description) {
                    info += ` - ${func.description}`;
                }
                info += `\n`;
            }
        }
        
        // Functions that can be called directly
        if (directCallable.length > 0) {
            info += `\nDIRECT CALLABLE (can use execute_function):\n`;
            info += directCallable.map(f => `- ${f}`).join('\n');
        }
        
        // Functions that require flow
        if (requiresFlow.length > 0) {
            info += `\n\nFLOW-ONLY (must start appropriate flow):\n`;
            info += requiresFlow.map(f => `- ${f}`).join('\n');
            info += `\n\nFor flow-only functions, START the flow - it will collect required data first.`;
        }
        
        info += `\n=========================`;
        return info;
    }

    /**
     * Get mode-specific instructions
     */
    _getModeInstructions(mode) {
        switch (mode) {
            case IntelligentFlowEngine.FLOW_MODES.GUIDED:
                return `FLOW MODE: GUIDED
- Follow flow steps strictly in order
- Always collect each required parameter before proceeding
- Do not skip steps or combine data collection`;

            case IntelligentFlowEngine.FLOW_MODES.INTELLIGENT:
                return `FLOW MODE: INTELLIGENT
You have flexibility in how you execute flows:

SMART STEP EXECUTION:
- If user provides multiple pieces of information at once, collect them all (don't ask for each separately)
- If a condition check already has the data (from extracted params), you can skip to the appropriate branch
- If user provides order number AND phone in same message, use whichever is more specific
- Skip redundant steps when data is already available

DIRECT FUNCTION EXECUTION:
- If you have ALL required parameters for a function, you can request direct execution
- Set "execute_function": { "name": "function_name", "params": {...} } in your response
- No need to go through intermediate steps if data is complete

SMART DATA EXTRACTION:
- Extract ALL relevant data from each message (order numbers, phones, emails, sentiment)
- Use the "extracted" field to capture everything, even if not immediately needed
- Previous extractions are preserved - don't ask for data already collected

EXAMPLES:
- User: "check my order 247020, my phone is 03001234567"
  → Extract both, use order_number for lookup (more specific)
- User: "my order CZ-247020 has wrong color, I'm very frustrated"
  → Extract order_number, sentiment=frustrated, detect complaint intent
- User sends order screenshot
  → Extract order number from image, proceed directly to lookup`;

            case IntelligentFlowEngine.FLOW_MODES.ADAPTIVE:
                return `FLOW MODE: ADAPTIVE
You can dynamically adapt to customer needs:

FLOW MANAGEMENT:
- Pause current flow if customer asks unrelated question
- Answer tangent questions inline without abandoning flow
- Resume paused flows when appropriate
- Switch flows only when customer clearly wants different help

CONTEXT PRESERVATION:
- Keep track of what was collected before pause
- Offer to resume: "I still have your order info. Would you like me to continue checking the status?"
- Don't make customer repeat information

INTELLIGENT RESPONSES:
- If customer is frustrated, acknowledge before proceeding
- If customer seems confused, explain what you're doing
- If customer provides partial info, work with what you have`;

            default:
                return '';
        }
    }

    /**
     * Format active flow context for LLM
     */
    _formatActiveFlowContext(blueprint) {
        if (!blueprint) return '';
        
        // Get current step details from flow config
        const currentStepInfo = blueprint.all_steps?.find(s => s.is_current);
        let currentStepDetails = '';
        let llmInstructions = '';
        let validationRules = '';
        let errorMessages = '';
        
        if (currentStepInfo) {
            currentStepDetails = `
CURRENT STEP DETAILS:
- Step ID: ${currentStepInfo.id}
- Type: ${currentStepInfo.type}
- Purpose: ${currentStepInfo.purpose}`;
            
            if (currentStepInfo.type === 'collect') {
                const paramNeeded = currentStepInfo.params_needed?.[0] || {};
                currentStepDetails += `
- Collecting: ${paramNeeded.name || 'data'} (${paramNeeded.type || 'string'})
- Prompt hint: ${paramNeeded.prompt || 'Ask user for this information'}`;
            } else if (currentStepInfo.type === 'function') {
                currentStepDetails += `
- Function: ${currentStepInfo.function_name}
- Will execute automatically when required params are collected`;
            }
            
            // Add LLM Instructions if present
            if (currentStepInfo.llm_instructions) {
                llmInstructions = `
=== STEP INSTRUCTIONS (FOLLOW THESE) ===
${currentStepInfo.llm_instructions}
========================================`;
            }
            
            // Add Validation Rules if present
            if (currentStepInfo.validation_rules) {
                validationRules = `
VALIDATION RULES:
${currentStepInfo.validation_rules}`;
            }
            
            // Add Error Messages if present
            if (currentStepInfo.error_messages) {
                errorMessages = `
ERROR RESPONSES (use these when applicable):
${currentStepInfo.error_messages}`;
            }
        }
        
        let context = `\n=== ACTIVE FLOW CONTEXT ===
Flow: ${blueprint.flow_name}
Purpose: ${blueprint.purpose}
Current Step: ${blueprint.current_step} (${blueprint.current_step_index + 1}/${blueprint.total_steps})
${currentStepDetails}
${llmInstructions}
${validationRules}
${errorMessages}

COLLECTED DATA SO FAR:
${JSON.stringify(this._sanitizeParamsForLLM(blueprint.collected_params), null, 2)}

WHAT'S STILL NEEDED TO COMPLETE THIS FLOW:
${blueprint.completion_requirements.map(r => 
    `- ${r.function}: needs ${r.needs.join(', ')}`
).join('\n')}

REMAINING STEPS AFTER CURRENT:
${blueprint.remaining_steps.map(s => 
    `- ${s.id} (${s.type}): ${s.purpose}${s.can_skip_if ? ` [skip if: ${s.can_skip_if}]` : ''}`
).join('\n')}

FLOW CONTINUATION RULES:
1. ALWAYS use action: CONTINUE_FLOW when there is an active flow - the flow executor will handle processing
2. If user provides text data → use CONTINUE_FLOW with extracted data
3. If user sends images → use CONTINUE_FLOW (flow executor will analyze images with AI vision)
4. If user says something unrelated → still use CONTINUE_FLOW (executor will handle appropriately)
5. ONLY use ABANDON_FLOW if user explicitly says "cancel", "stop", "nevermind", "forget it"
6. ONLY use SWITCH_FLOW if user clearly asks for completely different help (e.g., "actually I want to track a different order")
7. DO NOT use ASK_CLARIFICATION when there's an active flow - the flow executor handles that
=========================\n`;

        return context;
    }
    
    /**
     * Sanitize collected params before sending to LLM
     * Replaces base64 images with placeholders to avoid context overflow
     */
    _sanitizeParamsForLLM(params) {
        if (!params || typeof params !== 'object') {
            return params;
        }
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
                // Handle arrays (like complaint_images)
                sanitized[key] = value.map(item => {
                    if (typeof item === 'string' && item.startsWith('data:image')) {
                        return '[IMAGE_UPLOADED]';
                    }
                    return this._sanitizeParamsForLLM(item);
                });
            } else if (typeof value === 'string' && value.startsWith('data:image')) {
                // Handle single base64 string
                sanitized[key] = '[IMAGE_UPLOADED]';
            } else if (typeof value === 'object' && value !== null) {
                // Recursively handle nested objects
                sanitized[key] = this._sanitizeParamsForLLM(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }

    /**
     * Get image-to-flow instructions
     * PHASE 4: Image → Flow Integration
     */
    _getImageFlowInstructions(context) {
        if (!context.images || context.images.length === 0) {
            return '';
        }

        return `\n=== IMAGE HANDLING ===
An image was provided with this message.

IMAGE → FLOW ACTIONS:
1. ORDER SCREENSHOT DETECTED:
   - Extract order number from image
   - Add to extracted.order_numbers
   - Can directly execute check_order_status if order number found
   - Set: "image_action": "order_lookup", "extracted_order": "CZ-XXXXX"

2. COMPLAINT EVIDENCE:
   - Image shows product problem
   - Can trigger complaint flow
   - Set: "image_action": "complaint_evidence"

3. PRODUCT IMAGE:
   - User wants to find similar products
   - Can trigger product search
   - Set: "image_action": "product_search"

If you can extract an order number from the image:
{
  "action": "EXECUTE_FUNCTION",
  "execute_function": {
    "name": "check_order_status",
    "params": { "order_identifier": "[extracted_order_number]" }
  },
  "image_action": "order_lookup",
  "extracted_order": "[order_number]"
}
=========================\n`;
    }

    /**
     * Override _getLLMDecision to handle intelligent execution
     */
    async _getLLMDecision(context, agent) {
        const decision = await super._getLLMDecision(context, agent);
        
        // Get all available functions (hardcoded + agent-defined)
        const hardcodedFunctions = Object.keys(this.executor.functionHandlers || {});
        const agentFunctions = (context.agent_functions || []).map(f => f.name);
        const allFunctions = [...new Set([...hardcodedFunctions, ...agentFunctions])];
        
        // Handle direct function execution request - VALIDATE first
        if (decision.execute_function && 
            decision.execute_function.name && 
            decision.execute_function.name !== 'function_name' &&  // Not a placeholder
            decision.execute_function.name !== 'undefined' &&
            typeof decision.execute_function.name === 'string' &&
            decision.execute_function.name.trim() !== '') {
            
            const funcName = decision.execute_function.name;
            const params = decision.execute_function.params || {};
            
            // Check if this function exists (hardcoded OR agent-defined)
            if (!allFunctions.includes(funcName)) {
                console.log(`⚠️ Function ${funcName} not found in hardcoded or agent functions, ignoring direct execution`);
                delete decision.execute_function;
                delete decision._direct_execution;
                // Reset action to CONTINUE_FLOW to let flow processing continue
                decision.action = FlowEngine.ACTIONS.CONTINUE_FLOW;
            }
            // Check if function requires prior data collection from flows
            else if (this._functionRequiresFlowContext(funcName, context.flow_blueprints)) {
                console.log(`🚫 Function ${funcName} requires flow context (has collect steps before it) - must go through flow`);
                
                // Find the flow that contains this function and set flow_id
                const flowWithFunction = this._findFlowWithFunction(funcName, context.flow_blueprints);
                if (flowWithFunction) {
                    decision.flow_id = flowWithFunction.id;
                    console.log(`📌 Set flow_id to ${flowWithFunction.id} (${flowWithFunction.name})`);
                }
                
                delete decision.execute_function;
                delete decision._direct_execution;
                // Reset action to CONTINUE_FLOW to let flow processing continue with current step
                decision.action = FlowEngine.ACTIONS.CONTINUE_FLOW;
                console.log(`✅ Reset action to CONTINUE_FLOW for active flow processing`);
            }
            // Function can be called directly
            else {
                decision.action = FlowEngine.ACTIONS.EXECUTE_FUNCTION;
                decision._direct_execution = true;
                // Mark if this is an agent function (needs API call) vs hardcoded
                decision._is_agent_function = agentFunctions.includes(funcName) && !hardcodedFunctions.includes(funcName);
                console.log('✅ Valid execute_function detected:', funcName, decision._is_agent_function ? '(agent function)' : '(hardcoded)');
            }
        } else if (decision.execute_function) {
            // Invalid execute_function - clear it to prevent issues
            console.log('⚠️ Invalid execute_function received, ignoring:', decision.execute_function);
            delete decision.execute_function;
            delete decision._direct_execution;
            // Reset action to CONTINUE_FLOW
            decision.action = FlowEngine.ACTIONS.CONTINUE_FLOW;
        }
        
        // Handle image actions
        if (decision.image_action) {
            decision._image_triggered = true;
        }
        
        return decision;
    }
    
    /**
     * Check if a function requires flow context (has collect/condition steps before it in any flow)
     * This determines if the function can be called directly or needs to go through a flow
     */
    _functionRequiresFlowContext(funcName, flowBlueprints) {
        if (!flowBlueprints || flowBlueprints.length === 0) {
            return false;
        }
        
        for (const blueprint of flowBlueprints) {
            const steps = blueprint.steps || [];
            
            // Find if this function appears in this flow
            const funcStepIndex = steps.findIndex(s => 
                s.type === 'function' && s.config?.function === funcName
            );
            
            if (funcStepIndex === -1) continue; // Function not in this flow
            
            // Check if there are any collect or condition steps BEFORE this function
            for (let i = 0; i < funcStepIndex; i++) {
                const step = steps[i];
                if (step.type === 'collect' || step.type === 'condition') {
                    // This function has data collection steps before it
                    // It should NOT be called directly
                    console.log(`📋 Function ${funcName} has ${step.type} step "${step.id}" before it in flow "${blueprint.name}"`);
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Find the flow that contains a specific function
     * Returns the flow blueprint with id and name
     */
    _findFlowWithFunction(funcName, flowBlueprints) {
        if (!flowBlueprints || flowBlueprints.length === 0) {
            return null;
        }
        
        for (const blueprint of flowBlueprints) {
            const steps = blueprint.steps || [];
            
            // Find if this function appears in this flow
            const hasFunction = steps.some(s => 
                s.type === 'function' && s.config?.function === funcName
            );
            
            if (hasFunction) {
                return {
                    id: blueprint.id,
                    name: blueprint.name
                };
            }
        }
        
        return null;
    }

    /**
     * Override processMessage to handle direct function execution
     */
    async _processBufferedInput(session, agent, bufferedData) {
        console.log('🧠 Processing with IntelligentFlowEngine:', {
            sessionId: session.id,
            messageCount: bufferedData.messageCount,
            imageCount: bufferedData.imageCount,
            hasActiveFlow: !!session.active_flow,
            mode: agent.flow_mode || this.defaultMode
        });

        // Build enhanced context
        let context = await this._buildLLMContext(session, agent, bufferedData);

        // Get LLM decision with flow awareness
        let llmDecision = await this._getLLMDecision(context, agent);
        
        // SAFEGUARD: Force CONTINUE_FLOW when there's an active flow and user sends any input
        // This ensures the FlowExecutor handles image analysis and data extraction
        if (session.active_flow && llmDecision.action !== 'ABANDON_FLOW' && llmDecision.action !== 'SWITCH_FLOW') {
            const hasImages = bufferedData.images && bufferedData.images.length > 0;
            const isAskClarification = llmDecision.action === 'ASK_CLARIFICATION';
            const isRespondOnly = llmDecision.action === 'RESPOND' || !llmDecision.action;
            
            if (hasImages || isAskClarification || isRespondOnly) {
                console.log(`🔄 Active flow present - forcing CONTINUE_FLOW (was: ${llmDecision.action}, hasImages: ${hasImages})`);
                llmDecision.action = 'CONTINUE_FLOW';
                llmDecision.flow_id = session.active_flow.flow_id;
            }
        }

        // Handle KB search (same as parent)
        const kbSearchNeeded = llmDecision.search_kb || llmDecision.kb_search?.needed;
        if (kbSearchNeeded && agent.kb_id) {
            // ... KB search logic (inherited from parent)
            const searchResult = await this._performKBSearch(context, llmDecision, agent);
            if (searchResult) {
                context.kb_results = searchResult;
                llmDecision = await this._getLLMDecision(context, agent);
            }
        }

        // PHASE 2: Handle direct function execution
        if (llmDecision._direct_execution && llmDecision.execute_function) {
            console.log('⚡ Direct function execution requested:', llmDecision.execute_function);
            return await this._handleDirectFunctionExecution(
                session, 
                agent, 
                llmDecision, 
                bufferedData,
                context
            );
        }

        // Continue with normal flow processing
        return await this._continueFlowProcessing(session, agent, llmDecision, bufferedData, context);
    }

    /**
     * Handle direct function execution (bypass step-by-step)
     */
    async _handleDirectFunctionExecution(session, agent, llmDecision, bufferedData, context) {
        const execFunc = llmDecision.execute_function || {};
        const name = execFunc.name;
        const params = execFunc.params || {};
        
        // Validate function name
        if (!name || name === 'function_name' || name === 'undefined' || typeof name !== 'string') {
            console.warn(`⚠️ Invalid function name: ${name}, falling back to flow execution`);
            return await this._continueFlowProcessing(session, agent, llmDecision, bufferedData, context);
        }
        
        // Check if function is registered
        if (!this.executor.functionHandlers[name]) {
            console.warn(`⚠️ Function ${name} not registered, falling back to flow execution`);
            return await this._continueFlowProcessing(session, agent, llmDecision, bufferedData, context);
        }

        try {
            // Execute function directly
            console.log(`⚡ Executing ${name} directly with params:`, params);
            const result = await this.executor.functionHandlers[name](params, agent, session);

            // Generate response for function result
            const response = await this._generateDirectFunctionResponse(
                session,
                agent,
                name,
                result,
                llmDecision,
                bufferedData,
                context
            );

            // Store extracted data in session
            if (llmDecision.extracted) {
                await this._updateSessionExtracted(session.id, llmDecision.extracted);
            }

            return {
                status: 'completed',
                response,
                function_executed: name,
                function_result: result,
                direct_execution: true,
                cost: llmDecision._cost,
                cost_breakdown: {
                    decision: llmDecision._cost,
                    response: response._cost || 0
                }
            };

        } catch (error) {
            console.error(`❌ Direct function execution failed:`, error);
            return {
                status: 'error',
                response: {
                    text: llmDecision.response || 'I encountered an issue processing your request. Let me try a different approach.',
                    html: llmDecision.response || 'I encountered an issue processing your request. Let me try a different approach.'
                },
                error: error.message
            };
        }
    }

    /**
     * Continue with normal flow processing
     */
    async _continueFlowProcessing(session, agent, llmDecision, bufferedData, context) {
        // Use parent's flow processing logic - method is _processLLMDecision
        return await this._processLLMDecision(session, agent, llmDecision, bufferedData);
    }

    /**
     * Generate response for direct function execution result
     * NOTE: This is different from parent's _generateFunctionResponse which is called by flow executor
     */
    async _generateDirectFunctionResponse(session, agent, functionName, result, llmDecision, bufferedData, context) {
        // Find response instructions from flow if available
        let responseInstructions = '';
        if (session.active_flow) {
            const flow = await ChatFlowService.getFlow(session.active_flow.flow_id);
            const steps = flow?.config?.steps || [];
            const functionStep = steps.find(s => 
                s.type === 'function' && s.config?.function === functionName
            );
            responseInstructions = functionStep?.config?.response_instructions || '';
        }

        // Build response generation prompt
        const responsePrompt = `Generate a natural response for the customer based on this function result.

FUNCTION: ${functionName}
RESULT: ${JSON.stringify(result, null, 2)}

${responseInstructions ? `RESPONSE INSTRUCTIONS:\n${responseInstructions}\n` : ''}

CUSTOMER LANGUAGE: ${llmDecision?.detected_language || 'English'}
CUSTOMER MESSAGE: "${bufferedData?.combinedMessage || ''}"

Generate a helpful, natural response in the customer's language.`;

        try {
            const completion = await LLMService.chat([
                { role: 'system', content: context.instructions || 'You are a helpful customer service assistant.' },
                { role: 'user', content: responsePrompt }
            ], {
                model: agent.chat_model || 'gpt-4o-mini',
                temperature: 0.7,
                max_tokens: 1024
            });

            return {
                text: completion.content,
                html: completion.content,
                _cost: completion.cost
            };

        } catch (error) {
            console.error('Error generating function response:', error);
            return {
                text: llmDecision.response || 'Your request has been processed.',
                html: llmDecision.response || 'Your request has been processed.',
                _cost: 0
            };
        }
    }

    /**
     * Update session with extracted data
     */
    async _updateSessionExtracted(sessionId, extracted) {
        try {
            const session = await SessionStateService.getSession(sessionId);
            const currentMemory = session.context_memory || {};
            
            // Merge extracted data
            const updatedMemory = {
                ...currentMemory,
                extracted: {
                    ...(currentMemory.extracted || {}),
                    ...extracted,
                    // Append to arrays instead of replacing
                    order_numbers: [
                        ...(currentMemory.extracted?.order_numbers || []),
                        ...(extracted.order_numbers || [])
                    ].filter((v, i, a) => a.indexOf(v) === i), // Unique
                    phone_numbers: [
                        ...(currentMemory.extracted?.phone_numbers || []),
                        ...(extracted.phone_numbers || [])
                    ].filter((v, i, a) => a.indexOf(v) === i)
                }
            };

            await SessionStateService.updateContextMemory(sessionId, updatedMemory);
        } catch (error) {
            console.error('Error updating session extracted:', error);
        }
    }

    /**
     * Perform KB search
     */
    async _performKBSearch(context, llmDecision, agent) {
        try {
            const KnowledgeService = require('../KnowledgeService');
            const kbQuery = llmDecision.kb_search?.query_english || 
                           llmDecision.kb_search?.search_keywords?.join(' ') || 
                           context.message;

            const searchResult = await KnowledgeService.search({
                kbId: agent.kb_id,
                query: kbQuery,
                topK: 5,
                searchType: 'hybrid'
            });

            const textResults = searchResult?.results?.text_results || [];
            if (textResults.length > 0) {
                return textResults.map(r => ({
                    content: r.content || r.text || r.chunk_text || '',
                    score: r.score || r.similarity || 0,
                    source: r.source || r.file_name || ''
                }));
            }
        } catch (error) {
            console.error('KB search error:', error);
        }
        return null;
    }
}

module.exports = IntelligentFlowEngine;