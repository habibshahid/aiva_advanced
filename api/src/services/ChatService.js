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
   * Send message and get response
   * @param {Object} params - Message parameters
   * @returns {Promise<Object>} Response with cost
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
      // Create new session
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

    // Get agent
    const agent = await AgentService.getAgent(session.agent_id);

    // Get conversation history
    const history = await this.getConversationHistory(sessionId, 10);

    // Search knowledge base if agent has one
    let knowledgeResults = null;
    let knowledgeCost = null;

    if (agent.kb_id) {
      try {
        const searchResult = await KnowledgeService.search({
          kbId: agent.kb_id,
          query: message,
          image: image,
          topK: 5,
          searchType: image ? 'hybrid' : 'text'
        });

        knowledgeResults = searchResult.results;
        knowledgeCost = searchResult.cost_breakdown;
      } catch (error) {
        console.error('Knowledge search failed:', error);
        // Continue without knowledge
      }
    }

    // Build context from knowledge
    let context = '';
    if (knowledgeResults && knowledgeResults.text_results && knowledgeResults.text_results.length > 0) {
      context = '\n\nRELEVANT INFORMATION:\n' + 
        knowledgeResults.text_results
          .map(r => r.content)
          .join('\n\n');
    }

    // ANTI-HALLUCINATION SYSTEM INSTRUCTIONS
    const antiHallucinationInstructions = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 CRITICAL OPERATIONAL BOUNDARIES - STRICTLY ENFORCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOU MUST NEVER:
❌ Answer questions outside your knowledge base unless explicitly provided above
❌ Make up information, facts, statistics, or data that are not in your context
❌ Provide information that contradicts your instructions
❌ Discuss topics not related to your role and purpose as defined in instructions
❌ Claim capabilities or knowledge you don't have
❌ Speculate or guess when you don't have information

WHEN YOU CANNOT ANSWER (any of these conditions):
1. The question is outside your defined scope/instructions
2. The information is not in your knowledge base or context above
3. The request contradicts your instructions
4. You are uncertain about the answer
5. The topic is completely unrelated to your purpose

YOU MUST RESPOND WITH:
"I apologize, but I don't have the information needed to answer that question accurately. This appears to be outside my area of expertise. Would you like me to connect you with a human agent who can better assist you?"

THEN IMMEDIATELY SET agent_transfer = true

HUMAN AGENT TRANSFER TRIGGERS:
• User explicitly requests: "speak to human", "talk to agent", "transfer me", "connect to representative"
• User shows frustration: "this isn't working", "you're not helping", "I give up"
• You cannot answer their question (as per conditions above)
• After 3 failed attempts to help the user
• User needs information you don't have access to
• Complex issues requiring human judgment or empathy

REMEMBER:
✓ Your knowledge is LIMITED to your instructions and the RELEVANT INFORMATION above
✓ Being honest about limitations builds MORE trust than making things up
✓ Transferring to a human when needed is BETTER than providing wrong information
✓ NEVER pretend to know something you don't
✓ ALWAYS cite your knowledge base when answering from it
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
	
	if (knowledgeResults && knowledgeResults.product_results && knowledgeResults.product_results.length > 0) {
	  context += '\n\nAVAILABLE PRODUCTS:\n';
	  knowledgeResults.product_results.forEach((product, index) => {
		context += `\n${index + 1}. **${product.name}**`;
		context += `\n   Price: PKR ${product.price.toLocaleString()}`;
		if (product.compare_at_price && product.compare_at_price > product.price) {
		  context += ` (Was: PKR ${product.compare_at_price.toLocaleString()})`;
		}
		if (product.description) {
		  const shortDesc = product.description.length > 200 
			? product.description.substring(0, 200) + '...' 
			: product.description;
		  context += `\n   Description: ${shortDesc}`;
		}
		if (product.vendor) {
		  context += `\n   Brand: ${product.vendor}`;
		}
		context += `\n   Availability: ${product.availability === 'in_stock' ? 'In Stock' : 'Out of Stock'}`;
		context += `\n   Match Score: ${(product.similarity_score * 100).toFixed(0)}%`;
		context += '\n';
	  });
	  
	  context += '\n**IMPORTANT**: When products are listed above, YOU MUST present them to the user in your response. Do not say you don\'t have information if products are available!';
	}

	// Add image results
	if (knowledgeResults && knowledgeResults.image_results && knowledgeResults.image_results.length > 0) {
	  context += '\n\nRELEVANT IMAGES FOUND: ' + knowledgeResults.image_results.length + ' images available\n';
	}
	
	const systemPrompt = `${agent.instructions}

═══════════════════════════════════════════════════════
PRODUCT PRESENTATION GUIDELINES:
═══════════════════════════════════════════════════════
When products are found in the AVAILABLE PRODUCTS section below:
✓ ALWAYS present them to the user
✓ Format clearly: name, price, brief description
✓ Highlight sales/discounts
✓ Ask if user wants more details
✗ NEVER say "I don't have information" if products are listed

${context}

═══════════════════════════════════════════════════════
CRITICAL RULE:
═══════════════════════════════════════════════════════
${antiHallucinationInstructions}
`;


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

	console.log(messages);
	
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

    // Call OpenAI
    const model = agent.chat_model || agent.model || process.env.CHAT_MODEL || 'gpt-4o-mini';
	
    const completion = await this.openai.chat.completions.create({
      model: model,
      messages: messages,
      tools: tools,
      temperature: parseFloat(agent.temperature) || 0.7,
      max_tokens: agent.max_tokens || 4096
    });

    const aiMessage = completion.choices[0].message;
    let finalContent = aiMessage.content || '';
    const functionCalls = [];
	let agentTransferRequested = false;
	const transferIndicators = [
      'connect you with a human',
      'transfer you to',
      'speak with a human',
      'talk to a human',
      'human agent',
      'live agent',
      'customer service representative',
      'outside my area',
      'beyond my capabilities',
      'don\'t have access to',
      'unable to assist',
      'can\'t help with'
    ];
	
	const lowerContent = (finalContent || '').toLowerCase();
    agentTransferRequested = transferIndicators.some(indicator => 
      lowerContent.includes(indicator)
    );
	
	const userTransferPhrases = [
      'speak to human',
      'talk to agent',
      'transfer me',
      'connect to representative',
      'human please',
      'real person',
      'live chat',
      'customer service'
    ];
	
	const lowerUserMessage = message.toLowerCase();
    const userRequestedTransfer = userTransferPhrases.some(phrase => 
      lowerUserMessage.includes(phrase)
    );

    // Set transfer flag if detected
    if (agentTransferRequested || userRequestedTransfer) {
      agentTransferRequested = true;
    }
	
    // Handle function calls
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      for (const toolCall of aiMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // Execute function (implement function execution logic)
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

        // Add function result to context if needed
        finalContent += `\n\n[Function ${functionName} executed]`;
      }
    }

    // Format response in multiple formats
    const formattedResponse = markdown.formatResponse(finalContent);

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
      processingTimeMs: 0, // TODO: Track actual time
	  agentTransferRequested: agentTransferRequested
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
      context_used: {
        knowledge_base_chunks: knowledgeResults?.text_results?.length || 0,
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
        messageData.agentTransferRequested || false  // ← NEW FIELD
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