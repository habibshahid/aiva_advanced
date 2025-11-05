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

    // Get agent with conversation_strategy
    const agent = await AgentService.getAgent(session.agent_id);

    // Get conversation history
    const history = await this.getConversationHistory(sessionId, 10);

    // ✅ CHECK IF THIS IS THE FIRST MESSAGE (for greeting)
    const isFirstMessage = history.length === 0;

    // ✅ BUILD ENHANCED SYSTEM PROMPT WITH STRATEGY
    const systemPrompt = this._buildSystemPromptWithStrategy(
      agent.instructions,
      agent.conversation_strategy,
      agent.greeting,
      isFirstMessage // ✅ Pass flag to indicate if this is first message
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

    // Add image if provided
    if (image) {
      messages[messages.length - 1].content = [
        { type: 'text', text: message },
        { 
          type: 'image_url',
          image_url: { url: image }
        }
      ];
    }

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

    // ✅ CALL OPENAI WITH JSON MODE
    const model = agent.chat_model || 'gpt-4o-mini';

    const completion = await this.openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools,
      response_format: { type: "json_object" }, // ✅ Force JSON response
      temperature: parseFloat(agent.temperature) || 0.7,
      max_tokens: agent.max_tokens || 4096
    });

    const aiMessage = completion.choices[0].message;
    let llmDecision;

    // ✅ PARSE JSON RESPONSE
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

    // ✅ PRODUCT SEARCH - Only if LLM says ready
    let knowledgeResults = null;
    let knowledgeCost = null;

    if (llmDecision.product_search_needed && llmDecision.ready_to_search && agent.kb_id) {
      try {
        const searchQuery = llmDecision.product_search_query || llmDecision.search_query || message;
        
        console.log(`🔍 Product Search: "${searchQuery}"`);
        console.log(`📊 Preferences: ${JSON.stringify(llmDecision.preferences_collected || {})}`);
        
        const searchResult = await KnowledgeService.search({
          kbId: agent.kb_id,
          query: searchQuery,
          image: image,
          topK: 5,
          searchType: image ? 'hybrid' : 'text'
        });

        knowledgeResults = searchResult.results;
        knowledgeCost = searchResult.cost_breakdown;
        
        console.log(`✅ Found ${knowledgeResults?.product_results?.length || 0} products`);
        
      } catch (error) {
        console.error('Product search failed:', error);
      }
    } else if (llmDecision.collecting_preferences) {
      console.log(`💬 Collecting preferences... (${Object.keys(llmDecision.preferences_collected || {}).length} collected)`);
    } else if (!llmDecision.product_search_needed) {
      console.log(`⏭️ No product search needed (follow-up or general chat)`);
    } else if (!llmDecision.ready_to_search) {
      console.log(`⏸️ Not ready to search yet (need more preferences)`);
    }

    // ✅ KNOWLEDGE SEARCH - Only if LLM says needed
    if (llmDecision.knowledge_search_needed && agent.kb_id && !knowledgeResults) {
      try {
        const searchQuery = llmDecision.knowledge_search_query || message;
        
        console.log(`📚 Knowledge Search: "${searchQuery}"`);
        
        const searchResult = await KnowledgeService.search({
          kbId: agent.kb_id,
          query: searchQuery,
          image: image,
          topK: 5,
          searchType: 'text'
        });

        knowledgeResults = searchResult.results;
        knowledgeCost = searchResult.cost_breakdown;
        
        console.log(`✅ Found ${knowledgeResults?.text_results?.length || 0} knowledge chunks`);
        
      } catch (error) {
        console.error('Knowledge search failed:', error);
      }
    }

    // ✅ ENHANCED AGENT TRANSFER DETECTION
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

    // Calculate LLM cost
    const llmCost = CostCalculator.calculateChatCost(
      {
        prompt_tokens: completion.usage.prompt_tokens,
        completion_tokens: completion.usage.completion_tokens,
        cached_tokens: 0
      },
      model
    );

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
      // ✅ Store LLM decision metadata
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
      // ✅ Expose decision to frontend
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
   * Build system prompt with conversation strategy
   * @private
   */
  _buildSystemPromptWithStrategy(baseInstructions, conversationStrategy, greeting = null, isFirstMessage = false) {
    // Start with base instructions
    let systemPrompt = baseInstructions || '';
    
    // ✅ ADD GREETING AT THE BEGINNING IF PROVIDED
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

Example:
User: "hi"
Your Response: {
  "response": "${greeting} How can I help you today?",
  "product_search_needed": false,
  "collecting_preferences": false,
  "ready_to_search": false,
  "agent_transfer": false
}

User: "show me dresses"
Your Response: {
  "response": "${greeting} I'd be happy to help you find dresses! What color would you prefer?",
  "product_search_needed": false,
  "collecting_preferences": true,
  "ready_to_search": false
}
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
    
    // Add JSON response format instructions
    const jsonFormatInstructions = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL: JSON RESPONSE FORMAT (RFC 8259 COMPLIANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You MUST ALWAYS respond with valid JSON in this EXACT structure:

{
  "response": "Your natural conversational response in user's language",
  "product_search_needed": true/false,
  "product_search_query": "detailed search query (if searching for products)",
  "knowledge_search_needed": true/false,
  "knowledge_search_query": "search query (if searching knowledge base)",
  "collecting_preferences": true/false,
  "preferences_collected": {
    "preference_name": "value or null"
  },
  "ready_to_search": true/false,
  "agent_transfer": true/false
}

DECISION LOGIC:

SET product_search_needed = true WHEN:
✓ User requests to see/find products
✓ You have collected enough preferences (based on strategy below)
✓ ready_to_search must also be true

SET knowledge_search_needed = true WHEN:
✓ User asks questions about policies, information, or documentation
✓ You need to retrieve factual information from knowledge base

SET collecting_preferences = true WHEN:
✓ Following preference collection strategy
✓ Still gathering required information from user
✓ Haven't collected minimum required preferences yet

SET ready_to_search = true WHEN:
✓ All required preferences collected
✓ OR minimum preferences threshold met
✓ Have enough information to make meaningful search

SET agent_transfer = true WHEN:
✓ User explicitly requests human agent
✓ User shows frustration or dissatisfaction
✓ You cannot answer their question
✓ Question is outside your knowledge/scope
✓ After failed attempts to help

FOLLOW-UP ACTIONS (DO NOT SEARCH AGAIN):

If products were JUST shown in previous message, and user says:
• "I want to buy this", "I'll take this one", "interested in this"
• "Tell me more about this", "Show me details"
• "What's the price of this?", "Is this available?"

THEN:
✓ DO NOT set product_search_needed = true
✓ DO NOT search again
✓ Ask which specific product (by name/number) they're referring to
✓ OR if clear which one, provide details/transfer to complete purchase

Example:
User: "I want to buy this dress"
BAD Response: {
  "product_search_needed": true,  ❌ WRONG!
  "product_search_query": "dress"
}

GOOD Response: {
  "response": "Great choice! Which dress would you like to purchase? Please tell me the name or number of the dress you're interested in.",
  "product_search_needed": false,  ✅ CORRECT!
  "collecting_preferences": false,
  "ready_to_search": false
}

`;

    systemPrompt += jsonFormatInstructions;
    
    // Add conversation strategy if configured
    if (conversationStrategy?.preference_collection) {
      const pc = conversationStrategy.preference_collection;
      const strategyInstructions = this._generatePreferenceInstructions(pc);
      systemPrompt += strategyInstructions;
    }
    
    // ✅ ADD COMPREHENSIVE ANTI-HALLUCINATION INSTRUCTIONS
    const antiHallucinationInstructions = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 CRITICAL OPERATIONAL BOUNDARIES & ANTI-HALLUCINATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOU MUST NEVER:
❌ Answer questions outside your knowledge base unless explicitly provided above
❌ Make up information, facts, statistics, product details, or prices
❌ Claim products are available without searching first
❌ Provide information that contradicts your instructions
❌ Discuss topics not related to your role and purpose
❌ Claim capabilities or knowledge you don't have
❌ Speculate or guess when you don't have information
❌ Make up product specifications, availability, or pricing
❌ Answer definitively about things not in your knowledge base

WHEN YOU CANNOT ANSWER (any of these conditions):
1. The question is outside your defined scope/instructions
2. The information is not in your knowledge base or search results
3. The request contradicts your instructions
4. You are uncertain about the answer
5. The topic is completely unrelated to your purpose
6. User asks about products/info you haven't searched for yet

YOU MUST RESPOND WITH:
"I apologize, but I don't have the information needed to answer that question accurately. This appears to be outside my area of expertise. Would you like me to connect you with a human agent who can better assist you?"

THEN IMMEDIATELY SET:
{
  "response": "I apologize, but I don't have the information needed to answer that question accurately...",
  "agent_transfer": true,
  "product_search_needed": false,
  "knowledge_search_needed": false
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤝 HUMAN AGENT TRANSFER TRIGGERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMMEDIATELY SET agent_transfer = true WHEN:

1. EXPLICIT USER REQUESTS:
   • "speak to human", "talk to agent", "transfer me", "connect to representative"
   • "I want to talk to a real person", "get me a human", "customer service"
   • "speak to manager", "real agent"

2. USER FRUSTRATION SIGNALS:
   • "this isn't working", "you're not helping", "I give up"
   • "this is useless", "waste of time"
   • Repeated same question 3+ times
   • User getting angry or upset

3. LIMITATION SCENARIOS:
   • You cannot answer their question
   • Question is outside your knowledge base
   • User needs information you don't have access to
   • After 3 failed attempts to help the user
   • Complex issues requiring human judgment
   • Sensitive topics (complaints, refunds, account issues)

4. TECHNICAL ISSUES:
   • Search fails repeatedly
   • Cannot find requested products
   • System errors or timeouts

TRANSFER RESPONSE FORMAT:
{
  "response": "I understand you'd like to [user's need]. Let me connect you with a human agent who can better assist you. Please hold.",
  "agent_transfer": true,
  "product_search_needed": false,
  "knowledge_search_needed": false
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ BEST PRACTICES FOR TRUST & SAFETY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REMEMBER:
✓ Your knowledge is LIMITED to your instructions and search results
✓ Being honest about limitations builds MORE trust than making things up
✓ Transferring to a human when needed is BETTER than providing wrong information
✓ NEVER pretend to know something you don't
✓ If you searched and found nothing, say so clearly
✓ If search results don't match user's question, admit it
✓ ALWAYS cite your knowledge base when answering from search results
✓ When showing products, be clear they came from search

WHEN IN DOUBT → TRANSFER TO HUMAN
It's ALWAYS better to transfer than to provide incorrect information.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 CONVERSATION CONTEXT AWARENESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PAY ATTENTION TO CONVERSATION HISTORY:

If you JUST showed products in the previous message:
• User saying "I want to buy this/that/one of these" = referring to shown products
• DO NOT search again
• Ask which specific product they mean (by name)
• Help them complete the purchase

If user asks about price/availability of "this/that":
• They're referring to something already shown
• DO NOT search again
• Ask them to specify which product by name
• Provide the information from what was already shown

NEW SEARCH is needed ONLY when:
✓ User requests completely different products
✓ User adds new search criteria significantly different from before
✓ User explicitly says "show me other options" or "search for something else"

PURCHASE/ACTION TRIGGERS:
When user says: "I want to buy", "I'll take this", "Can I purchase", "How do I order"
→ Set product_search_needed = FALSE
→ Ask which specific product (if multiple were shown)
→ Then transfer to human agent for checkout:
{
  "response": "Great! To complete your purchase of [product name], let me connect you with our sales team who can process your order.",
  "agent_transfer": true
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    systemPrompt += antiHallucinationInstructions;
    
    return systemPrompt;
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
      cost_breakdown: msg.cost_breakdown ? JSON.parse(msg.cost_breakdown) : null
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