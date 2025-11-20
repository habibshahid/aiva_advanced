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
			logger.error('Error generating chat analytics:', error);
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
        const userMessageId = await this._saveMessage({
            sessionId,
            role: 'user',
            content: message,
            image
        });

        // Get agent with full configuration
        const agent = await AgentService.getAgent(session.agent_id);

        // Get conversation history
        const history = await this.getConversationHistory(sessionId, 10);
        const isFirstMessage = history.length === 0;

        // ============================================
        // 🖼️ IMAGE DETECTION - AUTOMATIC SEARCH PATH
        // ============================================

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
                    agent_transfer: false,
                    order_intent_detected: false,
                    "conversation_complete": false,
                    "user_wants_to_end": false
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
                    llmDecision.response += "\n\nThank you for choosing Wear Ego. Allah Hafiz!";
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

        // Call OpenAI with JSON mode
        const model = agent.chat_model || 'gpt-4o-mini';

        const completion = await this.openai.chat.completions.create({
            model: model,
            messages: messages,
            tools: tools,
            response_format: {
                type: "json_object"
            },
            temperature: parseFloat(agent.temperature) || 0.7,
            max_tokens: agent.max_tokens || 4096
        });

        const aiMessage = completion.choices[0].message;
        let llmDecision;

        // Parse JSON response
        try {
            llmDecision = JSON.parse(aiMessage.content);
            console.log('🤖 LLM Decision:', JSON.stringify(llmDecision, null, 2));
        } catch (error) {
            console.error('❌ Failed to parse LLM JSON:', aiMessage.content);
            // Fallback: treat as regular response
            llmDecision = {
                response: aiMessage.content,
                product_search_needed: false,
                knowledge_search_needed: false,
                collecting_preferences: false,
                preferences_collected: {},
                ready_to_search: false,
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
                llmDecision.response += "\n\nThank you for choosing Wear Ego. Allah Hafiz!";
            }
        }

        let llmCost = CostCalculator.calculateChatCost({
                prompt_tokens: completion.usage.prompt_tokens,
                completion_tokens: completion.usage.completion_tokens,
                cached_tokens: 0
            },
            model
        );

        console.log('💰 First LLM call cost:', llmCost.final_cost);

        // Initialize knowledge cost tracker
        let knowledgeCost = null;

        // Handle function calls (if any)
        const functionCalls = [];
        if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            for (const toolCall of aiMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);

                const functionResult = await this._executeFunction(
                    agent,
                    functionName,
                    functionArgs
                );

                functionCalls.push({
                    function_id: toolCall.id,
                    function_name: functionName,
                    arguments: functionArgs,
                    result: functionResult,
                    status: 'success'
                });
            }
        }

        // Product search - Only if LLM says ready
        let knowledgeResults = null;

        // Product search - Only if LLM says ready
        if (llmDecision.product_search_needed && llmDecision.ready_to_search && agent.kb_id) {
            try {
                const searchQuery = llmDecision.product_search_query || llmDecision.search_query || message;

                console.log(`🔍 Product Search: "${searchQuery}"`);

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

                // Log first image result to see structure
                if (searchResult.results?.image_results && searchResult.results.image_results.length > 0) {
                    console.log('📸 First image result structure:', JSON.stringify(searchResult.results.image_results[0], null, 2));
                }

                knowledgeResults = searchResult.results;
                knowledgeCost = searchResult.cost_breakdown;

                console.log(`✅ Found ${knowledgeResults?.product_results?.length || 0} products`);

                // ✅ Call LLM again with product results
                if (knowledgeResults?.product_results && knowledgeResults.product_results.length > 0) {
                    console.log('🔄 Calling LLM again WITH product results...');

                    // Build product context
                    const productContext = knowledgeResults.product_results.map((product, idx) =>
                        `[Product ${idx + 1}]
Name: ${product.name}
Price: ${product.price}
Description: ${product.description}
Availability: ${product.availability}`
                    ).join('\n\n');

                    // Build messages with product context
                    const messagesWithContext = [{
                            role: 'system',
                            content: `${systemPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT SEARCH RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found these products matching "${searchQuery}":

${productContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL: Present these products naturally to the user.
- DO NOT say "I need to search" - you already have the results
- DO NOT set product_search_needed=true again
- Present the products in a helpful, conversational way
- Highlight key features based on user preferences
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

                    // Call LLM again
                    const finalCompletion = await this.openai.chat.completions.create({
                        model: model,
                        messages: messagesWithContext,
                        response_format: {
                            type: "json_object"
                        },
                        temperature: parseFloat(agent.temperature) || 0.7,
                        max_tokens: agent.max_tokens || 4096
                    });

                    const finalMessage = finalCompletion.choices[0].message;

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
                            },
                            model
                        );

                        console.log('💰 Second LLM call cost:', secondCallCost.final_cost);

                        // ✅ Combine both LLM costs
                        llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);

                        console.log('💰 Total LLM cost (both calls):', llmCost.final_cost);

                    } catch (error) {
                        console.error('Failed to parse final LLM response:', error);
                    }
                }

            } catch (error) {
                console.error('Product search failed:', error);
            }
        }

        // Knowledge search - Only if LLM says needed
        if (llmDecision.knowledge_search_needed && agent.kb_id && !knowledgeResults) {
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
                    const finalCompletion = await this.openai.chat.completions.create({
                        model: model,
                        messages: messagesWithContext,
                        response_format: {
                            type: "json_object"
                        },
                        temperature: parseFloat(agent.temperature) || 0.7,
                        max_tokens: agent.max_tokens || 4096
                    });

                    const finalMessage = finalCompletion.choices[0].message;

                    try {
                        const finalDecision = JSON.parse(finalMessage.content);
                        console.log('✅ LLM generated final answer with search results');

                        // Update response with final answer
                        llmDecision.response = finalDecision.response;
                        llmDecision.knowledge_search_needed = false;

                        // ✅ ADD second call cost to existing llmCost
                        const secondCallCost = CostCalculator.calculateChatCost({
                                prompt_tokens: finalCompletion.usage.prompt_tokens,
                                completion_tokens: finalCompletion.usage.completion_tokens,
                                cached_tokens: 0
                            },
                            model
                        );

                        console.log('💰 Second LLM call cost:', secondCallCost.final_cost);

                        // ✅ Combine both LLM costs
                        llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);

                        console.log('💰 Total LLM cost (both calls):', llmCost.final_cost);

                    } catch (error) {
                        console.error('Failed to parse final LLM response:', error);
                        // Use original response as fallback
                    }
                }

            } catch (error) {
                console.error('Knowledge search failed:', error);
            }
        }

        // Enhanced agent transfer detection
        let agentTransferRequested = llmDecision.agent_transfer || false;

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

        const lowerContent = (llmDecision.response || '').toLowerCase();
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
            await this.endSession(sessionId);
        }

        const formattedSources = await this._formatKnowledgeSources(knowledgeResults);

        return {
            session_id: sessionId,
            message_id: assistantMessageId,
            agent_transfer: agentTransferRequested,
            interaction_closed: shouldCloseSession,
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
            /*images: knowledgeResults?.image_results?.map(img => ({
              image_id: img.result_id,
              url: img.image_url,
              thumbnail_url: img.thumbnail_url,
              title: img.description,
              description: img.description,
              similarity_score: img.score,
              source_document: img.source?.document_name,
              metadata: img.metadata || {}
            })) || [],
            products: knowledgeResults?.product_results?.map(p => ({
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
            })) || [],*/
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
            cost_breakdown: totalCost
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
	  ${hasProducts ? '"product_search_needed": true/false,' : ''}
	  ${hasProducts ? '"product_search_query": "detailed search query (if searching for products)",' : ''}
	  ${hasDocuments ? '"knowledge_search_needed": true/false,' : ''}
	  ${hasDocuments ? '"knowledge_search_query": "search query (if searching knowledge base)",' : ''}
	  ${hasProducts ? '"collecting_preferences": true/false,' : ''}
	  ${hasProducts ? '"preferences_collected": { "preference_name": "value or null" },' : ''}
	  ${hasProducts ? '"ready_to_search": true/false,' : ''}
	  "agent_transfer": true/false,
	  "order_intent_detected": true/false
	}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;

        systemPrompt += jsonFormatInstructions;

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
	- Use "Allah Hafiz" or "Thank you for shopping with Wear Ego"
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
	  "response": "Thank you for visiting Wear Ego! Allah Hafiz!",
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
	- Questions about policies, procedures, how-to guides
	- General information queries
	- Documentation lookups
	- FAQs and support articles

	Use product_search_needed = true for:
	- Finding specific products
	- Product recommendations
	- Browsing catalog
	- "Show me...", "I'm looking for...", "Do you have..."

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
	- Question requires specific domain knowledge
	- User asks "Do you have info about...", "Tell me about...", "What is..."

	NEVER set product_search_needed as there are no products to search.

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;
        } else if (hasProducts && !hasDocuments) {
            systemPrompt += `

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	PRODUCT CATALOG ONLY (NO KNOWLEDGE BASE)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

	This agent has a product catalog but NO knowledge base documents.

	Focus on helping users find and purchase products.
	Use product_search_needed for product queries.

	For general questions outside products (policies, shipping, etc.), 
	you should transfer to a human agent as you don't have that information.

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

    /**
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
	❌ Discuss topics not related to your role and purpose
	❌ Claim capabilities or knowledge you don't have
	❌ Speculate or guess when you don't have information

	🛒 ORDER PROCESSING RULES:
	1. Check if you have order functions → Use them
	2. Check your instructions for order process → Follow them
	3. If you have Shopify products → Share purchase URLs
	4. If none of above → Offer human agent transfer
	5. NEVER generate fake order confirmation yourself
	6. Set order_intent_detected = true when user wants to buy

	🚨 STRICTLY OFF-LIMITS TOPICS:
	- Politics, politicians, current events (e.g., "Imran Khan")
	- Religious, controversial, or sensitive topics
	- Medical, legal, or financial advice
	- Personal information about real people
	- Topics unrelated to fashion/clothing/Wear Ego

	${hasDocuments ? `
	WHEN YOU DON'T KNOW (set knowledge_search_needed = true):
	- User asks about Wear Ego policies, store info, or FAQs
	- You need specific information to answer accurately
	- Question requires domain-specific knowledge about fashion/brand
	- ONLY if the query is relevant to fashion/Wear Ego
	` : ''}

	${hasProducts ? `
	WHEN SEARCHING PRODUCTS (set product_search_needed = true):
	- User requests to see/find fashion items
	- After collecting sufficient preferences
	- When ready_to_search = true
	- ONLY for fashion/clothing-related queries
	` : ''}

	WHEN TO TRANSFER TO HUMAN (set agent_transfer = true):
	- Question is completely outside fashion/Wear Ego domain
	- User explicitly requests human agent
	- User shows frustration (3+ failed attempts)
	- You cannot answer accurately within your scope
	- User asks about politics, religion, or controversial topics

	${!hasDocuments && !hasProducts ? `
	⚠️ CRITICAL: You have NO knowledge base and NO product catalog.
	Answer ONLY based on your base instructions.
	For anything else, transfer to human immediately.
	` : ''}

	🎯 YOUR SCOPE: Fashion, clothing, Wear Ego products/services ONLY
	🚫 OUT OF SCOPE: Politics, news, general knowledge, personal questions

	IF USER ASKS IRRELEVANT QUESTION:
	- Politely decline to answer
	- Explain you only handle fashion/Wear Ego queries
	- Offer to transfer to human if they need help with something else
	- DO NOT search knowledge base for irrelevant topics
	- DO NOT set knowledge_search_needed = true for off-topic queries

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

        await db.query(
            `INSERT INTO yovo_tbl_aiva_chat_messages (
			id, session_id, role, content, content_html, content_markdown,
			sources, images, products, function_calls, cost, cost_breakdown,
			tokens_input, tokens_output, processing_time_ms, agent_transfer_requested
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
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
                messageData.processingTimeMs || 0,
                messageData.agentTransferRequested || false
            ]
        );
		
		TranscriptionAnalysisService.analyzeMessage(message, 'customer')
			.then(analysis => {
				// Check if translation needed
				if (analysis.language_detected && analysis.language_detected !== 'en') {
					return TranscriptionAnalysisService.translateToEnglish(message, analysis.language_detected)
						.then(translation => ({
							...analysis,
							translated_message: translation.translated_text
						}));
				}
				return analysis;
			})
			.then(analysis => {
				return TranscriptionService.updateChatMessageAnalysis(messageId, analysis);
			})
			.catch(error => {
				logger.error('Error analyzing chat message:', error);
			});

        return messageId;
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