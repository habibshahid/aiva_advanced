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
		metadata = {},
		// New channel fields
		channel = 'public_chat',
		channelUserId = null,
		channelUserName = null,
		channelMetadata = null,
		contextData = null,
		llmContextHints = null
	}) {
		const sessionId = uuidv4();

		await db.query(
			`INSERT INTO yovo_tbl_aiva_chat_sessions (
				id, tenant_id, agent_id, channel, channel_user_id, channel_user_name,
				channel_metadata, context_data, llm_context_hints,
				user_id, session_name, status, metadata
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
			[
				sessionId,
				tenantId,
				agentId,
				channel,
				channelUserId,
				channelUserName,
				channelMetadata ? JSON.stringify(channelMetadata) : null,
				contextData ? JSON.stringify(contextData) : null,
				llmContextHints,
				userId,
				sessionName,
				JSON.stringify(metadata)
			]
		);

		console.log(`📱 Chat session created: ${sessionId} | Channel: ${channel} | User: ${channelUserId || 'anonymous'}`);

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
				a.kb_id,
				a.knowledge_search_mode
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
				{},
			channel_metadata: session.channel_metadata ?
				(typeof session.channel_metadata === 'string' ? JSON.parse(session.channel_metadata) : session.channel_metadata) :
				null,
			context_data: session.context_data ?
				(typeof session.context_data === 'string' ? JSON.parse(session.context_data) : session.context_data) :
				null
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
		console.log('@@@@@@@@@@', 
			sessionId,
			agentId,
			message,
			image,
			userId
		)
		
        let session;
		let agent;
		
        if (sessionId) {
            session = await this.getSession(sessionId);
            if (!session) {
				agent = await AgentService.getAgent(agentId);
				if (!agent) {
					throw new Error('Agent not found');
				}

                session = await this.createSession({
					tenantId: agent.tenant_id,
					agentId: agentId,
					userId: userId,
					sessionName: message.substring(0, 50),
					channel: channelInfo?.channel || 'public_chat',
					channelUserId: channelInfo?.channelUserId || null,
					channelUserName: channelInfo?.channelUserName || null,
					channelMetadata: channelInfo?.channelMetadata || null,
					contextData: channelInfo?.contextData || null,
					llmContextHints: channelInfo?.llmContextHints || null
				});
				sessionId = session.id;
            }
        } else {
            agent = await AgentService.getAgent(agentId);
            if (!agent) {
                throw new Error('Agent not found');
            }

            session = await this.createSession({
                tenantId: agent.tenant_id,
                agentId: agentId,
                userId: userId,
                sessionName: message.substring(0, 50),
				channel: channelInfo?.channel || 'public_chat',
				channelUserId: channelInfo?.channelUserId || null,
				channelUserName: channelInfo?.channelUserName || null,
				channelMetadata: channelInfo?.channelMetadata || null,
				contextData: channelInfo?.contextData || null,
				llmContextHints: channelInfo?.llmContextHints || null
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
		const userAnalysisCost = 0;
			
        // Get agent with full configuration
        agent = await AgentService.getAgent(session.agent_id);

		agent.sessionContext = {
			channel: session.channel,
			channel_user_id: session.channel_user_id,
			channel_user_name: session.channel_user_name,
			channel_metadata: session.channel_metadata,
			context_data: session.context_data,
			llm_context_hints: session.llm_context_hints,
		};
	
        // Get conversation history
		const history = await this.getConversationHistory(sessionId, 10);

		// Check if this is the first ASSISTANT message (ignore user messages we just saved)
		// First message = no assistant messages in history yet
		const assistantMessagesCount = history.filter(msg => msg.role === 'assistant').length;
		const isFirstMessage = assistantMessagesCount === 0;

		console.log(`📊 History: ${history.length} messages, ${assistantMessagesCount} assistant messages, isFirstMessage: ${isFirstMessage}`);

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
            ...history
				.filter((msg, index) => !(index === history.length - 1 && msg.role === 'user'))
				.map(msg => ({
					role: msg.role,
					content: msg.content
				})),
            {
                role: 'user',
                content: message
            }
        ];

		//console.log(systemPrompt)
		//console.log(messages);
		
        const model = agent.chat_model || 'gpt-4o-mini';

		const completion = await this.openai.chat.completions.create({
			model: model,
			messages: messages,
			response_format: { type: "json_object" },  // ✅ ALWAYS use JSON mode
			temperature: parseFloat(agent.temperature) || 0.7,
			max_tokens: agent.max_tokens || 4096
		});

		const aiMessage = completion.choices[0].message;

		// Calculate first call cost
		let llmCost = CostCalculator.calculateChatCost({
			prompt_tokens: completion.usage.prompt_tokens,
			completion_tokens: completion.usage.completion_tokens,
			cached_tokens: completion.usage.prompt_tokens_details?.cached_tokens || 0
		}, model);

		console.log('💰 First LLM call cost:', llmCost.final_cost);

		let llmDecision;

		// Parse JSON response (should always be valid JSON now)
		try {
			llmDecision = JSON.parse(aiMessage.content);
			//console.log('llmDecision Before', llmDecision, agent.kb_metadata)
			
			//llmDecision.knowledge_search_needed = (!llmDecision.knowledge_search_needed && agent.kb_metadata.has_documents) ? true : llmDecision.knowledge_search_needed
			//llmDecision.knowledge_search_query = (!llmDecision.knowledge_search_needed && agent.kb_metadata.has_documents) ? true : (llmDecision.knowledge_search_query ? llmDecision.knowledge_search_query : message)
			
			//console.log('llmDecision After', llmDecision)
			console.log('🤖 LLM Decision:', JSON.stringify(llmDecision, null, 2));
			
			// ============================================
			// 🚨 EMPTY RESPONSE FALLBACK
			// ============================================
			if (!llmDecision.response || llmDecision.response.trim() === '') {
				console.log('⚠️ LLM returned empty response - generating fallback');
				
				const isTrivial = this._isTrivialMessage(message);
				
				if (isTrivial) {
					// It's a greeting/thanks/bye - provide appropriate response
					if (/^(hi|hello|hey|hii+|helo+|assalam|aoa|salam)/i.test(message.toLowerCase().trim())) {
						// Greeting - use agent's greeting if available, otherwise default
						llmDecision.response = agent.greeting || "Hello! How can I help you today?";
						console.log('👋 Using greeting response for trivial message');
					} else if (/^(thanks|thank|shukriya|thx|ty)/i.test(message.toLowerCase().trim())) {
						// Thanks
						llmDecision.response = "You're welcome! Is there anything else I can help you with?";
					} else if (/^(bye|goodbye|allah\s*hafiz|khuda\s*hafiz)/i.test(message.toLowerCase().trim())) {
						// Goodbye
						llmDecision.response = "Goodbye! Feel free to reach out if you need any help. Allah Hafiz!";
						llmDecision.conversation_complete = true;
						llmDecision.user_wants_to_end = true;
					} else {
						// Other trivial (yes/no/ok)
						llmDecision.response = "I understand. How can I assist you further?";
					}
				} else {
					// Non-trivial message but empty response - this shouldn't happen
					llmDecision.response = "I apologize, but I encountered an issue. Could you please repeat your question?";
					console.log('❌ Empty response for non-trivial message - using error fallback');
				}
			}
			
			// ============================================
			// 🔍 KNOWLEDGE SEARCH MODE OVERRIDE
			// ============================================
			const searchMode = agent.knowledge_search_mode || 'auto';
			const isTrivialMsg = this._isTrivialMessage(message);

			// ALWAYS MODE: Force search for non-trivial, PREVENT for trivial
			if (searchMode === 'always' && agent.kb_id) {
				if (isTrivialMsg) {
					// Trivial message - DON'T search even in always mode
					if (llmDecision.knowledge_search_needed) {
						console.log('🚫 [OVERRIDE] Trivial message detected → Disabling KB search');
						llmDecision.knowledge_search_needed = false;
					}
				} else if (!llmDecision.knowledge_search_needed) {
					// Non-trivial message - FORCE search
					console.log('🔍 [OVERRIDE] knowledge_search_mode=always → Forcing KB search');
					llmDecision.knowledge_search_needed = true;
					llmDecision.knowledge_search_query = llmDecision.knowledge_search_query || message;
				}
			} else if (searchMode === 'never') {
				// NEVER mode: Disable knowledge search entirely
				if (llmDecision.knowledge_search_needed) {
					console.log('🚫 [OVERRIDE] knowledge_search_mode=never → Disabling search');
					llmDecision.knowledge_search_needed = false;
				}
			}
		} catch (parseError) {
			console.error('❌ Failed to parse LLM response as JSON:', parseError.message);
			console.error('📄 Raw response:', aiMessage.content?.substring(0, 500));
			
			// Fallback - try to extract useful info
			llmDecision = {
				response: aiMessage.content || "I apologize, but I couldn't process your request. Please try again.",
				product_search_needed: false,
				knowledge_search_needed: false,
				product_search_type: "none",
				product_id: null,
				needs_clarification: false,
				function_call_needed: false,
				function_name: null,
				function_arguments: null,
				agent_transfer: false,
				order_intent_detected: false,
				conversation_complete: false,
				user_wants_to_end: false
			};
		}

		// ============================================
		// 🔧 HANDLE FUNCTION CALLS (from JSON decision)
		// ============================================
		let executedFunctionCalls = [];

		if (llmDecision && llmDecision.function_call_needed && llmDecision.function_name) {
			console.log(`🔧 Function call requested: ${llmDecision.function_name}`);
			console.log(`📋 Arguments:`, llmDecision.function_arguments);
			
			const builtInFunctions = ['check_order_status'];
			const isBuiltInFunction = builtInFunctions.includes(llmDecision.function_name);
	
			// Verify function exists
			const requestedFunction = isBuiltInFunction 
				? { name: llmDecision.function_name, is_active: true, _builtin: true }
				: agent.functions?.find(
					fn => fn.name === llmDecision.function_name && fn.is_active !== false
				);
			
			if (requestedFunction) {
				try {
					// Execute the function
					const functionResult = await this._executeFunction(
						agent,
						llmDecision.function_name,
						llmDecision.function_arguments || {}
					);
					
					console.log(`✅ Function executed:`, functionResult);
					
					executedFunctionCalls.push({
						function_id: uuidv4(),
						function_name: llmDecision.function_name,
						arguments: llmDecision.function_arguments,
						result: functionResult,
						status: 'success'
					});
					
					// Make second LLM call with function result
					console.log('🔄 Calling LLM again with function result...');
					
					const messagesWithFunctionResult = [
						...messages,
						{
							role: 'assistant',
							content: JSON.stringify(llmDecision)
						},
						{
							role: 'user',
							content: `[FUNCTION RESULT for ${llmDecision.function_name}]:\n${JSON.stringify(functionResult, null, 2)}\n\nBased on this function result, provide your final response to the user. Remember to respond in valid JSON format.`
						}
					];
					
					const functionFollowupCompletion = await this.openai.chat.completions.create({
						model: model,
						messages: messagesWithFunctionResult,
						response_format: { type: "json_object" },
						temperature: parseFloat(agent.temperature) || 0.7,
						max_tokens: agent.max_tokens || 4096
					});
					
					// Calculate second call cost
					const secondCallCost = CostCalculator.calculateChatCost({
						prompt_tokens: functionFollowupCompletion.usage.prompt_tokens,
						completion_tokens: functionFollowupCompletion.usage.completion_tokens,
						cached_tokens: functionFollowupCompletion.usage.prompt_tokens_details?.cached_tokens || 0
					}, model);
					
					console.log('💰 Function followup LLM cost:', secondCallCost.final_cost);
					llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);
					
					// Parse final response
					try {
						const finalDecision = JSON.parse(functionFollowupCompletion.choices[0].message.content);
						console.log('✅ Final response after function call:', finalDecision.response?.substring(0, 100));
						
						// Update llmDecision with final response
						llmDecision.response = finalDecision.response;
						llmDecision.function_call_needed = false; // Don't call again
						
						// Preserve any other decisions from final response
						if (finalDecision.agent_transfer !== undefined) {
							llmDecision.agent_transfer = finalDecision.agent_transfer;
						}
						if (finalDecision.conversation_complete !== undefined) {
							llmDecision.conversation_complete = finalDecision.conversation_complete;
						}
						if (finalDecision.user_wants_to_end !== undefined) {
							llmDecision.user_wants_to_end = finalDecision.user_wants_to_end;
						}
						
					} catch (parseError) {
						console.error('❌ Failed to parse function followup response:', parseError.message);
						// Use the raw content as response
						llmDecision.response = functionFollowupCompletion.choices[0].message.content || 
							"I've processed your request.";
					}
					
				} catch (functionError) {
					console.error(`❌ Function execution failed:`, functionError);
					
					executedFunctionCalls.push({
						function_id: uuidv4(),
						function_name: llmDecision.function_name,
						arguments: llmDecision.function_arguments,
						result: { error: functionError.message },
						status: 'error'
					});
					
					// Update response to indicate failure
					llmDecision.response = "I apologize, but I encountered an issue while processing your request. Please try again or let me know how else I can help.";
				}
			} else {
				console.warn(`⚠️ Function not found or inactive: ${llmDecision.function_name}`);
				llmDecision.response = "I apologize, but I'm unable to perform that action at the moment. How else can I help you?";
			}
		}

		// Use executedFunctionCalls for the response
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

					console.log('🔍 Knowledge search results 2:', {
						text_results: searchResult.results?.text_results?.length || 0,
						image_results: searchResult.results?.image_results?.length || 0,
						product_results: searchResult.results?.product_results?.length || 0,
						//text_result: searchResult.results?.text_results
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
		--------------------------------------------------------------------
		📦 SPECIFIC PRODUCT DETAILS (User is asking about THIS product)
		--------------------------------------------------------------------

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

		--------------------------------------------------------------------
		⚠️ IMPORTANT INSTRUCTIONS:
		- Answer the user's question using ONLY the above product details
		- Be SPECIFIC about sizes and availability
		- If user asks about a size, tell them if it's in stock or not
		- Include the purchase URL when relevant
		- DO NOT search for more products - you have all the information
		- DO NOT set product_search_needed = true
		--------------------------------------------------------------------`;
				} else {
					const INITIAL_PRODUCTS_COUNT = 3;
					const initialProducts = knowledgeResults.product_results.slice(0, INITIAL_PRODUCTS_COUNT);
					const remainingProducts = knowledgeResults.product_results.slice(INITIAL_PRODUCTS_COUNT);
					const hasMoreProducts = remainingProducts.length > 0;
					
					// Format initial products for display
					const initialProductContext = initialProducts.map((product, idx) =>
						`[Product ${idx + 1}]
		Name: ${product.name || product.title}
		Product ID: ${product.product_id}
		Price: PKR ${product.price}${product.compare_at_price ? ` (was PKR ${product.compare_at_price})` : ''}
		Description: ${product.description?.substring(0, 150) || 'No description'}...
		Availability: ${product.availability || (product.total_inventory > 0 ? 'In Stock' : 'Out of Stock')}
		${product.available_sizes?.length > 0 ? `Available Sizes: ${product.available_sizes.join(', ')}` : ''}
		Purchase URL: ${product.purchase_url || 'N/A'}`
					).join('\n\n');
					
					// Format remaining products (for "show more")
					const remainingProductContext = remainingProducts.length > 0 
						? remainingProducts.map((product, idx) =>
							`[Product ${idx + INITIAL_PRODUCTS_COUNT + 1}]
		Name: ${product.name || product.title}
		Product ID: ${product.product_id}
		Price: PKR ${product.price}${product.compare_at_price ? ` (was PKR ${product.compare_at_price})` : ''}
		Description: ${product.description?.substring(0, 150) || 'No description'}...
		Availability: ${product.availability || (product.total_inventory > 0 ? 'In Stock' : 'Out of Stock')}
		${product.available_sizes?.length > 0 ? `Available Sizes: ${product.available_sizes.join(', ')}` : ''}
		Purchase URL: ${product.purchase_url || 'N/A'}`
						).join('\n\n')
						: '';
						
					// MULTI PRODUCT - Show list of products
					productContext = knowledgeResults.product_results.map((product, idx) =>
						`[Product ${idx + 1}]
		Product ID: ${product.product_id}
		Name: ${product.name || product.title}
		Price: PKR ${product.price}${product.compare_at_price ? ` (was PKR ${product.compare_at_price})` : ''}
		Description: ${product.description?.substring(0, 150) || 'No description'}...
		Availability: ${product.availability || (product.total_inventory > 0 ? 'In Stock' : 'Out of Stock')}
		${product.available_sizes?.length > 0 ? `Available Sizes: ${product.available_sizes.join(', ')}` : ''}
		Purchase URL: ${product.purchase_url || 'N/A'}`
					).join('\n\n');
					
					productContext = `
		--------------------------------------------------------------------
		PRODUCT SEARCH RESULTS
		--------------------------------------------------------------------

		Total Products Found: ${knowledgeResults.product_results.length}
		Showing: Top ${initialProducts.length} most relevant products

		📦 TOP ${initialProducts.length} PRODUCTS TO SHOW:
		${initialProductContext}

		${hasMoreProducts ? `
		--------------------------------------------------------------------
		📋 ADDITIONAL ${remainingProducts.length} PRODUCTS (Show when user asks for more):
		${remainingProductContext}
		--------------------------------------------------------------------
		` : ''}

		--------------------------------------------------------------------
		⚠️ CRITICAL PRESENTATION RULES:
		--------------------------------------------------------------------
		
		1. INITIALLY SHOW ONLY THE TOP ${INITIAL_PRODUCTS_COUNT} PRODUCTS listed above
		2. DO NOT show all ${knowledgeResults.product_results.length} products at once
		3. ${hasMoreProducts ? `After showing top ${INITIAL_PRODUCTS_COUNT}, tell the user: "I have ${remainingProducts.length} more options. Would you like to see more?"` : ''}
		4. When user says "show more", "aur dikhao", "more options", etc. → Show the ADDITIONAL products
		5. Present products in a helpful, conversational way
		6. DO NOT say "I need to search" - you already have the results
		7. DO NOT set product_search_needed=true again
		
		--------------------------------------------------------------------`;
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

                console.log('🔍 Knowledge search results 1:', {
                    text_results: searchResult.results?.text_results?.length || 0,
                    image_results: searchResult.results?.image_results?.length || 0,
                    product_results: searchResult.results?.product_results?.length || 0,
					//text_result: searchResult.results?.text_results
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
--------------------------------------------------------------------
SEARCH RESULTS FROM KNOWLEDGE BASE
--------------------------------------------------------------------

Query: "${searchQuery}"

${contextChunks}

--------------------------------------------------------------------

CRITICAL: Use the above search results to answer the user's question.
- Provide a direct answer based on the search results
- DO NOT say "I need to search" - you already have the results
- DO NOT set knowledge_search_needed=true again
- Answer naturally without mentioning "search results"

Your response MUST be in JSON format with knowledge_search_needed=false.
--------------------------------------------------------------------`
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
							max_tokens: 4096  // ✅ Sufficient for JSON response, prevents timeout
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

		// ============================================
		// 📅 INJECT CURRENT DATE AT TOP (CRITICAL FOR DATE CALCULATIONS)
		// ============================================
		const todayFormatted = new Date().toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
		
		const dateHeader = `
	============================================================
	📅 CURRENT DATE: ${todayFormatted}
	============================================================
	Use this date for ALL time-based calculations (48-hour windows, delivery estimates, etc.)
	============================================================

	`;
		
		systemPrompt = dateHeader + systemPrompt;
		
		// ============================================
		// 📱 CHANNEL CONTEXT INJECTION
		// ============================================
		if (agent?.sessionContext) {
			const ctx = agent.sessionContext;
			
			let channelContextPrompt = `

		--------------------------------------------------------------------
		📱 CHANNEL & USER CONTEXT
		--------------------------------------------------------------------

		`;
		
			const todayFormatted = new Date().toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
			channelContextPrompt += `Today's Date: ${todayFormatted}\n`;
			
			if (ctx.channel) {
				channelContextPrompt += `Channel: ${ctx.channel.toUpperCase()}\n`;
			}
			
			// Add user info
			if (ctx.channel_user_id) {
				channelContextPrompt += `User ID: ${ctx.channel_user_id}\n`;
			}
			if (ctx.channel_user_name) {
				channelContextPrompt += `User Name: ${ctx.channel_user_name}\n`;
			}
			
			// Add custom context data
			if (ctx.context_data && Object.keys(ctx.context_data).length > 0) {
				channelContextPrompt += `\n===== CUSTOM CONTEXT =====\n`;
				Object.entries(ctx.context_data).forEach(([key, value]) => {
					channelContextPrompt += `${key}: ${value}\n`;
				});
				channelContextPrompt += `===== END OF CUSTOM CONTEXT =====\n`;
			}
			
			// Add LLM-specific hints
			if (ctx.llm_context_hints) {
				channelContextPrompt += `\n===== CRITICAL LLM INSTRUCTIONS =====\n`;
				channelContextPrompt += ctx.llm_context_hints;
				channelContextPrompt += `\n===== END OF CRITICAL INSTRUCTIONS =====\n`;
			}
			
			// Add channel-specific default instructions
			const channelDefaults = this._getChannelDefaultInstructions(ctx.channel);
			if (channelDefaults) {
				channelContextPrompt += channelDefaults;
			}
			
			channelContextPrompt += `
		--------------------------------------------------------------------
		`;
			
			systemPrompt += channelContextPrompt;
		}
			
		const searchMode = agent?.knowledge_search_mode || 'auto';
    
		// ============================================
		// 🔍 SEARCH MODE INSTRUCTIONS
		// ============================================
		if (searchMode === 'always' && agent?.kb_id) {
			systemPrompt += `

	--------------------------------------------------------------------
	⚠️ MANDATORY KNOWLEDGE BASE SEARCH MODE ENABLED
	--------------------------------------------------------------------

	This agent is configured to ALWAYS search the knowledge base.

	SET knowledge_search_needed = true FOR ALL QUESTIONS.

	The ONLY exceptions (no search needed):
	- Pure greetings: "hi", "hello", "assalam o alaikum"
	- Pure thanks: "thanks", "thank you", "shukriya"  
	- Pure goodbyes: "bye", "allah hafiz"
	- Simple confirmations: "yes", "no", "ok"

	FOR EVERYTHING ELSE → knowledge_search_needed = true

	You have NO built-in knowledge about this data. ALWAYS SEARCH FIRST.

	--------------------------------------------------------------------
	`;
		} else if (searchMode === 'never') {
			systemPrompt += `

	--------------------------------------------------------------------
	KNOWLEDGE SEARCH DISABLED
	--------------------------------------------------------------------

	This agent does not use knowledge base search.
	Answer based on your instructions only.
	Set knowledge_search_needed = false always.

	--------------------------------------------------------------------
	`;
	systemPrompt += channelContextPrompt;
	}
		// ============================================
		// 🔍 DETECT WHAT USER HAS ALREADY DEFINED
		// ============================================
		const coverage = this._detectInstructionCoverage(baseInstructions);
		
		console.log('📋 Instruction coverage:', JSON.stringify(coverage));

		// ============================================
		// 🌐 LANGUAGE MATCHING RULE (if not defined by user)
		// ============================================
		if (!coverage.hasLanguageRules) {
			const languageRule = `

	--------------------------------------------------------------------
	🌐 LANGUAGE MATCHING RULE
	--------------------------------------------------------------------

	RESPOND IN THE SAME LANGUAGE THE CUSTOMER USES:
	- Customer writes in ENGLISH → Respond in ENGLISH
	- Customer writes in URDU/ROMAN URDU → Respond in ROMAN URDU
	- Customer mixes both → Match their primary language

	NOTE: Examples below may show one language for illustration, but YOU must always match the customer's language.

	--------------------------------------------------------------------
	`;
			systemPrompt += languageRule;
		}

		// Add greeting instructions
		if (greeting) {
			const greetingInstructions = `

		--------------------------------------------------------------------
		GREETING MESSAGE ${isFirstMessage ? '⚠️ FIRST MESSAGE - USE GREETING NOW!' : ''}
		--------------------------------------------------------------------

		${isFirstMessage ? `
		CRITICAL: THIS IS THE FIRST MESSAGE IN THE CONVERSATION!

		You MUST begin your response with this exact greeting:
		"${greeting}"

		Then naturally transition to helping the user based on their message.

		EXAMPLE for greeting like "hi" or "hello":
		{
		  "response": "${greeting}",
		  "knowledge_search_needed": false,
		  "conversation_complete": false,
		  "user_wants_to_end": false
		}
		` : `
		GREETING: "${greeting}"

		This greeting was already used at the start. DO NOT repeat it.
		Continue the conversation naturally.

		For simple greetings (hi, hello), respond warmly like:
		"Hello! How can I help you today?" or "Hi there! What can I assist you with?"

		NEVER return an empty response. Always say something helpful.
		`}

		--------------------------------------------------------------------
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

	--------------------------------------------------------------------
	CRITICAL: JSON RESPONSE FORMAT (RFC 8259 COMPLIANT)
	--------------------------------------------------------------------

	You MUST ALWAYS respond with valid JSON in this EXACT structure:

	{
	  "response": "Your natural conversational response in user's language",
	  ${hasProducts ? `
	  "product_search_needed": true/false,
	  "product_search_type": "single" | "multi" | "none",
	  "product_id": "uuid-of-specific-product (only if search_type=single)",
	  "product_search_query": "search query (only if search_type=multi)",
	  "show_more_products": true/false,
	  "collecting_preferences": true/false,
	  "preferences_collected": { "preference_name": "value or null" },
	  "ready_to_search": true/false,
	  ` : ''}
	  ${hasDocuments ? `
	  "knowledge_search_needed": true/false,
	  "knowledge_search_query": "search query (if searching knowledge base)",
	  ` : ''}
	  "function_call_needed": true/false,
	  "function_name": "name_of_function_to_call (only if function_call_needed=true)",
	  "function_arguments": { "arg1": "value1" },
	  "needs_clarification": true/false,
	  "agent_transfer": true/false,
	  "order_intent_detected": true/false,
	  "conversation_complete": true/false,
	  "user_wants_to_end": true/false
	}

	--------------------------------------------------------------------
	`;

		systemPrompt += jsonFormatInstructions;

		// ============================================
		// PRODUCT SEARCH DECISION LOGIC (Language-neutral examples)
		// ============================================
		const productSearchDecisionInstructions = `

	--------------------------------------------------------------------
	SMART PRODUCT SEARCH DECISION LOGIC
	--------------------------------------------------------------------

	When user asks about products, YOU must decide the search type:

	--------------------------------------------------------------------
	1. SINGLE PRODUCT LOOKUP (product_search_type = "single")
	--------------------------------------------------------------------

	Use when:
	 Message contains "AiVA Product ID: <uuid>" 
	 Message contains "Shopify Product ID: <number>"
	 User replied to a specific product message (WhatsApp reply with product info)
	 User clearly references ONE specific product from conversation history
	 User says "this one", "is wali", "yeh product" AND you can identify which product from context

	HOW TO DETECT PRODUCT ID IN MESSAGE:
	- Look for pattern: "AiVA Product ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
	- Look for pattern: "Shopify Product ID: 1234567890"
	- Look for pattern: "Purchase URL: https://store.myshopify.com/products/..."

	RESPONSE FORMAT:
	{
	  "response": "[Acknowledge you're checking product details - use customer's language]",
	  "product_search_needed": true,
	  "product_search_type": "single",
	  "product_id": "8cbaf5af-7212-497e-ba95-6269dfa9199d",
	  "product_search_query": null,
	  "ready_to_search": true
	}

	--------------------------------------------------------------------
	2. MULTI PRODUCT SEARCH (product_search_type = "multi")
	--------------------------------------------------------------------

	Use when:
	 User asks general question: "show me red dresses", "kuch formal shirts dikhao"
	 User wants recommendations
	 User browsing: "what do you have under 5000?"
	 User searching by category/color/style/price

	RESPONSE FORMAT:
	{
	  "response": "[Acknowledge you're searching for products - use customer's language]",
	  "product_search_needed": true,
	  "product_search_type": "multi",
	  "product_id": null,
	  "product_search_query": "red formal dresses under 5000",
	  "ready_to_search": true
	}

	--------------------------------------------------------------------
	3. NEEDS CLARIFICATION (needs_clarification = true)
	--------------------------------------------------------------------

	Use when:
	 User says "this one" / "is ki" / "yeh wali" but NO product ID in message
	 User references "the second one" but you can't identify from history
	 Ambiguous which product they mean
	 Multiple products were shown and user's reference is unclear

	RESPONSE FORMAT:
	{
	  "response": "[Ask which product they mean - use customer's language]",
	  "product_search_needed": false,
	  "product_search_type": "none",
	  "needs_clarification": true
	}

	--------------------------------------------------------------------
	4. NO SEARCH NEEDED (product_search_type = "none")
	--------------------------------------------------------------------

	Use when:
	 General conversation / greeting
	 Question about policies, shipping, returns
	 You can answer from instructions/knowledge
	 Non-product related query

	RESPONSE FORMAT:
	{
	  "response": "[Your answer - use customer's language]",
	  "product_search_needed": false,
	  "product_search_type": "none"
	}

	--------------------------------------------------------------------
	WHATSAPP REPLY DETECTION - CRITICAL!
	--------------------------------------------------------------------

	WHEN MESSAGE CONTAINS "AiVA Product ID:" YOU MUST:
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
	  "response": "[Checking product details - match customer's language]",
	  "product_search_needed": true,
	  "product_search_type": "single",
	  "product_id": "01ba7c2b-7ac7-4c52-9d12-0c2896426270",
	  "product_search_query": null,
	  "ready_to_search": true,
	  "needs_clarification": false
	}

	WRONG (DO NOT DO THIS):
	{
	  "product_search_type": "multi",
	  "product_search_query": "Dreamy 2 Piece dress length"
	}

	CORRECT:
	{
	  "product_search_type": "single",
	  "product_id": "01ba7c2b-7ac7-4c52-9d12-0c2896426270"
	}

	--------------------------------------------------------------------
	HISTORY REFERENCE DETECTION - CRITICAL FOR SINGLE LOOKUPS
	--------------------------------------------------------------------

	When user references a product from conversation history:

	STEP 1: Look for the product in your PREVIOUS RESPONSES
	- Find the product name they're referring to
	- Extract its Product ID from your previous message

	STEP 2: Use product_search_type = "single" with that Product ID

	EXAMPLES:

	User previously saw: "Product ID: abc-123, Name: Pine Trees Shawl"
	User now asks: "is ki length kya hai?" or "what's the length of this?"

	CORRECT:
	{
	  "product_search_type": "single",
	  "product_id": "abc-123",
	  "product_search_query": null
	}

	WRONG:
	{
	  "product_search_type": "multi",
	  "product_search_query": "Pine Trees Shawl length"
	}

	REFERENCE KEYWORDS:
	- "pehle wala" / "the first one" → Find 1st product's ID from your last response
	- "is ki" / "this one" / "yeh wali" → Find the product from context
	- Product name mentioned → Find its ID from conversation history

	IF YOU CAN FIND THE PRODUCT ID FROM HISTORY:
	→ Use product_search_type = "single" with that product_id

	IF YOU CANNOT FIND THE PRODUCT ID:
	→ Set needs_clarification = true and ask which product

	--------------------------------------------------------------------
	DECISION FLOWCHART
	--------------------------------------------------------------------

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

	--------------------------------------------------------------------
	5️⃣ SHOW MORE PRODUCTS (show_more_products = true)
	--------------------------------------------------------------------

	Use when user asks to see more products after initial results:
	 "show more" / "aur dikhao" / "more options"
	 "what else do you have" / "aur kya hai"
	 "next" / "agle products"
	 "any other options" / "koi aur"

	RESPONSE FORMAT:
	{
	  "response": "[Show more products - match customer's language]",
	  "product_search_needed": false,
	  "product_search_type": "none",
	  "show_more_products": true
	}

	IMPORTANT: When show_more_products = true:
	- Use the ADDITIONAL PRODUCTS from the previous search results
	- DO NOT perform a new search
	- Present the next batch of products from context

	--------------------------------------------------------------------
	6. PURCHASE INTENT AFTER SHOWING PRODUCTS
	--------------------------------------------------------------------

	When user says "buy it", "order it", "I want this", etc. AFTER you showed products:

	STEP 1: Check conversation history - how many products were shown?

	IF ONLY 1 PRODUCT WAS SHOWN:
	→ Proceed with that product (use product_search_type = "single" with that product_id)

	IF MULTIPLE PRODUCTS WERE SHOWN:
	→ DO NOT search again!
	→ Ask which product they want
	→ Set product_search_needed = false
	→ Set needs_clarification = true

	EXAMPLE SCENARIO:
	Previous message: You showed 5 shawls
	User now says: "i wanna buy it" or "yeh chahiye"

	WRONG:
	{
	  "response": "Let me search for shawls...",
	  "product_search_needed": true,
	  "product_search_type": "multi",
	  "product_search_query": "shawls"
	}

	CORRECT:
	{
	  "response": "[Ask which of the products they want - match customer's language]",
	  "product_search_needed": false,
	  "product_search_type": "none",
	  "needs_clarification": true,
	  "order_intent_detected": true
	}

	PURCHASE INTENT PHRASES:
	- English: "buy it" / "order it" / "I want it" / "I'll take it"
	- Urdu: "kharidna hai" / "order karna hai" / "yeh chahiye" / "main le lungi" / "pack kar do"
	- "how to buy" / "how to order" / "delivery time"

	RULE: If user shows purchase intent but reference is ambiguous:
	1. DO NOT search for products again
	2. Ask which product from the ones you already showed
	3. Set product_search_needed = false
	4. Set needs_clarification = true
	5. Set order_intent_detected = true
	--------------------------------------------------------------------
	`;

		if (hasProducts) {
			systemPrompt += productSearchDecisionInstructions;
		}
		
		// ============================================
		// CONVERSATION CLOSURE DETECTION (Language-neutral examples)
		// ============================================
		const closureInstructions = `

	--------------------------------------------------------------------
	CONVERSATION CLOSURE DETECTION
	--------------------------------------------------------------------

	DETECT WHEN CONVERSATION IS NATURALLY COMPLETE:

	SET conversation_complete = true WHEN:
	 You've answered user's question completely
	 Products have been shown and user seems satisfied
	 Order/purchase has been explained/completed
	 Information request has been fulfilled
	 User's needs appear to be met

	WHEN conversation_complete = true:
	- Ask if there's anything else you can help with (in customer's language)
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
	- Respond with warm closing message (in customer's language)
	- Thank them for their time
	- Keep it brief and friendly
	- Set BOTH conversation_complete = true AND user_wants_to_end = true

	EXAMPLE FLOW:

	User: "Show me dresses"
	Assistant: [Shows products]
	{
	  "response": "[Your product response + ask if anything else needed - match customer's language]",
	  "conversation_complete": true,
	  "user_wants_to_end": false
	}

	User: "No, that's all" / "Nahi shukriya"
	Assistant: [Closing message]
	{
	  "response": "[Thank them and say goodbye - match customer's language]",
	  "conversation_complete": true,
	  "user_wants_to_end": true
	}

	IMPORTANT:
	- Don't ask "anything else" too early (wait until task is complete)
	- Don't ask multiple times in same conversation
	- Be natural - if user asks new question, continue helping
	- Only close when user explicitly indicates they're done

	--------------------------------------------------------------------
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

		if (agent && agent.functions && agent.functions.length > 0) {
			const functionInstructions = this._buildFunctionInstructions(agent.functions, agent);
			systemPrompt += functionInstructions;
		}

		// Add knowledge base specific instructions
		if (hasDocuments && hasProducts) {
			systemPrompt += `

	--------------------------------------------------------------------
	HYBRID KNOWLEDGE BASE & PRODUCT CATALOG
	--------------------------------------------------------------------

	This agent has BOTH a knowledge base (documents) AND a product catalog.

	WHEN TO USE EACH:

	--------------------------------------------------------------------
	KNOWLEDGE BASE AGENT - SEARCH BY DEFAULT
	--------------------------------------------------------------------

	This agent has a knowledge base with documents. You MUST search it to answer questions.

	--------------------------------------------------------------------
	CRITICAL RULE: SEARCH BY DEFAULT
	--------------------------------------------------------------------

	- You have ZERO built-in knowledge about the content in this knowledge base!
	- Previous search results in conversation history are for REFERENCE ONLY!
	- For EACH new question, you MUST search again - even if topic seems familiar!

	DEFAULT BEHAVIOR: knowledge_search_needed = true

	--------------------------------------------------------------------
	SET knowledge_search_needed = true FOR:
	--------------------------------------------------------------------

	- ANY question asking for information, data, or facts
	- ANY question with "what", "how", "why", "when", "where", "who"
	- ANY question about numbers, amounts, dates, names, details
	- ANY question about policies, procedures, rules, processes
	- ANY question about the domain/topic of this agent
	- ANY follow-up question asking for MORE or DIFFERENT information
	- ANY comparison, analysis, or summary request
	- ANY request to explain, describe, or clarify something
	- EVEN IF you discussed similar topic before - SEARCH AGAIN!

	--------------------------------------------------------------------
	SET knowledge_search_needed = false ONLY FOR:
	--------------------------------------------------------------------

	- Greetings: "hi", "hello", "good morning", "assalam o alaikum"
	- Thanks: "thank you", "thanks", "shukriya", "okay thanks"
	- Acknowledgments: "ok", "got it", "understood", "alright"
	- Goodbyes: "bye", "goodbye", "allah hafiz"
	- Simple confirmations: "yes", "no", "sure"
	- Requests for clarification about YOUR question: "what do you mean?"

	--------------------------------------------------------------------
	QUICK DECISION RULE:
	--------------------------------------------------------------------

	Is this message just a greeting, thanks, bye, or simple yes/no?
	→ NO SEARCH needed

	Is this ANY other type of message?
	→ SEARCH NEEDED (knowledge_search_needed = true)

	- WHEN IN DOUBT → ALWAYS SEARCH!
	- SEARCHING TOO MUCH IS BETTER THAN HALLUCINATING!
	- Never make decision based on chat history and search Knowledge base always even if the question has been answered before.

	--------------------------------------------------------------------
	PRODUCT DETAIL QUERIES - MANDATORY SEARCH
	--------------------------------------------------------------------

	CRITICAL: When user asks about SPECIFIC product details, you MUST search!

	ALWAYS set product_search_needed = true AND ready_to_search = true when user asks about:
	- Size, dimensions, length, width, height
	- Fabric, material, composition
	- Color options, available colors
	- Price, cost, discount
	- Availability, stock, inventory
	- Specifications, features, details
	- Any measurement or specification question

	RULES:
	1. If you DON'T KNOW a product detail → SEARCH (don't say "I don't have info")
	2. If user asks about ANY measurement/specification → SEARCH
	3. If product was mentioned earlier in conversation → SEARCH with that product name
	4. NEVER say "I don't have details" without searching first
	5. Use the product name/ID from conversation context in your search query

	--------------------------------------------------------------------
	You can use BOTH in the same response if needed:
	- Search knowledge base for policies, then search products for items

	--------------------------------------------------------------------
	`;
		} else if (hasDocuments && !hasProducts) {
			systemPrompt += `

	--------------------------------------------------------------------
	KNOWLEDGE BASE AGENT - SEARCH BY DEFAULT
	--------------------------------------------------------------------

	This agent has a knowledge base with documents. You MUST search it to answer questions.

	--------------------------------------------------------------------
	CRITICAL RULE: SEARCH BY DEFAULT
	--------------------------------------------------------------------

	You have ZERO built-in knowledge about the content in this knowledge base!
	Previous search results in conversation history are for REFERENCE ONLY!
	For EACH new question, you MUST search again - even if topic seems familiar!

	DEFAULT BEHAVIOR: knowledge_search_needed = true

	--------------------------------------------------------------------
	SET knowledge_search_needed = true FOR:
	--------------------------------------------------------------------

	- ANY question asking for information, data, or facts
	- ANY question with "what", "how", "why", "when", "where", "who"
	- ANY question about numbers, amounts, dates, names, details
	- ANY question about policies, procedures, rules, processes
	- ANY question about the domain/topic of this agent
	- ANY follow-up question asking for MORE or DIFFERENT information
	- ANY comparison, analysis, or summary request
	- ANY request to explain, describe, or clarify something
	- EVEN IF you discussed similar topic before - SEARCH AGAIN!

	--------------------------------------------------------------------
	SET knowledge_search_needed = false ONLY FOR:
	--------------------------------------------------------------------

	- Greetings: "hi", "hello", "good morning", "assalam o alaikum"
	- Thanks: "thank you", "thanks", "shukriya", "okay thanks"
	- Acknowledgments: "ok", "got it", "understood", "alright"
	- Goodbyes: "bye", "goodbye", "allah hafiz"
	- Simple confirmations: "yes", "no", "sure"
	- Requests for clarification about YOUR question: "what do you mean?"

	--------------------------------------------------------------------
	QUICK DECISION RULE:
	--------------------------------------------------------------------

	Is this message just a greeting, thanks, bye, or simple yes/no?
	→ NO SEARCH needed

	Is this ANY other type of message?
	→ SEARCH NEEDED (knowledge_search_needed = true)

	 WHEN IN DOUBT → ALWAYS SEARCH!
	 SEARCHING TOO MUCH IS BETTER THAN HALLUCINATING!

	NEVER set product_search_needed as there are no products to search.

	--------------------------------------------------------------------
	`;
		} else if (hasProducts && !hasDocuments) {
			systemPrompt += `

	--------------------------------------------------------------------
	PRODUCT DETAIL QUERIES - MANDATORY SEARCH
	--------------------------------------------------------------------

	CRITICAL: When user asks about SPECIFIC product details, you MUST search!

	ALWAYS set product_search_needed = true AND ready_to_search = true when user asks about:
	- Size, dimensions, length, width, height
	- Fabric, material, composition
	- Color options, available colors
	- Price, cost, discount
	- Availability, stock, inventory
	- Specifications, features, details
	- Any measurement or specification question

	RULES:
	1. If you DON'T KNOW a product detail → SEARCH (don't say "I don't have info")
	2. If user asks about ANY measurement/specification → SEARCH
	3. If product was mentioned earlier in conversation → SEARCH with that product name
	4. NEVER say "I don't have details" without searching first
	5. Use the product name/ID from conversation context in your search query

	SEARCH QUERY TIPS:
	- Include product name: "chamomile 3 piece shirt length"
	- Include specific attribute: "shirt length measurements size"

	--------------------------------------------------------------------
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
	--------------------------------------------------------------------
    ORDER STATUS CHECK INSTRUCTIONS
    --------------------------------------------------------------------
    
    When customer asks about their ORDER STATUS, TRACKING, or DELIVERY:
    
    TRIGGER PHRASES:
    - "Where is my order?"
    - "Order status check karna hai"
    - "Mera order kahan hai?"
    - "Track my order"
    - "When will my order arrive?"
    - "Order delivery status"
    - "My order number is..."
    
    --------------------------------------------------------------------
    CRITICAL: PARAMETER IDENTIFICATION
    --------------------------------------------------------------------
    
    When customer provides information, identify the correct parameter:
    
    📞 PHONE NUMBER (use "phone" parameter):
    - ANY number that looks like a phone number (7-15 digits)
    - Pakistani: 03XX, +923XX, 923XX, 00923XX
    - International: +1XXX, +44XXX, +971XXX, etc.
    - With or without country code
    - With or without + prefix
    - With or without spaces/dashes
    Examples:
      "03315757575" → phone: "03315757575"
      "+923315757575" → phone: "+923315757575"
      "+1 234 567 8900" → phone: "+1 234 567 8900"
      "00971501234567" → phone: "00971501234567"
    
    📧 EMAIL (use "email" parameter):
    - MUST contain @ symbol
    Examples:
      "test@example.com" → email: "test@example.com"
      "customer@gmail.com" → email: "customer@gmail.com"
    
    🔢 ORDER NUMBER (use "order_number" parameter):
    - Alphanumeric codes with letters OR short numbers (typically 4-8 digits)
    - Usually has prefix like CZ-, ORD-, #
    Examples:
      "CZ-228913" → order_number: "CZ-228913"
      "#1001" → order_number: "1001"
      "ORD-12345" → order_number: "ORD-12345"
    
    --------------------------------------------------------------------
    HOW TO DISTINGUISH PHONE vs ORDER NUMBER
    --------------------------------------------------------------------
    
    PHONE NUMBER indicators:
    ✓ Starts with + (international format)
    ✓ Starts with 00 (international dialing)
    ✓ Starts with 03 (Pakistani mobile)
    ✓ 10-15 digits long
    ✓ Customer says "phone", "number", "contact", "mobile"
    
    ORDER NUMBER indicators:
    ✓ Contains letters (CZ-, ORD-, ABC)
    ✓ Has # prefix
    ✓ Short (4-8 characters)
    ✓ Customer says "order", "tracking", "confirmation"
    
    WHEN IN DOUBT:
    - If it's 10+ digits and starts with 0, +, or 00 → PHONE
    - If it contains letters or is short → ORDER NUMBER
    
    --------------------------------------------------------------------
    EXAMPLES
    --------------------------------------------------------------------
    
    User: "03315757575"
    → { "phone": "03315757575" }
    
    User: "+923315757575"
    → { "phone": "+923315757575" }
    
    User: "+1 555 123 4567"
    → { "phone": "+1 555 123 4567" }
    
    User: "00971501234567"
    → { "phone": "00971501234567" }
    
    User: "My number is 923001234567"
    → { "phone": "923001234567" }
    
    User: "john@gmail.com"
    → { "email": "john@gmail.com" }
    
    User: "CZ-228913_1"
    → { "order_number": "CZ-228913_1" }
    
    User: "#1001"
    → { "order_number": "1001" }
    
    --------------------------------------------------------------------
    HOW TO HANDLE ORDER STATUS REQUESTS
    --------------------------------------------------------------------
    
    1. If customer provides phone/email/order_number → Call function immediately
    2. If customer asks about order but doesn't provide info → Ask for ONE of:
       - Order number (preferred)
       - Phone number used during order
       - Email used during order
    3. After getting function result → Share status details naturally
	`;

        if (hasOrderFunction) {
            // Agent HAS order functions - can process orders
            instructions += `
	--------------------------------------------------------------------
	ORDER/PURCHASE REQUEST HANDLING
	--------------------------------------------------------------------
	YOU HAVE ORDER PROCESSING FUNCTIONS AVAILABLE

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
	 - Use order functions when user wants to buy
	 - Collect required information (size, color, address, etc.)
	 - Confirm details before processing
	 - Call the appropriate function

	DON'T:
	 - Generate fake order numbers yourself
	 - Claim order is placed without calling function
	 - Skip collecting required information
	`;
        } else if (instructionsMentionOrders) {
            // Instructions mention order process - follow them
            instructions += `
	NO ORDER FUNCTIONS, BUT INSTRUCTIONS MENTION ORDER PROCESS

	Your instructions contain information about orders/purchases.
	Follow those instructions exactly.

	When user wants to buy/order:
	1. Check your base instructions for order process details
	2. Follow the process mentioned in your instructions
	3. If instructions say to transfer → set agent_transfer = true
	4. If instructions give a URL/website → share that with user
	5. Set order_intent_detected = true

	DO:
	 Follow order instructions from your base prompt
	 Guide user through the specified process
	 Share any URLs/links mentioned in instructions
	 Transfer to human if instructions say so

	DON'T:
	 Generate fake order numbers
	 Process orders without proper authorization
	 Claim order is placed when it's not
	`;
        } else if (hasShopify && hasProducts) {
            // Has Shopify + products - share purchase URLs
            instructions += `
	SHOPIFY STORE INTEGRATION AVAILABLE

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
	 Search and show the requested product
	 Share direct purchase URL from Shopify
	 Explain how to complete purchase on website
	 Offer to help find more products

	DON'T:
	 Generate order numbers yourself
	 Claim you can process the order directly
	 Say "order placed" without user going to website
	 Make up fake tracking IDs
	`;
        } else {
            // No order capability - offer agent transfer
            instructions += `
	NO ORDER PROCESSING CAPABILITY

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
	 Be honest about limitations
	 Offer human agent transfer
	 Set agent_transfer = true
	 Be helpful and polite

	DON'T:
	 Generate fake order numbers
	 Pretend you can process orders
	 Give false hope about order placement
	 Make up confirmation IDs
	`;
        }

        instructions += `

	CRITICAL: ORDER INTENT DETECTION

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

	--------------------------------------------------------------------
	`;

        return instructions;
    }

	/**
	 * Get anti-hallucination instructions based on content type
	 * @private
	 */
	_getAntiHallucinationInstructions(hasDocuments, hasProducts) {
		return `

	--------------------------------------------------------------------
	CRITICAL: NEVER HALLUCINATE - ALWAYS SEARCH FIRST
	--------------------------------------------------------------------

	 YOU DO NOT HAVE ANY BUILT-IN KNOWLEDGE ABOUT THIS BUSINESS!
	 You don't know: store locations, policies, prices, products, hours, etc.
	 ALL business information is in the knowledge base - YOU MUST SEARCH!

	${hasDocuments ? `
	--------------------------------------------------------------------
	MANDATORY KNOWLEDGE BASE SEARCH - NO EXCEPTIONS!
	--------------------------------------------------------------------

	ALWAYS set knowledge_search_needed = true

	EXAMPLE - User asks: "What are your locations in Karachi?"

	WRONG (HALLUCINATION):
	{
	  "response": "We have stores at Dolmen Mall, Lucky One Mall...",
	  "knowledge_search_needed": false
	}

	CORRECT:
	{
	  "response": "Let me check our store locations for you...",
	  "knowledge_search_needed": true,
	  "knowledge_search_query": "store locations Karachi branches addresses"
	}

	CRITICAL RULE:
	- If you DON'T KNOW something → SEARCH (set knowledge_search_needed = true)
	- NEVER make up locations, addresses, phone numbers, hours, or policies
	- NEVER guess or assume business information
	- When in doubt → SEARCH FIRST
	` : ''}

	${hasProducts ? `
	--------------------------------------------------------------------
	MANDATORY PRODUCT SEARCH
	--------------------------------------------------------------------

	ALWAYS set product_search_needed = true for:
	Product availability, stock questions
	Product details, specifications, sizes
	Price inquiries
	Product recommendations
	"Show me...", "Do you have...", "What about..."

	NEVER make up:
	- Product names or details
	- Prices or discounts
	- Stock availability
	- Product features
	` : ''}

	--------------------------------------------------------------------
	ABSOLUTE PROHIBITIONS
	--------------------------------------------------------------------

	YOU MUST NEVER:
	 - Make up store locations or addresses
	 - Invent business hours or contact details
	 - Create fake order numbers or tracking IDs
	 - Fabricate policies or procedures
	 - Guess prices or availability
	 - Assume any business information
	 - Answer business questions without searching first

	ORDER PROCESSING RULES:
	1. Check if you have order functions → Use them
	2. Check your instructions for order process → Follow them
	3. If you have Shopify products → Share purchase URLs
	4. If none of above → Offer human agent transfer
	5. NEVER generate fake order confirmations

	STRICTLY OFF-LIMITS TOPICS (ALWAYS DECLINE):
	- Politics, politicians, current events
	- Religious, controversial, or sensitive topics
	- Medical, legal, or financial advice
	- Personal information about real people
	- Never take up another persona if asked

	WHEN TO TRANSFER TO HUMAN (set agent_transfer = true):
	- Question is CLEARLY outside domain AND search returned no results
	- User explicitly requests human agent
	- User shows frustration (3+ failed attempts)
	- User asks about politics, religion, or controversial topics

	### HINDI vs URDU Quick Reference:
	| ❌ NEVER (Hindi) | ✅ USE INSTEAD (Urdu/English) |
	|-----------------|------------------------------|
	| kripya          | please / meherbani se        |
	| dhanyavaad      | shukriya / thank you         |
	| namaste         | Assalam-o-Alaikum / Hello    |
	| swagat          | khush aamdeed / welcome      |
	| sahayata        | madad / help                 |
	| uplabdh         | available / dastiyab         |
	| jankari         | maloomat / information       |

	${!hasDocuments && !hasProducts ? `
	CRITICAL: You have NO knowledge base and NO product catalog.
	Answer ONLY based on your base instructions.
	For anything else, transfer to human immediately.
	` : ''}

	--------------------------------------------------------------------
	DEFAULT BEHAVIOR: WHEN IN DOUBT → SEARCH FIRST!
	--------------------------------------------------------------------
	knowledge_search_needed=true
	`;
	}

	/**
	 * Build function calling instructions for system prompt
	 * @private
	 */
	_buildFunctionInstructions(functions, agent = null) {
		if (!functions || functions.length === 0) {
			return '';
		}

		// Filter only active functions
		const activeFunctions = functions.filter(fn => fn.is_active !== false);
		
		// ============================================
        // ADD BUILT-IN ORDER STATUS FUNCTION
        // ============================================
        // Add check_order_status if agent has Shopify connected (via kb_id)
        if (agent && agent.kb_id) {
            // Check if Shopify store exists for this KB
            const hasOrderStatusFunction = activeFunctions.some(fn => fn.name === 'check_order_status');
            
            if (!hasOrderStatusFunction) {
                // Add built-in order status function
                activeFunctions.push({
                    name: 'check_order_status',
                    description: `Check the status of a customer order using order number, email, or phone.

PARAMETER RULES:
- order_number: Order IDs like "CZ-228913", "#1001", "ORD-123"
- phone: ANY phone number format (local or international):
  * Pakistani: 03315757575, +923315757575, 923315757575
  * International: +1234567890, +971501234567, 00441onal234567890
  * With/without spaces, dashes, or + prefix
- email: Must contain @ (e.g., customer@example.com)

IDENTIFICATION:
- 10+ digits starting with 0/+/00/9 → use "phone"
- Contains @ → use "email"  
- Contains letters or is short code → use "order_number"

Only ONE parameter is needed to search.`,
                    parameters: {
                        type: 'object',
                        properties: {
                            order_number: {
                                type: 'string',
                                description: 'Order number/ID (e.g., CZ-228913, #1001, ORD-123)'
                            },
                            email: {
                                type: 'string',
                                description: 'Email address (must contain @)'
                            },
                            phone: {
                                type: 'string',
                                description: 'Phone number in ANY format - local (03315757575) or international (+923315757575, +14155551234)'
                            }
                        }
                    },
                    is_active: true,
                    handler_type: 'inline',
                    _builtin: true
                });
            }
        }
		
		if (activeFunctions.length === 0) {
			return '';
		}

		let instructions = `

	--------------------------------------------------------------------
	🔧 AVAILABLE FUNCTIONS - YOU CAN CALL THESE WHEN NEEDED
	--------------------------------------------------------------------

	You have access to the following functions. When you need to use one,
	include the function call details in your JSON response.

	AVAILABLE FUNCTIONS:
	`;

		activeFunctions.forEach((fn, index) => {
			instructions += `
	${index + 1}. **${fn.name}**
	   Description: ${fn.description || 'No description provided'}
	   Parameters: ${JSON.stringify(fn.parameters || {}, null, 2).split('\n').map((line, i) => i === 0 ? line : '   ' + line).join('\n')}
	`;
		});

		instructions += `

	--------------------------------------------------------------------
	HOW TO CALL A FUNCTION
	--------------------------------------------------------------------

	When you need to call a function, include these fields in your JSON response:

	{
	  "response": "Brief message to user (e.g., 'Let me transfer you to an agent...')",
	  "function_call_needed": true,
	  "function_name": "exact_function_name",
	  "function_arguments": {
		"param1": "value1",
		"param2": "value2"
	  },
	  ... other fields as usual ...
	}

	RULES FOR FUNCTION CALLING:
	1. Set function_call_needed = true ONLY when you need to execute a function
	2. Use the EXACT function name from the list above
	3. Provide ALL required parameters in function_arguments
	4. Your "response" should be a brief acknowledgment (the function result will be shared separately)
	5. DO NOT make up functions - only use the ones listed above

	WHEN TO CALL FUNCTIONS:
	- User explicitly requests an action that matches a function (e.g., "transfer me to agent")
	- The conversation requires an action you cannot perform without the function
	- User asks for information that requires an external API call

	WHEN NOT TO CALL FUNCTIONS:
	- General conversation or questions you can answer directly
	- Product searches (use product_search_needed instead)
	- Knowledge lookups (use knowledge_search_needed instead)

	--------------------------------------------------------------------
	`;

		return instructions;
	}

    /**
     * Generate preference collection instructions based on strategy
     * @private
     */
    _generatePreferenceInstructions(preferenceConfig) {
        const strategy = preferenceConfig.strategy || 'immediate_search';

        if (strategy === 'immediate_search') {
            return `

--------------------------------------------------------------------
PRODUCT SEARCH STRATEGY: IMMEDIATE SEARCH
--------------------------------------------------------------------

When user requests products:
 Search IMMEDIATELY - set product_search_needed = true
 Use user's query as search query
 Do NOT ask preference questions
 Show products right away

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

--------------------------------------------------------------------
`;
        }

        if (strategy === 'ask_questions' || strategy === 'minimal_questions') {
            const preferences = preferenceConfig.preferences_to_collect || [];
            const minPrefs = preferenceConfig.min_preferences_before_search || 2;
            const maxQuestions = preferenceConfig.max_questions || 3;

            let instructions = `

--------------------------------------------------------------------
PRODUCT SEARCH STRATEGY: ${strategy === 'ask_questions' ? 'ASK QUESTIONS' : 'MINIMAL QUESTIONS'}
--------------------------------------------------------------------

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

--------------------------------------------------------------------
`;

            return instructions;
        }

        if (strategy === 'adaptive') {
            return `

--------------------------------------------------------------------
PRODUCT SEARCH STRATEGY: ADAPTIVE
--------------------------------------------------------------------

Use your intelligence to decide:
- High-value items (>10,000): Ask 2-3 questions
- Medium items (1,000-10,000): Ask 1-2 questions
- Low-value items (<1,000): Search immediately
- User provides detailed request: Search immediately
- Vague request: Ask clarifying questions

Adapt based on context and user behavior.

--------------------------------------------------------------------
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
			// 💾 SAVE MESSAGE IMMEDIATELY (NO BLOCKING)
			// ============================================
			await db.query(
				`INSERT INTO yovo_tbl_aiva_chat_messages (
					id, session_id, role, content, content_html, content_markdown,
					sources, images, products, function_calls, 
					cost, cost_breakdown, tokens_input, tokens_output, processing_time_ms,
					agent_transfer_requested
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
					messageData.processingTimeMs || null,
					messageData.agentTransferRequested ? 1 : 0
				]
			);

			// ============================================
			// 🔄 TRIGGER ASYNC ANALYSIS (NON-BLOCKING)
			// ============================================
			if (messageData.role === 'user' && messageData.content) {
				// Fire-and-forget: Don't await, let it run in background
				this._analyzeMessageAsync(messageId, messageData.content, messageData.sessionId)
					.catch(err => console.error('Background analysis error:', err));
			}

			console.info(`Chat message saved: ${messageId} (analysis running in background)`);
			
			return {
				messageId: messageId,
				analysisCost: 0, // Will be updated async, return 0 for now
				translationCost: 0
			};
			
		} catch (error) {
			console.error('Error saving chat message:', error);
			throw error;
		}
	}

	/**
	 * Analyze message in background and update record
	 * @private
	 */
	async _analyzeMessageAsync(messageId, content, sessionId) {
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
			
			// ============================================
			// 💾 UPDATE MESSAGE WITH ANALYSIS DATA
			// ============================================
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
			
			// ============================================
			// 💰 UPDATE SESSION COST WITH ANALYSIS COST
			// ============================================
			const analysisCost = (analysis?.analysis_metadata?.cost || 0) + 
							   (translatedMessage ? 0.0001 : 0); // Add small translation cost if translated
			
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
        // ============================================
        // BUILT-IN FUNCTIONS (handled internally)
        // ============================================
        
        // Order Status Check - built-in Shopify integration
        if (functionName === 'check_order_status') {
            console.log('📦 Executing built-in function: check_order_status');
            return await this._handleOrderStatusCheck(agent, args);
        }

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
                let headers = {};

				if (func.api_headers) {
					let headersData = func.api_headers;
					
					// Parse if it's a JSON string
					if (typeof headersData === 'string' && headersData.trim()) {
						try {
							headersData = JSON.parse(headersData);
						} catch (e) {
							headersData = {};
						}
					}

					// Assign if it's an object
					if (typeof headersData === 'object' && headersData !== null) {
						headers = { ...headersData };
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
	
	/**
     * Handle order status check (built-in function)
     * @private
     */
    /**
     * Handle order status check (built-in function)
     * @private
     */
    async _handleOrderStatusCheck(agent, args) {
        const { order_number, email, phone } = args;

        console.log('📦 [ORDER STATUS] Checking order:', { order_number, email, phone });

        // Validate we have at least one search parameter
        if (!order_number && !email && !phone) {
            return {
                success: false,
                error: 'Please provide an order number, email, or phone number to check the order status.'
            };
        }

        // Check if agent has Shopify connected via kb_id
        if (!agent.kb_id) {
            return {
                success: false,
                error: 'Order status check is not available for this agent.'
            };
        }

        try {
            const ShopifyService = require('./ShopifyService');
            
            // Get store by KB ID
            const store = await ShopifyService.getStoreByKbId(agent.kb_id);
            
            if (!store) {
                return {
                    success: false,
                    error: 'No Shopify store is connected to this agent.'
                };
            }

            // Lookup order
            const result = await ShopifyService.lookupOrder(
                store.shop_domain,
                store.access_token,
                { order_number, email, phone }
            );

            if (!result.found) {
                return {
                    success: false,
                    found: false,
                    message: result.message || 'No order found with the provided information.',
                    searched_variants: result.searched_variants
                };
            }

            // Format order details for LLM to use in response
            const order = result.order;
            
            // Build formatted items list
            const formattedItems = order.line_items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: `${order.currency} ${item.price}`,
                variant: item.variant_title
            }));

            // Build shipping address string
            let addressString = null;
            if (order.shipping_address) {
                const addr = order.shipping_address;
                const parts = [addr.address1, addr.city, addr.province, addr.country].filter(Boolean);
                addressString = parts.join(', ');
            }

            return {
                success: true,
                found: true,
                order: {
                    // Basic Info
					created_at: order.created_at,
                    order_number: order.order_number,
                    status: order.status,
                    status_description: order.status_description,
                    
                    // Order Details
                    items: formattedItems,
                    item_count: order.item_count,
                    total_price: `${order.currency} ${order.total_price}`,
                    order_date: new Date(order.created_at).toLocaleDateString('en-PK', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    
                    // Shipping
                    shipping_address: addressString,
                    shipping_city: order.shipping_address?.city,
                    
                    // Order Status URL (for customer to view on website)
                    order_status_url: order.order_status_url,
                    
                    // Tracking Details
                    has_tracking: order.has_tracking,
                    tracking: order.tracking ? {
                        company: order.tracking.company,
                        number: order.tracking.number,
                        url: order.tracking.url
                    } : null,
                    
                    // Cancellation
                    is_cancelled: order.is_cancelled,
                    cancel_reason: order.cancel_reason,
                    
                    // Split order info
                    split_order_info: order.split_order_info
                },
                
                // Formatting instructions for LLM
                // Formatting instructions for LLM
response_format_hint: `
FORMAT YOUR RESPONSE BASED ON ORDER STATUS:

⚠️ CRITICAL: RESPOND IN THE SAME LANGUAGE AS THE CUSTOMER'S LAST MESSAGE
- If customer asked in ENGLISH → Respond 100% in English
- If customer asked in URDU/Roman Urdu → Respond in Roman Urdu
- NEVER mix languages or default to one language

====================================================================
IF STATUS = "processing" (Order not yet dispatched):
====================================================================
- Tell customer their order is confirmed and being prepared
- If customer asks about tracking:
  * English: "Your order has not been dispatched yet. Once dispatched, you'll receive the tracking number via email/SMS."
  * Urdu: "Aapka order abhi dispatch nahi hua. Jaise hi dispatch hoga, aapko tracking number mil jayega."
- DO NOT say "tracking number not found" or "could not find tracking"
- Reassure them the order is being processed

Example response structure (use customer's language):
- Order Number: [number]
- Order Date: [date]
- Expected Delivery: [based on policy - 3-5 working days from order date]
- Status: Being prepared for dispatch
- Note: Tracking will be shared once dispatched

====================================================================
IF STATUS = "shipped" / "in_transit" / "out_for_delivery":
====================================================================
Example response structure (use customer's language):
- Order Number: [number]
- Order Date: [date]
- Status: Shipped/In Transit/Out for Delivery
- Courier: [company]
- Tracking ID: [number]
- Track Here: [url]

====================================================================
IF STATUS = "delivered":
====================================================================
- Confirm delivery
- Ask if they need any help with the product

====================================================================
IF STATUS = "cancelled":
====================================================================
- Be empathetic
- Explain cancellation reason if available
- Offer to help with new order

====================================================================
GENERAL RULES:
====================================================================
1. ⚠️ MATCH CUSTOMER'S LANGUAGE - Check their last message
2. NEVER say "I don't have the tracking number" for processing orders
   → Instead: "Tracking will be available after dispatch"
3. Always include Order Status URL if available
4. Include expected delivery date based on order date + 3-5 working days
5. Be reassuring and helpful
`,
                message: result.message
            };

        } catch (error) {
            console.error('❌ [ORDER STATUS] Error:', error);
            return {
                success: false,
                error: `Failed to check order status: ${error.message}`
            };
        }
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
	
	/**
	 * Detect which instruction sections are already covered in agent instructions
	 * @private
	 */
	_detectInstructionCoverage(instructions) {
		if (!instructions) {
			return {
				hasLanguageRules: false,
				hasResponseExamples: false,
				hasClosureExamples: false,
				hasOrderStatusFormat: false
			};
		}

		return {
			// Language handling rules
			hasLanguageRules: /language|respond in (english|urdu|roman)|same language|customer('s)? language/i.test(instructions),
			
			// Response format examples
			hasResponseExamples: /(example|template|format).*(response|reply|message)/i.test(instructions),
			
			// Closure/goodbye examples
			hasClosureExamples: /(goodbye|allah hafiz|closing|end.*(conversation|chat))/i.test(instructions),
			
			// Order status format
			hasOrderStatusFormat: /order.*(status|tracking).*(format|template|response)/i.test(instructions)
		};
	}
	
	/**
	 * Check if message is trivial (greeting/thanks/bye) - doesn't need KB search
	 * @private
	 */
	_isTrivialMessage(message) {
		if (!message) return true;
		
		const trivialPatterns = [
			// Greetings
			/^(hi|hello|hey|hii+|helo+)[\s!.]*$/i,
			/^(assalam[- ]?o[- ]?alaikum|aoa|salam)[\s!.]*$/i,
			/^(good\s*(morning|afternoon|evening|night))[\s!.]*$/i,
			
			// Thanks
			/^(thanks|thank\s*you|shukriya|thx|ty)[\s!.]*$/i,
			/^(ok+a*y*\s*(thanks|thank\s*you|shukriya)?)[\s!.]*$/i,
			
			// Goodbyes
			/^(bye|goodbye|good\s*bye|allah\s*hafiz|khuda\s*hafiz)[\s!.]*$/i,
			
			// Simple confirmations
			/^(yes|no|ok|okay|sure|alright|got\s*it|understood|ji|haan|nahi)[\s!.]*$/i,
			
			// Very short (1-2 chars)
			/^.{1,2}$/
		];
		
		return trivialPatterns.some(pattern => pattern.test(message.toLowerCase().trim()));
	}
	
	/**
	 * Get default LLM instructions based on channel
	 * @private
	 */
	_getChannelDefaultInstructions(channel) {
		const channelInstructions = {
			whatsapp: `
	WHATSAPP CHANNEL INSTRUCTIONS:
	- Keep responses concise (WhatsApp has character limits)
	- Use emojis sparingly but appropriately
	- Format lists with line breaks, not bullets
	- Avoid markdown formatting (* for bold, etc.)
	- Support both English and Roman Urdu seamlessly
	`,
			voice: `
	VOICE CHANNEL INSTRUCTIONS:
	- Keep responses conversational and natural
	- Avoid markdown or special formatting
	- Spell out numbers (three hundred, not 300)
	- Use "Rupees" not "Rs" or "PKR"
	- Avoid abbreviations
	- Keep sentences short and clear
	`,
			sms: `
	SMS CHANNEL INSTRUCTIONS:
	- Keep responses very short (160 char limit per segment)
	- No emojis or special characters
	- Abbreviations are acceptable
	- Get to the point quickly
	`,
			email: `
	EMAIL CHANNEL INSTRUCTIONS:
	- Can use longer, more detailed responses
	- Proper formatting with paragraphs
	- Can include links and references
	- Professional tone
	`,
			instagram_dm: `
	INSTAGRAM DM INSTRUCTIONS:
	- Casual, friendly tone
	- Emojis are welcome
	- Keep responses relatively short
	- Visual references are good
	`,
			fb_messenger: `
	FACEBOOK MESSENGER INSTRUCTIONS:
	- Conversational tone
	- Can use emojis
	- Medium-length responses
	- Support quick replies style
	`,
			web_chat: `
	WEB CHAT INSTRUCTIONS:
	- Can use markdown for formatting
	- Medium-length responses
	- Support for rich content
	`,
			public_chat: `
	PUBLIC CHAT INSTRUCTIONS:
	- Standard formatting allowed
	- Be helpful and professional
	`
		};
		
		return channelInstructions[channel] || null;
	}
}

module.exports = new ChatService();