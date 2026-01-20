/**
 * Flow Engine v2
 * 
 * Main orchestrator for flow-based conversation handling.
 * 
 * Architecture:
 * 1. Message Buffer collects rapid-fire messages
 * 2. LLM classifies intent and picks flow
 * 3. Flow Executor handles step-by-step execution
 * 4. Session State tracks flow stack and context
 * 
 * Benefits:
 * - Industry-agnostic (flows are configurable)
 * - 60-80% token reduction
 * - Handles rapid-fire messages
 * - Supports context switching
 */

const MessageBufferService = require('./MessageBufferService');
const SessionStateService = require('./SessionStateService');
const ChatFlowService = require('./ChatFlowService');
const FlowExecutor = require('./FlowExecutor');
const LLMService = require('../LLMService');
const db = require('../../config/database');

class FlowEngine {

    /**
     * LLM Action types
     */
    static ACTIONS = {
        START_FLOW: 'START_FLOW',
        CONTINUE_FLOW: 'CONTINUE_FLOW',
        SWITCH_FLOW: 'SWITCH_FLOW',
        INLINE_ANSWER: 'INLINE_ANSWER',
        COMPLETE_FLOW: 'COMPLETE_FLOW',
        ABANDON_FLOW: 'ABANDON_FLOW',
        EXECUTE_FUNCTION: 'EXECUTE_FUNCTION',
        ASK_CLARIFICATION: 'ASK_CLARIFICATION'
    };

    /**
     * Session action types
     */
    static SESSION_ACTIONS = {
        NONE: 'NONE',
        SOFT_CLOSE: 'SOFT_CLOSE',
        HARD_CLOSE: 'HARD_CLOSE'
    };

    /**
     * Initialize Flow Engine
     */
    constructor() {
        this.executor = new FlowExecutor();
        // NOTE: Function handlers are registered in FlowEngineIntegration.js
        // Do NOT register functions here to avoid duplication
    }

    /**
     * Register a function handler
     */
    registerFunction(name, handler) {
        this.executor.registerFunction(name, handler);
    }

    /**
     * Process incoming message
     * Main entry point for the engine
     */
    async processMessage({
        agentId,
        channelId,
        sessionId = null,
        message = '',
        imageUrl = null,
        audioTranscript = null,
        audioDuration = null,
        customerInfo = {},
        bufferSecondsOverride = null
    }) {
        const startTime = Date.now();

        try {
            // Get agent config
            const agent = await this._getAgent(agentId);
            if (!agent) {
                throw new Error('Agent ' + agentId + ' not found');
            }

            // Get or create session
            const session = await SessionStateService.getOrCreateSession(
                sessionId,
                agentId,
                channelId,
                customerInfo
            );

            // Update activity
            await SessionStateService._updateLastActivity(session.id);

            // Determine buffer seconds (override takes precedence)
            const bufferSeconds = bufferSecondsOverride !== null 
                ? bufferSecondsOverride 
                : agent.message_buffer_seconds;
            
            // Add message to buffer
            console.log(`📦 Buffer config: message_buffer_seconds = ${bufferSeconds} (override: ${bufferSecondsOverride})`);
            const bufferResult = await MessageBufferService.addMessage(
                session.id,
                {
                    text: message,
                    type: audioTranscript ? 'audio' : 'text',
                    imageUrl: imageUrl,
                    audioTranscript: audioTranscript,
                    audioDuration: audioDuration
                },
                bufferSeconds
            );

            // If buffering, return acknowledgment
            if (!bufferResult.shouldProcess) {
                return {
                    session_id: session.id,
                    status: 'buffering',
                    message: 'Message received, waiting for more...',
                    buffer_id: bufferResult.bufferId
                };
            }

            // If buffer is disabled (bufferSeconds = 0), process immediately with bufferedData
            if (bufferResult.bufferedData) {
                console.log('⚡ Processing immediately (buffer disabled)');
                const result = await this._processBufferedInput(session, agent, bufferResult.bufferedData);
                result.processing_time_ms = Date.now() - startTime;
                result.session_id = session.id;
                return result;
            }

            // Try to acquire buffer for processing
            const buffer = await MessageBufferService.acquireBuffer(
                session.id,
                agent.message_buffer_seconds
            );

            if (!buffer) {
                return {
                    session_id: session.id,
                    status: 'pending',
                    message: 'Processing in progress...'
                };
            }

            // Process the buffered messages
            const result = await this._processBufferedInput(session, agent, buffer.data);

            // Mark buffer as done
            await MessageBufferService.markDone(buffer.bufferId);

            result.processing_time_ms = Date.now() - startTime;
            result.session_id = session.id;

            return result;

        } catch (error) {
            console.error('Error in FlowEngine.processMessage:', error);
            return {
                session_id: sessionId,
                status: 'error',
                error: error.message,
                response: {
                    text: 'I apologize, something went wrong. Please try again.',
                    html: 'I apologize, something went wrong. Please try again.'
                },
                processing_time_ms: Date.now() - startTime
            };
        }
    }

    /**
     * Process buffered input through LLM and flow execution
     */
    async _processBufferedInput(session, agent, bufferedData) {
        console.log('Processing buffered input:', {
            sessionId: session.id,
            messageCount: bufferedData.messageCount,
            imageCount: bufferedData.imageCount,
            hasActiveFlow: !!session.active_flow
        });

        // Build context for LLM
        let context = await this._buildLLMContext(session, agent, bufferedData);

        // First LLM call for decision
        let llmDecision = await this._getLLMDecision(context, agent);

        // If LLM requests KB search, do it and make a second call with results
        const kbSearchNeeded = llmDecision.search_kb || llmDecision.kb_search?.needed;
        const kbQuery = llmDecision.kb_search?.query_english || llmDecision.kb_query;
        const kbKeywords = llmDecision.kb_search?.search_keywords || [];
        
        if (kbSearchNeeded && agent.kb_id) {
            // Build search query from English translation + keywords
            const searchQuery = kbQuery || kbKeywords.join(' ') || bufferedData.combinedMessage;
            
            console.log('📚 LLM requested KB search:', {
                kb_id: agent.kb_id,
                original_language: llmDecision.kb_search?.original_language,
                query_english: kbQuery,
                keywords: kbKeywords,
                final_query: searchQuery
            });
            
            try {
                const KnowledgeService = require('../KnowledgeService');
                
                // KnowledgeService.search returns { results: { text_results, product_results, ... }, cost, cost_breakdown }
                const searchResult = await KnowledgeService.search({
                    kbId: agent.kb_id,
                    query: searchQuery,
                    topK: 5,
                    searchType: 'hybrid'
                });
                
                console.log('📚 KB search response:', {
                    has_results: !!searchResult?.results,
                    text_results: searchResult?.results?.text_results?.length || 0,
                    product_results: searchResult?.results?.product_results?.length || 0
                });
                
                // Extract text results from the response
                const textResults = searchResult?.results?.text_results || [];
                const productResults = searchResult?.results?.product_results || [];
                const allResults = [...textResults, ...productResults];
                
                if (allResults.length > 0) {
                    console.log('📚 KB search found', allResults.length, 'total results');
                    
                    // Format results for LLM context
                    const formattedResults = textResults.map(r => ({
                        content: r.content || r.text || r.chunk_text || '',
                        score: r.score || r.similarity || 0,
                        source: r.source || r.file_name || ''
                    }));
                    
                    // Update context with KB results for second LLM call
                    context.kb_results = formattedResults;
                    
                    // Second LLM call with KB context to generate proper response
                    console.log('📚 Making second LLM call with KB context');
                    const secondDecision = await this._getLLMDecision(context, agent);
                    
                    // Merge costs from both calls (including KB search cost)
                    secondDecision._cost = this._mergeCosts(llmDecision._cost, secondDecision._cost);
                    if (searchResult.cost) {
                        secondDecision._cost = this._mergeCosts(secondDecision._cost, { final_cost: searchResult.cost });
                    }
                    secondDecision._kb_searched = true;
                    secondDecision._kb_results_count = allResults.length;
                    
                    llmDecision = secondDecision;
                } else {
                    console.log('📚 KB search returned no results');
                }
            } catch (kbError) {
                console.error('📚 KB search error:', kbError.message, kbError.stack);
            }
        }

        // Process LLM decision
        const result = await this._processLLMDecision(session, agent, llmDecision, bufferedData);

        // Handle session actions
        if (llmDecision.session_action === this.constructor.SESSION_ACTIONS.SOFT_CLOSE) {
            await SessionStateService.softCloseSession(session.id);
        } else if (llmDecision.session_action === this.constructor.SESSION_ACTIONS.HARD_CLOSE) {
            await SessionStateService.closeSession(session.id);
        }

        // Update context memory with extracted info AND detected language
        const memoryUpdates = { ...(llmDecision.extracted || {}) };
        
        // Store detected language in session context
        if (llmDecision.detected_language) {
            memoryUpdates.detected_language = llmDecision.detected_language;
            console.log('🌐 Storing detected language:', llmDecision.detected_language);
        }
        
        if (Object.keys(memoryUpdates).length > 0) {
            await SessionStateService.updateContextMemory(session.id, memoryUpdates);
        }

        return result;
    }
    
    /**
     * Merge costs from multiple LLM calls
     */
    _mergeCosts(cost1, cost2) {
        if (!cost1) return cost2;
        if (!cost2) return cost1;
        
        // If costs are objects with detailed breakdown
        if (typeof cost1 === 'object' && typeof cost2 === 'object') {
            return {
                provider: cost1.provider || cost2.provider,
                model: cost1.model || cost2.model,
                input_tokens: (cost1.input_tokens || 0) + (cost2.input_tokens || 0),
                output_tokens: (cost1.output_tokens || 0) + (cost2.output_tokens || 0),
                cached_tokens: (cost1.cached_tokens || 0) + (cost2.cached_tokens || 0),
                input_cost: (cost1.input_cost || 0) + (cost2.input_cost || 0),
                output_cost: (cost1.output_cost || 0) + (cost2.output_cost || 0),
                cached_cost: (cost1.cached_cost || 0) + (cost2.cached_cost || 0),
                base_cost: (cost1.base_cost || 0) + (cost2.base_cost || 0),
                profit_amount: (cost1.profit_amount || 0) + (cost2.profit_amount || 0),
                final_cost: (cost1.final_cost || 0) + (cost2.final_cost || 0)
            };
        }
        
        // If costs are simple numbers
        return (cost1 || 0) + (cost2 || 0);
    }

    /**
     * Build context for LLM
     */
    async _buildLLMContext(session, agent, bufferedData) {
        const flows = await ChatFlowService.getFlowsForLLM(agent.id);
        const instructions = this._buildInstructions(agent);
        const history = await this._getRecentHistory(session.id, 5);

        // Session has 'channel' field directly (public_chat, whatsapp, etc.)
        const channel = session.channel || 'unknown';
        const channelUserId = session.channel_user_id || null;

        // Build customer context
        const customerContext = {
            channel: channel,
            channel_user_id: channelUserId,
            phone: session.customer_info?.phone || session.customer_phone || channelUserId,
            name: session.customer_info?.name || session.customer_name || null,
            email: session.customer_info?.email || null
        };

        return {
            instructions,
            active_flow: session.active_flow,
            paused_flows: session.paused_flows || [],
            available_flows: flows,
            context_memory: session.context_memory || {},
            customer: customerContext,  // NEW: Customer/channel context
            message: bufferedData.combinedMessage,
            images: bufferedData.images,
            has_audio: bufferedData.hasAudio,
            history
        };
    }

    /**
     * Build instructions from agent configuration
     */
    _buildInstructions(agent) {
        const parts = [];

        // Always include main instructions first if available
        if (agent.instructions) {
            parts.push(agent.instructions);
        }

        // Add persona info if not in instructions
        if (agent.persona_name && !agent.instructions?.includes(agent.persona_name)) {
            parts.push('You are ' + agent.persona_name + '.');
        }
        if (agent.persona_description && !agent.instructions?.includes(agent.persona_description)) {
            parts.push(agent.persona_description);
        }
        if (agent.tone_instructions) {
            parts.push('\nTone: ' + agent.tone_instructions);
        }
        if (agent.language_mode === 'auto') {
            parts.push('\nMatch the customer\'s language in your responses.');
        } else if (agent.fixed_language) {
            parts.push('\nAlways respond in ' + agent.fixed_language + '.');
        }
        if (agent.boundary_instructions) {
            parts.push('\nBoundaries:\n' + agent.boundary_instructions);
        }
        if (agent.quick_policies) {
            parts.push('\nQuick Facts:\n' + agent.quick_policies);
        }

        return parts.join('\n');
    }
    
    /**
     * Sanitize params to remove base64 images (they cause context overflow)
     * Replaces base64 data with placeholders
     */
    _sanitizeParamsForContext(params) {
        if (!params || typeof params !== 'object') {
            return params;
        }
        
        const sanitized = {};
        
        for (const [key, value] of Object.entries(params)) {
            if (Array.isArray(value)) {
                // Handle arrays (like complaint_images)
                const sanitizedArray = value.map(item => {
                    if (typeof item === 'string' && item.startsWith('data:image')) {
                        return '[IMAGE_COLLECTED]';
                    }
                    if (typeof item === 'object' && item !== null) {
                        return this._sanitizeParamsForContext(item);
                    }
                    return item;
                });
                sanitized[key] = sanitizedArray;
            } else if (typeof value === 'string' && value.startsWith('data:image')) {
                // Handle single base64 string
                sanitized[key] = '[IMAGE_COLLECTED]';
            } else if (typeof value === 'object' && value !== null) {
                // Recursively handle nested objects
                sanitized[key] = this._sanitizeParamsForContext(value);
            } else {
                sanitized[key] = value;
            }
        }
        
        return sanitized;
    }

    /**
     * Get LLM decision
     */
    async _getLLMDecision(context, agent) {
        const systemPrompt = this._buildSystemPrompt(context);
        const userMessage = this._buildUserMessage(context);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...context.history,
            userMessage
        ];

        const model = agent.chat_model || 'gpt-4o-mini';

        try {
            const completion = await LLMService.chat(messages, {
                model,
                temperature: parseFloat(agent.chat_temperature) || 0.7,
                max_tokens: agent.chat_max_tokens || 2048,
                json_mode: true
            });

            let decision;
            try {
                decision = JSON.parse(completion.content);
            } catch (e) {
                console.error('Failed to parse LLM response:', e.message);
                decision = {
                    action: this.constructor.ACTIONS.INLINE_ANSWER,
                    response: completion.content || 'I apologize, could you please rephrase that?'
                };
            }

            decision._cost = completion.cost;
            decision._model = completion.model;

            return decision;

        } catch (error) {
            console.error('LLM call failed:', error);
            return {
                action: this.constructor.ACTIONS.INLINE_ANSWER,
                response: 'I apologize, I\'m having trouble processing your request. Please try again.',
                _error: error.message
            };
        }
    }

    /**
     * Build system prompt for LLM
     */
    _buildSystemPrompt(context) {
        const flowsDescription = context.available_flows
            .map(function(f) { return '- ' + f.id + ': ' + f.description; })
            .join('\n');

        let activeFlowInfo = '\nNo active flow.';
        if (context.active_flow) {
            // Sanitize params to remove base64 images (they cause token overflow)
            const sanitizedParams = this._sanitizeParamsForContext(context.active_flow.params_collected || {});
            activeFlowInfo = '\nACTIVE FLOW: ' + context.active_flow.flow_id + 
                ' at step ' + (context.active_flow.current_step || 'start') +
                '\nCollected params: ' + JSON.stringify(sanitizedParams);
        }

        let pausedFlowsInfo = '';
        if (context.paused_flows.length > 0) {
            pausedFlowsInfo = '\nPAUSED FLOWS: ' + context.paused_flows.map(function(f) { return f.flow_id; }).join(', ');
        }

        let memoryInfo = '';
        if (Object.keys(context.context_memory || {}).length > 0) {
            // Sanitize context memory too (in case images got stored there)
            const sanitizedMemory = this._sanitizeParamsForContext(context.context_memory);
            memoryInfo = '\nCONTEXT MEMORY: ' + JSON.stringify(sanitizedMemory);
        }
        
        // Customer context for personalization and channel-aware responses
        let customerInfo = '';
        if (context.customer) {
            const c = context.customer;
            customerInfo = '\nCUSTOMER CONTEXT:';
            customerInfo += '\n- Channel: ' + (c.channel || 'unknown');
            if (c.name) customerInfo += '\n- Name: ' + c.name;
            if (c.phone) customerInfo += '\n- Phone: ' + c.phone;
            if (c.email) customerInfo += '\n- Email: ' + c.email;
        }
        
        let kbInfo = '';
        if (context.kb_results && context.kb_results.length > 0) {
            kbInfo = '\n\nKNOWLEDGE BASE RESULTS (use this to answer):\n' + 
                context.kb_results.map(function(r) { return '- ' + (r.content || r.text || ''); }).join('\n');
        }

        return context.instructions + '\n\n' +
'You are a conversational AI that routes customer messages to the appropriate flow.\n\n' +
'AVAILABLE FLOWS:\n' + flowsDescription + '\n' +
activeFlowInfo + pausedFlowsInfo + memoryInfo + customerInfo + kbInfo + '\n\n' +
'OUTPUT FORMAT: Respond ONLY with valid JSON (RFC 8259). No markdown, no code blocks, no explanations.\n\n' +
'JSON SCHEMA:\n' +
'{\n' +
'  "action": "START_FLOW | CONTINUE_FLOW | SWITCH_FLOW | INLINE_ANSWER | COMPLETE_FLOW | ABANDON_FLOW | EXECUTE_FUNCTION | ASK_CLARIFICATION",\n' +
'  "flow_id": "string or null - flow ID if starting/switching",\n' +
'  "response": "string - your natural language response to the customer in their language",\n' +
'  "detected_language": "string - the language customer is speaking: English, Urdu, Roman Urdu, Hindi, etc. Default to English if unclear",\n' +
'  "search_kb": false,\n' +
'  "kb_search": {\n' +
'    "needed": false,\n' +
'    "original_language": "string - detected language of user message (en/ur/roman_urdu/etc)",\n' +
'    "query_english": "string - user query translated to English for search",\n' +
'    "search_keywords": ["array", "of", "keywords", "for", "search"]\n' +
'  },\n' +
'  "extracted": {\n' +
'    "order_numbers": [],\n' +
'    "phone_numbers": [],\n' +
'    "email": null,\n' +
'    "sentiment": "neutral | frustrated | happy"\n' +
'  },\n' +
'  "execute_function": {\n' +
'    "name": "function_name",\n' +
'    "params": { "param1": "value1" }\n' +
'  },\n' +
'  "session_action": "NONE | SOFT_CLOSE | HARD_CLOSE"\n' +
'}\n\n' +
'EXTRACTION RULES (CRITICAL):\n' +
'1. phone_numbers: Numbers starting with 03, +92, 92, or 00 followed by 9-10 digits (Pakistani phones)\n' +
'   - Examples: 03214407521, +923001234567, 923001234567 → phone_numbers\n' +
'2. order_numbers: Alphanumeric codes like CZ-247020, #247020, or short numbers (5-6 digits) mentioned as "order"\n' +
'   - Examples: CZ-247020, 247020, #12345 → order_numbers\n' +
'3. If user says "phone" or "number" with a 03/+92 number → phone_numbers\n' +
'4. If user says "order" with a number → order_numbers\n' +
'5. email: Any valid email address\n' +
'6. ALWAYS extract ALL identifiable data from messages, even if not immediately needed\n\n' +
'INTELLIGENT FLOW EXECUTION:\n' +
'1. If user provides multiple pieces of info at once, extract ALL and use the most specific for lookup\n' +
'2. If you have ALL required data for a function, use execute_function to call it directly:\n' +
'   {"execute_function": {"name": "check_order_status", "params": {"order_identifier": "CZ-247020"}}}\n' +
'3. Skip redundant collection steps when data is already available in extracted or context_memory\n' +
'4. For ORDER lookups: order_number > phone > email (in order of specificity)\n' +
'5. NEVER ask for data that was already provided in the current or previous messages\n\n' +
'IMAGE HANDLING:\n' +
'1. If image shows order confirmation/receipt/tracking → extract order_number and lookup directly\n' +
'2. If image shows product damage → this is complaint_evidence, continue complaint flow\n' +
'3. If image shows product → this is product_search intent\n' +
'4. When extracting order number from image, put it in extracted.order_numbers\n\n' +
'LANGUAGE DETECTION:\n' +
'1. Detect the customer\'s language from their message and set "detected_language"\n' +
'2. Roman Urdu examples: "mujhe order status chahiye", "kya hal hai", "order kab aye ga"\n' +
'3. If message is just numbers/order IDs, use the language from conversation history or default to English\n' +
'4. Your "response" MUST be in the detected_language\n\n' +
'KB SEARCH RULES:\n' +
'1. Set search_kb=true and fill kb_search object when user asks about: policies, procedures, product info, pricing, shipping, returns, exchanges, store info, or anything not in your instructions\n' +
'2. If user message is NOT in English, translate it to English in kb_search.query_english\n' +
'3. Extract 3-5 relevant search_keywords in English for semantic search\n' +
'4. If KB results are provided above, use them to answer - do NOT set search_kb=true again\n\n' +
'CONVERSATION RULES:\n' +
'1. If user is mid-flow, continue unless they clearly want to switch\n' +
'2. If user asks about something else mid-flow, consider SWITCH_FLOW (pause current, can resume later)\n' +
'3. For simple questions mid-flow, use INLINE_ANSWER without switching\n' +
'4. If user asks to go back or resume previous topic, check paused_flows\n' +
'5. Use SOFT_CLOSE when user says thanks/bye after resolution\n' +
'6. Use HARD_CLOSE only when user explicitly requests to end\n' +
'7. ALWAYS respond in the detected_language - match the customer\'s language exactly\n' +
'8. Be adaptive - if user provides unexpected info, work with it rather than following rigid script';
    }

    /**
     * Build user message for LLM
     */
    _buildUserMessage(context) {
        if (context.images && context.images.length > 0) {
            var content = [
                { type: 'text', text: context.message || 'Image shared' }
            ];
            for (var i = 0; i < context.images.length; i++) {
                content.push({
                    type: 'image_url',
                    image_url: { url: context.images[i], detail: 'high' }
                });
            }
            return { role: 'user', content: content };
        }

        return { role: 'user', content: context.message };
    }

    /**
     * Process LLM decision
     */
    async _processLLMDecision(session, agent, decision, bufferedData) {
        const action = decision.action || this.constructor.ACTIONS.INLINE_ANSWER;

        console.log('LLM Decision: ' + action + (decision.flow_id ? ' -> ' + decision.flow_id : ''));

        var result = {
            status: 'success',
            action: action,
            response: {
                text: decision.response || '',
                html: this._formatHtml(decision.response || '')
            }
        };

        switch (action) {
            case this.constructor.ACTIONS.START_FLOW:
                if (decision.flow_id) {
                    var flowResult = await this.executor.startFlow(
                        session.id,
                        decision.flow_id,
                        decision.extracted || {},
                        agent
                    );
                    result.flow = flowResult;
                    
                    // Handle auto-executed function results
                    if (flowResult.needs_llm_response && flowResult.llm_context) {
                        const llmResponse = await this._generateFunctionResponse(
                            flowResult.llm_context,
                            session,
                            agent,
                            bufferedData
                        );
                        result.response.text = llmResponse.text;
                        result.response.html = this._formatHtml(llmResponse.text);
                        if (llmResponse.cost) {
                            result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                        }
                    } else if (flowResult.message_to_send) {
                        // Message step was executed - use its text
                        result.response.text = flowResult.message_to_send;
                        result.response.html = this._formatHtml(result.response.text);
                        // Append completion message if flow also completed
                        if (flowResult.status === 'flow_completed' && flowResult.completion_message) {
                            result.response.text += '\n\n' + flowResult.completion_message;
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } else if (flowResult.status === 'flow_completed' && flowResult.completion_message) {
                        // Flow completed with a completion message
                        result.response.text = flowResult.completion_message;
                        result.response.html = this._formatHtml(result.response.text);
                    } else if (flowResult.status === 'awaiting_input' && flowResult.prompt) {
                        // Flow is waiting for user input, show the prompt
                        result.response.text = flowResult.prompt;
                        result.response.html = this._formatHtml(result.response.text);
                    }
                }
                break;

            case this.constructor.ACTIONS.SWITCH_FLOW:
                if (session.active_flow) {
                    await SessionStateService.pauseCurrentFlow(session.id, 'user_switched');
                }
                if (decision.flow_id) {
                    var flowResult2 = await this.executor.startFlow(
                        session.id,
                        decision.flow_id,
                        decision.extracted || {},
                        agent
                    );
                    result.flow = flowResult2;
                    
                    // Handle auto-executed function results
                    if (flowResult2.needs_llm_response && flowResult2.llm_context) {
                        const llmResponse = await this._generateFunctionResponse(
                            flowResult2.llm_context,
                            session,
                            agent,
                            bufferedData
                        );
                        result.response.text = llmResponse.text;
                        result.response.html = this._formatHtml(llmResponse.text);
                        if (llmResponse.cost) {
                            result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                        }
                    } else if (flowResult2.message_to_send) {
                        // Message step was executed - use its text
                        result.response.text = flowResult2.message_to_send;
                        result.response.html = this._formatHtml(result.response.text);
                        if (flowResult2.status === 'flow_completed' && flowResult2.completion_message) {
                            result.response.text += '\n\n' + flowResult2.completion_message;
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } else if (flowResult2.status === 'flow_completed' && flowResult2.completion_message) {
                        result.response.text = flowResult2.completion_message;
                        result.response.html = this._formatHtml(result.response.text);
                    } else if (flowResult2.status === 'awaiting_input' && flowResult2.prompt) {
                        // PRIORITIZE flow's configured prompt over LLM response for collect steps
                        result.response.text = flowResult2.prompt;
                        result.response.html = this._formatHtml(result.response.text);
                    }
                }
                break;

            case this.constructor.ACTIONS.CONTINUE_FLOW:
                // Check if LLM wants to switch to a different flow
                const wantsDifferentFlow = decision.flow_id && 
                    session.active_flow && 
                    session.active_flow.flow_id !== decision.flow_id;
                
                if (wantsDifferentFlow) {
                    // LLM wants to switch flows - abandon current and start new
                    console.log(`🔀 Switching from flow ${session.active_flow.flow_id} to ${decision.flow_id}`);
                    await SessionStateService.abandonFlow(session.id);
                    
                    var flowResultSwitch = await this.executor.startFlow(
                        session.id,
                        decision.flow_id,
                        decision.extracted || {},
                        agent
                    );
                    result.flow = flowResultSwitch;
                    
                    // Handle flow result
                    if (flowResultSwitch.needs_llm_response && flowResultSwitch.llm_context) {
                        const llmResponse = await this._generateFunctionResponse(
                            flowResultSwitch.llm_context,
                            session,
                            agent,
                            bufferedData
                        );
                        result.response.text = llmResponse.text;
                        result.response.html = this._formatHtml(result.response.text);
                        if (llmResponse.cost) {
                            result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                        }
                    } else if (flowResultSwitch.message_to_send) {
                        result.response.text = flowResultSwitch.message_to_send;
                        result.response.html = this._formatHtml(result.response.text);
                        if (flowResultSwitch.status === 'flow_completed' && flowResultSwitch.completion_message) {
                            result.response.text += '\n\n' + flowResultSwitch.completion_message;
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } else if (flowResultSwitch.status === 'flow_completed' && flowResultSwitch.completion_message) {
                        result.response.text = flowResultSwitch.completion_message;
                        result.response.html = this._formatHtml(result.response.text);
                    } else if (flowResultSwitch.status === 'awaiting_input' && flowResultSwitch.prompt) {
                        result.response.text = flowResultSwitch.prompt;
                        result.response.html = this._formatHtml(result.response.text);
                    }
                } else if (session.active_flow) {
                    var flowResult3 = await this.executor.processFlowInput(
                        session.id,
                        {
                            message: bufferedData.combinedMessage,
                            images: bufferedData.images,
                            extracted: decision.extracted || {}
                        },
                        agent
                    );
                    result.flow = flowResult3;

                    // Handle flow result
                    if (flowResult3.needs_llm_response && flowResult3.llm_context) {
                        const llmResponse = await this._generateFunctionResponse(
                            flowResult3.llm_context,
                            session,
                            agent,
                            bufferedData
                        );
                        result.response.text = llmResponse.text;
                        result.response.html = this._formatHtml(result.response.text);
                        if (llmResponse.cost) {
                            result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                        }
                    } else if (flowResult3.message_to_send) {
                        result.response.text = flowResult3.message_to_send;
                        result.response.html = this._formatHtml(result.response.text);
                        if (flowResult3.status === 'flow_completed' && flowResult3.completion_message) {
                            result.response.text += '\n\n' + flowResult3.completion_message;
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } else if (flowResult3.status === 'flow_completed' && flowResult3.completion_message) {
                        result.response.text = flowResult3.completion_message;
                        result.response.html = this._formatHtml(result.response.text);
                    } else if (flowResult3.status === 'awaiting_input' && flowResult3.prompt) {
                        result.response.text = flowResult3.prompt;
                        result.response.html = this._formatHtml(result.response.text);
                    }
                } else if (decision.flow_id) {
                    // No active flow but LLM wants to continue - restart the flow
                    console.log(`🔄 No active flow, restarting flow ${decision.flow_id}`);
                    var flowResult3b = await this.executor.startFlow(
                        session.id,
                        decision.flow_id,
                        decision.extracted || {},
                        agent
                    );
                    result.flow = flowResult3b;
                    
                    // Handle flow result
                    if (flowResult3b.needs_llm_response && flowResult3b.llm_context) {
                        const llmResponse = await this._generateFunctionResponse(
                            flowResult3b.llm_context,
                            session,
                            agent,
                            bufferedData
                        );
                        result.response.text = llmResponse.text;
                        result.response.html = this._formatHtml(result.response.text);
                        if (llmResponse.cost) {
                            result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                        }
                    } else if (flowResult3b.message_to_send) {
                        result.response.text = flowResult3b.message_to_send;
                        result.response.html = this._formatHtml(result.response.text);
                        if (flowResult3b.status === 'flow_completed' && flowResult3b.completion_message) {
                            result.response.text += '\n\n' + flowResult3b.completion_message;
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } else if (flowResult3b.status === 'flow_completed' && flowResult3b.completion_message) {
                        result.response.text = flowResult3b.completion_message;
                        result.response.html = this._formatHtml(result.response.text);
                    } else if (flowResult3b.status === 'awaiting_input' && flowResult3b.prompt) {
                        result.response.text = flowResult3b.prompt;
                        result.response.html = this._formatHtml(result.response.text);
                    }
                }
                break;

            case this.constructor.ACTIONS.COMPLETE_FLOW:
                if (session.active_flow) {
                    await SessionStateService.completeFlow(session.id, decision.extracted);
                }
                if (decision.prompt_for_resume && session.paused_flows && session.paused_flows.length > 0) {
                    var pausedFlow = session.paused_flows[session.paused_flows.length - 1];
                    result.pending_resume = {
                        flow_id: pausedFlow.flow_id,
                        step: pausedFlow.current_step
                    };
                }
                break;

            case this.constructor.ACTIONS.ABANDON_FLOW:
                await SessionStateService.abandonFlow(session.id);
                await SessionStateService.clearPausedFlows(session.id);
                break;

            case this.constructor.ACTIONS.EXECUTE_FUNCTION:
                if (decision.execute_function) {
                    console.log('⚡ Direct function execution:', decision.execute_function.name);
                    
                    try {
                        var funcResult = await this.executor.executeFunction(
                            decision.execute_function.name,
                            decision.execute_function.params,
                            agent,
                            session
                        );
                        result.function_result = funcResult;
                        result.direct_execution = true;
                        
                        // Generate response for function result
                        if (funcResult && !funcResult.error) {
                            // Build context for response generation
                            const llmContext = {
                                function_name: decision.execute_function.name,
                                function_result: funcResult,
                                response_instructions: decision.response_instructions || null
                            };
                            
                            const llmResponse = await this._generateFunctionResponse(
                                llmContext,
                                session,
                                agent,
                                bufferedData
                            );
                            
                            result.response.text = llmResponse.text;
                            result.response.html = this._formatHtml(llmResponse.text);
                            if (llmResponse.cost) {
                                result.cost = this._mergeCosts(result.cost, llmResponse.cost);
                            }
                        } else if (funcResult?.error) {
                            // Function returned an error
                            result.response.text = decision.response || 'I encountered an issue processing your request. Please try again or provide more details.';
                            result.response.html = this._formatHtml(result.response.text);
                        }
                    } catch (funcError) {
                        console.error('❌ Function execution error:', funcError);
                        result.function_error = funcError.message;
                        result.response.text = decision.response || 'I encountered an issue. Let me try a different approach.';
                        result.response.html = this._formatHtml(result.response.text);
                    }
                }
                break;

            case this.constructor.ACTIONS.ASK_CLARIFICATION:
                // Response already contains the clarification question
                break;

            case this.constructor.ACTIONS.INLINE_ANSWER:
            default:
                // Response already set
                break;
        }

        // Add KB search if needed
        if (decision.search_kb && decision.kb_query) {
            result.kb_search = {
                needed: true,
                query: decision.kb_query
            };
        }

        // Add cost info
        if (decision._cost) {
            result.cost = decision._cost;
        }
        if (decision._model) {
            result.model = decision._model;
        }

        return result;
    }

    /**
     * Generate LLM response for function result
     * Used when a flow function step has auto_respond enabled
     */
    async _generateFunctionResponse(llmContext, session, agent, bufferedData) {
        const { function_name, function_result, error, response_instructions } = llmContext;
        
        console.log('🤖 Generating LLM response for function result:', {
            function: function_name,
            has_result: !!function_result,
            has_error: !!error,
            has_instructions: !!response_instructions
        });

        // Get stored language from session context memory (set by first LLM call)
        // Fall back to keyword detection only if not stored
        let detectedLanguage = session.context_memory?.detected_language;
        
        if (!detectedLanguage) {
            // Fallback: detect from conversation history - USER MESSAGES ONLY
            const history = await this._getRecentHistory(session.id, 5);
            // IMPORTANT: Only use USER messages for language detection, not assistant responses
            const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
            const currentMessage = bufferedData?.combinedMessage || '';
            // Put current message first (most relevant), then recent user messages
            const allUserText = [currentMessage, ...userMessages].filter(Boolean).join(' ');
            detectedLanguage = this._detectLanguage(allUserText);
        }
        
        // If still unclear and current message is clearly English, use English
        const currentMsg = bufferedData?.combinedMessage || '';
        if (currentMsg && /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(currentMsg.trim()) && currentMsg.length > 5) {
            // Current message is purely English characters
            detectedLanguage = 'English';
        }
        
        console.log('🤖 Using language for response:', { 
            storedLanguage: session.context_memory?.detected_language,
            finalLanguage: detectedLanguage
        });

        // Build a focused prompt for response generation
        let systemPrompt = `You are a helpful customer service assistant for ${agent.name || 'our company'}.

CRITICAL LANGUAGE RULE:
You MUST respond in ${detectedLanguage.toUpperCase()}. The customer has been communicating in ${detectedLanguage}, so your entire response must be in ${detectedLanguage}. Do NOT mix languages or switch to another language.

RESPONSE GUIDELINES:
1. Be conversational, friendly, and helpful
2. Include all relevant details from the function result
3. If there's an error, apologize and offer alternatives
4. Keep the response concise but complete
`;

        if (response_instructions) {
            systemPrompt += `\nADDITIONAL INSTRUCTIONS:\n${response_instructions}\n`;
        }
        
        // Handle next step prompt - CRITICAL: must be included in response
        const next_step_prompt = llmContext.next_step_prompt;
        if (next_step_prompt) {
            systemPrompt += `\nCRITICAL - NEXT STEP:
You MUST end your response by asking: "${next_step_prompt}"
This is required to continue the flow. Do not skip this.\n`;
        }

        if (error) {
            systemPrompt += `\nFUNCTION ERROR:\nThe function "${function_name}" failed with error: ${error}\nApologize to the customer and offer to help in another way.`;
        } else {
            systemPrompt += `\nFUNCTION RESULT (${function_name}):\n${JSON.stringify(function_result, null, 2)}`;
        }

        try {
            const LLMService = require('../LLMService');
            
            // Get conversation history for context
            const history = await this._getRecentHistory(session.id, 5);
            
            // Build messages with actual conversation history for better context
            const messages = [
                { role: 'system', content: systemPrompt }
            ];
            
            // Add recent conversation history (last 3 exchanges)
            const recentHistory = history.slice(-6);
            for (const msg of recentHistory) {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
            
            // Add final instruction
            messages.push({ 
                role: 'user', 
                content: `Based on the function result above, provide a helpful response to the customer. Remember: respond ONLY in ${detectedLanguage}.` 
            });
            
            const completion = await LLMService.chat(messages, {
                model: agent.model || 'openai/gpt-4o-mini',
                temperature: 0.7,
                max_tokens: 500
            });

            console.log('🤖 Function response generated:', {
                length: completion.content?.length,
                cost: completion.cost?.final_cost
            });

            return {
                text: completion.content || 'I found the information you requested.',
                cost: completion.cost
            };

        } catch (error) {
            console.error('Error generating function response:', error);
            return {
                text: error ? 
                    'I apologize, but I encountered an issue. Please try again or contact support.' :
                    'Here is the information you requested.',
                cost: null
            };
        }
    }
    
    /**
     * Detect language from text
     * Uses word boundary matching and scoring to avoid false positives
     */
    _detectLanguage(text) {
        if (!text || text.trim().length === 0) return 'English';
        
        const lowerText = text.toLowerCase();
        
        // Check for Arabic/Urdu script first (definitive)
        if (/[\u0600-\u06FF]/.test(text)) {
            return 'Urdu';
        }
        
        // Common English words (to detect English context)
        const englishWords = [
            'help', 'find', 'check', 'want', 'need', 'please', 'thank', 'thanks',
            'order', 'status', 'track', 'tracking', 'delivery', 'where', 'when',
            'what', 'how', 'can', 'could', 'would', 'should', 'will', 'have',
            'the', 'my', 'your', 'this', 'that', 'with', 'for', 'and', 'but'
        ];
        
        // Urdu words in Roman script (must use word boundaries to avoid false matches)
        const urduWords = [
            'mujhe', 'mujhay', 'mera', 'meri', 'mere', 'hain', 'kya', 'kaise', 
            'kab', 'kahan', 'kyun', 'aur', 'nahi', 'nhi', 'haan', 'han', 'jee', 'ji',
            'aap', 'tum', 'hum', 'woh', 'yeh', 'iska', 'uska', 'apna', 'apni',
            'tha', 'thi', 'the', 'hoga', 'hogi', 'hona', 'karo', 'karna', 'karein',
            'raha', 'rahi', 'rahe', 'wala', 'wali', 'wale', 'chahiye', 'chahte',
            'sakta', 'sakti', 'sakte', 'dena', 'lena', 'jana', 'aana', 'baat',
            'batao', 'bataye', 'bataiye', 'bolo', 'boliye', 'sunao', 'dekhao',
            'chata', 'chati', 'chahta', 'chahti', 'hon', 'hoon', 'hun',
            'maloom', 'pata', 'janana', 'janna', 'dekho', 'suno', 'karo',
            'abhi', 'pehle', 'baad', 'phir', 'lekin', 'magar', 'agar', 'toh',
            'kiun', 'kion', 'kaisay', 'kaisa', 'kaisi', 'kitna', 'kitni', 'kitne'
        ];
        
        // Count matches with word boundaries
        let urduScore = 0;
        let englishScore = 0;
        
        for (const word of urduWords) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(lowerText)) {
                urduScore++;
            }
        }
        
        for (const word of englishWords) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(lowerText)) {
                englishScore++;
            }
        }
        
        console.log('🌐 Language scoring:', { urduScore, englishScore, sample: lowerText.substring(0, 50) });
        
        // Need at least 2 Urdu words AND more Urdu than English to classify as Urdu
        if (urduScore >= 2 && urduScore > englishScore) {
            return 'Urdu';
        }
        
        // Default to English
        return 'English';
    }

    /**
     * Get recent conversation history
     */
    async _getRecentHistory(sessionId, limit) {
        try {
            const [messages] = await db.query(
                'SELECT role, content FROM yovo_tbl_aiva_chat_messages ' +
                'WHERE session_id = ? ORDER BY created_at DESC LIMIT ?',
                [sessionId, limit * 2]
            );

            // Reverse to get chronological order and format
            return messages.reverse().map(function(m) {
                return {
                    role: m.role === 'assistant' ? 'assistant' : 'user',
                    content: m.content
                };
            });
        } catch (error) {
            console.error('Error fetching history:', error);
            return [];
        }
    }

    /**
     * Get agent by ID
     */
    async _getAgent(agentId) {
        try {
            const [agents] = await db.query(
                'SELECT * FROM yovo_tbl_aiva_agents WHERE id = ?',
                [agentId]
            );

            if (agents.length === 0) {
                return null;
            }

            var agent = agents[0];

            // Parse JSON fields
            var jsonFields = ['greetings', 'endings', 'supported_languages', 'functions'];
            for (var i = 0; i < jsonFields.length; i++) {
                var field = jsonFields[i];
                if (agent[field] && typeof agent[field] === 'string') {
                    try {
                        agent[field] = JSON.parse(agent[field]);
                    } catch (e) {
                        agent[field] = null;
                    }
                }
            }

            return agent;
        } catch (error) {
            console.error('Error fetching agent:', error);
            return null;
        }
    }

    /**
     * Format text as HTML
     */
    _formatHtml(text) {
        if (!text) return '';
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }
}

// Export singleton instance
module.exports = new FlowEngine();

// Also export class
module.exports.FlowEngine = FlowEngine;