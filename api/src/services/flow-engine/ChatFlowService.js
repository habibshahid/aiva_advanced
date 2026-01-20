/**
 * Chat Flow Service
 * 
 * CRUD operations for conversation flows (yovo_tbl_aiva_flows).
 * Separate from IVR FlowService to handle chat-specific flows.
 * 
 * Flow Types:
 * - system: Built-in flows (general, kb_search, handoff, clarify_image)
 * - integration: Auto-created when integration connected (Shopify order_status, etc.)
 * - custom: User-created flows
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

class ChatFlowService {

    /**
     * Flow type constants
     */
    static TYPES = {
        SYSTEM: 'system',
        INTEGRATION: 'integration',
        CUSTOM: 'custom'
    };

    /**
     * System flow IDs (always present)
     */
    static SYSTEM_FLOWS = {
        GENERAL: '_general',
        KB_SEARCH: '_kb_search',
        HANDOFF: '_handoff',
        CLARIFY_IMAGE: '_clarify_image'
    };

    // ========================================================================
    // FLOW CRUD
    // ========================================================================

    /**
     * List all flows for an agent
     * 
     * @param {string} agentId - Agent ID
     * @param {boolean} activeOnly - Only return active flows
     */
    static async listFlows(agentId, activeOnly = true) {
        try {
            let query = `
                SELECT * FROM yovo_tbl_aiva_flows
                WHERE agent_id = ?
            `;
            
            if (activeOnly) {
                query += ` AND is_active = 1`;
            }
            
            query += ` ORDER BY 
                CASE type 
                    WHEN 'system' THEN 1 
                    WHEN 'integration' THEN 2 
                    WHEN 'custom' THEN 3 
                END,
                priority DESC,
                created_at ASC`;

            const [flows] = await db.query(query, [agentId]);
            
            return flows.map(f => this._parseFlowJson(f));
        } catch (error) {
            console.error('Error in ChatFlowService.listFlows:', error);
            return [];
        }
    }

    /**
     * Get flow by ID
     */
    static async getFlow(flowId) {
        try {
            const [flows] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_flows WHERE id = ?`,
                [flowId]
            );

            if (flows.length === 0) {
                return null;
            }

            return this._parseFlowJson(flows[0]);
        } catch (error) {
            console.error('Error in ChatFlowService.getFlow:', error);
            return null;
        }
    }

    /**
     * Get flow by agent and flow name/id
     */
    static async getFlowByName(agentId, flowName) {
        try {
            const [flows] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_flows 
                 WHERE agent_id = ? AND (id = ? OR name = ?) AND is_active = 1`,
                [agentId, flowName, flowName]
            );

            if (flows.length === 0) {
                return null;
            }

            return this._parseFlowJson(flows[0]);
        } catch (error) {
            console.error('Error in ChatFlowService.getFlowByName:', error);
            return null;
        }
    }

    /**
     * Create a new flow
     */
    static async createFlow(agentId, flowData) {
        try {
            const id = flowData.id || uuidv4();
            
            // Validate flow config
            const config = this._validateFlowConfig(flowData.config || {});

            await db.query(
                `INSERT INTO yovo_tbl_aiva_flows 
                 (id, agent_id, name, description, type, integration_type, config, is_active, is_deletable, priority)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    agentId,
                    flowData.name,
                    flowData.description,
                    flowData.type || this.TYPES.CUSTOM,
                    flowData.integration_type || null,
                    JSON.stringify(config),
                    flowData.is_active !== false ? 1 : 0,
                    flowData.is_deletable !== false ? 1 : 0,
                    flowData.priority || 0
                ]
            );

            console.log(`✨ Created flow ${id} for agent ${agentId}`);
            return await this.getFlow(id);
        } catch (error) {
            console.error('Error in ChatFlowService.createFlow:', error);
            throw error;
        }
    }

    /**
     * Update a flow
     */
    static async updateFlow(flowId, updates) {
        try {
            const flow = await this.getFlow(flowId);
            if (!flow) {
                throw new Error('Flow not found');
            }

            // System flows can only update certain fields
            if (flow.type === this.TYPES.SYSTEM) {
                // Only allow updating config for system flows
                if (updates.config) {
                    const config = this._validateFlowConfig(updates.config);
                    await db.query(
                        `UPDATE yovo_tbl_aiva_flows 
                         SET config = ?, version = version + 1, updated_at = NOW()
                         WHERE id = ?`,
                        [JSON.stringify(config), flowId]
                    );
                }
                return await this.getFlow(flowId);
            }

            // Build update query
            const updateFields = [];
            const updateValues = [];

            if (updates.name !== undefined) {
                updateFields.push('name = ?');
                updateValues.push(updates.name);
            }

            if (updates.description !== undefined) {
                updateFields.push('description = ?');
                updateValues.push(updates.description);
            }

            if (updates.config !== undefined) {
                const config = this._validateFlowConfig(updates.config);
                updateFields.push('config = ?');
                updateValues.push(JSON.stringify(config));
            }

            if (updates.is_active !== undefined) {
                updateFields.push('is_active = ?');
                updateValues.push(updates.is_active ? 1 : 0);
            }

            if (updates.priority !== undefined) {
                updateFields.push('priority = ?');
                updateValues.push(updates.priority);
            }

            if (updateFields.length === 0) {
                return flow;
            }

            updateFields.push('version = version + 1');
            updateFields.push('updated_at = NOW()');
            updateValues.push(flowId);

            await db.query(
                `UPDATE yovo_tbl_aiva_flows SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            console.log(`📝 Updated flow ${flowId}`);
            return await this.getFlow(flowId);
        } catch (error) {
            console.error('Error in ChatFlowService.updateFlow:', error);
            throw error;
        }
    }

    /**
     * Delete a flow (only custom flows)
     */
    static async deleteFlow(flowId) {
        try {
            const flow = await this.getFlow(flowId);
            if (!flow) {
                throw new Error('Flow not found');
            }

            if (!flow.is_deletable) {
                throw new Error('This flow cannot be deleted');
            }

            await db.query(
                `DELETE FROM yovo_tbl_aiva_flows WHERE id = ? AND is_deletable = 1`,
                [flowId]
            );

            console.log(`🗑️ Deleted flow ${flowId}`);
            return true;
        } catch (error) {
            console.error('Error in ChatFlowService.deleteFlow:', error);
            throw error;
        }
    }

    /**
     * Toggle flow active status
     */
    static async toggleFlow(flowId, isActive) {
        try {
            await db.query(
                `UPDATE yovo_tbl_aiva_flows 
                 SET is_active = ?, updated_at = NOW()
                 WHERE id = ? AND type != 'system'`,
                [isActive ? 1 : 0, flowId]
            );
            return await this.getFlow(flowId);
        } catch (error) {
            console.error('Error in ChatFlowService.toggleFlow:', error);
            throw error;
        }
    }

    /**
     * Duplicate a flow
     */
    static async duplicateFlow(flowId, newName = null) {
        try {
            const flow = await this.getFlow(flowId);
            if (!flow) {
                throw new Error('Flow not found');
            }

            const newFlow = {
                name: newName || `${flow.name} (Copy)`,
                description: flow.description,
                type: this.TYPES.CUSTOM,
                config: flow.config,
                priority: flow.priority
            };

            return await this.createFlow(flow.agent_id, newFlow);
        } catch (error) {
            console.error('Error in ChatFlowService.duplicateFlow:', error);
            throw error;
        }
    }

    // ========================================================================
    // SYSTEM FLOWS
    // ========================================================================

    /**
     * Initialize system flows for an agent
     * Called when agent is created
     */
    static async initializeSystemFlows(agentId) {
        try {
            const systemFlows = this._getSystemFlowDefinitions();
            
            for (const flow of systemFlows) {
                // Check if already exists by name for this agent
                const existing = await this.getFlowByName(agentId, flow.name);
                if (!existing) {
                    // Use UUID for unique ID (don't pass flow.id, let createFlow generate UUID)
                    await this.createFlow(agentId, {
                        name: flow.name,
                        description: flow.description,
                        type: this.TYPES.SYSTEM,
                        config: flow.config,
                        is_active: true,
                        is_deletable: false
                    });
                }
            }

            console.log(`🔧 Initialized system flows for agent ${agentId}`);
        } catch (error) {
            console.error('Error initializing system flows:', error);
        }
    }

    /**
     * Initialize integration flows when integration is connected
     */
    static async initializeIntegrationFlows(agentId, integrationType) {
        try {
            const integrationFlows = this._getIntegrationFlowDefinitions(integrationType);
            
            for (const flow of integrationFlows) {
                // Check if already exists by name for this agent
                const existing = await this.getFlowByName(agentId, flow.name);
                if (!existing) {
                    // Use UUID for unique ID (don't pass flow.id, let createFlow generate UUID)
                    await this.createFlow(agentId, {
                        name: flow.name,
                        description: flow.description,
                        type: this.TYPES.INTEGRATION,
                        integration_type: integrationType,
                        config: flow.config,
                        is_active: true,
                        is_deletable: false
                    });
                }
            }

            console.log(`🔌 Initialized ${integrationType} flows for agent ${agentId}`);
        } catch (error) {
            console.error('Error initializing integration flows:', error);
        }
    }

    // ========================================================================
    // FLOW DEFINITIONS
    // ========================================================================

    /**
     * Get system flow definitions
     */
    static _getSystemFlowDefinitions() {
        return [
            {
                id: this.SYSTEM_FLOWS.GENERAL,
                name: 'General Chat',
                description: 'Handles greetings, thanks, casual conversation, and general inquiries',
                config: {
                    trigger_examples: [
                        'hello', 'hi', 'hey', 'good morning',
                        'thanks', 'thank you', 'bye', 'goodbye',
                        'how are you', 'what can you do'
                    ],
                    steps: [],
                    allow_kb_search: true,
                    allow_context_switch: true,
                    is_default: true
                }
            },
            {
                id: this.SYSTEM_FLOWS.KB_SEARCH,
                name: 'Knowledge Base Q&A',
                description: 'Answers questions from knowledge base documents and FAQs',
                config: {
                    trigger_examples: [
                        'what is your return policy',
                        'how do I return',
                        'what are your hours',
                        'do you deliver to'
                    ],
                    steps: [
                        {
                            id: 'search_kb',
                            type: 'function',
                            config: {
                                function: 'search_knowledge',
                                params_map: {
                                    query: '{{user_message}}'
                                }
                            }
                        }
                    ],
                    allow_context_switch: true
                }
            },
            {
                id: this.SYSTEM_FLOWS.HANDOFF,
                name: 'Human Handoff',
                description: 'Transfers conversation to human agent',
                config: {
                    trigger_examples: [
                        'talk to human', 'speak to agent',
                        'connect me to support', 'I want to talk to a person',
                        'real person please'
                    ],
                    steps: [
                        {
                            id: 'confirm_handoff',
                            type: 'message',
                            config: {
                                text: 'I\'ll connect you with our support team right away.'
                            }
                        },
                        {
                            id: 'execute_handoff',
                            type: 'function',
                            config: {
                                function: 'transfer_to_agent'
                            }
                        }
                    ],
                    allow_context_switch: false
                }
            },
            {
                id: this.SYSTEM_FLOWS.CLARIFY_IMAGE,
                name: 'Clarify Image Intent',
                description: 'Asks user about ambiguous image uploads',
                config: {
                    trigger_examples: [],
                    steps: [
                        {
                            id: 'ask_intent',
                            type: 'collect',
                            config: {
                                param: 'image_intent',
                                prompt: 'I see you\'ve shared an image! How can I help?\n\n1. Find similar products\n2. Report a problem with this item\n3. Something else\n\nJust reply with 1, 2, or 3, or describe what you need.'
                            }
                        }
                    ],
                    allow_context_switch: true
                }
            }
        ];
    }

    /**
     * Get integration flow definitions
     */
    static _getIntegrationFlowDefinitions(integrationType) {
        const integrations = {
            shopify: [
                {
                    id: 'order_status',
                    name: 'Order Status',
                    description: 'Check delivery status, tracking info, and order details',
                    config: {
                        trigger_examples: [
                            'where is my order', 'track my order',
                            'order status', 'when will my order arrive',
                            'check order', 'delivery status',
                            'mera order kahan hai', 'order ka status'
                        ],
                        steps: [
                            {
                                id: 'collect_order_info',
                                type: 'collect',
                                config: {
                                    param: 'order_identifier',
                                    param_type: 'string',
                                    prompt: 'I\'d be happy to check your order status! Please share your order number or the phone/email used for the order.',
                                    patterns: ['CZ-?\\d+', '\\d{5,10}', '.+@.+\\..+', '03\\d{9}']
                                }
                            },
                            {
                                id: 'check_order',
                                type: 'function',
                                config: {
                                    function: 'check_order_status',
                                    params_map: {
                                        order_identifier: '{{order_identifier}}'
                                    },
                                    store_result_as: 'order_details'
                                }
                            }
                        ],
                        completion_message: null,
                        required_functions: ['check_order_status'],
                        allow_kb_search: true,
                        allow_context_switch: true
                    }
                },
                {
                    id: 'product_search',
                    name: 'Product Search',
                    description: 'Search and browse products, find items by description or image',
                    config: {
                        trigger_examples: [
                            'show me', 'find', 'search for',
                            'looking for', 'do you have',
                            'I want', 'can I see',
                            'red dress', 'blue shirt',
                            'dikhao', 'chahiye'
                        ],
                        steps: [
                            {
                                id: 'search_products',
                                type: 'function',
                                config: {
                                    function: 'search_products',
                                    params_map: {
                                        query: '{{user_message}}',
                                        image: '{{image_url}}'
                                    },
                                    store_result_as: 'product_results'
                                }
                            }
                        ],
                        allow_kb_search: false,
                        allow_context_switch: true
                    }
                }
            ],
            woocommerce: [
                // Similar to Shopify
                {
                    id: 'order_status',
                    name: 'Order Status',
                    description: 'Check delivery status and order details',
                    config: {
                        trigger_examples: ['where is my order', 'track order', 'order status'],
                        steps: [
                            {
                                id: 'collect_order',
                                type: 'collect',
                                config: {
                                    param: 'order_number',
                                    prompt: 'Please share your order number.'
                                }
                            },
                            {
                                id: 'check_order',
                                type: 'function',
                                config: {
                                    function: 'check_order_status',
                                    params_map: { order_number: '{{order_number}}' }
                                }
                            }
                        ],
                        allow_context_switch: true
                    }
                }
            ]
        };

        return integrations[integrationType] || [];
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Validate flow config structure
     */
    static _validateFlowConfig(config) {
        const validated = {
            trigger_examples: config.trigger_examples || [],
            steps: config.steps || [],
            completion_message: config.completion_message || null,
            required_functions: config.required_functions || [],
            allow_kb_search: config.allow_kb_search !== false,
            allow_context_switch: config.allow_context_switch !== false,
            is_default: config.is_default || false
        };

        // Validate steps
        validated.steps = validated.steps.map((step, index) => ({
            id: step.id || `step_${index}`,
            type: step.type || 'message',
            config: step.config || {}
        }));

        return validated;
    }

    /**
     * Parse JSON fields from database row
     */
    static _parseFlowJson(row) {
        const flow = { ...row };

        if (flow.config && typeof flow.config === 'string') {
            try {
                flow.config = JSON.parse(flow.config);
            } catch (e) {
                flow.config = {};
            }
        }

        return flow;
    }

    /**
     * Get flows formatted for LLM context
     */
    static async getFlowsForLLM(agentId) {
        const flows = await this.listFlows(agentId, true);
        
        return flows.map(flow => ({
            id: flow.id,
            name: flow.name,
            description: flow.description,
            trigger_examples: flow.config?.trigger_examples || []
        }));
    }
}

module.exports = ChatFlowService;