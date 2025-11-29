/**
 * Chat Service
 * Manages chat sessions, messages, and integrates with knowledge and OpenAI
 */
require('dotenv').config();

const db = require('../config/database');
const {
    v4: uuidv4
} = require('uuid');
const OpenAI = require('openai');
const KnowledgeService = require('./KnowledgeService');
const ShopifyService = require('./ShopifyService');
const AgentService = require('./AgentService');
const ProductService = require('./ProductService');
const CostCalculator = require('../utils/cost-calculator');
const markdown = require('../utils/markdown');
const knowledgeFormatter = require('../utils/knowledge-formatter');
const TranscriptionService = require('./TranscriptionService');
const TranscriptionAnalysisService = require('./TranscriptionAnalysisService');

class ChatService {
    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * Create chat session
     * @param {Object} params - Session parameters
     * @returns {Promise<Object>} Created session
     */
    async createSession({
        tenantId,
        agentId,
        userId = null,
        sessionName = null,
        metadata = {}
    }) {
        const sessionId = uuidv4();

        await db.query(
            `INSERT INTO yovo_tbl_aiva_chat_sessions (
        id, tenant_id, agent_id, user_id, session_name, status, metadata
      ) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
            [
                sessionId,
                tenantId,
                agentId,
                userId,
                sessionName,
                JSON.stringify(metadata)
            ]
        );

        return this.getSession(sessionId);
    }

    /**
     * Get chat session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} Session or null
     */
    async getSession(sessionId) {
        const [sessions] = await db.query(
            `SELECT 
        cs.*,
        a.name as agent_name,
        a.kb_id
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      WHERE cs.id = ?`,
            [sessionId]
        );

        if (sessions.length === 0) {
            return null;
        }

        const session = sessions[0];

        return {
            ...session,
            metadata: session.metadata ?
                (typeof session.metadata === 'string' ? JSON.parse(session.metadata) : session.metadata) :
                {}
        };
    }

    /**
     * List chat sessions for tenant
     * @param {string} tenantId - Tenant ID
     * @param {Object} options - List options
     * @returns {Promise<Object>} Sessions and total
     */
    async listSessions(tenantId, {
        page = 1,
        limit = 20,
        agentId = null,
        status = null
    }) {
        const offset = (page - 1) * limit;

        let query = `
      SELECT 
        cs.*,
        a.name as agent_name
      FROM yovo_tbl_aiva_chat_sessions cs
      LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
      WHERE cs.tenant_id = ?
    `;
        const params = [tenantId];

        if (agentId) {
            query += ' AND cs.agent_id = ?';
            params.push(agentId);
        }

        if (status) {
            query += ' AND cs.status = ?';
            params.push(status);
        }

        query += ' ORDER BY cs.start_time DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [sessions] = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) as total FROM yovo_tbl_aiva_chat_sessions WHERE tenant_id = ?';
        const countParams = [tenantId];

        if (agentId) {
            countQuery += ' AND agent_id = ?';
            countParams.push(agentId);
        }

        if (status) {
            countQuery += ' AND status = ?';
            countParams.push(status);
        }

        const [countResult] = await db.query(countQuery, countParams);
        const total = countResult[0].total;

        return {
            sessions: sessions.map(s => ({
                ...s,
                metadata: s.metadata ? JSON.parse(s.metadata) : {}
            })),
            total
        };
    }

    /**
     * Check if agent has order processing capability
     * @private
     */
    _checkOrderCapability(agent) {
        // Check for order functions
        const hasOrderFunction = agent.functions && agent.functions.length > 0 &&
            agent.functions.some(fn =>
                fn.name.toLowerCase().includes('order') ||
                fn.name.toLowerCase().includes('purchase') ||
                fn.name.toLowerCase().includes('checkout')
            );

        if (hasOrderFunction) {
            return {
                canProcess: true,
                method: 'function',
                reason: 'Has order processing functions'
            };
        }

        // Check if instructions mention order process
        const instructionsMentionOrders = agent.instructions && (
            agent.instructions.toLowerCase().includes('place order') ||
            agent.instructions.toLowerCase().includes('to order') ||
            agent.instructions.toLowerCase().includes('checkout process')
        );

        if (instructionsMentionOrders) {
            return {
                canProcess: true,
                method: 'instructions',
                reason: 'Instructions contain order process'
            };
        }

        // Check for Shopify integration
        const hasShopify = agent.shopify_store_url && agent.shopify_access_token;
        const hasProducts = agent.kb_id; // Assuming KB has products

        if (hasShopify && hasProducts) {
            return {
                canProcess: false,
                method: 'shopify_url',
                reason: 'Can share purchase URLs but cannot process orders directly',
                hasShopifyProducts: true
            };
        }

        return {
            canProcess: false,
            method: 'none',
            reason: 'No order processing capability',
            hasShopifyProducts: false
        };
    }

    /**
     * Detect if response contains fake order numbers
     * @private
     */
    _containsFakeOrderNumber(response) {
        if (!response) return false;

        const lowerResponse = response.toLowerCase();

        // Patterns that indicate fake order generation
        const fakeOrderPatterns = [
            /order number[:\s]+[a-z0-9]{6,}/i,
            /order id[:\s]+[a-z0-9]{6,}/i,
            /tracking (number|id)[:\s]+[a-z0-9]{6,}/i,
            /confirmation (number|code|id)[:\s]+[a-z0-9]{6,}/i,
            /transaction (id|number)[:\s]+[a-z0-9]{6,}/i,
            /order placed.*#[a-z0-9]+/i,
            /your order.*[a-z0-9]{8,}/i
        ];

        // Check for patterns
        const hasFakePattern = fakeOrderPatterns.some(pattern =>
            pattern.test(response)
        );

        if (hasFakePattern) {
            console.log('🚫 Detected fake order number pattern in response');
            return true;
        }

        // Check for specific phrases
        const fakeOrderPhrases = [
            'order has been placed',
            'order is confirmed',
            'order placed successfully',
            'aapka order place ho gaya',
            'order confirm ho gaya',
            'tracking number',
            'order number'
        ];

        const hasFakePhrase = fakeOrderPhrases.some(phrase =>
            lowerResponse.includes(phrase)
        );

        if (hasFakePhrase) {
            console.log('🚫 Detected fake order phrase in response');
            return true;
        }

        return false;
    }

    /**
     * End chat session
     * @param {string} sessionId - Session ID
     * @returns {Promise<void>}
     */
    async endSession(sessionId) {
        await db.query(
            `UPDATE yovo_tbl_aiva_chat_sessions 
			   SET status = 'ended', end_time = NOW() 
			   WHERE id = ?`,
            [sessionId]
        );
		
		try {
			await TranscriptionService.generateChatAnalytics(sessionId);
		} catch (error) {
			console.error('Error generating chat analytics:', error);
		}
    }

    /**
     * Send message and get AI response
     * @param {Object} params - Message parameters
     * @returns {Promise<Object>} AI response with metadata
     */
    async sendMessage({
        sessionId,
        agentId,
        message,
        image = null,
        userId = null
    }) {
        // Get or create session
		console.log('@@@@@@@@@@', message)
        let session;
        if (sessionId) {
            session = await this.getSession(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }
        } else {
            const agent = await AgentService.getAgent(agentId);
            if (!agent) {
                throw new Error('Agent not found');
            }

            session = await this.createSession({
                tenantId: agent.tenant_id,
                agentId: agentId,
                userId: userId,
                sessionName: message.substring(0, 50)
            });
            sessionId = session.id;
        }

        // Save user message
        const userMessageResult = await this._saveMessage({
            sessionId,
            role: 'user',
            content: message,
            image
        });

		const userMessageId = userMessageResult.messageId || userMessageResult; // Handle both old/new format

		// Track user message analysis cost
		const userAnalysisCost = typeof userMessageResult === 'object' 
			? (userMessageResult.analysisCost + userMessageResult.translationCost)
			: 0.0;
			
        // Get agent with full configuration
        const agent = await AgentService.getAgent(session.agent_id);

        // Get conversation history
        const history = await this.getConversationHistory(sessionId, 10);
		
        const isFirstMessage = history.length === 0;

        // ============================================
        // 🖼️ IMAGE DETECTION - AUTOMATIC SEARCH PATH
        // ============================================

        if (image) {
            console.log('🖼️ IMAGE DETECTED - Using automatic search path (no LLM decision needed)');

            // ============================================
            // 1. AUTOMATIC IMAGE SEARCH (Vector DB)
            // ============================================

            let imageSearchResults = null;
            let imageSearchContext = '';
            let imageSearchCost = 0;

            if (agent.kb_id) {
                try {
                    console.log('🔍 Auto-triggering image search in KB:', agent.kb_id);

                    // Extract base64 from data URI if present
                    let imageBase64 = image;
                    if (image.startsWith('data:')) {
                        imageBase64 = image.split(',')[1];
                    }

                    // Search KB for similar images
                    imageSearchResults = await KnowledgeService.searchImages({
                        kbId: agent.kb_id,
                        tenantId: agent.tenant_id,
                        query: message,
                        imageBase64: imageBase64,
                        searchType: 'image',
                        topK: 5,
                        filters: {}
                    });

                    console.log('✅ Image search completed:', {
                        results_count: imageSearchResults.results?.length || 0,
                        cost: imageSearchResults.cost || 0
                    });

                    imageSearchCost = imageSearchResults.cost || 0;

                    // Build context from image search results
                    if (imageSearchResults.results && imageSearchResults.results.length > 0) {
                        imageSearchContext = '\n\n=== SIMILAR IMAGES IN KNOWLEDGE BASE ===\n';

                        imageSearchResults.results.forEach((result, index) => {
                            imageSearchContext += `\nImage ${index + 1} (Similarity: ${(result.score * 100).toFixed(1)}%):\n`;
                            imageSearchContext += `- Filename: ${result.filename}\n`;

                            if (result.metadata?.description) {
                                imageSearchContext += `- Description: ${result.metadata.description}\n`;
                            }

                            if (result.metadata?.tags) {
                                imageSearchContext += `- Tags: ${result.metadata.tags.join(', ')}\n`;
                            }
                        });

                        imageSearchContext += '\n=== END OF IMAGE SEARCH RESULTS ===\n';
                    }

                } catch (error) {
                    console.error('❌ Image search error:', error);
                    imageSearchContext = '\n\n=== IMAGE SEARCH ERROR ===\nUnable to search images.\n';
                }
            }

            // ============================================
            // 2. AUTOMATIC SHOPIFY PRODUCT SEARCH
            // ============================================

            let shopifyProducts = [];
            let shopifySearchContext = '';
            let shopifySearchCost = 0;

            // Check if agent has Shopify integration
            const hasShopify = agent.shopify_store_url && agent.shopify_access_token;

            if (hasShopify) {
                try {
                    console.log('🛍️ Shopify integration detected - Auto-triggering product search');

                    // ✅ STRATEGY: Direct product lookup from image metadata
                    let productIds = [];
                    let productScores = {}; // Map: product_id → similarity score
                    let searchQuery = message;

                    if (imageSearchResults?.results && imageSearchResults.results.length > 0) {
                        console.log('📦 Extracting product IDs from image search results...');

                        // Extract unique product IDs with their scores
                        imageSearchResults.results.forEach(result => {
                            if (result.metadata?.product_id) {
                                const productId = result.metadata.product_id;

                                // Store the highest score for each product (in case multiple images per product)
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

                        // Also build keyword search as fallback
                        const topResult = imageSearchResults.results[0];
                        const keywords = [];

                        if (topResult.metadata?.tags) {
                            keywords.push(...topResult.metadata.tags);
                        }
                        if (topResult.metadata?.description) {
                            keywords.push(topResult.metadata.description);
                        }

                        if (keywords.length > 0) {
                            searchQuery = keywords.join(' ');
                            console.log('📝 Backup search query from metadata:', searchQuery);
                        }
                    }

                    // Strategy 1: Direct product lookup by IDs (if we have them)
                    if (productIds.length > 0) {
                        console.log('🎯 Fetching products directly by IDs:', productIds);

                        try {
                            const productResults = await ShopifyService.getProductsByIds(
                                agent.tenant_id,
                                agent.shopify_store_url,
                                agent.shopify_access_token,
                                productIds
                            );

                            let products = productResults.products || [];
                            console.log(`📦 Fetched ${products.length} products from database`);

                            // ✅ FIX 1: ATTACH scores to ALL products BEFORE sorting
                            products = products.map(product => {
                                const score = productScores[product.id] || 0;
                                return {
                                    ...product,
                                    similarity_score: score,
                                    match_percentage: Math.round(score * 100)
                                };
                            });

                            // ✅ FIX 2: SORT by similarity_score (now attached to product)
                            products.sort((a, b) => {
                                return b.similarity_score - a.similarity_score; // Descending
                            });

                            shopifyProducts = products;

                            console.log('✅ Products sorted by similarity score');
                            console.log('🏆 Top matches:', shopifyProducts.slice(0, 3).map(p => ({
                                id: p.id,
                                title: p.title,
                                score: p.similarity_score,
                                match: p.match_percentage + '%'
                            })));

                        } catch (directLookupError) {
                            console.error('❌ Direct product lookup failed:', directLookupError);
                            console.error('Stack:', directLookupError.stack);
                            // Fall through to keyword search
                        }
                    }

                    // Strategy 2: Keyword search (if direct lookup didn't work or found nothing)
                    if (shopifyProducts.length === 0 && searchQuery) {
                        console.log('🔍 Falling back to keyword search:', searchQuery);

                        try {
                            // ✅ FIXED: Use ProductService instead of ShopifyService
                            const ProductService = require('./ProductService');

                            const searchResults = await ProductService.listProducts(agent.kb_id, {
                                search: searchQuery,
                                status: 'active',
                                limit: 10,
                                page: 1
                            });

                            // Map products to expected format with handle extraction
                            shopifyProducts = searchResults.products.map(p => {
                                // Extract handle from shopify_metadata
                                let handle = null;
                                if (p.shopify_metadata) {
                                    const metadata = typeof p.shopify_metadata === 'string' ?
                                        JSON.parse(p.shopify_metadata) :
                                        p.shopify_metadata;
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
                                    variants: [], // listProducts doesn't return variants
                                    similarity_score: 0,
                                    match_percentage: 0
                                };
                            });

                            console.log(`✅ Keyword search found ${shopifyProducts.length} products`);

                        } catch (searchError) {
                            console.error('❌ Product search error:', searchError);
                            console.error('Stack:', searchError.stack);
                        }
                    }

                    // Strategy 3: LLM image analysis (only if we have no results yet)
                    if (shopifyProducts.length === 0 && (!imageSearchResults?.results || imageSearchResults.results.length === 0)) {
                        console.log('🤖 No results yet - Using LLM to analyze image');

                        try {
                            const analysisCompletion = await this.openai.chat.completions.create({
                                model: agent.chat_model,
                                messages: [{
                                        role: 'system',
                                        content: 'Extract product attributes from image. Return JSON: {"category":"","color":"","style":"","keywords":[]}'
                                    },
                                    {
                                        role: 'user',
                                        content: [{
                                                type: 'text',
                                                text: 'Identify product attributes'
                                            },
                                            {
                                                type: 'image_url',
                                                image_url: {
                                                    url: image,
                                                    detail: 'low'
                                                }
                                            }
                                        ]
                                    }
                                ],
                                max_tokens: 150,
                                temperature: 0.3
                            });

                            const analysisText = analysisCompletion.choices[0].message.content
                                .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                            const imageAnalysis = JSON.parse(analysisText);

                            console.log('🎯 Image analysis:', imageAnalysis);

                            const searchTerms = [
                                imageAnalysis.category,
                                imageAnalysis.color,
                                imageAnalysis.style,
                                ...(imageAnalysis.keywords || [])
                            ].filter(Boolean);

                            if (searchTerms.length > 0) {
                                searchQuery = searchTerms.join(' ');

                                // ✅ FIXED: Use ProductService
                                const ProductService = require('./ProductService');

                                const searchResults = await ProductService.listProducts(agent.kb_id, {
                                    search: searchQuery,
                                    status: 'active',
                                    limit: 10,
                                    page: 1
                                });

                                // Map products with handle extraction
                                shopifyProducts = searchResults.products.map(p => {
                                    let handle = null;
                                    if (p.shopify_metadata) {
                                        const metadata = typeof p.shopify_metadata === 'string' ?
                                            JSON.parse(p.shopify_metadata) :
                                            p.shopify_metadata;
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
                                        image_url: p.image_url || null,
                                        variants: [],
                                        similarity_score: 0,
                                        match_percentage: 0
                                    };
                                });
                            }

                            // Track LLM cost
                            const analysisCost = CostCalculator.calculateChatCost({
                                    prompt_tokens: analysisCompletion.usage.prompt_tokens,
                                    completion_tokens: analysisCompletion.usage.completion_tokens,
                                    cached_tokens: 0
                                },
                                agent.chat_model
                            );

                            shopifySearchCost += analysisCost.final_cost;

                        } catch (parseError) {
                            console.error('❌ LLM analysis error:', parseError);
                        }
                    }

                    console.log('✅ Shopify search completed:', {
                        products_found: shopifyProducts.length,
                        strategy_used: productIds.length > 0 ? 'direct_lookup' : 'keyword_search'
                    });

                    // Build context from Shopify products
                    if (shopifyProducts.length > 0) {
                        shopifySearchContext = '\n\n=== MATCHING PRODUCTS FROM SHOPIFY ===\n';
                        shopifySearchContext += `Found ${shopifyProducts.length} products matching the image:\n\n`;

                        shopifyProducts.slice(0, 5).forEach((product, index) => {
                            shopifySearchContext += `${index + 1}. **${product.title}**\n`;

                            // Add match percentage if available
                            if (product.match_percentage > 0) {
                                shopifySearchContext += `   🎯 Match: ${product.match_percentage}% similarity\n`;
                            }

                            if (product.variants && product.variants.length > 0) {
                                const variant = product.variants[0];
                                if (variant.price) {
                                    shopifySearchContext += `   💰 Price: $${variant.price}\n`;
                                }
                                if (variant.sku) {
                                    shopifySearchContext += `   🏷️  SKU: ${variant.sku}\n`;
                                }
                                if (variant.inventory_quantity !== undefined) {
                                    shopifySearchContext += `   📦 Stock: ${variant.inventory_quantity > 0 ? 'Available' : 'Out of Stock'}\n`;
                                }
                            }

                            if (product.product_type) {
                                shopifySearchContext += `   📂 Category: ${product.product_type}\n`;
                            }

                            if (product.handle && product.shop_domain) {
                                shopifySearchContext += `   🔗 URL: https://${product.shop_domain}/products/${product.handle}\n`;
                            }

                            shopifySearchContext += '\n';
                        });

                        shopifySearchContext += `=== END OF SHOPIFY PRODUCTS (${shopifyProducts.length} total) ===\n`;
                    } else {
                        shopifySearchContext = '\n\n=== NO MATCHING PRODUCTS ===\nNo products found matching the image.\n';
                    }

                } catch (error) {
                    console.error('❌ Shopify search error:', error);
                    console.error('Error stack:', error.stack);
                    shopifySearchContext = '\n\n=== SHOPIFY SEARCH ERROR ===\nUnable to search products.\n';
                }
            }

            // ============================================
            // 3. BUILD SYSTEM PROMPT WITH ALL CONTEXT
            // ============================================

            let systemPrompt = this._buildSystemPromptWithStrategy(
                agent.instructions,
                agent.conversation_strategy,
                agent.greeting,
                isFirstMessage,
                agent.kb_metadata,
                agent
            );

            // Add all search contexts
            if (imageSearchContext) {
                systemPrompt += imageSearchContext;
            }

            if (shopifySearchContext) {
                systemPrompt += shopifySearchContext;
            }

            // Add specific instructions for image queries
            systemPrompt += '\n\n🎯 IMPORTANT INSTRUCTIONS:\n';
            systemPrompt += '- User shared an image\n';

            if (imageSearchResults?.results && imageSearchResults.results.length > 0) {
                systemPrompt += `- ${imageSearchResults.results.length} similar images were found in the knowledge base\n`;
                systemPrompt += '- Use these similar images to help identify what the user is looking for\n';
            }

            if (shopifyProducts.length > 0) {
                systemPrompt += `- ${shopifyProducts.length} matching products were found in the Shopify store\n`;
                systemPrompt += '- Present these specific products to the user with names, prices, and SKUs\n';
                systemPrompt += '- Include purchase links for the products\n';
                systemPrompt += '- DO NOT ask for more information - provide the products that match\n';
                systemPrompt += '- Highlight which products best match based on the similar images found\n';
            } else if (imageSearchResults?.results && imageSearchResults.results.length > 0) {
                systemPrompt += '- No Shopify products found, but similar images exist in knowledge base\n';
                systemPrompt += '- Describe what you found in the knowledge base images\n';
            }

            systemPrompt += '- Be specific and actionable in your recommendations\n';
            systemPrompt += '- If products are available, present them immediately\n';
            systemPrompt += '- Set product_search_needed=false since search is already done\n';
            systemPrompt += '- Respond in JSON format as usual\n\n';

            // ============================================
            // 4. SINGLE LLM CALL WITH ALL CONTEXT
            // ============================================

            const messages = [{
                    role: 'system',
                    content: systemPrompt
                },
                ...history.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                {
                    role: 'user',
                    content: [{
                            type: 'text',
                            text: message
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: image,
                                detail: 'high'
                            }
                        }
                    ]
                }
            ];

            const model = agent.chat_model || 'gpt-4o-mini';

            const completion = await this.openai.chat.completions.create({
                model: model,
                messages: messages,
                response_format: {
                    type: "json_object"
                },
                temperature: parseFloat(agent.temperature) || 0.7,
                max_tokens: agent.max_tokens || 4096
            });

            const aiMessage = completion.choices[0].message;
            let llmDecision;

            try {
                llmDecision = JSON.parse(aiMessage.content);
                console.log('🤖 LLM Response (with image context):', JSON.stringify(llmDecision, null, 2));
            } catch (error) {
                console.error('❌ Failed to parse LLM JSON:', aiMessage.content);
                llmDecision = {
                    response: aiMessage.content,
                    product_search_needed: false,
                    knowledge_search_needed: false,
					product_search_type: "none",
					product_id: null,
					needs_clarification: false,
                    agent_transfer: false,
                    order_intent_detected: false,
                    conversation_complete: false,
                    user_wants_to_end: false
                };
            }

            let shouldCloseSession = false;

            if (llmDecision.conversation_complete && llmDecision.user_wants_to_end) {
                console.log('👋 User wants to end conversation - closing session');
                shouldCloseSession = true;

                // Check if agent has custom goodbye message in instructions
                const hasGoodbyeInInstructions = agent.instructions &&
                    (agent.instructions.toLowerCase().includes('allah hafiz') ||
                        agent.instructions.toLowerCase().includes('goodbye') ||
                        agent.instructions.toLowerCase().includes('closing'));

                // If no custom goodbye in LLM response and no instructions, add default
                if (!llmDecision.response.toLowerCase().includes('allah hafiz') &&
                    !llmDecision.response.toLowerCase().includes('thank') &&
                    !hasGoodbyeInInstructions) {
                    llmDecision.response += "\n\nThank you for contacting us. Allah Hafiz!";
                }
            }

            if (llmDecision.order_intent_detected) {
                console.log('🛒 Order intent detected');

                // Check if agent has order processing capability
                const hasOrderCapability = this._checkOrderCapability(agent);

                if (!hasOrderCapability.canProcess) {
                    console.log('⚠️ No order capability:', hasOrderCapability.reason);

                    // Override response if LLM generated fake order number
                    if (this._containsFakeOrderNumber(llmDecision.response)) {
                        console.log('🚫 Fake order number detected, overriding response');

                        if (hasOrderCapability.hasShopifyProducts) {
                            // Has products but no order function - share purchase URL
                            llmDecision.response = "Main aapko product ka purchase link share kar sakti hoon jahan se aap order place kar sakte hain. Kya aap product dekhna chahenge?";
                            llmDecision.product_search_needed = true;
                        } else {
                            // No capability at all - offer transfer
                            llmDecision.response = "Mujhe maaf kariye, lekin main directly orders process nahi kar sakti. Kya main aapko ek human agent se connect kar doon jo aapki order place karne mein madad kar sakenge?";
                            llmDecision.agent_transfer = true;
                        }
                    }
                }
            }

            // Calculate LLM cost
            const llmCost = CostCalculator.calculateChatCost({
                    prompt_tokens: completion.usage.prompt_tokens,
                    completion_tokens: completion.usage.completion_tokens,
                    cached_tokens: 0
                },
                model
            );

            console.log('💰 LLM call cost:', llmCost.final_cost);

            // ============================================
            // 5. FORMAT RESPONSE AND RETURN
            // ============================================

            const formattedResponse = markdown.formatResponse(llmDecision.response);

            // Combine all costs
            const costs = [llmCost];

            // Add image search cost if present
            if (imageSearchCost > 0) {
                costs.push({
                    final_cost: imageSearchCost,
                    base_cost: imageSearchCost,
                    markup_cost: 0,
                    profit_margin: 0
                });
            }

            // Add Shopify search cost if present
            if (shopifySearchCost > 0) {
                costs.push({
                    final_cost: shopifySearchCost,
                    base_cost: shopifySearchCost,
                    markup_cost: 0,
                    profit_margin: 0
                });
            }

            const totalCost = CostCalculator.combineCosts(costs);

			// ============================================
			// 💰 ADD ANALYSIS COST TO TOTAL COST (IMAGE PATH)
			// ============================================
			if (userAnalysisCost > 0) {
				console.log(`💰 [IMAGE PATH] Adding user analysis cost: $${userAnalysisCost.toFixed(6)}`);
				
				// Ensure operations array exists
				if (!totalCost.operations) {
					totalCost.operations = [];
				}
				
				// Add analysis as an operation
				totalCost.operations.push({
					operation: 'message_analysis',
					quantity: 1,
					unit_cost: userAnalysisCost,
					total_cost: userAnalysisCost,
					details: {
						sentiment_analysis: true,
						language_detection: true,
						profanity_detection: true,
						intent_detection: true
					}
				});
				
				// Update cost breakdown totals
				const baseAnalysisCost = userAnalysisCost / 1.2; // Remove 20% profit margin
				totalCost.base_cost = (totalCost.base_cost || 0) + baseAnalysisCost;
				totalCost.profit_amount = (totalCost.profit_amount || 0) + (userAnalysisCost - baseAnalysisCost);
				totalCost.final_cost = (totalCost.final_cost || 0) + userAnalysisCost;
				
				console.log(`💰 [IMAGE PATH] Updated total cost with analysis: $${totalCost.final_cost.toFixed(6)}`);
			}

            // Save assistant message
            const assistantMessageId = await this._saveMessage({
                sessionId,
                role: 'assistant',
                content: formattedResponse.text,
                contentHtml: formattedResponse.html,
                contentMarkdown: formattedResponse.markdown,
                sources: imageSearchResults?.results || [],
                images: imageSearchResults?.results || [],
                products: shopifyProducts.slice(0, 10),
                functionCalls: [],
                cost: totalCost.final_cost,
                costBreakdown: totalCost,
                tokensInput: completion.usage.prompt_tokens,
                tokensOutput: completion.usage.completion_tokens,
                processingTimeMs: 0,
                agentTransferRequested: llmDecision.agent_transfer || false,
                metadata: {
                    image_provided: true,
                    automatic_search_triggered: true,
                    image_search_results: imageSearchResults?.results?.length || 0,
                    shopify_products_found: shopifyProducts.length
                }
            });

            // Update session stats
            await this._updateSessionStats(sessionId, totalCost.final_cost);

            if (shouldCloseSession) {
                console.log('🔒 Closing session:', sessionId);
				
				await db.query(
					'UPDATE yovo_tbl_aiva_chat_sessions SET feedback_requested = 1 WHERE id = ?',
					[sessionId]
				);
				
                await this.endSession(sessionId);
            }

            // Build operations array for cost_breakdown
            const operations = [];

            // Add LLM operation
            operations.push({
                operation: 'llm_completion',
                base_cost: llmCost.base_cost || llmCost.final_cost,
                markup_cost: llmCost.markup_cost || 0,
                total_cost: llmCost.final_cost,
                tokens: {
                    prompt: completion.usage.prompt_tokens,
                    completion: completion.usage.completion_tokens,
                    total: completion.usage.total_tokens
                }
            });

            // Add image search operation
            if (imageSearchCost > 0) {
                operations.push({
                    operation: 'image_search',
                    base_cost: imageSearchCost,
                    markup_cost: 0,
                    total_cost: imageSearchCost,
                    results_count: imageSearchResults?.results?.length || 0
                });
            }

            // Add Shopify search operation
            if (shopifySearchCost > 0) {
                operations.push({
                    operation: 'shopify_product_search',
                    base_cost: shopifySearchCost,
                    markup_cost: 0,
                    total_cost: shopifySearchCost,
                    products_found: shopifyProducts.length
                });
            }

            return {
                session_id: sessionId,
                message_id: assistantMessageId,
                agent_transfer: llmDecision.agent_transfer || false,
                interaction_closed: shouldCloseSession,
				show_feedback_prompt: shouldCloseSession,  
                response: {
                    text: formattedResponse.text,
                    html: formattedResponse.html,
                    markdown: formattedResponse.markdown
                },
                sources: imageSearchResults?.results?.map(r => ({
                    type: 'image',
                    image_id: r.image_id,
                    filename: r.filename,
                    similarity_score: r.score,
                    metadata: r.metadata || {}
                })) || [],
                images: imageSearchResults?.results?.map(img => ({
                    image_id: img.image_id,
                    url: img.image_url,
                    thumbnail_url: img.thumbnail_url,
                    title: img.filename,
                    description: img.metadata?.description,
                    similarity_score: img.score,
                    metadata: img.metadata || {}
                })) || [],
                products: shopifyProducts.slice(0, 10).map(p => ({
                    product_id: p.id,
                    shopify_product_id: p.shopify_product_id,
                    title: p.title,
                    description: p.description,
                    image_url: p.image_url,
                    price: p.variants?.[0]?.price,
                    sku: p.variants?.[0]?.sku,
                    inventory_quantity: p.variants?.[0]?.inventory_quantity,
                    available: p.variants?.[0]?.inventory_quantity > 0,
                    similarity_score: p.similarity_score || null,
                    match_percentage: p.match_percentage || null,
                    handle: p.handle || null,
                    vendor: p.vendor,
                    product_type: p.product_type,
                    tags: p.tags || [],
                    // Use shop_domain from product if available, fallback to agent
                    url: (p.handle && (p.shop_domain || agent.shopify_store_url)) ?
                        `https://${p.shop_domain || agent.shopify_store_url}/products/${p.handle}` :
                        null,
                    purchase_url: (p.handle && (p.shop_domain || agent.shopify_store_url)) ?
                        `https://${p.shop_domain || agent.shopify_store_url}/products/${p.handle}` :
                        null,
                    metadata: p.metadata || {}
                })),
                function_calls: [],
                llm_decision: {
                    collecting_preferences: false,
                    preferences_collected: {},
                    ready_to_search: false,
                    product_search_needed: false,
                    knowledge_search_needed: false,
					product_search_type: "none",
					product_id: null,
					needs_clarification: false,
                    conversation_complete: llmDecision.conversation_complete || false, // ✅ ADD
                    user_wants_to_end: llmDecision.user_wants_to_end || false
                },
                context_used: {
                    knowledge_base_chunks: 0,
                    image_search_results: imageSearchResults?.results?.length || 0,
                    shopify_products_found: shopifyProducts.length,
                    conversation_history_messages: history.length,
                    total_context_tokens: completion.usage.prompt_tokens
                },
                agent_metadata: {
                    agent_id: agent.id,
                    agent_name: agent.name,
                    provider: 'openai',
                    model: model,
                    temperature: agent.temperature || 0.7,
                    has_shopify: hasShopify
                },
                cost: totalCost.final_cost,
                cost_breakdown: {
                    ...totalCost,
                    operations: operations
                }
            };
        }

        // ============================================
        // 📝 NO IMAGE - USE ORIGINAL TWO-PASS FLOW
        // ============================================

        console.log('📝 No image detected - Using original LLM decision flow');

        // Build enhanced system prompt with strategy
        const systemPrompt = this._buildSystemPromptWithStrategy(
            agent.instructions,
            agent.conversation_strategy,
            agent.greeting,
            isFirstMessage,
            agent.kb_metadata,
            agent
        );
		
        // Build messages for OpenAI
        const messages = [{
                role: 'system',
                content: systemPrompt
            },
            ...history.map(msg => ({
                role: msg.role,
                content: msg.content
            })),
            {
                role: 'user',
                content: message
            }
        ];

        // Prepare tools/functions
        const tools = agent.functions && agent.functions.length > 0 ?
			agent.functions.map(fn => ({
				type: 'function',
				function: {
					name: fn.name,
					description: fn.description,
					parameters: fn.parameters
				}
			})) :
			undefined;

		// Call OpenAI
		const model = agent.chat_model || 'gpt-4o-mini';
		const hasTools = tools && tools.length > 0;

		const completion = await this.openai.chat.completions.create({
			model: model,
			messages: messages,
			tools: hasTools ? tools : undefined,
			// ⚠️ JSON mode conflicts with tool_calls - only use when no tools
			response_format: hasTools ? undefined : { type: "json_object" },
			temperature: parseFloat(agent.temperature) || 0.7,
			max_tokens: agent.max_tokens || 4096
		});

		const aiMessage = completion.choices[0].message;
		const finishReason = completion.choices[0].finish_reason;

		console.log('🤖 OpenAI Response:', {
			finish_reason: finishReason,
			has_content: !!aiMessage.content,
			has_tool_calls: !!aiMessage.tool_calls
		});

		// ✅ Calculate first call cost IMMEDIATELY
		let llmCost = CostCalculator.calculateChatCost({
			prompt_tokens: completion.usage.prompt_tokens,
			completion_tokens: completion.usage.completion_tokens,
			cached_tokens: completion.usage.prompt_tokens_details?.cached_tokens || 0
		}, model);

		console.log('💰 First LLM call cost:', llmCost.final_cost);

		let llmDecision;
		let executedFunctionCalls = []; // Track function calls for response

		// ============================================
		// 🔧 HANDLE TOOL CALLS SCENARIO
		// ============================================
		if (finishReason === 'tool_calls' && aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
			console.log('🔧 Model requested tool calls - executing functions first');
			
			// Execute all tool calls
			const toolResults = [];
			
			for (const toolCall of aiMessage.tool_calls) {
				const functionName = toolCall.function.name;
				const functionArgs = JSON.parse(toolCall.function.arguments);
				
				console.log(`📞 Executing function: ${functionName}`, functionArgs);
				
				const functionResult = await this._executeFunction(
					agent,
					functionName,
					functionArgs
				);
				
				executedFunctionCalls.push({
					function_id: toolCall.id,
					function_name: functionName,
					arguments: functionArgs,
					result: functionResult,
					status: 'success'
				});
				
				toolResults.push({
					tool_call_id: toolCall.id,
					role: 'tool',
					content: JSON.stringify(functionResult)
				});
			}
			
			// Make second call to get final response with tool results
			const messagesWithToolResults = [
				...messages,
				aiMessage, // Include assistant's tool call message
				...toolResults // Include tool results
			];
			
			const finalCompletion = await this.openai.chat.completions.create({
				model: model,
				messages: messagesWithToolResults,
				response_format: { type: "json_object" }, // Now safe to use JSON mode
				temperature: parseFloat(agent.temperature) || 0.7,
				max_tokens: agent.max_tokens || 4096
			});
			
			const finalMessage = finalCompletion.choices[0].message;
			
			// ✅ Calculate second call cost
			const secondCallCost = CostCalculator.calculateChatCost({
				prompt_tokens: finalCompletion.usage.prompt_tokens,
				completion_tokens: finalCompletion.usage.completion_tokens,
				cached_tokens: finalCompletion.usage.prompt_tokens_details?.cached_tokens || 0
			}, model);
			
			console.log('💰 Second LLM call cost:', secondCallCost.final_cost);
			
			// ✅ Combine costs
			llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);
			console.log('💰 Combined LLM cost (with tool calls):', llmCost.final_cost);
			
			// Parse final response
			try {
				llmDecision = JSON.parse(finalMessage.content);
				console.log('🤖 LLM Decision (after tool execution):', JSON.stringify(llmDecision, null, 2));
			} catch (parseError) {
				console.error('❌ Failed to parse final response:', finalMessage.content);
				llmDecision = {
					response: finalMessage.content || "I've processed your request.",
					product_search_needed: false,
					knowledge_search_needed: false,
					product_search_type: "none",
					product_id: null,
					needs_clarification: false,
					agent_transfer: false,
					order_intent_detected: false,
					conversation_complete: false,
					user_wants_to_end: false
				};
			}

		} else {
			// ============================================
			// 📝 NORMAL RESPONSE (no tool calls)
			// ============================================
			
			if (aiMessage.content) {
				try {
					// Try JSON parse first
					llmDecision = JSON.parse(aiMessage.content);
					console.log('🤖 LLM Decision:', JSON.stringify(llmDecision, null, 2));
				} catch (jsonError) {
					// Not valid JSON - wrap the response
					console.log('⚠️ Response not JSON (tools enabled), wrapping response');
					llmDecision = {
						response: aiMessage.content,
						product_search_needed: false,
						knowledge_search_needed: true,
						product_search_type: "none",
						product_id: null,
						needs_clarification: false,
						collecting_preferences: false,
						preferences_collected: {},
						ready_to_search: false,
						agent_transfer: false,
						order_intent_detected: false,
						conversation_complete: false,
						user_wants_to_end: false
					};
				}
			} else {
				// No content at all - shouldn't happen but handle it
				console.error('❌ No content in response');
				llmDecision = {
					response: "I apologize, but I couldn't process your request. Please try again.",
					product_search_needed: false,
					knowledge_search_needed: false,
					product_search_type: "none",
					product_id: null,
					needs_clarification: false,
					agent_transfer: false,
					order_intent_detected: false,
					conversation_complete: false,
					user_wants_to_end: false
				};
			}
		}

		// ✅ Use executedFunctionCalls later instead of functionCalls
		const functionCalls = executedFunctionCalls;

        let shouldCloseSession = false;

        if (llmDecision && llmDecision.conversation_complete && llmDecision.user_wants_to_end) {
            console.log('👋 User wants to end conversation - closing session');
            shouldCloseSession = true;

            // Check if agent has custom goodbye message in instructions
            const hasGoodbyeInInstructions = agent.instructions &&
                (agent.instructions.toLowerCase().includes('allah hafiz') ||
                    agent.instructions.toLowerCase().includes('goodbye') ||
                    agent.instructions.toLowerCase().includes('closing'));

            // If no custom goodbye in LLM response and no instructions, add default
            if (!llmDecision.response.toLowerCase().includes('allah hafiz') &&
                !llmDecision.response.toLowerCase().includes('thank') &&
                !hasGoodbyeInInstructions) {
                llmDecision.response += "\n\nThank you for Contacting us. Allah Hafiz!";
            }
        }

        console.log('💰 First LLM call cost:', llmCost.final_cost);

        // Initialize knowledge cost tracker
        let knowledgeCost = null;

        // Product search - Only if LLM says ready
        let knowledgeResults = null;

        // Product search - Only if LLM says ready
        if (llmDecision && llmDecision.product_search_needed && agent.kb_id) {
    
			const searchType = llmDecision.product_search_type || 'multi';
			
			console.log(`🔍 Product search type: ${searchType}`);
			
			if (searchType === 'single' && llmDecision.product_id) {
			// ════════════════════════════════════════════════════════════════
			// 🎯 SINGLE PRODUCT LOOKUP (Direct DB fetch - fast & precise)
			// ════════════════════════════════════════════════════════════════
			console.log(`🎯 Single product lookup: ${llmDecision.product_id}`);
			
			try {
				const ProductService = require('./ProductService');
				const product = await ProductService.getProduct(llmDecision.product_id);
				
				if (product) {
					// Ensure variants are loaded
					if (!product.variants || product.variants.length === 0) {
						product.variants = await ProductService.getVariants(llmDecision.product_id);
					}
					
					// Extract handle from metadata if not present
					let handle = product.handle;
					if (!handle && product.shopify_metadata) {
						const metadata = typeof product.shopify_metadata === 'string' 
							? JSON.parse(product.shopify_metadata) 
							: product.shopify_metadata;
						handle = metadata?.handle;
					}
					
					// Build purchase URL
					const purchaseUrl = (handle && product.shop_domain)
						? `https://${product.shop_domain}/products/${handle}`
						: null;
					
					// ════════════════════════════════════════════════════════════════
					// 🖼️ Extract Shopify CDN image URL from metadata
					// ════════════════════════════════════════════════════════════════
					let imageUrl = null;
					if (product.images && product.images.length > 0) {
						const firstImage = product.images[0];
						if (firstImage.metadata) {
							const imgMetadata = typeof firstImage.metadata === 'string'
								? JSON.parse(firstImage.metadata)
								: firstImage.metadata;
							imageUrl = imgMetadata?.shopify_image_src || null;
						}
					}
					
					// Build available/out-of-stock sizes
					const availableSizes = [];
					const outOfStockSizes = [];
					
					(product.variants || []).forEach(v => {
						const variantName = v.title || v.option1 || 'Default';
						if (variantName !== 'Default Title') {
							if ((v.inventory_quantity || 0) > 0) {
								availableSizes.push(variantName);
							} else {
								outOfStockSizes.push(variantName);
							}
						}
					});
					
					// Calculate total inventory
					const totalInventory = (product.variants || []).reduce(
						(sum, v) => sum + (v.inventory_quantity || 0), 0
					);
					
					// ════════════════════════════════════════════════════════════════
					// 📦 Format to MATCH multi-product search result structure
					// ════════════════════════════════════════════════════════════════
					knowledgeResults = {
						text_results: [],
						image_results: [],
						product_results: [{
							// Core fields (same as multi)
							product_id: product.id,
							name: product.title,
							description: product.description,
							image_url: imageUrl,  // Shopify CDN URL
							price: parseFloat(product.price) || 0,
							availability: totalInventory > 0 ? 'in_stock' : 'out_of_stock',
							similarity_score: 1.0,  // Perfect match for direct lookup
							
							// Match reason (same structure as multi)
							match_reason: {
								semantic_score: 1.0,
								match_type: 'direct_lookup',
								matched_on: ['product_id']
							},
							
							// Metadata object (same as multi)
							metadata: {
								vendor: product.vendor,
								product_type: product.product_type,
								tags: product.tags || [],
								shopify_product_id: product.shopify_product_id,
								total_inventory: totalInventory,
								available_sizes: availableSizes,
								out_of_stock_sizes: outOfStockSizes,
								handle: handle,
								purchase_url: purchaseUrl
							},
							
							// URL fields
							url: `/shopify/products/${product.id}`,
							purchase_url: purchaseUrl,
							
							// Additional fields for detailed context (used in LLM prompt)
							variants: (product.variants || []).map(v => ({
								variant_id: v.shopify_variant_id || v.id,
								title: v.title,
								sku: v.sku,
								price: parseFloat(v.price) || null,
								compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
								inventory_quantity: v.inventory_quantity || 0,
								available: (v.inventory_quantity || 0) > 0,
								option1: v.option1,
								option2: v.option2,
								option3: v.option3
							}))
						}]
					};
					
					console.log(`✅ Loaded single product: ${product.title}`);
					console.log(`   Shopify Product ID: ${product.shopify_product_id}`);
					console.log(`   Image URL: ${imageUrl || 'N/A'}`);
					console.log(`   Variants: ${product.variants?.length || 0}`);
					console.log(`   Available sizes: ${availableSizes.join(', ') || 'None'}`);
					console.log(`   Out of stock: ${outOfStockSizes.join(', ') || 'None'}`);
					console.log(`   Purchase URL: ${purchaseUrl || 'N/A'}`);
					
				} else {
					console.log(`⚠️ Product not found: ${llmDecision.product_id}`);
				}
				
			} catch (error) {
				console.error(`❌ Single product lookup error:`, error);
			}
			
		} else if (searchType === 'multi' || llmDecision.ready_to_search) {
				// ════════════════════════════════════════════════════════════════
				// 🔍 MULTI PRODUCT SEARCH (Semantic search - for browsing/discovery)
				// ════════════════════════════════════════════════════════════════
				const searchQuery = llmDecision.product_search_query || llmDecision.search_query || message;
				
				console.log(`🔍 Multi product search: "${searchQuery}"`);
				
				try {
					const searchResult = await KnowledgeService.search({
						kbId: agent.kb_id,
						query: searchQuery,
						image: null,
						topK: 5,
						searchType: 'text',
						filters: {
							include_products: true
						}
					});

					console.log('🔍 Knowledge search results:', {
						text_results: searchResult.results?.text_results?.length || 0,
						image_results: searchResult.results?.image_results?.length || 0,
						product_results: searchResult.results?.product_results?.length || 0
					});

					knowledgeResults = searchResult.results;
					knowledgeCost = searchResult.cost_breakdown;

					console.log(`✅ Found ${knowledgeResults?.product_results?.length || 0} products`);
					
				} catch (error) {
					console.error('❌ Multi product search error:', error);
				}
			}
			
			// ════════════════════════════════════════════════════════════════
			// 📝 CALL LLM AGAIN WITH PRODUCT RESULTS
			// ════════════════════════════════════════════════════════════════
			if (knowledgeResults?.product_results && knowledgeResults.product_results.length > 0) {
				console.log('🔄 Calling LLM again WITH product results...');

				// Build detailed product context based on search type
				let productContext;
				
				if (searchType === 'single' && knowledgeResults.product_results.length === 1) {
					// SINGLE PRODUCT - Include full details with variants
					const product = knowledgeResults.product_results[0];
					
					productContext = `
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		📦 SPECIFIC PRODUCT DETAILS (User is asking about THIS product)
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

		Product Name: ${product.name || product.title}
		Product ID: ${product.product_id}
		Price: PKR ${product.price}${product.compare_at_price ? ` (Original: PKR ${product.compare_at_price})` : ''}
		Vendor: ${product.vendor || 'N/A'}
		Category: ${product.product_type || 'N/A'}

		📝 Description:
		${product.description || 'No description available'}

		📏 SIZES & AVAILABILITY:
		${product.variants && product.variants.length > 0 
			? product.variants.map(v => {
				const status = v.inventory_quantity > 0 
					? `✅ In Stock (${v.inventory_quantity} available)` 
					: '❌ Out of Stock';
				const priceInfo = v.price && parseFloat(v.price) !== parseFloat(product.price) 
					? ` - PKR ${v.price}` 
					: '';
				return `  • ${v.title || 'Default'}: ${status}${priceInfo}`;
			}).join('\n')
			: '  No size variants available'
		}

		📊 AVAILABILITY SUMMARY:
		  ✅ Available Sizes: ${product.available_sizes?.length > 0 ? product.available_sizes.join(', ') : 'None available'}
		  ❌ Out of Stock: ${product.out_of_stock_sizes?.length > 0 ? product.out_of_stock_sizes.join(', ') : 'All in stock'}
		  📦 Total Inventory: ${product.total_inventory || 0} units

		🔗 Purchase URL: ${product.purchase_url || 'Not available'}

		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		⚠️ IMPORTANT INSTRUCTIONS:
		- Answer the user's question using ONLY the above product details
		- Be SPECIFIC about sizes and availability
		- If user asks about a size, tell them if it's in stock or not
		- Include the purchase URL when relevant
		- DO NOT search for more products - you have all the information
		- DO NOT set product_search_needed = true
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
				} else {
					// MULTI PRODUCT - Show list of products
					productContext = knowledgeResults.product_results.map((product, idx) =>
						`[Product ${idx + 1}]
		Name: ${product.name || product.title}
		Price: PKR ${product.price}${product.compare_at_price ? ` (was PKR ${product.compare_at_price})` : ''}
		Description: ${product.description?.substring(0, 150) || 'No description'}...
		Availability: ${product.availability || (product.total_inventory > 0 ? 'In Stock' : 'Out of Stock')}
		${product.available_sizes?.length > 0 ? `Available Sizes: ${product.available_sizes.join(', ')}` : ''}
		Purchase URL: ${product.purchase_url || 'N/A'}`
					).join('\n\n');
					
					productContext = `
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		PRODUCT SEARCH RESULTS
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

		Found ${knowledgeResults.product_results.length} products:

		${productContext}

		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

		CRITICAL: Present these products naturally to the user.
		- DO NOT say "I need to search" - you already have the results
		- DO NOT set product_search_needed=true again
		- Present the products in a helpful, conversational way
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
				}

				// Build messages with product context
				const messagesWithContext = [{
						role: 'system',
						content: `${systemPrompt}\n\n${productContext}`
					},
					...history.map(msg => ({
						role: msg.role,
						content: msg.content
					})),
					{
						role: 'user',
						content: message
					}
				];

				// Call LLM again
				// Call LLM again with product context
				try {
					const finalCompletion = await this.openai.chat.completions.create({
						model: model,
						messages: messagesWithContext,
						response_format: {
							type: "json_object"
						},
						temperature: parseFloat(agent.temperature) || 0.7,
						max_tokens: 2048  // ✅ Sufficient for JSON response, prevents timeout
					});

					const finalMessage = finalCompletion.choices[0].message;
					const finishReason = finalCompletion.choices[0].finish_reason;
					
					console.log('📝 Second LLM call (knowledge) finish_reason:', finishReason);
					
					if (finishReason === 'length') {
						console.warn('⚠️ Response was truncated (hit max_tokens limit)');
					}

					try {
						const finalDecision = JSON.parse(finalMessage.content);
						console.log('✅ LLM generated final answer with knowledge results');

						// Update response with final answer
						llmDecision.response = finalDecision.response;
						llmDecision.knowledge_search_needed = false;

						// Add second call cost
						const secondCallCost = CostCalculator.calculateChatCost({
							prompt_tokens: finalCompletion.usage.prompt_tokens,
							completion_tokens: finalCompletion.usage.completion_tokens,
							cached_tokens: 0
						}, model);

						console.log('💰 Second LLM call cost:', secondCallCost.final_cost);
						llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);
						console.log('💰 Total LLM cost (both calls):', llmCost.final_cost);

					} catch (parseError) {
						console.error('❌ Failed to parse final LLM response (knowledge):', parseError.message);
						console.error('📄 Raw response (first 500 chars):', finalMessage.content?.substring(0, 500));
						
						// ✅ FALLBACK: Use raw content if JSON parsing fails
						if (finalMessage.content) {
							// Try to extract just the response text
							const responseMatch = finalMessage.content.match(/"response"\s*:\s*"([^"]+)"/);
							if (responseMatch) {
								llmDecision.response = responseMatch[1];
								console.log('✅ Extracted response from partial JSON');
							} else {
								// Use raw content as last resort
								llmDecision.response = "I found some information but had trouble formatting it. Please try asking again.";
								console.log('⚠️ Using generic fallback response');
							}
						}
						
						llmDecision.knowledge_search_needed = false;
					}
					
				} catch (llmError) {
					console.error('❌ Second LLM call (knowledge) failed:', llmError.message);
					
					// ✅ FALLBACK: Provide helpful message
					llmDecision.response = "I found some relevant information but encountered an error while processing it. Please try asking your question again.";
					llmDecision.knowledge_search_needed = false;
					
					console.log('⚠️ Using fallback response due to LLM error');
				}
			}
		}

        // Knowledge search - Only if LLM says needed
        if (llmDecision && llmDecision.knowledge_search_needed && agent.kb_id && !knowledgeResults) {
            try {
                const searchQuery = llmDecision.knowledge_search_query || message;

                console.log(`📚 Knowledge Search: "${searchQuery}"`);

                const searchResult = await KnowledgeService.search({
                    kbId: agent.kb_id,
                    query: searchQuery,
                    image: null,
                    topK: 5,
                    searchType: 'text',
                    filters: {
                        include_products: false
                    }
                });

                knowledgeResults = searchResult.results;
                knowledgeCost = searchResult.cost_breakdown;

                console.log('🔍 Knowledge search results:', {
                    text_results: searchResult.results?.text_results?.length || 0,
                    image_results: searchResult.results?.image_results?.length || 0,
                    product_results: searchResult.results?.product_results?.length || 0
                });

                // Log first image result to see structure
                if (searchResult.results?.image_results && searchResult.results.image_results.length > 0) {
                    console.log('📸 First image result structure:', JSON.stringify(searchResult.results.image_results[0], null, 2));
                }
                console.log(`✅ Found ${knowledgeResults?.text_results?.length || 0} knowledge chunks`);

                // ✅ Call LLM AGAIN with search results
                if (knowledgeResults?.text_results && knowledgeResults.text_results.length > 0) {
                    console.log('🔄 Calling LLM again WITH search results...');

                    // Build context from search results
                    const contextChunks = knowledgeResults.text_results.map((result, idx) =>
                        `[Source ${idx + 1}] ${result.content}`
                    ).join('\n\n');

                    // Build messages with context
                    const messagesWithContext = [{
                            role: 'system',
                            content: `${systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEARCH RESULTS FROM KNOWLEDGE BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Query: "${searchQuery}"

${contextChunks}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: Use the above search results to answer the user's question.
- Provide a direct answer based on the search results
- DO NOT say "I need to search" - you already have the results
- DO NOT set knowledge_search_needed=true again
- Answer naturally without mentioning "search results"

Your response MUST be in JSON format with knowledge_search_needed=false.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
                        },
                        ...history.map(msg => ({
                            role: msg.role,
                            content: msg.content
                        })),
                        {
                            role: 'user',
                            content: message
                        }
                    ];

                    // Second LLM call
                    // Call LLM again with product context
					try {
						const finalCompletion = await this.openai.chat.completions.create({
							model: model,
							messages: messagesWithContext,
							response_format: {
								type: "json_object"
							},
							temperature: parseFloat(agent.temperature) || 0.7,
							max_tokens: 2048  // ✅ Sufficient for JSON response, prevents timeout
						});

						const finalMessage = finalCompletion.choices[0].message;
						const finishReason = finalCompletion.choices[0].finish_reason;
						
						console.log('📝 Second LLM call finish_reason:', finishReason);
						
						// ✅ Check if response was cut off
						if (finishReason === 'length') {
							console.warn('⚠️ Response was truncated (hit max_tokens limit)');
						}

						try {
							const finalDecision = JSON.parse(finalMessage.content);
							console.log('✅ LLM generated final answer with products');

							llmDecision.response = finalDecision.response;
							llmDecision.product_search_needed = false;
							llmDecision.ready_to_search = false;

							// Add second call cost
							const secondCallCost = CostCalculator.calculateChatCost({
								prompt_tokens: finalCompletion.usage.prompt_tokens,
								completion_tokens: finalCompletion.usage.completion_tokens,
								cached_tokens: 0
							}, model);

							console.log('💰 Second LLM call cost:', secondCallCost.final_cost);
							llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);
							console.log('💰 Total LLM cost (both calls):', llmCost.final_cost);

						} catch (parseError) {
							console.error('❌ Failed to parse final LLM response (knowledge):', parseError.message);
							console.error('📄 Raw response (first 500 chars):', finalMessage.content?.substring(0, 500));
							
							// ✅ FALLBACK: Try to extract response from partial JSON
							if (finalMessage.content) {
								const responseMatch = finalMessage.content.match(/"response"\s*:\s*"([^"]+)"/);
								if (responseMatch) {
									llmDecision.response = responseMatch[1];
									console.log('✅ Extracted response from partial JSON');
								} else {
									llmDecision.response = "I found some information but had trouble formatting it. Please try asking again.";
									console.log('⚠️ Using generic fallback response');
								}
							}
							
							llmDecision.knowledge_search_needed = false;
						}
						
					} catch (llmError) {
						console.error('❌ Second LLM call (knowledge) failed:', llmError.message);
						
						// ✅ FALLBACK: Provide helpful message
						llmDecision.response = "I found some relevant information but encountered an error while processing it. Please try asking your question again.";
						llmDecision.knowledge_search_needed = false;
						
						console.log('⚠️ Using fallback response due to LLM error');
					}
                }

            } catch (error) {
                console.error('Knowledge search failed:', error);
            }
        }

        // Enhanced agent transfer detection
        let agentTransferRequested = (llmDecision && llmDecision.agent_transfer) || false;

        // Additional transfer detection from response content
        const transferIndicators = [
            'connect you with a human',
            'transfer you to',
            'speak with a human',
            'talk to a human',
            'human agent',
            'live agent',
            'customer service representative',
            'connect you with someone',
            'let me get someone'
        ];

        const lowerContent = (llmDecision && llmDecision.response || '').toLowerCase();
        if (!agentTransferRequested) {
            agentTransferRequested = transferIndicators.some(indicator =>
                lowerContent.includes(indicator)
            );
        }

        // Check user message for explicit transfer requests
        const userTransferPhrases = [
            'speak to human',
            'talk to agent',
            'transfer me',
            'human please',
            'real person',
            'customer service',
            'representative',
            'connect me',
            'speak to manager',
            'talk to someone',
            'real agent',
            'get me a human'
        ];

        const lowerUserMessage = message.toLowerCase();
        const userRequestedTransfer = userTransferPhrases.some(phrase =>
            lowerUserMessage.includes(phrase)
        );

        if (userRequestedTransfer) {
            agentTransferRequested = true;

            // If LLM didn't handle it, add transfer message
            if (!transferIndicators.some(indicator => lowerContent.includes(indicator))) {
                llmDecision.response = "I understand you'd like to speak with a human agent. Let me connect you right away. Please hold for a moment.";
            }
        }

        // Log transfer decision
        if (agentTransferRequested) {
            console.log('🤝 Agent transfer requested:', {
                from_llm: llmDecision.agent_transfer,
                from_response: transferIndicators.some(i => lowerContent.includes(i)),
                from_user: userRequestedTransfer
            });
        }

        // Format response
        const formattedResponse = markdown.formatResponse(llmDecision.response);

        // Combine costs
        const costs = [llmCost];
        if (knowledgeCost) {
            costs.push(knowledgeCost);
        }

        const totalCost = CostCalculator.combineCosts(costs);

		// ============================================
		// 💰 ADD ANALYSIS COST TO OPERATIONS
		// ============================================
		if (userAnalysisCost > 0) {
			// Ensure operations array exists
			if (!totalCost.operations) {
				totalCost.operations = [];
			}
			
			// Add analysis as an operation
			totalCost.operations.push({
				operation: 'message_analysis',
				quantity: 1,
				unit_cost: userAnalysisCost,
				total_cost: userAnalysisCost,
				details: {
					sentiment_analysis: true,
					language_detection: true,
					profanity_detection: true,
					intent_detection: true
				}
			});
			
			// Update cost breakdown totals
			const baseAnalysisCost = userAnalysisCost / 1.2; // Remove profit margin to get base
			totalCost.base_cost = (totalCost.base_cost || 0) + baseAnalysisCost;
			totalCost.profit_amount = (totalCost.profit_amount || 0) + (userAnalysisCost - baseAnalysisCost);
			totalCost.final_cost = (totalCost.final_cost || 0) + userAnalysisCost;
		}

        // Save assistant message
        const assistantMessageId = await this._saveMessage({
            sessionId,
            role: 'assistant',
            content: formattedResponse.text,
            contentHtml: formattedResponse.html,
            contentMarkdown: formattedResponse.markdown,
            sources: knowledgeResults?.text_results || [],
            images: knowledgeResults?.image_results || [],
            products: knowledgeResults?.product_results || [],
            functionCalls: functionCalls,
            cost: totalCost.final_cost,
            costBreakdown: totalCost,
            tokensInput: completion.usage.prompt_tokens,
            tokensOutput: completion.usage.completion_tokens,
            processingTimeMs: 0,
            agentTransferRequested: agentTransferRequested,
            metadata: {
                collecting_preferences: llmDecision.collecting_preferences,
                preferences_collected: llmDecision.preferences_collected,
                ready_to_search: llmDecision.ready_to_search,
                product_search_needed: llmDecision.product_search_needed,
                knowledge_search_needed: llmDecision.knowledge_search_needed
            }
        });

        // Update session stats
        await this._updateSessionStats(sessionId, totalCost.final_cost);

        if (shouldCloseSession) {
            console.log('🔒 Closing session:', sessionId);
			await db.query(
				'UPDATE yovo_tbl_aiva_chat_sessions SET feedback_requested = 1 WHERE id = ?',
				[sessionId]
			);
            await this.endSession(sessionId);
        }

        const formattedSources = await this._formatKnowledgeSources(knowledgeResults);

        return {
            session_id: sessionId,
            message_id: assistantMessageId,
            agent_transfer: agentTransferRequested,
            interaction_closed: shouldCloseSession,
			show_feedback_prompt: shouldCloseSession,
            response: {
                text: formattedResponse.text,
                html: formattedResponse.html,
                markdown: formattedResponse.markdown
            },
            formatted_html: formattedSources.formatted_html || null,
            formatted_markdown: formattedSources.formatted_markdown || null,
            formatted_text: formattedSources.formatted_text || null,
            sources: formattedSources.text_results,
            images: formattedSources.image_results,
            products: formattedSources.product_results,
            function_calls: functionCalls,
            llm_decision: {
                collecting_preferences: llmDecision.collecting_preferences,
                preferences_collected: llmDecision.preferences_collected,
                ready_to_search: llmDecision.ready_to_search,
                product_search_needed: llmDecision.product_search_needed,
                knowledge_search_needed: llmDecision.knowledge_search_needed,
                conversation_complete: llmDecision.conversation_complete || false, // ✅ ADD
                user_wants_to_end: llmDecision.user_wants_to_end || false
            },
            context_used: {
                knowledge_base_chunks: (knowledgeResults?.text_results?.length || 0) + (knowledgeResults?.product_results?.length || 0),
                conversation_history_messages: history.length,
                total_context_tokens: completion.usage.prompt_tokens
            },
            agent_metadata: {
                agent_id: agent.id,
                agent_name: agent.name,
                provider: 'openai',
                model: model,
                temperature: agent.temperature || 0.7
            },
            cost: totalCost.final_cost,
            cost_breakdown: totalCost,
			user_analysis_cost: userAnalysisCost
        };
    }


    /**
     * Build system prompt with conversation strategy based on KB content type
     * @private
     */
    _buildSystemPromptWithStrategy(baseInstructions, conversationStrategy, greeting = null, isFirstMessage = false, kbMetadata = {}, agent = null) {
        // Start with base instructions
        let systemPrompt = baseInstructions || '';

        // Add greeting instructions
        if (greeting) {
            const greetingInstructions = `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	GREETING MESSAGE ${isFirstMessage ? '⚠️ FIRST MESSAGE - USE GREETING NOW!' : ''}
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	${isFirstMessage ? `
	🚨 CRITICAL: THIS IS THE FIRST MESSAGE IN THE CONVERSATION!

	You MUST begin your response with this exact greeting:
	"${greeting}"

	Then naturally transition to helping the user based on their message.
	` : `
	GREETING: "${greeting}"

	This greeting should ONLY be used for the FIRST message of a NEW conversation.
	Since there are already messages in the conversation history, DO NOT repeat the greeting.
	Continue the conversation naturally.
	`}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
            systemPrompt += greetingInstructions;
        }

        const KNOWLEDGE_FORMATTING_INSTRUCTION = `
	KNOWLEDGE BASE FORMATTING:
	- Knowledge base content is provided with markdown formatting
	- Headers use # syntax (# Header, ## Subheader)
	- Lists use - or * for bullets, 1. 2. 3. for numbered
	- Tables use | pipe | syntax |
	- Bold text uses **bold**, italic uses *italic*
	- When referencing knowledge base content, maintain the structure in your response

	IMAGE REFERENCES:
	- Some knowledge base content includes [Image X: Page Y] references
	- When these are present, relevant images are provided separately in the images array
	- Reference these images when answering visual questions
	`;
        systemPrompt += KNOWLEDGE_FORMATTING_INSTRUCTION;

        // Determine KB content type
        const hasProducts = kbMetadata.has_products || false;
        const hasDocuments = kbMetadata.has_documents || false;

        // Add JSON response format instructions - ALWAYS INCLUDE THIS
        const jsonFormatInstructions = `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	CRITICAL: JSON RESPONSE FORMAT (RFC 8259 COMPLIANT)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	You MUST ALWAYS respond with valid JSON in this EXACT structure:

	{
	  "response": "Your natural conversational response in user's language",
	  ${hasProducts ? `
	  "product_search_needed": true/false,
	  "product_search_type": "single" | "multi" | "none",
	  "product_id": "uuid-of-specific-product (only if search_type=single)",
	  "product_search_query": "search query (only if search_type=multi)",
	  "collecting_preferences": true/false,
	  "preferences_collected": { "preference_name": "value or null" },
	  "ready_to_search": true/false,
	  ` : ''}
	  ${hasDocuments ? `
	  "knowledge_search_needed": true/false,
	  "knowledge_search_query": "search query (if searching knowledge base)",
	  ` : ''}
	  "needs_clarification": true/false,
	  "agent_transfer": true/false,
	  "order_intent_detected": true/false,
	  "conversation_complete": true/false,
	  "user_wants_to_end": true/false
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;

        systemPrompt += jsonFormatInstructions;

	const productSearchDecisionInstructions = `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🔍 SMART PRODUCT SEARCH DECISION LOGIC
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	When user asks about products, YOU must decide the search type:

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	1️⃣ SINGLE PRODUCT LOOKUP (product_search_type = "single")
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	Use when:
	✅ Message contains "AiVA Product ID: <uuid>" 
	✅ Message contains "Shopify Product ID: <number>"
	✅ User replied to a specific product message (WhatsApp reply with product info)
	✅ User clearly references ONE specific product from conversation history
	✅ User says "this one", "is wali", "yeh product" AND you can identify which product from context

	HOW TO DETECT PRODUCT ID IN MESSAGE:
	- Look for pattern: "AiVA Product ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
	- Look for pattern: "Shopify Product ID: 1234567890"
	- Look for pattern: "Purchase URL: https://store.myshopify.com/products/..."
	
	RESPONSE FORMAT:
	{
	  "response": "Main is product ki details check kar rahi hoon...",
	  "product_search_needed": true,
	  "product_search_type": "single",
	  "product_id": "8cbaf5af-7212-497e-ba95-6269dfa9199d",  // Extract from message
	  "product_search_query": null,
	  "ready_to_search": true
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	2️⃣ MULTI PRODUCT SEARCH (product_search_type = "multi")
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	Use when:
	✅ User asks general question: "show me red dresses"
	✅ User wants recommendations: "kuch formal shirts dikhao"
	✅ User browsing: "what do you have under 5000?"
	✅ User searching by category/color/style/price

	RESPONSE FORMAT:
	{
	  "response": "Main aap ke liye products dhundh rahi hoon...",
	  "product_search_needed": true,
	  "product_search_type": "multi",
	  "product_id": null,
	  "product_search_query": "red formal dresses under 5000",
	  "ready_to_search": true
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	3️⃣ NEEDS CLARIFICATION (needs_clarification = true)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	Use when:
	⚠️ User says "this one" / "is ki" / "yeh wali" but NO product ID in message
	⚠️ User references "the second one" but you can't identify from history
	⚠️ Ambiguous which product they mean
	⚠️ Multiple products were shown and user's reference is unclear

	RESPONSE FORMAT:
	{
	  "response": "Aap kis product ke baare mein pooch rahe hain? Please product ka naam batayein ya WhatsApp par us message ko reply karein jis mein product ki photo hai.",
	  "product_search_needed": false,
	  "product_search_type": "none",
	  "needs_clarification": true
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	4️⃣ NO SEARCH NEEDED (product_search_type = "none")
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	Use when:
	✅ General conversation / greeting
	✅ Question about policies, shipping, returns
	✅ You can answer from instructions/knowledge
	✅ Non-product related query

	RESPONSE FORMAT:
	{
	  "response": "Your answer here...",
	  "product_search_needed": false,
	  "product_search_type": "none"
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	📱 WHATSAPP REPLY DETECTION - CRITICAL!
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	🚨 WHEN MESSAGE CONTAINS "AiVA Product ID:" YOU MUST:
	1. Extract the UUID after "AiVA Product ID:"
	2. Set product_search_type = "single"
	3. Set product_id = the extracted UUID
	4. Set product_search_query = null

	EXAMPLE INPUT:
	"is ki length kya hai?
	AiVA Product ID: 01ba7c2b-7ac7-4c52-9d12-0c2896426270
	Shopify Product ID: 9048659034365"

	REQUIRED OUTPUT:
	{
	  "response": "Main is product ki details check kar rahi hoon...",
	  "product_search_needed": true,
	  "product_search_type": "single",
	  "product_id": "01ba7c2b-7ac7-4c52-9d12-0c2896426270",
	  "product_search_query": null,
	  "ready_to_search": true,
	  "needs_clarification": false
	}

	❌ WRONG (DO NOT DO THIS):
	{
	  "product_search_type": "multi",
	  "product_search_query": "Dreamy 2 Piece dress length"
	}

	✅ CORRECT:
	{
	  "product_search_type": "single",
	  "product_id": "01ba7c2b-7ac7-4c52-9d12-0c2896426270"
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	📜 HISTORY REFERENCE DETECTION
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	If user references a product from conversation history:

	"pehle wala" / "the first one" → Look for 1st product in your last response
	"second option" / "doosra" → Look for 2nd product you mentioned
	"the blue one" / "neeli wali" → Match by color from products you showed
	"last one" / "aakhri wala" → Look for last product in your response

	IF YOU CAN IDENTIFY THE PRODUCT:
	- Find its product_id from the conversation history
	- Use product_search_type = "single" with that product_id

	IF YOU CANNOT IDENTIFY:
	- Set needs_clarification = true
	- Ask user to specify or reply to the product message

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	⚡ DECISION FLOWCHART
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	User asks about product(s)
	         │
	         ▼
	┌─────────────────────────────────────┐
	│ Does message contain Product ID?    │
	│ (AiVA Product ID: xxx)              │
	└─────────────────────────────────────┘
	         │
	    YES  │  NO
	         ▼         ▼
	┌─────────────┐   ┌─────────────────────────────────┐
	│ SINGLE      │   │ Is user referencing a specific  │
	│ search_type │   │ product from history?           │
	│ = "single"  │   └─────────────────────────────────┘
	│ Extract ID  │            │
	└─────────────┘       YES  │  NO / UNCLEAR
	                           ▼         ▼
	                    ┌─────────────┐   ┌─────────────────────────────┐
	                    │ SINGLE      │   │ Is this a general product   │
	                    │ Use ID from │   │ search request?             │
	                    │ history     │   └─────────────────────────────┘
	                    └─────────────┘            │
	                                          YES  │  UNCLEAR
	                                               ▼         ▼
	                                        ┌─────────────┐   ┌─────────────┐
	                                        │ MULTI       │   │ ASK FOR     │
	                                        │ search_type │   │ CLARIFICATION│
	                                        │ = "multi"   │   │ needs_      │
	                                        └─────────────┘   │ clarification│
	                                                          │ = true      │
	                                                          └─────────────┘

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
	
		if (hasProducts) {
			systemPrompt += productSearchDecisionInstructions;
		}
		
        const closureInstructions = `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🔚 CONVERSATION CLOSURE DETECTION
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	DETECT WHEN CONVERSATION IS NATURALLY COMPLETE:

	SET conversation_complete = true WHEN:
	✅ You've answered user's question completely
	✅ Products have been shown and user seems satisfied
	✅ Order/purchase has been explained/completed
	✅ Information request has been fulfilled
	✅ User's needs appear to be met

	WHEN conversation_complete = true:
	- Ask: "Kya main aur kisi tarah se aapki madad kar sakti hoon?" (or English equivalent)
	- Or: "Is there anything else I can help you with?"
	- Be natural and friendly
	- Wait for user response

	USER CLOSURE PHRASES (set user_wants_to_end = true):

	English:
	- "No thanks" / "No, thank you" / "That's all"
	- "Nothing else" / "I'm good" / "I'm done"
	- "Goodbye" / "Bye" / "Thanks, bye"
	- "That's it" / "That's everything"

	Urdu/Roman Urdu:
	- "Nahi shukriya" / "Bas itna hi"
	- "Aur kuch nahi" / "Theek hai"
	- "Allah Hafiz" / "Khuda Hafiz"
	- "Shukriya, bas" / "Bas"

	WHEN user_wants_to_end = true:
	- Respond with warm closing message
	- Thank them for their time
	- Use "Allah Hafiz" or "Thank you for contacting us."
	- Keep it brief and friendly
	- Set BOTH conversation_complete = true AND user_wants_to_end = true

	EXAMPLE FLOW:

	User: "Show me dresses"
	Assistant: [Shows products]
	{
	  "response": "Here are our beautiful dresses... Kya main aur kisi tarah se aapki madad kar sakti hoon?",
	  "conversation_complete": true,
	  "user_wants_to_end": false
	}

	User: "No, that's all"
	Assistant: [Closing message]
	{
	  "response": "Thank you for visiting us today! Allah Hafiz!",
	  "conversation_complete": true,
	  "user_wants_to_end": true
	}

	IMPORTANT:
	- Don't ask "anything else" too early (wait until task is complete)
	- Don't ask multiple times in same conversation
	- Be natural - if user asks new question, continue helping
	- Only close when user explicitly indicates they're done

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;

        systemPrompt += closureInstructions;

        // ✅ ADD THIS NEW SECTION: Order/Purchase Intent Handling
        const orderHandlingInstructions = this._getOrderHandlingInstructions(agent, hasProducts);
        systemPrompt += orderHandlingInstructions;


        // Add conversation strategy ONLY if products exist
        if (hasProducts && conversationStrategy?.preference_collection) {
            const pc = conversationStrategy.preference_collection;
            const strategyInstructions = this._generatePreferenceInstructions(pc);
            systemPrompt += strategyInstructions;
        }

        // Add knowledge base specific instructions
        if (hasDocuments && hasProducts) {
            systemPrompt += `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	HYBRID KNOWLEDGE BASE & PRODUCT CATALOG
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	This agent has BOTH a knowledge base (documents) AND a product catalog.

	WHEN TO USE EACH:

	Use knowledge_search_needed = true for:
	- Questions about policies, procedures, how-to guides, products
	- General information queries
	- Documentation lookups
	- FAQs and support articles

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🔍 PRODUCT DETAIL QUERIES - MANDATORY SEARCH
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	CRITICAL: When user asks about SPECIFIC product details, you MUST search!

	ALWAYS set product_search_needed = true AND ready_to_search = true when user asks about:
	- Size, dimensions, length, width, height
	- Fabric, material, composition
	- Color options, available colors
	- Price, cost, discount
	- Availability, stock, inventory
	- Specifications, features, details
	- "is ki length kya hai", "fabric kya hai", "size guide"
	- Any measurement or specification question

	EXAMPLE SCENARIOS:

	User: "is ki shirt length kya hai?"
	✅ CORRECT Response:
	{
	  "response": "Main aap ke liye is product ki details check karti hoon...",
	  "product_search_needed": true,
	  "product_search_query": "chamomile shirt length size specifications",
	  "ready_to_search": true,
	  "knowledge_search_needed": true,
	  "knowledge_search_query": "chamomile 3 piece shirt length measurements"
	}

	❌ WRONG Response:
	{
	  "response": "Mujhe details nahi mil rahi...",
	  "product_search_needed": false,
	  "knowledge_search_needed": false
	}

	RULES:
	1. If you DON'T KNOW a product detail → SEARCH (don't say "I don't have info")
	2. If user asks about ANY measurement/specification → SEARCH
	3. If product was mentioned earlier in conversation → SEARCH with that product name
	4. NEVER say "I don't have details" without searching first
	5. Use the product name/ID from conversation context in your search query

	SEARCH QUERY TIPS:
	- Include product name: "chamomile 3 piece shirt length"
	- Include specific attribute: "shirt length measurements size"
	- Use both product_search AND knowledge_search for specifications

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	You can use BOTH in the same response if needed:
	- Search knowledge base for policies, then search products for items

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
        } else if (hasDocuments && !hasProducts) {
            systemPrompt += `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	KNOWLEDGE BASE ONLY (NO PRODUCTS)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	This agent has a knowledge base with documents but NO product catalog.

	ALWAYS set knowledge_search_needed = true when:
	- User asks questions about topics in your knowledge base
	- You need factual information to answer accurately

	NEVER set product_search_needed as there are no products to search.

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
        } else if (hasProducts && !hasDocuments) {
            systemPrompt += `

		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🔍 PRODUCT DETAIL QUERIES - MANDATORY SEARCH
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	CRITICAL: When user asks about SPECIFIC product details, you MUST search!

	ALWAYS set product_search_needed = true AND ready_to_search = true when user asks about:
	- Size, dimensions, length, width, height
	- Fabric, material, composition
	- Color options, available colors
	- Price, cost, discount
	- Availability, stock, inventory
	- Specifications, features, details
	- "is ki length kya hai", "fabric kya hai", "size guide"
	- Any measurement or specification question

	EXAMPLE SCENARIOS:

	User: "is ki shirt length kya hai?"
	✅ CORRECT Response:
	{
	  "response": "Main aap ke liye is product ki details check karti hoon...",
	  "product_search_needed": true,
	  "product_search_query": "chamomile shirt length size specifications",
	  "ready_to_search": true,
	  "knowledge_search_needed": true,
	  "knowledge_search_query": "chamomile 3 piece shirt length measurements"
	}

	❌ WRONG Response:
	{
	  "response": "Mujhe details nahi mil rahi...",
	  "product_search_needed": false,
	  "knowledge_search_needed": false
	}

	RULES:
	1. If you DON'T KNOW a product detail → SEARCH (don't say "I don't have info")
	2. If user asks about ANY measurement/specification → SEARCH
	3. If product was mentioned earlier in conversation → SEARCH with that product name
	4. NEVER say "I don't have details" without searching first
	5. Use the product name/ID from conversation context in your search query

	SEARCH QUERY TIPS:
	- Include product name: "chamomile 3 piece shirt length"
	- Include specific attribute: "shirt length measurements size"
	- Use both product_search AND knowledge_search for specifications

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
        }

        // Anti-hallucination instructions
        systemPrompt += this._getAntiHallucinationInstructions(hasDocuments, hasProducts);

        return systemPrompt;
    }


    /**
     * Get order/purchase handling instructions based on agent capabilities
     * @private
     */
    _getOrderHandlingInstructions(agent, hasProducts) {
        // Check if agent has order-related functions
        const hasOrderFunction = agent.functions && agent.functions.length > 0 &&
            agent.functions.some(fn =>
                fn.name.toLowerCase().includes('order') ||
                fn.name.toLowerCase().includes('purchase') ||
                fn.name.toLowerCase().includes('checkout') ||
                fn.name.toLowerCase().includes('cart')
            );

        // Check if instructions mention order process
        const instructionsMentionOrders = agent.instructions && (
            agent.instructions.toLowerCase().includes('order') ||
            agent.instructions.toLowerCase().includes('purchase') ||
            agent.instructions.toLowerCase().includes('checkout') ||
            agent.instructions.toLowerCase().includes('buy')
        );

        // Check if agent has Shopify integration
        const hasShopify = agent.shopify_store_url && agent.shopify_access_token;

        let instructions = `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🛒 ORDER/PURCHASE REQUEST HANDLING
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	`;

        if (hasOrderFunction) {
            // Agent HAS order functions - can process orders
            instructions += `
	✅ YOU HAVE ORDER PROCESSING FUNCTIONS AVAILABLE

	When user wants to buy/order:
	1. Use the available order functions to process the request
	2. Follow the function parameters exactly
	3. Return the function result to user
	4. Set order_intent_detected = true

	Available order functions:
	${agent.functions.filter(fn => 
	  fn.name.toLowerCase().includes('order') ||
	  fn.name.toLowerCase().includes('purchase') ||
	  fn.name.toLowerCase().includes('checkout')
	).map(fn => `- ${fn.name}: ${fn.description}`).join('\n')}

	DO:
	✅ Use order functions when user wants to buy
	✅ Collect required information (size, color, address, etc.)
	✅ Confirm details before processing
	✅ Call the appropriate function

	DON'T:
	❌ Generate fake order numbers yourself
	❌ Claim order is placed without calling function
	❌ Skip collecting required information
	`;
        } else if (instructionsMentionOrders) {
            // Instructions mention order process - follow them
            instructions += `
	⚠️ NO ORDER FUNCTIONS, BUT INSTRUCTIONS MENTION ORDER PROCESS

	Your instructions contain information about orders/purchases.
	Follow those instructions exactly.

	When user wants to buy/order:
	1. Check your base instructions for order process details
	2. Follow the process mentioned in your instructions
	3. If instructions say to transfer → set agent_transfer = true
	4. If instructions give a URL/website → share that with user
	5. Set order_intent_detected = true

	DO:
	✅ Follow order instructions from your base prompt
	✅ Guide user through the specified process
	✅ Share any URLs/links mentioned in instructions
	✅ Transfer to human if instructions say so

	DON'T:
	❌ Generate fake order numbers
	❌ Process orders without proper authorization
	❌ Claim order is placed when it's not
	`;
        } else if (hasShopify && hasProducts) {
            // Has Shopify + products - share purchase URLs
            instructions += `
	🛍️ SHOPIFY STORE INTEGRATION AVAILABLE

	You have access to a Shopify store with products.
	When user wants to buy/order:

	1. Search for the requested product (if not already shown)
	2. Share the product's purchase URL from Shopify
	3. Explain user can click the link to complete purchase
	4. Set order_intent_detected = true

	RESPONSE TEMPLATE:
	"Main aapko yeh product ka link share kar rahi hoon. Aap is link par click karke 
	product dekh sakte hain aur order place kar sakte hain:

	[Product Name]
	Price: Rs. [price]
	🔗 Purchase Link: [product purchase URL]

	Kya aapko kisi aur product ki zarurat hai?"

	DO:
	✅ Search and show the requested product
	✅ Share direct purchase URL from Shopify
	✅ Explain how to complete purchase on website
	✅ Offer to help find more products

	DON'T:
	❌ Generate order numbers yourself
	❌ Claim you can process the order directly
	❌ Say "order placed" without user going to website
	❌ Make up fake tracking IDs
	`;
        } else {
            // No order capability - offer agent transfer
            instructions += `
	❌ NO ORDER PROCESSING CAPABILITY

	You have NO functions, NO order instructions, and NO store integration.
	When user wants to buy/order:

	1. Politely explain you cannot process orders directly
	2. Offer to transfer to a human agent who can help
	3. Set agent_transfer = true
	4. Set order_intent_detected = true

	RESPONSE TEMPLATE:
	"Mujhe maaf kariye, lekin main directly orders process nahi kar sakti. 
	Agar aap order place karna chahte hain, toh main aapko ek human agent 
	se connect kar sakti hoon jo aapki madad kar sakenge. 

	Kya main aapko human agent se connect kar doon?"

	DO:
	✅ Be honest about limitations
	✅ Offer human agent transfer
	✅ Set agent_transfer = true
	✅ Be helpful and polite

	DON'T:
	❌ Generate fake order numbers
	❌ Pretend you can process orders
	❌ Give false hope about order placement
	❌ Make up confirmation IDs
	`;
        }

        instructions += `

	🚨 CRITICAL: ORDER INTENT DETECTION

	SET order_intent_detected = true WHEN:
	- User says "I want to buy/order/purchase"
	- User asks "How do I order?"
	- User says "Place order for this"
	- User asks for checkout/payment
	- Any clear purchase/buying intent

	When order_intent_detected = true:
	- Follow the appropriate process above
	- NEVER generate fake order numbers
	- NEVER claim order is placed without proper authorization
	- NEVER create transaction IDs, tracking numbers, etc.

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;

        return instructions;
    }
	
	/*
	 * Get anti-hallucination instructions based on content type
	 * @private
	 */
	_getAntiHallucinationInstructions(hasDocuments, hasProducts) {
		return `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	🚫 CRITICAL OPERATIONAL BOUNDARIES & ANTI-HALLUCINATION RULES
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	YOU MUST NEVER:
	❌ Answer questions outside your ${hasDocuments ? 'knowledge base' : 'instructions'} ${hasProducts ? 'or product catalog' : ''}
	❌ Make up information, facts, statistics, ${hasProducts ? 'product details, ' : ''}or prices
	${hasProducts ? '❌ Claim products are available without searching first' : ''}
	❌ Create fake order numbers, tracking IDs, or transaction references
	❌ Say "order placed" or "order confirmed" without proper authorization
	❌ Generate confirmation codes, booking IDs, or receipt numbers
	❌ Process payments or transactions (you have NO such capability)
	❌ Claim you can complete checkout process yourself
	❌ Provide information that contradicts your instructions
	❌ Claim capabilities or knowledge you don't have
	❌ Speculate or guess when you don't have information

	🛒 ORDER PROCESSING RULES:
	1. Check if you have order functions → Use them
	2. Check your instructions for order process → Follow them
	3. If you have Shopify products → Share purchase URLs
	4. If none of above → Offer human agent transfer
	5. NEVER generate fake order confirmation yourself
	6. Set order_intent_detected = true when user wants to buy

	🚨 STRICTLY OFF-LIMITS TOPICS (ALWAYS DECLINE):
	- Politics, politicians, current events (e.g., "Imran Khan")
	- Religious, controversial, or sensitive topics
	- Medical, legal, or financial advice
	- Personal information about real people
	- Never take up another persona if asked

	${hasDocuments ? `
	🔍 KNOWLEDGE BASE SEARCH RULES - IMPORTANT:
	When user asks ANY question that MIGHT be related to your domain:
	✅ ALWAYS set knowledge_search_needed = true FIRST
	✅ Let the search determine if information exists
	✅ Only say "I don't have information" AFTER searching returns no results
	✅ DO NOT assume a question is off-topic without searching first

	Questions that REQUIRE knowledge search:
	- "How to...", "What is...", "Can you tell me about..."
	- Integration questions, setup questions, configuration questions
	- Any technical or domain-specific questions
	- Questions about features, capabilities, processes

	Only skip search for CLEARLY off-topic questions like:
	- "Who is the Prime Minister?"
	- "What's the weather today?"
	- General chitchat unrelated to any business domain
	` : ''}

	${hasProducts ? `
	🔗 PURCHASE URL RULES - CRITICAL: 
	WHEN SEARCHING PRODUCTS (set product_search_needed = true):
	- User requests to see products
	- After collecting sufficient preferences
	- When ready_to_search = true
	
	- ONLY use purchase_url from search results - NEVER generate URLs yourself
	- If purchase_url is null/missing → Say "I'll share the link once I find it" and search again
	- NEVER modify or construct URLs - use EXACTLY what's provided
	- Format: Share the exact URL from product data, don't add parameters
	- If no URL available → Direct user to website: "You can find this on [store website]"
	` : ''}

	WHEN TO TRANSFER TO HUMAN (set agent_transfer = true):
	- Question is CLEARLY outside domain AND search returned no results
	- User explicitly requests human agent
	- User shows frustration (3+ failed attempts)
	- You cannot answer accurately within your scope
	- User asks about politics, religion, or controversial topics

	${!hasDocuments && !hasProducts ? `
	⚠️ CRITICAL: You have NO knowledge base and NO product catalog.
	Answer ONLY based on your base instructions.
	For anything else, transfer to human immediately.
	` : ''}

	🎯 DEFAULT BEHAVIOR: When in doubt, SEARCH FIRST, then decide

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
	}

    /**
     * Generate preference collection instructions based on strategy
     * @private
     */
    _generatePreferenceInstructions(preferenceConfig) {
        const strategy = preferenceConfig.strategy || 'immediate_search';

        if (strategy === 'immediate_search') {
            return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT SEARCH STRATEGY: IMMEDIATE SEARCH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When user requests products:
✅ Search IMMEDIATELY - set product_search_needed = true
✅ Use user's query as search query
✅ Do NOT ask preference questions
✅ Show products right away

Example:
User: "show me dresses"
Response: {
  "response": "Here are our dress collection...",
  "product_search_needed": true,
  "product_search_query": "dresses",
  "collecting_preferences": false,
  "preferences_collected": {},
  "ready_to_search": true
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }

        if (strategy === 'ask_questions' || strategy === 'minimal_questions') {
            const preferences = preferenceConfig.preferences_to_collect || [];
            const minPrefs = preferenceConfig.min_preferences_before_search || 2;
            const maxQuestions = preferenceConfig.max_questions || 3;

            let instructions = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT SEARCH STRATEGY: ${strategy === 'ask_questions' ? 'ASK QUESTIONS' : 'MINIMAL QUESTIONS'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PREFERENCES TO COLLECT:
`;

            preferences.forEach((pref, index) => {
                instructions += `
${index + 1}. ${pref.name} (${pref.required ? 'REQUIRED' : 'OPTIONAL'})
   Question: "${pref.question || `What ${pref.name}?`}"
   Type: ${pref.type || 'text'}
${pref.options ? `   Options: ${pref.options.join(', ')}` : ''}
`;
            });

            instructions += `

COLLECTION RULES:
✓ Ask questions ONE AT A TIME naturally
✓ Track collected preferences in preferences_collected object
✓ Search when you have at least ${minPrefs} preference(s)
✓ Never ask more than ${maxQuestions} questions total
✓ Required preferences MUST be collected
✓ Optional preferences can be skipped if user provides enough info naturally

SEARCH QUERY CONSTRUCTION:
When ready_to_search = true, build comprehensive query including ALL collected preferences.
Example: "pink formal dresses wedding under 5000"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

            return instructions;
        }

        if (strategy === 'adaptive') {
            return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT SEARCH STRATEGY: ADAPTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use your intelligence to decide:
- High-value items (>10,000): Ask 2-3 questions
- Medium items (1,000-10,000): Ask 1-2 questions
- Low-value items (<1,000): Search immediately
- User provides detailed request: Search immediately
- Vague request: Ask clarifying questions

Adapt based on context and user behavior.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }

        return '';
    }

    /**
     * Get conversation history
     * @param {string} sessionId - Session ID
     * @param {number} limit - Number of messages
     * @returns {Promise<Array>} Messages
     */
    async getConversationHistory(sessionId, limit = 20) {
        const [messages] = await db.query(
            `SELECT * FROM yovo_tbl_aiva_chat_messages 
       WHERE session_id = ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
            [sessionId, limit]
        );

        return messages.reverse().map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            content_html: msg.content_html,
            content_markdown: msg.content_markdown,
            sources: msg.sources ? msg.sources : [],
            images: msg.images ? msg.images : [],
            products: msg.products ? msg.products : [],
            function_calls: msg.function_calls ? msg.function_calls : [],
            cost: msg.cost,
            agent_transfer_requested: msg.agent_transfer_requested,
            created_at: msg.created_at
        }));
    }

    /**
     * Get full message with all details
     * @param {string} messageId - Message ID
     * @returns {Promise<Object|null>} Message or null
     */
    async getMessage(messageId) {
        const [messages] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_chat_messages WHERE id = ?',
            [messageId]
        );

        if (messages.length === 0) {
            return null;
        }

        const msg = messages[0];

        return {
            ...msg,
            sources: msg.sources ? JSON.parse(msg.sources) : [],
            images: msg.images ? JSON.parse(msg.images) : [],
            products: msg.products ? JSON.parse(msg.products) : [],
            function_calls: msg.function_calls ? JSON.parse(msg.function_calls) : [],
            cost_breakdown: msg.cost_breakdown ? JSON.parse(msg.cost_breakdown) : null,
            metadata: msg.metadata ? JSON.parse(msg.metadata) : {}
        };
    }

    /**
     * Delete chat session
     * @param {string} sessionId - Session ID
     * @returns {Promise<void>}
     */
    async deleteSession(sessionId) {
        await db.query('DELETE FROM yovo_tbl_aiva_chat_sessions WHERE id = ?', [sessionId]);
    }

    /**
     * Get session statistics
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Statistics
     */
    async getSessionStats(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        const [stats] = await db.query(
            `SELECT 
        COUNT(*) as total_messages,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
        SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages,
        SUM(cost) as total_cost,
        SUM(tokens_input) as total_input_tokens,
        SUM(tokens_output) as total_output_tokens,
        AVG(processing_time_ms) as avg_processing_time
      FROM yovo_tbl_aiva_chat_messages
      WHERE session_id = ?`,
            [sessionId]
        );

        return {
            session_id: sessionId,
            session_name: session.session_name,
            status: session.status,
            start_time: session.start_time,
            end_time: session.end_time,
            ...stats[0],
            total_cost: parseFloat(stats[0].total_cost || 0).toFixed(6)
        };
    }

    /**
     * Save message to database
     * @private
     */
    async _saveMessage(messageData) {
		const messageId = uuidv4();
		
		try {
			// ============================================
			// 🎯 AUTOMATIC ANALYSIS FOR USER MESSAGES
			// ============================================
			let analysis = null;
			let translatedMessage = null;
			
			// Only analyze user messages (not assistant responses)
			if (messageData.role === 'user' && messageData.content) {
				try {
					console.info(`Analyzing chat message: ${messageId}`);
					
					// Analyze the message
					analysis = await TranscriptionAnalysisService.analyzeMessage(
						messageData.content,
						'customer',
						{}
					);
					
					// Translate if not English
					if (analysis.language_detected && analysis.language_detected !== 'en') {
						const translation = await TranscriptionAnalysisService.translateToEnglish(
							messageData.content,
							analysis.language_detected
						);
						translatedMessage = translation.translated_text;
					}
					
					console.info(`Message analysis complete: sentiment=${analysis.sentiment}, intent=${analysis.primary_intent}`);
					
				} catch (analysisError) {
					console.error('Error analyzing chat message:', analysisError);
					analysis = null;
				}
			}

			// ============================================
			// 💾 SAVE MESSAGE WITH ANALYSIS DATA
			// ============================================
			// Count: 31 columns = 31 values
			await db.query(
				`INSERT INTO yovo_tbl_aiva_chat_messages (
					id, session_id, role, content, content_html, content_markdown,
					sources, images, products, function_calls, 
					cost, cost_breakdown, tokens_input, tokens_output, processing_time_ms,
					agent_transfer_requested,
					language_detected, translated_message,
					sentiment, sentiment_score, sentiment_confidence,
					profanity_detected, profanity_score, profane_words,
					intents, primary_intent, intent_confidence,
					topics, keywords, emotion_tags,
					analyzed_at, analysis_model, analysis_cost
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					// Basic message data (16 values)
					messageId,
					messageData.sessionId,
					messageData.role,
					messageData.content,
					messageData.contentHtml || null,
					messageData.contentMarkdown || null,
					messageData.sources ? JSON.stringify(messageData.sources) : null,
					messageData.images ? JSON.stringify(messageData.images) : null,
					messageData.products ? JSON.stringify(messageData.products) : null,
					messageData.functionCalls ? JSON.stringify(messageData.functionCalls) : null,
					messageData.cost || 0,
					messageData.costBreakdown ? JSON.stringify(messageData.costBreakdown) : null,
					messageData.tokensInput || 0,
					messageData.tokensOutput || 0,
					messageData.processingTimeMs || null,
					messageData.agentTransferRequested ? 1 : 0,
					
					// Analysis fields (17 values)
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
					analysis ? new Date() : null,
					analysis?.analysis_metadata?.model || null,
					analysis?.analysis_metadata?.cost || 0.0
					
					// TOTAL: 16 + 17 = 33 values to match 33 placeholders
				]
			);

			console.info(`Chat message saved with analysis: ${messageId}`);
			return {
				messageId: messageId,
				analysisCost: analysis?.analysis_metadata?.cost || 0.0,
				translationCost: translatedMessage ? (analysis?.translation_cost || 0.0) : 0.0
			};
			
		} catch (error) {
			console.error('Error saving chat message:', error);
			throw error;
		}
	}

    /**
     * Update session statistics
     * @private
     */
    async _updateSessionStats(sessionId, additionalCost) {
        await db.query(
            `UPDATE yovo_tbl_aiva_chat_sessions 
       SET total_messages = total_messages + 1,
           total_cost = total_cost + ?
       WHERE id = ?`,
            [additionalCost, sessionId]
        );
    }

    /**
     * Execute agent function
     * @private
     */
    async _executeFunction(agent, functionName, args) {
        // Find function definition
        const func = agent.functions.find(f => f.name === functionName);
        if (!func) {
            return {
                error: 'Function not found'
            };
        }

        // If API function, call it
        if (func.handler_type === 'api' && func.api_endpoint) {
            try {
                const axios = require('axios');

                // Replace parameters in URL
                let url = func.api_endpoint;
                for (const [key, value] of Object.entries(args)) {
                    url = url.replace(`{{${key}}}`, value);
                }

                // Prepare headers
                const headers = {};
                if (func.api_headers) {
                    for (const header of func.api_headers) {
                        headers[header.key] = header.value;
                    }
                }

                // Make request
                const response = await axios({
                    method: func.api_method || 'POST',
                    url: url,
                    headers: headers,
                    data: func.api_method !== 'GET' ? args : undefined,
                    timeout: func.timeout_ms || 30000
                });

                return response.data;
            } catch (error) {
                return {
                    error: error.message
                };
            }
        }

        // Inline functions would be handled here
        return {
            error: 'Function execution not implemented'
        };
    }

    async _formatKnowledgeSources(knowledgeResults) {
        if (!knowledgeResults || !knowledgeResults.text_results) {
            return {
                text_results: [],
                image_results: [],
                product_results: [],
                formatted_html: '',
                formatted_markdown: '',
                formatted_text: ''
            };
        }

        // Text results
        const formattedTextResults = (knowledgeResults.text_results || []).map(r => ({
            result_id: r.result_id,
            type: r.type,
            content: r.content,
            source: r.source,
            score: r.score,
            scoring_details: r.scoring_details,
            metadata: r.metadata
        }));

        // Image results
        const formattedImageResults = (knowledgeResults.image_results || []).map(img => ({
            image_id: img.image_id || img.result_id,
            url: this._getImageUrl(img.image_url || img.url),
            thumbnail_url: this._getThumbnailUrl(img.thumbnail_url || img.url),
            title: img.title || img.description || 'Image',
            description: img.description,
            similarity_score: img.similarity_score || img.score,
            source_document: img.source_document || img.metadata?.document_name,
            page_number: img.page_number || img.metadata?.page_number,
            width: img.width,
            height: img.height,
            metadata: img.metadata || {}
        }));

        // ✅ FIXED: Product results (was truncated)
        const formattedProductResults = (knowledgeResults.product_results || []).map(p => ({
            product_id: p.product_id,
            name: p.name,
            description: p.description,
            image_url: p.image_url,
            price: p.price,
            availability: p.availability,
            similarity_score: p.score,
            match_reason: p.scoring_details,
            metadata: p.metadata,
            url: p.url,
            purchase_url: p.purchase_url || null
        }));

        console.log(`📝 Formatted ${formattedTextResults.length} text results`);
        console.log(`📸 Formatted ${formattedImageResults.length} images`);
        console.log(`📦 Formatted ${formattedProductResults.length} products`); // ✅ NOW WORKS

        // Generate formatted response (from knowledge-formatter.js)
        const formatted = knowledgeFormatter.formatKnowledgeResponse(knowledgeResults, {
            includeImages: true,
            imagePosition: 'inline',
            maxImages: 10,
            imageSize: 'medium',
            includeMetadata: true,
            baseUrl: process.env.API_BASE_URL || ''
        });

        return {
            text_results: formattedTextResults,
            image_results: formattedImageResults,
            product_results: formattedProductResults, // ✅ NOW PROPERLY RETURNED

            // Formatted responses (for inline image display)
            formatted_html: formatted.html,
            formatted_markdown: formatted.markdown,
            formatted_text: formatted.text,
            has_images: formatted.hasImages,
            has_products: formatted.hasProducts,
            stats: formatted.stats
        };
    }

    /**
     * NEW HELPER METHOD: Transform storage paths to accessible URLs
     */
    _getImageUrl(storagePath) {
        if (!storagePath) return null;


        // Transform /etc/aiva-oai/storage/images/... to /api/images/...
        if (storagePath.startsWith('/etc/aiva-oai/storage/images/')) {
            const relativePath = storagePath.replace('/etc/aiva-oai/storage/images/', '');
            return `${process.env.MANAGEMENT_API_URL || 'http://localhost:62001'}/api/images/${relativePath}`;
        }


        return storagePath;
    }

    /**
     * NEW HELPER METHOD: Generate thumbnail URL
     */
    _getThumbnailUrl(storagePath) {
        const imageUrl = this._getImageUrl(storagePath);
        if (!imageUrl) return null;

        // Add thumbnail parameter
        return `${imageUrl}?size=thumbnail`;
    }
}

module.exports = new ChatService();