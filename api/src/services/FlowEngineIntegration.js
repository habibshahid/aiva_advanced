/**
 * Flow Engine Integration
 * 
 * Bridges between existing chat routes and the new FlowEngine.
 * Provides backward-compatible interface while enabling flow-based processing.
 * 
 * Usage:
 *   // Check if agent uses FlowEngine
 *   const useFlowEngine = await FlowEngineIntegration.shouldUseFlowEngine(agentId);
 *   
 *   if (useFlowEngine) {
 *       result = await FlowEngineIntegration.processMessage({...});
 *   } else {
 *       result = await ChatService.sendMessage({...});
 *   }
 */

const FlowEngine = require('./flow-engine');
const { ChatFlowService, SessionStateService, MessageBufferService } = require('./flow-engine');
const AgentService = require('./AgentService');
const KnowledgeService = require('./KnowledgeService');
const ShopifyService = require('./ShopifyService');
const TranscriptionAnalysisService = require('./TranscriptionAnalysisService');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class FlowEngineIntegration {

    /**
     * Check if an agent should use FlowEngine
     * Based on feature flag or agent setting
     */
    static async shouldUseFlowEngine(agentId) {
        try {
            // Check agent-level flag
            const [agents] = await db.query(
                `SELECT use_flow_engine FROM yovo_tbl_aiva_agents WHERE id = ?`,
                [agentId]
            );

            if (agents.length > 0 && agents[0].use_flow_engine) {
                return true;
            }

            // Check tenant-level flag
            const [tenants] = await db.query(
                `SELECT t.use_flow_engine 
                 FROM yovo_tbl_aiva_tenants t
                 JOIN yovo_tbl_aiva_agents a ON a.tenant_id = t.id
                 WHERE a.id = ?`,
                [agentId]
            );

            if (tenants.length > 0 && tenants[0].use_flow_engine) {
                return true;
            }

            // Default: don't use FlowEngine yet (gradual rollout)
            return false;

        } catch (error) {
            console.error('Error checking FlowEngine flag:', error);
            return false;
        }
    }

    /**
     * Process a message through FlowEngine
     * Returns response in format compatible with ChatService.sendMessage()
     * 
     * @param {object} params - Message parameters
     * @returns {object} Response compatible with existing format
     */
    static async processMessage({
        sessionId,
        agentId,
        message,
        image = null,
        audioTranscript = null,
        audioDuration = null,
        userId = null,
        channelInfo = {}
    }) {
        try {
            // Build channel identifier
            const channelId = this._buildChannelId(channelInfo, userId, sessionId);
            
            // For public_chat, force buffer to 0 for immediate response
            // WhatsApp and other channels can use buffering for rapid-fire messages
            let bufferOverride = null;
            if (channelInfo?.channel === 'public_chat') {
                bufferOverride = 0;
                console.log('📦 [FlowEngine] Public chat - forcing buffer to 0 for immediate response');
            }

            // Process through FlowEngine
            const result = await FlowEngine.processMessage({
                agentId,
                channelId,
                sessionId,
                message,
                imageUrl: image,
                audioTranscript,
                audioDuration,
                customerInfo: {
                    phone: channelInfo?.channelUserId,
                    name: channelInfo?.channelUserName
                },
                bufferSecondsOverride: bufferOverride
            });

            // If still buffering, return acknowledgment
            if (result.status === 'buffering' || result.status === 'pending') {
                return {
                    buffering: true,
                    session_id: result.session_id,
                    message: 'Message received'
                };
            }

            // Note: KB search is handled internally by FlowEngine
            // The FlowEngine makes a second LLM call with KB results if needed
            // No need to do it again here

            // Save messages to chat history
            await this._saveMessages(sessionId, message, image, result);

            // Convert to legacy format
            return this._convertToLegacyFormat(result, agentId);

        } catch (error) {
            console.error('FlowEngineIntegration.processMessage error:', error);
            throw error;
        }
    }

    /**
     * Initialize system flows for a new agent
     */
    static async initializeAgentFlows(agentId) {
        try {
            // Initialize system flows
            await ChatFlowService.initializeSystemFlows(agentId);

            // Check for integrations and initialize those flows
            const agent = await AgentService.getAgent(agentId);
            
            if (agent.shopify_store_url) {
                await ChatFlowService.initializeIntegrationFlows(agentId, 'shopify');
            }

            console.log(`✅ Initialized flows for agent ${agentId}`);
            return true;

        } catch (error) {
            console.error('Error initializing agent flows:', error);
            return false;
        }
    }

    /**
     * Enable FlowEngine for an agent
     */
    static async enableFlowEngine(agentId) {
        try {
            // Add column if not exists and set flag
            await db.query(
                `UPDATE yovo_tbl_aiva_agents SET use_flow_engine = 1 WHERE id = ?`,
                [agentId]
            );

            // Initialize flows
            await this.initializeAgentFlows(agentId);

            return true;

        } catch (error) {
            console.error('Error enabling FlowEngine:', error);
            return false;
        }
    }

    /**
     * Disable FlowEngine for an agent (fallback to ChatService)
     */
    static async disableFlowEngine(agentId) {
        try {
            await db.query(
                `UPDATE yovo_tbl_aiva_agents SET use_flow_engine = 0 WHERE id = ?`,
                [agentId]
            );
            return true;
        } catch (error) {
            console.error('Error disabling FlowEngine:', error);
            return false;
        }
    }

    /**
     * Get flow engine status for an agent
     */
    static async getStatus(agentId) {
        try {
            const enabled = await this.shouldUseFlowEngine(agentId);
            const flows = await ChatFlowService.listFlows(agentId, false);
            
            // Get recent session stats
            const [stats] = await db.query(
                `SELECT 
                    COUNT(*) as total_sessions,
                    SUM(CASE WHEN session_status = 'active' THEN 1 ELSE 0 END) as active_sessions,
                    SUM(CASE WHEN session_status = 'soft_closed' THEN 1 ELSE 0 END) as soft_closed_sessions
                 FROM yovo_tbl_aiva_chat_sessions
                 WHERE agent_id = ? AND start_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
                [agentId]
            );

            return {
                enabled,
                flows: {
                    total: flows.length,
                    active: flows.filter(f => f.is_active).length,
                    system: flows.filter(f => f.type === 'system').length,
                    integration: flows.filter(f => f.type === 'integration').length,
                    custom: flows.filter(f => f.type === 'custom').length
                },
                sessions_24h: stats[0] || { total_sessions: 0, active_sessions: 0, soft_closed_sessions: 0 }
            };

        } catch (error) {
            console.error('Error getting FlowEngine status:', error);
            return { enabled: false, error: error.message };
        }
    }

    /**
     * Register custom function handlers
     */
    static registerFunction(name, handler) {
        FlowEngine.registerFunction(name, handler);
    }

    /**
     * Run session cleanup job
     */
    static async runCleanup(timeoutMinutes = 30) {
        const sessionResult = await SessionStateService.runCleanup(timeoutMinutes);
        const bufferResult = await MessageBufferService.cleanup();
        
        return {
            sessions: sessionResult,
            buffers: bufferResult
        };
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Save user and assistant messages to chat history
     */
    static async _saveMessages(sessionId, userMessage, userImage, result) {
        try {
			const userCreatedAt = new Date();
			const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1000);
			
            const responseText = result.response?.text || result.response?.html || '';
            
            // Save user message
            const userMessageId = uuidv4();
            await db.query(
                `INSERT INTO yovo_tbl_aiva_chat_messages (
                    id, session_id, role, content, images, created_at
                ) VALUES (?, ?, 'user', ?, ?, ?)`,
                [
                    userMessageId,
                    sessionId,
                    userMessage,
                    userImage ? JSON.stringify([userImage]) : null,
					userCreatedAt
                ]
            );

            // Save assistant message
            const assistantMessageId = uuidv4();
            
            // Extract cost - handle both number and object formats
            const cost = typeof result.cost === 'number' 
                ? result.cost 
                : (result.cost?.final_cost || result.cost?.base_cost || 0);
            
            // Extract tokens if available
            const tokensInput = result.cost?.input_tokens || result.cost?.tokens?.input || result.tokens?.input || 0;
            const tokensOutput = result.cost?.output_tokens || result.cost?.tokens?.output || result.tokens?.output || 0;
            
            // Build cost breakdown JSON
            const costBreakdown = result.cost ? {
                provider: result.cost.provider || 'openai',
                model: result.cost.model || result.model || 'gpt-4o-mini',
                input_tokens: tokensInput,
                output_tokens: tokensOutput,
                cached_tokens: result.cost.cached_tokens || 0,
                input_cost: result.cost.input_cost || 0,
                output_cost: result.cost.output_cost || 0,
                cached_cost: result.cost.cached_cost || 0,
                base_cost: result.cost.base_cost || 0,
                profit_amount: result.cost.profit_amount || 0,
                final_cost: result.cost.final_cost || cost
            } : null;
            
            await db.query(
                `INSERT INTO yovo_tbl_aiva_chat_messages (
                    id, session_id, role, content, content_html, cost, cost_breakdown, tokens_input, tokens_output, created_at
                ) VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
                [
                    assistantMessageId,
                    sessionId,
                    responseText,
                    result.response?.html || null,
                    cost,
                    costBreakdown ? JSON.stringify(costBreakdown) : null,
                    tokensInput,
                    tokensOutput,
					assistantCreatedAt
                ]
            );

            // Update session statistics (message count and total cost)
            // We count 2 messages: 1 user + 1 assistant
            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET total_messages = total_messages + 2,
                     total_cost = total_cost + ?,
                     last_activity_at = NOW()
                 WHERE id = ?`,
                [cost, sessionId]
            );

            console.log(`💾 Saved flow messages: user=${userMessageId}, assistant=${assistantMessageId}, cost=$${cost.toFixed(6)}`);
            
            // Trigger background analysis for user message (non-blocking)
            if (userMessage && userMessage.trim()) {
                this._analyzeMessageAsync(userMessageId, userMessage, sessionId)
                    .catch(err => console.error('Background analysis error:', err));
            }
            
            return { userMessageId, assistantMessageId, cost };
        } catch (error) {
            console.error('Error saving flow messages:', error);
            // Don't throw - message saving failure shouldn't break the response
            return null;
        }
    }
    
    /**
     * Analyze message in background (sentiment, language, intents)
     * @private
     */
    static async _analyzeMessageAsync(messageId, content, sessionId) {
        try {
            console.info(`🔄 [ASYNC] Starting background analysis for message: ${messageId}`);
            const startTime = Date.now();
            
            // Analyze the message
            const analysis = await TranscriptionAnalysisService.analyzeMessage(
                content,
                'customer',
                {}
            );
            
            // Translate if not English
            let translatedMessage = null;
            if (analysis.language_detected && analysis.language_detected !== 'en') {
                const translation = await TranscriptionAnalysisService.translateToEnglish(
                    content,
                    analysis.language_detected
                );
                translatedMessage = translation.translated_text;
            }
            
            // Update message with analysis data
            await db.query(
                `UPDATE yovo_tbl_aiva_chat_messages SET
                    language_detected = ?,
                    translated_message = ?,
                    sentiment = ?,
                    sentiment_score = ?,
                    sentiment_confidence = ?,
                    profanity_detected = ?,
                    profanity_score = ?,
                    profane_words = ?,
                    intents = ?,
                    primary_intent = ?,
                    intent_confidence = ?,
                    topics = ?,
                    keywords = ?,
                    emotion_tags = ?,
                    analyzed_at = ?,
                    analysis_model = ?,
                    analysis_cost = ?
                WHERE id = ?`,
                [
                    analysis?.language_detected || null,
                    translatedMessage || null,
                    analysis?.sentiment || null,
                    analysis?.sentiment_score || null,
                    analysis?.sentiment_confidence || null,
                    analysis?.profanity_detected ? 1 : 0,
                    analysis?.profanity_score || 0.0,
                    analysis?.profane_words ? JSON.stringify(analysis.profane_words) : null,
                    analysis?.intents ? JSON.stringify(analysis.intents) : null,
                    analysis?.primary_intent || null,
                    analysis?.intent_confidence || null,
                    analysis?.topics ? JSON.stringify(analysis.topics) : null,
                    analysis?.keywords ? JSON.stringify(analysis.keywords) : null,
                    analysis?.emotion_tags ? JSON.stringify(analysis.emotion_tags) : null,
                    new Date(),
                    analysis?.analysis_metadata?.model || null,
                    analysis?.analysis_metadata?.cost || 0.0,
                    messageId
                ]
            );
            
            const elapsed = Date.now() - startTime;
            console.info(`✅ [ASYNC] Analysis complete for ${messageId} in ${elapsed}ms: sentiment=${analysis?.sentiment}, intent=${analysis?.primary_intent}`);
            
            // Update session cost with analysis cost
            const analysisCost = (analysis?.analysis_metadata?.cost || 0) + 
                               (translatedMessage ? 0.0001 : 0);
            
            if (analysisCost > 0 && sessionId) {
                await db.query(
                    `UPDATE yovo_tbl_aiva_chat_sessions 
                     SET total_cost = total_cost + ?
                     WHERE id = ?`,
                    [analysisCost, sessionId]
                );
                console.info(`💰 [ASYNC] Added analysis cost $${analysisCost.toFixed(6)} to session ${sessionId}`);
            }
            
        } catch (error) {
            console.error(`❌ [ASYNC] Analysis failed for message ${messageId}:`, error.message);
            // Don't throw - this is background processing, failure shouldn't affect user
        }
    }

    /**
     * Build channel identifier from channel info
     * 
     * For WhatsApp: whatsapp:923001234567
     * For public_chat: public_chat:session_id or public_chat:anonymous
     * For user: user:user_id
     * Fallback: anonymous:timestamp
     */
    static _buildChannelId(channelInfo, userId, sessionId = null) {
        // WhatsApp or other channels with user ID
        if (channelInfo && channelInfo.channel && channelInfo.channelUserId) {
            return `${channelInfo.channel}:${channelInfo.channelUserId}`;
        }
        
        // Public chat - use session ID as identifier
        if (channelInfo && channelInfo.channel === 'public_chat') {
            return sessionId ? `public_chat:${sessionId}` : `public_chat:anonymous_${Date.now()}`;
        }
        
        // Channel without user ID
        if (channelInfo && channelInfo.channel) {
            return `${channelInfo.channel}:anonymous_${Date.now()}`;
        }
        
        // Logged in user
        if (userId) {
            return `user:${userId}`;
        }
        
        // Fallback
        return `anonymous:${Date.now()}`;
    }

    /**
     * Search knowledge base
     */
    static async _searchKnowledgeBase(agentId, query) {
        try {
            const agent = await AgentService.getAgent(agentId);
            if (!agent.kb_id) {
                return null;
            }

            const results = await KnowledgeService.search({
                kbId: agent.kb_id,
                tenantId: agent.tenant_id,
                query: query,
                topK: 5
            });

            return results;

        } catch (error) {
            console.error('KB search error:', error);
            return null;
        }
    }

    /**
     * Convert FlowEngine result to ChatService-compatible format
     */
    static _convertToLegacyFormat(result, agentId) {
        // Extract products from function result if search_products was executed
        let products = [];
        if (result.function_executed === 'search_products' && result.function_result?.products) {
            products = result.function_result.products;
        }
        
        return {
            session_id: result.session_id,
            
            response: {
                text: result.response?.text || '',
                html: result.response?.html || '',
                markdown: result.response?.text || ''
            },

            // Products, sources, images (like ChatService returns)
            products: products,
            sources: [],
            images: [],
            
            // Formatted outputs (like _formatKnowledgeSources returns)
            formatted_html: null,
            formatted_markdown: null,
            formatted_text: null,

            // Legacy decision format
            llm_decision: {
                response: result.response?.text || '',
                
                // Product search
                product_search_needed: result.action === 'EXECUTE_FUNCTION' && 
                    result.function_result?.function === 'search_products',
                product_search_type: products.length > 0 ? 'image_similarity' : 'none',
                product_search_query: null,
                
                // Knowledge search
                knowledge_search_needed: result.kb_search?.needed || false,
                knowledge_search_query: result.kb_search?.query || null,
                
                // Function calls
                function_call_needed: result.action === 'EXECUTE_FUNCTION',
                function_name: result.function_result?.function || result.function_executed || null,
                function_arguments: result.function_result?.result || null,
                
                // State
                agent_transfer: result.action === 'EXECUTE_FUNCTION' && 
                    result.function_result?.function === 'transfer_to_agent',
                conversation_complete: result.session_action === 'HARD_CLOSE',
                user_wants_to_end: result.session_action === 'SOFT_CLOSE' || 
                    result.session_action === 'HARD_CLOSE'
            },
            
            // Context used (like ChatService returns)
            context_used: {
                knowledge_base_chunks: 0,
                image_search_results: result.function_result?.image_search_results || 0,
                shopify_products_found: products.length,
                conversation_history_messages: 0,
                total_context_tokens: result.cost?.input_tokens || 0
            },

            // Cost tracking - extract numeric cost from cost object
            cost: typeof result.cost === 'number' ? result.cost : (result.cost?.final_cost || result.cost?.base_cost || 0),
            cost_breakdown: {
                operations: result.cost ? [{
                    operation: 'llm_completion',
                    total_cost: typeof result.cost === 'number' ? result.cost : (result.cost?.final_cost || result.cost?.base_cost || 0)
                }] : []
            },
            
            // Flow state
            flow: result.flow || null,
            pending_resume: result.pending_resume || null,

            // Processing info
            processing_time_ms: result.processing_time_ms,
            model: result.model || result.cost?.model || 'gpt-4o-mini',

            // Agent info - include tokens for credit deduction
            agent_metadata: {
                agent_id: agentId,
                model: result.model || result.cost?.model || 'gpt-4o-mini',
                input_tokens: result.cost?.input_tokens || 0,
                output_tokens: result.cost?.output_tokens || 0
            }
        };
    }
}

// ============================================================================
// ============================================================================
// REGISTER FLOW ENGINE FUNCTIONS
// ============================================================================
// 
// BUILT-IN FUNCTIONS (registered here):
//   - check_order_status: Look up order by order number, email, or phone (Shopify)
//   - search_products: Search products in KB or Shopify
//   - search_knowledge: Search knowledge base documents
//   - transfer_to_agent: Transfer chat to human agent
//
// CUSTOM FUNCTIONS (defined per agent in database):
//   - create_ticket, send_sms, book_appointment, etc.
//   - Configure in Agent Editor → Functions section
//   - Each agent can define their own API endpoints
//
// Function execution priority:
//   1. Built-in handlers (registered below)
//   2. Agent-specific functions from yovo_tbl_aiva_functions table
//
// To add a new BUILT-IN function:
//   FlowEngine.registerFunction('function_name', async (params, agent, session) => {
//       // Your logic here
//       return { success: true, result: ... };
//   });
// ============================================================================

// Register Shopify order lookup
FlowEngine.registerFunction('check_order_status', async (params, agent, session) => {
    try {
        // Initialize lookup params
        let order_number = null;
        let email = null;
        let phone = null;
        
        // PRIORITY 1: Use order_identifier if provided (from flow collect step or direct)
        // This takes precedence over session/channel data
        const identifier = params.order_identifier;
        if (identifier) {
            const cleanIdentifier = identifier.toString().trim();
            
            // Check if it's an email
            if (cleanIdentifier.includes('@') && cleanIdentifier.includes('.')) {
                email = cleanIdentifier;
                console.log('📦 [FlowEngineIntegration] Detected email from identifier:', email);
            }
            // Check if it's a phone number (starts with 0, +, or is 10+ digits)
            else if (/^[\+]?[0-9]{10,}$/.test(cleanIdentifier.replace(/[\s\-\(\)]/g, '')) ||
                     /^0[0-9]{9,}$/.test(cleanIdentifier.replace(/[\s\-]/g, ''))) {
                phone = cleanIdentifier;
                console.log('📦 [FlowEngineIntegration] Detected phone from identifier:', phone);
            }
            // Otherwise treat as order number
            else {
                order_number = cleanIdentifier;
                console.log('📦 [FlowEngineIntegration] Detected order number from identifier:', order_number);
            }
        }
        
        // PRIORITY 2: Use explicit params if order_identifier didn't set them
        if (!order_number && params.order_number) {
            order_number = params.order_number;
        }
        if (!email && (params.email || params.customer_email)) {
            email = params.email || params.customer_email;
        }
        if (!phone && params.phone) {
            // Only use explicit phone param, NOT customer_phone from session
            phone = params.phone;
            console.log('📦 [FlowEngineIntegration] Using explicit phone param:', phone);
        }
        
        // PRIORITY 3: Fall back to customer_phone from session/channel ONLY if nothing else provided
        if (!order_number && !email && !phone && params.customer_phone) {
            phone = params.customer_phone;
            console.log('📦 [FlowEngineIntegration] Falling back to customer_phone:', phone);
        }
        
        console.log('📦 [FlowEngineIntegration] Checking order:', { 
            order_number, 
            email, 
            phone, 
            kb_id: agent.kb_id,
            original_identifier: identifier
        });
        
        // Validate we have at least one search parameter
        if (!order_number && !email && !phone) {
            return { 
                success: false, 
                error: 'Please provide an order number, email, or phone number to check the order status.' 
            };
        }
        
        // Check if agent has Shopify connected via kb_id (preferred) or direct config
        let store = null;
        
        if (agent.kb_id) {
            // Get store by KB ID (like ChatService does)
            store = await ShopifyService.getStoreByKbId(agent.kb_id);
        }
        
        if (!store && agent.shopify_store_url && agent.shopify_access_token) {
            // Fallback to direct config
            store = {
                shop_domain: agent.shopify_store_url,
                access_token: agent.shopify_access_token
            };
        }
        
        if (!store) {
            return { 
                success: false, 
                error: 'No Shopify store is connected to this agent.' 
            };
        }
        
        // Lookup order - ShopifyService returns full formatted order data
        const result = await ShopifyService.lookupOrder(
            store.shop_domain,
            store.access_token,
            { order_number, email, phone }
        );
        
        // Pass through the full result from ShopifyService
        // It already has: found, order (with all details), searched_variants, message
        if (!result.found) {
            return {
                success: false,
                found: false,
                message: result.message || 'No order found with the provided information.',
                searched_variants: result.searched_variants,
                searched_with: { order_number, email, phone }
            };
        }
        
        // Return success with full order data from ShopifyService
        // The order object already contains: order_number, status, status_description,
        // customer_name, tracking, line_items, shipping_address, etc.
        return { 
            success: true, 
            found: true,
            order: result.order,  // Full order data from ShopifyService
            total_orders_found: result.total_orders_found,
            searched_variants: result.searched_variants,
            message: result.message
        };

    } catch (error) {
        console.error('📦 [FlowEngineIntegration] Order lookup error:', error);
        return { success: false, error: error.message };
    }
});

// Register product search
FlowEngine.registerFunction('search_products', async (params, agent, session, bufferedData) => {
    try {
        // Check if we have images for visual search
        const hasImages = bufferedData?.images && bufferedData.images.length > 0;
        
        // Build query from params - LLM may send query string or search_keywords array
        let searchQuery = params.query || params.description;
        if (!searchQuery && params.search_keywords) {
            searchQuery = Array.isArray(params.search_keywords) 
                ? params.search_keywords.join(' ') 
                : params.search_keywords;
        }
        
        // Use message as fallback query
        if (!searchQuery && bufferedData?.combinedMessage) {
            searchQuery = bufferedData.combinedMessage;
        }
        
        // Get Shopify store - try kb_id first (like check_order_status), then direct config
        let store = null;
        if (agent.kb_id) {
            store = await ShopifyService.getStoreByKbId(agent.kb_id);
        }
        if (!store && agent.shopify_store_url && agent.shopify_access_token) {
            store = {
                shop_domain: agent.shopify_store_url,
                access_token: agent.shopify_access_token,
                tenant_id: agent.tenant_id
            };
        }
        
        const hasShopify = !!store;
        
        console.log('🔍 Product search:', {
            hasImages,
            hasQuery: !!searchQuery,
            hasKB: !!agent.kb_id,
            hasShopify,
            storeFound: !!store,
            imageAction: params.image_action
        });
        
        let imageSearchResults = null;
        let products = [];
        
        // Step 1: If we have images and KB, do image similarity search
        if (hasImages && agent.kb_id) {
            console.log('🔍 Step 1: Image similarity search in KB:', agent.kb_id);
            
            // Extract base64 from data URI if present
            let imageBase64 = bufferedData.images[0];
            if (imageBase64.startsWith('data:')) {
                imageBase64 = imageBase64.split(',')[1];
            }
            
            imageSearchResults = await KnowledgeService.searchImages({
                kbId: agent.kb_id,
                tenantId: agent.tenant_id,
                query: searchQuery || '',
                imageBase64: imageBase64,
                searchType: 'image',
                topK: 5,
                filters: {}
            });
            
            console.log('✅ Image search completed:', {
                results_count: imageSearchResults.results?.length || 0,
                cost: imageSearchResults.cost || 0
            });
        }
        
        // Step 2: If we have image results with product IDs, fetch full product details
        if (imageSearchResults?.results?.length > 0) {
            console.log('🛍️ Step 2: Extracting product IDs from image search results');
            
            // Extract unique product IDs with their scores
            let productIds = [];
            let productScores = {};
            
            imageSearchResults.results.forEach(result => {
                if (result.metadata?.product_id) {
                    const productId = result.metadata.product_id;
                    
                    // Store the highest score for each product
                    if (!productScores[productId] || result.score > productScores[productId]) {
                        productScores[productId] = result.score;
                    }
                    
                    productIds.push(productId);
                }
            });
            
            // Remove duplicates
            productIds = [...new Set(productIds)];
            
            console.log('✅ Found unique product IDs:', productIds);
            console.log('📊 Product scores:', productScores);
            
            // Fetch products by IDs from Shopify
            if (hasShopify && productIds.length > 0) {
                console.log('🎯 Fetching products from Shopify by IDs:', productIds);
                
                try {
                    const productResults = await ShopifyService.getProductsByIds(
                        store.tenant_id || agent.tenant_id,
                        store.shop_domain,
                        store.access_token,
                        productIds
                    );
                    
                    products = (productResults.products || []).map(product => {
                        const score = productScores[product.id] || 0;
                        return {
                            ...product,
                            similarity_score: score,
                            match_percentage: Math.round(score * 100)
                        };
                    });
                    
                    // Sort by similarity score (descending)
                    products.sort((a, b) => b.similarity_score - a.similarity_score);
                    
                    console.log('✅ Products sorted by similarity score');
                    console.log('🏆 Top matches:', products.slice(0, 3).map(p => ({
                        id: p.id,
                        title: p.title,
                        score: p.similarity_score,
                        match: p.match_percentage + '%'
                    })));
                    
                } catch (directLookupError) {
                    console.error('❌ Direct product lookup failed:', directLookupError);
                }
            }
            
            // Fallback: Keyword search via ProductService
            if (products.length === 0 && searchQuery) {
                console.log('🔍 Falling back to keyword search:', searchQuery);
                
                try {
                    const ProductService = require('./ProductService');
                    
                    const searchResults = await ProductService.listProducts(agent.kb_id, {
                        search: searchQuery,
                        status: 'active',
                        limit: 10,
                        page: 1
                    });
                    
                    products = (searchResults.products || []).map(p => {
                        let handle = null;
                        if (p.shopify_metadata) {
                            const metadata = typeof p.shopify_metadata === 'string' ?
                                JSON.parse(p.shopify_metadata) : p.shopify_metadata;
                            handle = metadata.handle;
                        }
                        
                        return {
                            id: p.id,
                            shopify_product_id: p.shopify_product_id,
                            title: p.title,
                            description: p.description,
                            vendor: p.vendor,
                            product_type: p.product_type,
                            tags: p.tags || [],
                            handle: handle,
                            shop_domain: p.shop_domain,
                            status: p.status,
                            image_url: p.image_url || null,
                            variants: [],
                            similarity_score: 0,
                            match_percentage: 0
                        };
                    });
                    
                    console.log(`✅ Keyword search found ${products.length} products`);
                    
                } catch (searchError) {
                    console.error('❌ Product search error:', searchError);
                }
            }
        }
        
        // Fallback: Text-based KB search (no image results)
        if (products.length === 0 && searchQuery && agent.kb_id) {
            console.log('🔍 Fallback: Text search in KB with query:', searchQuery);
            
            const results = await KnowledgeService.search({
                kbId: agent.kb_id,
                query: searchQuery,
                image: null,
                topK: params.limit || 5,
                searchType: 'hybrid'
            });
            
            products = results?.results?.product_results || [];
        }
        
        // Final fallback: Shopify keyword search
        if (products.length === 0 && hasShopify && searchQuery) {
            console.log('🔍 Final fallback: Shopify keyword search');
            
            const results = await ShopifyService.searchProducts(
                store.tenant_id || agent.tenant_id,
                store.shop_domain,
                store.access_token,
                searchQuery,
                params.limit || 5
            );
            products = results.products || [];
        }
        
        console.log('✅ Product search completed:', {
            products_found: products.length,
            search_type: imageSearchResults ? 'image_similarity' : 'text'
        });
        
        // Format products to match _formatKnowledgeSources product_results format
        const formattedProducts = products.slice(0, 10).map(p => ({
            product_id: p.id || p.product_id,
            name: p.title || p.name,
            description: p.description,
            image_url: p.image_url,
            price: p.variants?.[0]?.price || p.price,
            availability: p.variants?.[0]?.inventory_quantity > 0 ? 'in_stock' : 'out_of_stock',
            similarity_score: p.similarity_score || p.score || null,
            match_reason: p.match_percentage ? `${p.match_percentage}% match` : null,
            metadata: {
                shopify_product_id: p.shopify_product_id,
                sku: p.variants?.[0]?.sku,
                inventory_quantity: p.variants?.[0]?.inventory_quantity,
                vendor: p.vendor,
                product_type: p.product_type,
                tags: p.tags || [],
                handle: p.handle,
                shop_domain: p.shop_domain || store?.shop_domain
            },
            url: (p.handle && (p.shop_domain || store?.shop_domain)) ?
                `https://${p.shop_domain || store?.shop_domain}/products/${p.handle}` : null,
            purchase_url: (p.handle && (p.shop_domain || store?.shop_domain)) ?
                `https://${p.shop_domain || store?.shop_domain}/products/${p.handle}` : null
        }));
        
        return { 
            success: true, 
            products: formattedProducts,
            search_type: imageSearchResults ? 'image_similarity' : 'text',
            image_search_results: imageSearchResults?.results?.length || 0,
            cost: imageSearchResults?.cost || 0
        };

    } catch (error) {
        console.error('Product search error:', error);
        return { success: false, error: error.message };
    }
});

// Register KB search
FlowEngine.registerFunction('search_knowledge', async (params, agent) => {
    try {
        if (!agent.kb_id) {
            return { success: false, error: 'Knowledge base not configured' };
        }

        const results = await KnowledgeService.search({
            kbId: agent.kb_id,
            tenantId: agent.tenant_id,
            query: params.query,
            topK: 5
        });

        return { success: true, results: results.text_results || [] };

    } catch (error) {
        console.error('KB search error:', error);
        return { success: false, error: error.message };
    }
});

// Register human handoff
FlowEngine.registerFunction('transfer_to_agent', async (params, agent, session) => {
    console.log(`👤 Transferring session ${session?.id} to human agent`);
    
    // In production, this would integrate with your queue/agent system
    // For now, just mark it
    if (session?.id) {
        await db.query(
            `UPDATE yovo_tbl_aiva_chat_sessions 
             SET needs_human = 1, updated_at = NOW() 
             WHERE id = ?`,
            [session.id]
        );
    }

    return { success: true, transferred: true };
});

// NOTE: create_ticket is NOT a built-in function
// It should be defined as a custom function per agent in the Functions section
// Each agent can configure their own ticketing system API endpoint

module.exports = FlowEngineIntegration;