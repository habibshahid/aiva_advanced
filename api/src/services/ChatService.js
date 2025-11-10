/**
 * Chat Service
 * Manages chat sessions, messages, and integrates with knowledge and OpenAI
 */
require('dotenv').config();

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const KnowledgeService = require('./KnowledgeService');
const AgentService = require('./AgentService');
const CostCalculator = require('../utils/cost-calculator');
const markdown = require('../utils/markdown');

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
  async createSession({ tenantId, agentId, userId = null, sessionName = null, metadata = {} }) {
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
      metadata: session.metadata 
        ? (typeof session.metadata === 'string' ? JSON.parse(session.metadata) : session.metadata)
        : {}
    };
  }

  /**
   * List chat sessions for tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} options - List options
   * @returns {Promise<Object>} Sessions and total
   */
  async listSessions(tenantId, { page = 1, limit = 20, agentId = null, status = null }) {
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
  }
  
  /**
   * Send message and get AI response
   * @param {Object} params - Message parameters
   * @returns {Promise<Object>} AI response with metadata
   */
  async sendMessage({ sessionId, agentId, message, image = null, userId = null }) {
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
          searchType: 'hybrid',
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
        
        // Strategy 1: Use image search results to build query
        let searchQuery = message;
        
        if (imageSearchResults?.results && imageSearchResults.results.length > 0) {
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
            console.log('📝 Enhanced search query from image metadata:', searchQuery);
          }
        }
        
        // Strategy 2: If no image results, use LLM to analyze image
        if (!imageSearchResults?.results || imageSearchResults.results.length === 0) {
          console.log('🤖 No image results - Using LLM to analyze image for product search');
          
          const analysisCompletion = await this.openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: 'Extract product attributes from image. Return JSON: {"category":"","color":"","style":"","keywords":[]}'
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Identify product attributes' },
                  { type: 'image_url', image_url: { url: image, detail: 'low' }}
                ]
              }
            ],
            max_tokens: 150,
            temperature: 0.3
          });
          
          try {
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
            }
            
            // Track LLM cost using your existing calculator
            const analysisCost = CostCalculator.calculateChatCost(
              {
                prompt_tokens: analysisCompletion.usage.prompt_tokens,
                completion_tokens: analysisCompletion.usage.completion_tokens,
                cached_tokens: 0
              },
              'gpt-4o'
            );
            
            shopifySearchCost += analysisCost.final_cost;
            
          } catch (parseError) {
            console.error('Failed to parse image analysis:', parseError);
          }
        }
        
        // Search Shopify products
        console.log('🔍 Searching Shopify with query:', searchQuery);
        
        const shopifyResults = await ShopifyService.searchProducts({
          tenantId: agent.tenant_id,
          storeUrl: agent.shopify_store_url,
          accessToken: agent.shopify_access_token,
          query: searchQuery,
          limit: 10
        });
        
        shopifyProducts = shopifyResults.products || [];
        
        console.log('✅ Shopify search completed:', {
          products_found: shopifyProducts.length
        });
        
        // Build context from Shopify products
        if (shopifyProducts.length > 0) {
          shopifySearchContext = '\n\n=== MATCHING PRODUCTS FROM SHOPIFY ===\n';
          shopifySearchContext += 'Found these products matching the image:\n\n';
          
          shopifyProducts.slice(0, 5).forEach((product, index) => {
            shopifySearchContext += `${index + 1}. **${product.title}**\n`;
            
            if (product.variants && product.variants.length > 0) {
              const variant = product.variants[0];
              if (variant.price) {
                shopifySearchContext += `   Price: $${variant.price}\n`;
              }
              if (variant.sku) {
                shopifySearchContext += `   SKU: ${variant.sku}\n`;
              }
              if (variant.inventory_quantity !== undefined) {
                shopifySearchContext += `   Stock: ${variant.inventory_quantity > 0 ? 'Available' : 'Out of Stock'}\n`;
              }
            }
            
            if (product.product_type) {
              shopifySearchContext += `   Category: ${product.product_type}\n`;
            }
            
            if (product.handle) {
              shopifySearchContext += `   URL: https://${agent.shopify_store_url}/products/${product.handle}\n`;
            }
            
            shopifySearchContext += '\n';
          });
          
          shopifySearchContext += `=== END OF SHOPIFY PRODUCTS (${shopifyProducts.length} total) ===\n`;
        }
        
      } catch (error) {
        console.error('❌ Shopify search error:', error);
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
      agent.kb_metadata
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
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: [
          { type: 'text', text: message },
          { 
            type: 'image_url',
            image_url: { url: image, detail: 'high' }
          }
        ]
      }
    ];

    const model = agent.chat_model || 'gpt-4o-mini';

    const completion = await this.openai.chat.completions.create({
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
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
        agent_transfer: false
      };
    }

    // Calculate LLM cost
    const llmCost = CostCalculator.calculateChatCost(
      {
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
      const imageSearchCostObj = {
        final_cost: imageSearchCost,
        base_cost: imageSearchCost,
        markup_cost: 0,
        profit_margin: 0,
        breakdown: {
          operations: [{
            operation: 'image_search',
            base_cost: imageSearchCost,
            markup_cost: 0,
            total_cost: imageSearchCost
          }]
        }
      };
      costs.push(imageSearchCostObj);
    }
    
    // Add Shopify search cost if present
    if (shopifySearchCost > 0) {
      const shopifySearchCostObj = {
        final_cost: shopifySearchCost,
        base_cost: shopifySearchCost,
        markup_cost: 0,
        profit_margin: 0,
        breakdown: {
          operations: [{
            operation: 'shopify_search',
            base_cost: shopifySearchCost,
            markup_cost: 0,
            total_cost: shopifySearchCost
          }]
        }
      };
      costs.push(shopifySearchCostObj);
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
        title: p.title,
        description: p.description,
        image_url: p.image_url,
        price: p.variants?.[0]?.price,
        sku: p.variants?.[0]?.sku,
        inventory_quantity: p.variants?.[0]?.inventory_quantity,
        available: p.variants?.[0]?.available,
        product_type: p.product_type,
        vendor: p.vendor,
        tags: p.tags,
        handle: p.handle,
        url: `https://${agent.shopify_store_url}/products/${p.handle}`,
        metadata: p.metadata || {}
      })),
      function_calls: [],
      llm_decision: {
        collecting_preferences: false,
        preferences_collected: {},
        ready_to_search: false,
        product_search_needed: false,
        knowledge_search_needed: false
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
    agent.kb_metadata
  );
  
  // Build messages for OpenAI
  const messages = [
    {
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
  const tools = agent.functions && agent.functions.length > 0
    ? agent.functions.map(fn => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }
      }))
    : undefined;

  // Call OpenAI with JSON mode
  const model = agent.chat_model || 'gpt-4o-mini';

  const completion = await this.openai.chat.completions.create({
    model: model,
    messages: messages,
    tools: tools,
    response_format: { type: "json_object" },
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
      agent_transfer: false
    };
  }

  let llmCost = CostCalculator.calculateChatCost(
    {
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
        searchType: 'text'
      });

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
        const messagesWithContext = [
          {
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
          response_format: { type: "json_object" },
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
          const secondCallCost = CostCalculator.calculateChatCost(
            {
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
        searchType: 'text'
      });

      knowledgeResults = searchResult.results;
      knowledgeCost = searchResult.cost_breakdown;
      
      console.log(`✅ Found ${knowledgeResults?.text_results?.length || 0} knowledge chunks`);
      
      // ✅ Call LLM AGAIN with search results
      if (knowledgeResults?.text_results && knowledgeResults.text_results.length > 0) {
        console.log('🔄 Calling LLM again WITH search results...');
        
        // Build context from search results
        const contextChunks = knowledgeResults.text_results.map((result, idx) => 
          `[Source ${idx + 1}] ${result.content}`
        ).join('\n\n');
        
        // Build messages with context
        const messagesWithContext = [
          {
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
          response_format: { type: "json_object" },
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
          const secondCallCost = CostCalculator.calculateChatCost(
            {
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

  return {
    session_id: sessionId,
    message_id: assistantMessageId,
    agent_transfer: agentTransferRequested,
    response: {
      text: formattedResponse.text,
      html: formattedResponse.html,
      markdown: formattedResponse.markdown
    },
    sources: knowledgeResults?.text_results?.map(r => ({
      type: 'document',
      source_id: r.source?.document_id,
      title: r.source?.document_name,
      content: r.content,
      page: r.source?.page,
      chunk_id: r.source?.chunk_id,
      relevance_score: r.score,
      url: r.source?.url,
      metadata: r.source?.metadata || {}
    })) || [],
    images: knowledgeResults?.image_results?.map(img => ({
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
    })) || [],
    function_calls: functionCalls,
    llm_decision: {
      collecting_preferences: llmDecision.collecting_preferences,
      preferences_collected: llmDecision.preferences_collected,
      ready_to_search: llmDecision.ready_to_search,
      product_search_needed: llmDecision.product_search_needed,
      knowledge_search_needed: llmDecision.knowledge_search_needed
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
	_buildSystemPromptWithStrategy(baseInstructions, conversationStrategy, greeting = null, isFirstMessage = false, kbMetadata = {}) {
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
	  "agent_transfer": true/false
	}

	DECISION LOGIC:

	${hasProducts ? `
	SET product_search_needed = true WHEN:
	✓ User requests to see/find products
	✓ You have collected enough preferences (based on strategy below)
	✓ ready_to_search must also be true
	` : ''}

	${hasDocuments ? `
	SET knowledge_search_needed = true WHEN:
	✓ User asks questions about policies, information, or documentation
	✓ You need to retrieve factual information from knowledge base
	✓ Question requires specific domain knowledge you don't have
	` : ''}

	${hasProducts ? `
	SET collecting_preferences = true WHEN:
	✓ Following preference collection strategy
	✓ Still gathering required information from user
	✓ Haven't collected minimum required preferences yet

	SET ready_to_search = true WHEN:
	✓ All required preferences collected
	✓ OR minimum preferences threshold met
	✓ Have enough information to make meaningful search
	` : ''}

	SET agent_transfer = true WHEN:
	✓ User explicitly requests human agent
	✓ User shows frustration or dissatisfaction
	✓ You cannot answer their question
	✓ Question is outside your knowledge/scope
	✓ After failed attempts to help

	${!hasProducts && !hasDocuments ? `
	⚠️ IMPORTANT: This agent has NO knowledge base or product catalog.
	You can only answer based on your base instructions and general knowledge.
	For anything outside your scope, offer to transfer to a human agent.
	` : ''}

	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
	`;

	  systemPrompt += jsonFormatInstructions;
	  
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
	❌ Provide information that contradicts your instructions
	❌ Discuss topics not related to your role and purpose
	❌ Claim capabilities or knowledge you don't have
	❌ Speculate or guess when you don't have information

	${hasDocuments ? `
	WHEN YOU DON'T KNOW (set knowledge_search_needed = true):
	- User asks about topics that might be in your knowledge base
	- You need specific information to answer accurately
	- Question requires domain-specific knowledge
	` : ''}

	${hasProducts ? `
	WHEN SEARCHING PRODUCTS (set product_search_needed = true):
	- User requests to see/find products
	- After collecting sufficient preferences
	- When ready_to_search = true
	` : ''}

	WHEN TO TRANSFER TO HUMAN (set agent_transfer = true):
	- Question is outside your ${hasDocuments || hasProducts ? 'knowledge base/catalog' : 'scope'}
	- User explicitly requests human agent
	- User shows frustration (3+ failed attempts)
	- You cannot answer accurately

	${!hasDocuments && !hasProducts ? `
	⚠️ CRITICAL: You have NO knowledge base and NO product catalog.
	Answer ONLY based on your base instructions.
	For anything else, transfer to human immediately.
	` : ''}

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
      return { error: 'Function not found' };
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
        return { error: error.message };
      }
    }

    // Inline functions would be handled here
    return { error: 'Function execution not implemented' };
  }
}

module.exports = new ChatService();