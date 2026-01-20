/**
 * Image Flow Bridge
 * 
 * PHASE 4: Image → Flow Integration
 * 
 * Bridges image classification with flow execution:
 * 1. Classifies image intent (order screenshot, complaint, product search)
 * 2. Extracts relevant data from image (order numbers, etc.)
 * 3. Can trigger flow functions directly with extracted data
 * 4. Integrates with existing flow state
 */

const LLMService = require('../LLMService');

class ImageFlowBridge {

    /**
     * Image intent types that can trigger flows
     */
    static INTENTS = {
        ORDER_SCREENSHOT: 'order_screenshot',
        COMPLAINT_EVIDENCE: 'complaint_evidence',
        PRODUCT_SEARCH: 'product_search',
        GENERAL: 'general'
    };

    /**
     * Default action mappings
     */
    static DEFAULT_ACTIONS = {
        order_screenshot: {
            action: 'invoke_function',
            function: 'check_order_status',
            extract_fields: ['order_number'],
            param_mapping: { order_identifier: '{{order_number}}' }
        },
        complaint_evidence: {
            action: 'continue_flow',
            target_flow: 'complaint',
            collect_image: true
        },
        product_search: {
            action: 'invoke_function',
            function: 'search_products',
            use_image: true
        }
    };

    /**
     * Process image and determine flow action
     * 
     * @param {string} imageUrl - URL of the image
     * @param {string} userMessage - Accompanying text message
     * @param {object} session - Current session state
     * @param {object} agent - Agent configuration
     * @param {array} history - Conversation history
     * @returns {object} { intent, action, extractedData, flowAction }
     */
    static async processImage(imageUrl, userMessage, session, agent, history = []) {
        console.log('🖼️ ImageFlowBridge: Processing image...');

        // Step 1: Classify intent and extract data in one call
        const classification = await this._classifyAndExtract(
            imageUrl, 
            userMessage, 
            session, 
            agent, 
            history
        );

        console.log('🖼️ Image classification:', classification);

        // Step 2: Determine flow action based on classification
        const flowAction = await this._determineFlowAction(
            classification, 
            session, 
            agent
        );

        return {
            intent: classification.intent,
            confidence: classification.confidence,
            extractedData: classification.extracted,
            flowAction,
            skipRegularProcessing: flowAction.skipRegular || false
        };
    }

    /**
     * Classify image intent and extract relevant data
     */
    static async _classifyAndExtract(imageUrl, userMessage, session, agent, history) {
        // Build context from recent history
        const recentHistory = history.slice(-5).map(m => ({
            role: m.role,
            content: (m.content || '').substring(0, 200)
        }));

        // Check for active flows that might influence interpretation
        const activeFlowContext = session.active_flow 
            ? `Active flow: ${session.active_flow.flow_id} at step ${session.active_flow.current_step}`
            : 'No active flow';

        const prompt = `Analyze this image in the context of an e-commerce customer service chat.

CONVERSATION CONTEXT:
${recentHistory.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

USER'S MESSAGE WITH IMAGE: "${userMessage || '[no text]'}"

${activeFlowContext}

TASK: Classify the image AND extract any relevant data.

IMAGE CLASSIFICATION (pick ONE):
A) order_screenshot - Screenshot showing order confirmation, invoice, receipt, tracking, delivery notification
   - Look for: Order numbers (CZ-XXXXX, #XXXXX), dates, amounts, tracking info
   
B) complaint_evidence - Photo showing a problem with a received product
   - Look for: Damage, defects, wrong item, quality issues
   
C) product_search - User wants to find similar products
   - Product photo for search/matching
   
D) general - None of the above

DATA EXTRACTION:
- If order_screenshot: Extract any visible order numbers, tracking numbers, dates
- If complaint_evidence: Describe the visible issue
- If product_search: Describe the product for search

Respond in JSON:
{
  "intent": "order_screenshot | complaint_evidence | product_search | general",
  "confidence": "high | medium | low",
  "reasoning": "brief explanation",
  "extracted": {
    "order_numbers": ["CZ-XXXXX"],     // if visible
    "tracking_number": "LEXXXXXXX",     // if visible
    "issue_description": "...",         // for complaints
    "product_description": "..."        // for product search
  }
}`;

        try {
            const response = await LLMService.chat([
                { 
                    role: 'user', 
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ], {
                model: 'gpt-4o',  // Vision model
                temperature: 0.3,
                max_tokens: 500,
                json_mode: true
            });

            const result = JSON.parse(response.content);
            result._cost = response.cost;
            return result;

        } catch (error) {
            console.error('Image classification error:', error);
            return {
                intent: 'general',
                confidence: 'low',
                reasoning: 'Classification failed',
                extracted: {},
                _error: error.message
            };
        }
    }

    /**
     * Determine what flow action to take based on classification
     */
    static async _determineFlowAction(classification, session, agent) {
        const intent = classification.intent;
        const extracted = classification.extracted || {};

        // Get action mapping from agent config or use defaults
        const actionConfig = agent.image_flow_actions?.[intent] || 
                            this.DEFAULT_ACTIONS[intent];

        if (!actionConfig) {
            return { 
                action: 'none', 
                skipRegular: false,
                reason: 'no_action_configured'
            };
        }

        // Build flow action based on config
        switch (actionConfig.action) {
            case 'invoke_function':
                return this._buildFunctionInvocation(actionConfig, extracted, session);

            case 'start_flow':
                return this._buildFlowStart(actionConfig, extracted, session);

            case 'continue_flow':
                return this._buildFlowContinuation(actionConfig, extracted, session);

            default:
                return { action: 'none', skipRegular: false };
        }
    }

    /**
     * Build function invocation action
     */
    static _buildFunctionInvocation(config, extracted, session) {
        const functionName = config.function;
        const params = {};

        // Map extracted data to function parameters
        if (config.param_mapping) {
            for (const [param, mapping] of Object.entries(config.param_mapping)) {
                // Replace {{field}} with extracted value
                const fieldMatch = mapping.match(/\{\{(\w+)\}\}/);
                if (fieldMatch) {
                    const field = fieldMatch[1];
                    // Handle arrays (like order_numbers)
                    const value = Array.isArray(extracted[field]) 
                        ? extracted[field][0] 
                        : extracted[field];
                    if (value) {
                        params[param] = value;
                    }
                }
            }
        }

        // Check if we have enough data to invoke
        const hasRequiredParams = Object.keys(params).length > 0 || config.use_image;

        if (!hasRequiredParams) {
            return {
                action: 'insufficient_data',
                function: functionName,
                missing: config.extract_fields,
                skipRegular: false,
                fallback: 'ask_for_data'
            };
        }

        return {
            action: 'invoke_function',
            function: functionName,
            params,
            skipRegular: true,  // Skip regular flow processing
            extracted
        };
    }

    /**
     * Build flow start action
     */
    static _buildFlowStart(config, extracted, session) {
        // Don't start if already in the target flow
        if (session.active_flow?.flow_id?.includes(config.target_flow)) {
            return this._buildFlowContinuation(config, extracted, session);
        }

        return {
            action: 'start_flow',
            flow_id: config.target_flow,
            initial_params: extracted,
            skipRegular: true
        };
    }

    /**
     * Build flow continuation action
     */
    static _buildFlowContinuation(config, extracted, session) {
        return {
            action: 'continue_flow',
            add_data: extracted,
            collect_image: config.collect_image || false,
            skipRegular: false  // Let flow engine handle it
        };
    }

    /**
     * Extract order number from image using OCR-focused prompt
     * 
     * More focused extraction when we specifically need order number
     */
    static async extractOrderNumber(imageUrl) {
        const prompt = `Extract the ORDER NUMBER from this image.

Look for patterns like:
- CZ-XXXXXX (e.g., CZ-247020)
- Order #XXXXXX
- #XXXXXX
- Order Number: XXXXXX

Respond with JSON:
{
  "found": true/false,
  "order_number": "CZ-XXXXXX" or null,
  "confidence": "high/medium/low",
  "all_numbers_found": ["list", "of", "all", "potential", "order", "numbers"]
}`;

        try {
            const response = await LLMService.chat([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ], {
                model: 'gpt-4o',
                temperature: 0.1,
                max_tokens: 200,
                json_mode: true
            });

            return {
                ...JSON.parse(response.content),
                _cost: response.cost
            };

        } catch (error) {
            console.error('Order number extraction error:', error);
            return {
                found: false,
                order_number: null,
                confidence: 'low',
                error: error.message
            };
        }
    }

    /**
     * Quick check if image likely contains order info
     * Uses cheaper model for initial screening
     */
    static async quickScreenOrderImage(imageUrl) {
        const prompt = `Does this image show an order confirmation, receipt, invoice, or tracking screenshot?
Answer only: YES or NO`;

        try {
            const response = await LLMService.chat([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }
            ], {
                model: 'gpt-4o-mini',  // Cheaper model for screening
                temperature: 0,
                max_tokens: 10
            });

            const answer = response.content.trim().toUpperCase();
            return {
                isOrderImage: answer.includes('YES'),
                _cost: response.cost
            };

        } catch (error) {
            return { isOrderImage: false, error: error.message };
        }
    }
}

module.exports = ImageFlowBridge;