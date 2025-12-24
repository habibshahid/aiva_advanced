/**
 * Flow Manager
 * Handles multi-turn conversation flows with multi-language support
 */

const TemplateRenderer = require('./template-renderer');
const SlotExtractor = require('./slot-extractor');

class FlowManager {
    
    constructor(config) {
        this.apiBaseUrl = config.apiBaseUrl || process.env.API_BASE_URL;
        this.apiToken = config.apiToken || process.env.INTERNAL_API_TOKEN;
        
        // Session cache (in-memory, use Redis in production)
        this.sessionCache = new Map();
        
        // Template renderer
        this.templateRenderer = new TemplateRenderer({
            apiBaseUrl: this.apiBaseUrl,
            apiToken: this.apiToken,
            ttsHandler: config.ttsHandler,
            audioStorage: config.audioStorage
        });
        
        // Slot extractor
        this.slotExtractor = config.slotExtractor || new SlotExtractor({
            llmApiKey: config.llmApiKey
        });
        
        // Confirmation phrases
        this.confirmPhrases = ['yes', 'yeah', 'yep', 'correct', 'right', 'haan', 'ji', 'jee', 'bilkul', 'sahi'];
        this.negationPhrases = ['no', 'nope', 'wrong', 'incorrect', 'nahi', 'nahin', 'galat', 'nai'];
        this.cancelPhrases = ['cancel', 'stop', 'quit', 'exit', 'band karo', 'ruko'];
    }
    
    // ========================================================================
    // SESSION MANAGEMENT
    // ========================================================================
    
    /**
     * Check if there's an active flow session
     */
    async hasActiveSession(sessionId) {
        // Check cache first
        if (this.sessionCache.has(sessionId)) {
            const session = this.sessionCache.get(sessionId);
            if (session.status === 'active') {
                return true;
            }
        }
        
        // Check database
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/flow-sessions/${sessionId}/active`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                if (data.data && data.data.status === 'active') {
                    this.sessionCache.set(sessionId, data.data);
                    return true;
                }
            }
        } catch (error) {
            console.error('[FlowManager] Error checking session:', error);
        }
        
        return false;
    }
    
    /**
     * Get active session
     */
    async getSession(sessionId) {
        if (this.sessionCache.has(sessionId)) {
            return this.sessionCache.get(sessionId);
        }
        
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/flow-sessions/${sessionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                const session = data.data;
                
                // Parse JSON fields
                if (typeof session.slots_data === 'string') {
                    session.slots_data = JSON.parse(session.slots_data);
                }
                if (typeof session.context_data === 'string') {
                    session.context_data = JSON.parse(session.context_data);
                }
                
                this.sessionCache.set(sessionId, session);
                return session;
            }
        } catch (error) {
            console.error('[FlowManager] Error getting session:', error);
        }
        
        return null;
    }
    
    // ========================================================================
    // FLOW CONTROL
    // ========================================================================
    
    /**
     * Start a new flow
     */
    async startFlow(flowId, context) {
        const { sessionId, agentId, tenantId, callerPhone, callerId, language } = context;
        
        console.log(`[FlowManager] Starting flow ${flowId} for session ${sessionId}`);
        
        // Get flow definition
        const flow = await this.getFlow(flowId);
        if (!flow) {
            throw new Error(`Flow ${flowId} not found`);
        }
        
        // Detect or use provided language
        const sessionLanguage = language || await this.detectLanguage(agentId, context.initialUtterance);
        
        // Create session
        const session = {
            id: sessionId,
            flow_id: flowId,
            agent_id: agentId,
            tenant_id: tenantId,
            caller_phone: callerPhone,
            caller_id: callerId,
            language: sessionLanguage,
            status: 'active',
            current_step_key: flow.steps[0]?.step_key || null,
            slots_data: {},
            context_data: context.contextData || {},
            pending_confirmation: null,
            retry_count: 0,
            created_at: new Date().toISOString()
        };
        
        // Save session
        await this.saveSession(session);
        this.sessionCache.set(sessionId, session);
        
        // Build intro responses
        const responses = [];
        
        // Flow intro
        if (flow.intro_text) {
            const introContent = await this.getContent(flow, 'intro', sessionLanguage);
            responses.push(await this.buildSpeakResponse(introContent, session));
        }
        
        // First step prompt
        if (flow.steps.length > 0) {
            const firstStep = flow.steps[0];
            const stepContent = await this.getStepContent(firstStep, 'prompt', sessionLanguage);
            responses.push(await this.buildSpeakResponse(stepContent, session));
        }
        
        return {
            success: true,
            flowStarted: true,
            flowId: flowId,
            flowName: flow.flow_name,
            sessionId: sessionId,
            language: sessionLanguage,
            responses: responses
        };
    }
    
    /**
     * Process an utterance within an active flow
     */
    async processUtterance(sessionId, utterance) {
        console.log(`[FlowManager] Processing: "${utterance}" for session ${sessionId}`);
        
        // Get session
        const session = await this.getSession(sessionId);
        if (!session || session.status !== 'active') {
            return {
                success: false,
                error: 'No active session',
                flowEnded: true
            };
        }
        
        // Get flow
        const flow = await this.getFlow(session.flow_id);
        if (!flow) {
            return {
                success: false,
                error: 'Flow not found',
                flowEnded: true
            };
        }
        
        // Check for cancellation
        if (this.isCancellation(utterance, flow.cancel_phrases)) {
            return await this.handleCancellation(session, flow);
        }
        
        // Check for pending confirmation
        if (session.pending_confirmation) {
            return await this.handleConfirmation(session, flow, utterance);
        }
        
        // Get current step
        const currentStep = flow.steps.find(s => s.step_key === session.current_step_key);
        if (!currentStep) {
            return await this.completeFlow(session, flow);
        }
        
        // Process based on step type
        switch (currentStep.step_type) {
            case 'collect_slot':
                return await this.handleCollectSlot(session, flow, currentStep, utterance);
            
            case 'confirm':
                return await this.handleConfirmStep(session, flow, currentStep, utterance);
            
            case 'respond':
                return await this.handleRespondStep(session, flow, currentStep);
            
            case 'branch':
                return await this.handleBranchStep(session, flow, currentStep);
            
            case 'function':
                return await this.handleFunctionStep(session, flow, currentStep);
            
            case 'transfer':
                return await this.handleTransferStep(session, flow, currentStep);
            
            default:
                return await this.handleCollectSlot(session, flow, currentStep, utterance);
        }
    }
    
    // ========================================================================
    // STEP HANDLERS
    // ========================================================================
    
    /**
     * Handle slot collection
     */
    async handleCollectSlot(session, flow, step, utterance) {
        const responses = [];
        
        // Extract slot value
        const extracted = await this.slotExtractor.extract(
            utterance,
            step.slot_type,
            {
                validation_regex: step.validation_regex,
                min_length: step.min_length,
                max_length: step.max_length,
                allowed_values: step.allowed_values,
                language: session.language
            }
        );
        
        if (!extracted.success) {
            // Invalid input
            session.retry_count++;
            
            if (session.retry_count >= (step.retry_limit || flow.max_retries_per_step || 3)) {
                // Max retries exceeded
                return await this.handleMaxRetries(session, flow, step);
            }
            
            // Send invalid message
            const invalidContent = await this.getStepContent(step, 'on_invalid', session.language);
            if (invalidContent.text) {
                responses.push(await this.buildSpeakResponse(invalidContent, session));
            }
            
            // Re-prompt
            const retryContent = await this.getStepContent(step, 'retry_prompt', session.language) ||
                                await this.getStepContent(step, 'prompt', session.language);
            responses.push(await this.buildSpeakResponse(retryContent, session));
            
            await this.saveSession(session);
            
            return {
                success: true,
                responses: responses,
                awaitingInput: true
            };
        }
        
        // Valid input - store slot
        session.slots_data[step.slot_name] = extracted.value;
        session.retry_count = 0;
        
        // Check if confirmation required
        if (step.requires_confirmation) {
            session.pending_confirmation = {
                step_key: step.step_key,
                slot_name: step.slot_name,
                value: extracted.value
            };
            
            await this.saveSession(session);
            
            // Send confirmation prompt
            const confirmContent = await this.getStepContent(step, 'confirm', session.language);
            const interpolated = this.interpolate(confirmContent.text, session.slots_data);
            
            responses.push(await this.buildSpeakResponse({
                ...confirmContent,
                text: interpolated
            }, session));
            
            return {
                success: true,
                responses: responses,
                awaitingConfirmation: true
            };
        }
        
        // Move to next step
        return await this.moveToNextStep(session, flow, step, responses);
    }
    
    /**
     * Handle confirmation response
     */
    async handleConfirmation(session, flow, utterance) {
        const responses = [];
        const pendingConf = session.pending_confirmation;
        
        const step = flow.steps.find(s => s.step_key === pendingConf.step_key);
        
        if (this.isConfirmation(utterance)) {
            // Confirmed - clear pending and move on
            session.pending_confirmation = null;
            return await this.moveToNextStep(session, flow, step, responses);
            
        } else if (this.isNegation(utterance)) {
            // Not confirmed - clear value and re-ask
            delete session.slots_data[pendingConf.slot_name];
            session.pending_confirmation = null;
            session.retry_count = 0;
            
            await this.saveSession(session);
            
            // Re-prompt for the slot
            const promptContent = await this.getStepContent(step, 'prompt', session.language);
            responses.push(await this.buildSpeakResponse(promptContent, session));
            
            return {
                success: true,
                responses: responses,
                awaitingInput: true
            };
            
        } else {
            // Unclear response - ask again
            const confirmContent = await this.getStepContent(step, 'confirm', session.language);
            const interpolated = this.interpolate(confirmContent.text, session.slots_data);
            
            responses.push(await this.buildSpeakResponse({
                ...confirmContent,
                text: interpolated
            }, session));
            
            return {
                success: true,
                responses: responses,
                awaitingConfirmation: true
            };
        }
    }
    
    /**
     * Handle respond step (speak message)
     */
    async handleRespondStep(session, flow, step) {
        const responses = [];
        
        const responseContent = await this.getStepContent(step, 'response', session.language) ||
                               await this.getStepContent(step, 'prompt', session.language);
        
        const interpolated = this.interpolate(responseContent.text, session.slots_data);
        
        responses.push(await this.buildSpeakResponse({
            ...responseContent,
            text: interpolated
        }, session));
        
        if (step.is_terminal) {
            return await this.completeFlow(session, flow, responses);
        }
        
        return await this.moveToNextStep(session, flow, step, responses);
    }
    
    /**
     * Handle function call step
     */
    async handleFunctionStep(session, flow, step) {
        const responses = [];
        
        try {
            // Build function arguments
            const args = {};
            if (step.function_args) {
                for (const [key, value] of Object.entries(step.function_args)) {
                    args[key] = this.interpolate(value, session.slots_data);
                }
            }
            
            // Execute function
            const result = await this.executeFunction(session.agent_id, step.function_name, args);
            
            // Store result
            if (step.response_variable) {
                session.slots_data[step.response_variable] = result;
            }
            session.slots_data['_last_function_result'] = result;
            
            // Speak response if configured
            if (step.response_text || step.response_template_id) {
                const responseContent = await this.getStepContent(step, 'response', session.language);
                const interpolated = this.interpolate(responseContent.text, {
                    ...session.slots_data,
                    result: result
                });
                
                responses.push(await this.buildSpeakResponse({
                    ...responseContent,
                    text: interpolated
                }, session));
            }
            
            if (step.is_terminal) {
                return await this.completeFlow(session, flow, responses);
            }
            
            // Determine next step
            const nextStepKey = step.on_success_step_key || step.next_step_key;
            return await this.moveToNextStep(session, flow, step, responses, nextStepKey);
            
        } catch (error) {
            console.error('[FlowManager] Function execution failed:', error);
            
            // Use failure path if configured
            if (step.on_failure_step_key) {
                session.slots_data['_function_error'] = error.message;
                return await this.moveToNextStep(session, flow, step, responses, step.on_failure_step_key);
            }
            
            // Otherwise handle as error
            return await this.handleError(session, flow, error.message, responses);
        }
    }
    
    /**
     * Handle branch/condition step
     */
    async handleBranchStep(session, flow, step) {
        const responses = [];
        
        // Evaluate branch conditions
        let nextStepKey = step.next_step_key; // Default
        
        if (step.branch_conditions && Array.isArray(step.branch_conditions)) {
            for (const condition of step.branch_conditions) {
                if (this.evaluateCondition(condition, session.slots_data)) {
                    nextStepKey = condition.goto_step_key;
                    break;
                }
            }
        }
        
        return await this.moveToNextStep(session, flow, step, responses, nextStepKey);
    }
    
    /**
     * Handle transfer step
     */
    async handleTransferStep(session, flow, step) {
        const responses = [];
        
        // Speak transfer message if configured
        const transferContent = await this.getStepContent(step, 'prompt', session.language);
        if (transferContent.text) {
            const interpolated = this.interpolate(transferContent.text, session.slots_data);
            responses.push(await this.buildSpeakResponse({
                ...transferContent,
                text: interpolated
            }, session));
        }
        
        // End session
        session.status = 'transferred';
        await this.saveSession(session);
        this.sessionCache.delete(session.id);
        
        return {
            success: true,
            responses: responses,
            transfer: {
                queue: step.transfer_queue,
                context: this.interpolateObject(step.transfer_context || {}, session.slots_data)
            },
            flowEnded: true
        };
    }
    
    // ========================================================================
    // FLOW COMPLETION
    // ========================================================================
    
    /**
     * Move to next step
     */
    async moveToNextStep(session, flow, currentStep, responses = [], overrideNextKey = null) {
        // Determine next step
        let nextStepKey = overrideNextKey || currentStep.next_step_key;
        
        if (!nextStepKey) {
            // Find next by order
            const currentIndex = flow.steps.findIndex(s => s.step_key === currentStep.step_key);
            const nextStep = flow.steps[currentIndex + 1];
            nextStepKey = nextStep?.step_key;
        }
        
        if (!nextStepKey || currentStep.is_terminal) {
            // No more steps - complete flow
            return await this.completeFlow(session, flow, responses);
        }
        
        const nextStep = flow.steps.find(s => s.step_key === nextStepKey);
        if (!nextStep) {
            return await this.completeFlow(session, flow, responses);
        }
        
        // Check skip condition
        if (nextStep.skip_if_slot_filled && session.slots_data[nextStep.skip_if_slot_filled]) {
            // Skip this step
            return await this.moveToNextStep(session, flow, nextStep, responses);
        }
        
        // Update session
        session.current_step_key = nextStepKey;
        session.retry_count = 0;
        await this.saveSession(session);
        
        // Add next step prompt
        const promptContent = await this.getStepContent(nextStep, 'prompt', session.language);
        const interpolated = this.interpolate(promptContent.text, session.slots_data);
        
        responses.push(await this.buildSpeakResponse({
            ...promptContent,
            text: interpolated
        }, session));
        
        // For non-input steps, process immediately
        if (['respond', 'branch', 'function'].includes(nextStep.step_type)) {
            // Note: respond step already added response, but we process it for terminal check
            if (nextStep.step_type !== 'respond') {
                return await this.processUtterance(session.id, '');
            }
        }
        
        return {
            success: true,
            responses: responses,
            currentStep: nextStepKey,
            awaitingInput: nextStep.step_type === 'collect_slot'
        };
    }
    
    /**
     * Complete the flow
     */
    async completeFlow(session, flow, responses = []) {
        console.log(`[FlowManager] Completing flow for session ${session.id}`);
        
        // Execute on_complete action
        if (flow.on_complete_action === 'function_call' && flow.on_complete_function_name) {
            try {
                const args = this.interpolateObject(flow.on_complete_args_mapping || {}, session.slots_data);
                const result = await this.executeFunction(session.agent_id, flow.on_complete_function_name, args);
                session.slots_data['_completion_result'] = result;
                session.slots_data['result'] = result;
            } catch (error) {
                console.error('[FlowManager] Completion function failed:', error);
                session.slots_data['_completion_error'] = error.message;
            }
        }
        
        // Speak completion message
        const completeContent = await this.getContent(flow, 'on_complete', session.language);
        if (completeContent.text) {
            const interpolated = this.interpolate(completeContent.text, session.slots_data);
            responses.push(await this.buildSpeakResponse({
                ...completeContent,
                text: interpolated
            }, session));
        }
        
        // Send WhatsApp if configured
        if (flow.send_whatsapp_on_complete && session.caller_phone) {
            this.sendWhatsAppNotification(session, flow);
        }
        
        // Ask "anything else?"
        if (flow.ask_anything_else) {
            const anythingContent = await this.getContent(flow, 'anything_else', session.language);
            if (anythingContent.text) {
                responses.push(await this.buildSpeakResponse(anythingContent, session));
            }
        }
        
        // Update session status
        session.status = 'completed';
        session.completed_at = new Date().toISOString();
        await this.saveSession(session);
        this.sessionCache.delete(session.id);
        
        // Handle transfer if configured
        if (flow.on_complete_action === 'transfer') {
            return {
                success: true,
                responses: responses,
                transfer: {
                    queue: flow.on_complete_transfer_queue,
                    context: session.slots_data
                },
                flowCompleted: true,
                collectedData: session.slots_data
            };
        }
        
        return {
            success: true,
            responses: responses,
            flowCompleted: true,
            collectedData: session.slots_data
        };
    }
    
    /**
     * Handle cancellation
     */
    async handleCancellation(session, flow) {
        const responses = [];
        
        const cancelContent = await this.getContent(flow, 'on_cancel', session.language);
        if (cancelContent.text) {
            responses.push(await this.buildSpeakResponse(cancelContent, session));
        }
        
        session.status = 'cancelled';
        await this.saveSession(session);
        this.sessionCache.delete(session.id);
        
        return {
            success: true,
            responses: responses,
            flowCancelled: true
        };
    }
    
    /**
     * Handle max retries exceeded
     */
    async handleMaxRetries(session, flow, step) {
        const responses = [];
        
        const errorContent = await this.getContent(flow, 'on_error', session.language);
        if (errorContent.text) {
            responses.push(await this.buildSpeakResponse(errorContent, session));
        }
        
        if (flow.on_error_action === 'transfer') {
            session.status = 'failed_transfer';
            await this.saveSession(session);
            
            return {
                success: false,
                responses: responses,
                transfer: {
                    queue: flow.on_error_transfer_queue || 'default',
                    context: { reason: 'max_retries', step: step.step_key }
                },
                flowEnded: true
            };
        }
        
        session.status = 'failed';
        await this.saveSession(session);
        this.sessionCache.delete(session.id);
        
        return {
            success: false,
            responses: responses,
            error: 'Max retries exceeded',
            flowEnded: true
        };
    }
    
    /**
     * Handle error
     */
    async handleError(session, flow, errorMessage, responses = []) {
        const errorContent = await this.getContent(flow, 'on_error', session.language);
        if (errorContent.text) {
            responses.push(await this.buildSpeakResponse(errorContent, session));
        }
        
        session.status = 'failed';
        session.error = errorMessage;
        await this.saveSession(session);
        this.sessionCache.delete(session.id);
        
        return {
            success: false,
            responses: responses,
            error: errorMessage,
            flowEnded: true
        };
    }
    
    // ========================================================================
    // CONTENT RESOLUTION
    // ========================================================================
    
    /**
     * Get flow-level content
     */
    async getContent(flow, field, language) {
        // Try i18n content first
        // TODO: Implement i18n lookup
        
        // Fall back to base fields
        const fieldMap = {
            'intro': { text: 'intro_text', audio: 'intro_audio_id', template: null },
            'on_complete': { text: 'on_complete_response_text', audio: 'on_complete_audio_id', template: 'on_complete_template_id' },
            'on_cancel': { text: 'on_cancel_text', audio: 'on_cancel_audio_id', template: null },
            'anything_else': { text: 'anything_else_text', audio: 'anything_else_audio_id', template: null },
            'closing': { text: 'closing_text', audio: 'closing_audio_id', template: null },
            'on_error': { text: 'on_error_text', audio: 'on_error_audio_id', template: null }
        };
        
        const mapping = fieldMap[field];
        if (!mapping) return { text: null, audio_id: null, template_id: null };
        
        return {
            text: flow[mapping.text],
            audio_id: flow[mapping.audio],
            template_id: mapping.template ? flow[mapping.template] : null
        };
    }
    
    /**
     * Get step-level content
     */
    async getStepContent(step, field, language) {
        const fieldMap = {
            'prompt': { text: 'prompt_text', audio: 'prompt_audio_id', template: 'prompt_template_id' },
            'confirm': { text: 'confirm_template', audio: 'confirm_audio_id', template: 'confirm_template_id' },
            'on_invalid': { text: 'on_invalid_text', audio: 'on_invalid_audio_id', template: 'on_invalid_template_id' },
            'on_empty': { text: 'on_empty_text', audio: 'on_empty_audio_id', template: null },
            'retry_prompt': { text: 'retry_prompt_text', audio: 'retry_prompt_audio_id', template: null },
            'response': { text: 'response_text', audio: 'response_audio_id', template: 'response_template_id' }
        };
        
        const mapping = fieldMap[field];
        if (!mapping) return { text: null, audio_id: null, template_id: null };
        
        return {
            text: step[mapping.text],
            audio_id: step[mapping.audio],
            template_id: mapping.template ? step[mapping.template] : null
        };
    }
    
    /**
     * Build speak response with audio resolution
     */
    async buildSpeakResponse(content, session) {
        // If template is specified, render it
        if (content.template_id) {
            const template = await this.getTemplate(content.template_id);
            if (template) {
                const audioParts = await this.templateRenderer.render(
                    session.agent_id,
                    template,
                    session.slots_data,
                    session.language
                );
                
                return {
                    type: 'speak',
                    text: await this.templateRenderer.renderText(
                        session.agent_id,
                        template,
                        session.slots_data,
                        session.language
                    ),
                    audioParts: audioParts,
                    useTemplate: true
                };
            }
        }
        
        // Simple response
        return {
            type: 'speak',
            text: content.text,
            audioId: content.audio_id,
            useTemplate: false
        };
    }
    
    // ========================================================================
    // HELPERS
    // ========================================================================
    
    /**
     * Interpolate template variables
     */
    interpolate(template, data) {
        if (!template) return '';
        
        return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
            const keys = key.trim().split('.');
            let value = data;
            
            for (const k of keys) {
                value = value?.[k];
            }
            
            return value !== undefined && value !== null ? String(value) : match;
        });
    }
    
    /**
     * Interpolate object values
     */
    interpolateObject(obj, data) {
        if (!obj) return {};
        
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.interpolate(value, data);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
    
    isConfirmation(text) {
        const normalized = text.toLowerCase().trim();
        return this.confirmPhrases.some(p => normalized.includes(p));
    }
    
    isNegation(text) {
        const normalized = text.toLowerCase().trim();
        return this.negationPhrases.some(p => normalized.includes(p));
    }
    
    isCancellation(text, customPhrases = []) {
        const normalized = text.toLowerCase().trim();
        const phrases = [...this.cancelPhrases, ...customPhrases];
        return phrases.some(p => normalized.includes(p.toLowerCase()));
    }
    
    evaluateCondition(condition, data) {
        const { field, operator, value } = condition;
        const fieldValue = this.getNestedValue(data, field);
        
        switch (operator) {
            case 'equals': return fieldValue === value;
            case 'not_equals': return fieldValue !== value;
            case 'contains': return String(fieldValue).includes(value);
            case 'greater_than': return Number(fieldValue) > Number(value);
            case 'less_than': return Number(fieldValue) < Number(value);
            case 'exists': return fieldValue !== undefined && fieldValue !== null;
            case 'not_exists': return fieldValue === undefined || fieldValue === null;
            default: return false;
        }
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((o, k) => o?.[k], obj);
    }
    
    // ========================================================================
    // API CALLS
    // ========================================================================
    
    async getFlow(flowId) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/flows/${flowId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return data.data;
            }
        } catch (error) {
            console.error('[FlowManager] Error fetching flow:', error);
        }
        return null;
    }
    
    async getTemplate(templateId) {
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/internal/templates/${templateId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken
                    }
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return data.data;
            }
        } catch (error) {
            console.error('[FlowManager] Error fetching template:', error);
        }
        return null;
    }
    
    async saveSession(session) {
        try {
            await fetch(
                `${this.apiBaseUrl}/api/internal/flow-sessions`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(session)
                }
            );
        } catch (error) {
            console.error('[FlowManager] Error saving session:', error);
        }
    }
    
    async executeFunction(agentId, functionName, args) {
        const response = await fetch(
            `${this.apiBaseUrl}/api/internal/functions/execute`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'X-Internal-Token': this.apiToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ agent_id: agentId, function_name: functionName, arguments: args })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Function execution failed: ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.data?.result;
    }
    
    async detectLanguage(agentId, text) {
        if (!text) return 'en';
        
        try {
            const response = await fetch(
                `${this.apiBaseUrl}/api/languages/detect`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ text })
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return data.data?.code || 'en';
            }
        } catch (error) {
            console.error('[FlowManager] Language detection failed:', error);
        }
        
        return 'en';
    }
    
    async sendWhatsAppNotification(session, flow) {
        try {
            await fetch(
                `${this.apiBaseUrl}/api/internal/whatsapp/send`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'X-Internal-Token': this.apiToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        phone: session.caller_phone,
                        template: flow.whatsapp_template_name,
                        variables: session.slots_data
                    })
                }
            );
        } catch (error) {
            console.error('[FlowManager] WhatsApp notification failed:', error);
        }
    }
}

module.exports = FlowManager;
