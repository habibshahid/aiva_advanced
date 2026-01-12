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
const llmService = require('./LLMService');
const https = require('https');

class ChatService {
    constructor() {
		// OpenAI client
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
		
		// DeepSeek client (uses OpenAI-compatible API)
		if (process.env.DEEPSEEK_API_KEY) {
            this.deepseek = new OpenAI({
                baseURL: 'https://api.deepseek.com',
                apiKey: process.env.DEEPSEEK_API_KEY
            });
        }
        
        // Anthropic client (optional)
        if (process.env.ANTHROPIC_API_KEY) {
            const Anthropic = require('@anthropic-ai/sdk');
            this.anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY
            });
        }
		
		this.sessionLocks = new Map(); // Track processing sessions
		this.sessionLockTimeout = 10000; // 10 second max lock time
    }
	
	/**
	 * Call LLM with automatic provider routing
	 * Supports text and vision (image) inputs
	 * @private
	 */
	async _callLLM(messages, options = {}) {
		const {
			model = 'gpt-4o-mini',
			temperature = 0.7,
			max_tokens = 4096,
			json_mode = true,
			hasVision = false  // Flag to indicate vision content
		} = options;
		
		// For vision requests, ensure we use a vision-capable model
		let effectiveModel = model;
		if (hasVision) {
			const visionModels = ['gpt-4o', 'gpt-4o-mini', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'];
			const modelLower = model.toLowerCase();
			
			// Check if current model supports vision
			const supportsVision = visionModels.some(vm => modelLower.includes(vm.toLowerCase()));
			
			if (!supportsVision) {
				// Fall back to gpt-4o-mini for vision
				console.log(`⚠️ Model ${model} doesn't support vision, falling back to gpt-4o-mini`);
				effectiveModel = 'gpt-4o-mini';
			}
		}
		
		try {
			const result = await llmService.chat(messages, {
				model: effectiveModel,
				temperature,
				max_tokens,
				json_mode
			});
			
			// Return in format compatible with existing code
			return {
				content: result.content,
				usage: {
					prompt_tokens: result.usage.prompt_tokens,
					completion_tokens: result.usage.completion_tokens,
					cached_tokens: result.usage.cached_tokens || 0,
					total_tokens: result.usage.prompt_tokens + result.usage.completion_tokens
				},
				cost: result.cost,
				provider: result.provider,
				model: result.model
			};
		} catch (error) {
			console.error(`❌ LLM call failed (${effectiveModel}):`, error.message);
			
			// Fallback to OpenAI if other provider fails
			if (effectiveModel !== 'gpt-4o-mini' && this.openai) {
				console.log('🔄 Falling back to OpenAI gpt-4o-mini...');
				return this._callLLM(messages, { ...options, model: 'gpt-4o-mini' });
			}
			
			throw error;
		}
	}

	/**
     * Get the appropriate client based on model provider
     */
    _getClientForModel(modelName) {
        if (modelName?.startsWith('deepseek')) {
            if (!this.deepseek) {
                console.warn('⚠️ DeepSeek requested but API key not configured, falling back to OpenAI');
                return { client: this.openai, provider: 'openai' };
            }
            return { client: this.deepseek, provider: 'deepseek' };
        }
        
        if (modelName?.startsWith('claude')) {
            if (!this.anthropic) {
                console.warn('⚠️ Claude requested but API key not configured, falling back to OpenAI');
                return { client: this.openai, provider: 'openai' };
            }
            return { client: this.anthropic, provider: 'anthropic' };
        }
        
        return { client: this.openai, provider: 'openai' };
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
				(typeof session.metadata === 'string' ? session.metadata : session.metadata) :
				{},
			channel_metadata: session.channel_metadata ?
				(typeof session.channel_metadata === 'string' ? session.channel_metadata : session.channel_metadata) :
				null,
			context_data: session.context_data ?
				(typeof session.context_data === 'string' ? session.context_data : session.context_data) :
				null,
			complaint_state: session.complaint_state ? 
				(typeof session.complaint_state === 'string' ? session.complaint_state : session.complaint_state) :
				null,
			pending_image: session.pending_image ? 
				(typeof session.pending_image === 'string' ? session.pending_image : session.pending_image) :
				null,
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
        userId = null,
		channelInfo
    }) {
        // Get or create session
		console.log('*********** User Message: ***********', 
			sessionId,
			agentId,
			message,
			userId,
			channelInfo
		)
		
		const lockKey = `${agentId}-${channelInfo?.channelUserId || sessionId}`;
		const existingLock = this.sessionLocks.get(lockKey);

		if (existingLock && (Date.now() - existingLock.startTime) < this.sessionLockTimeout) {
			console.log(`🔒 Session locked - waiting for previous message to complete for ${lockKey}`);
			
			// Wait for lock to release (check every 500ms, max 15 seconds)
			const maxWaitTime = 15000; // 15 seconds
			const checkInterval = 500;
			let waited = 0;
			
			while (waited < maxWaitTime) {
				await new Promise(resolve => setTimeout(resolve, checkInterval));
				waited += checkInterval;
				
				const currentLock = this.sessionLocks.get(lockKey);
				if (!currentLock) {
					console.log(`🔓 Lock released after ${waited}ms - proceeding with message`);
					break;
				}
			}
			
			// If still locked after max wait, force release (stale lock)
			if (this.sessionLocks.get(lockKey)) {
				console.log(`⚠️ Force releasing stale lock after ${maxWaitTime}ms`);
				this.sessionLocks.delete(lockKey);
			}
		}

		// Acquire fresh lock and proceed normally
		this.sessionLocks.set(lockKey, {
			startTime: Date.now(),
			messageCount: 1,
			messages: [{ message, image, timestamp: Date.now() }]
		});

		// Ensure lock is released at the end
		const releaseLock = () => {
			this.sessionLocks.delete(lockKey);
			console.log(`🔓 Session lock released for ${lockKey}`);
		};
		
        let session;
		let agent;
		
        if (sessionId) {
            session = await this.getSession(sessionId);
            if (!session || session.status === 'ended') {
				if (session?.status === 'ended') {
					console.log(`⚠️ Session ${sessionId} is ended - creating new session`);
				}
				
				agent = await AgentService.getAgent(agentId);
				if (!agent) {
					throw new Error('Agent not found');
				}

                session = await this.createSession({
					tenantId: agent.tenant_id,
					agentId: agentId,
					userId: userId,
					sessionName: (message || 'Image upload').substring(0, 50),
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
                sessionName: (message || 'Image upload').substring(0, 50),
				channel: channelInfo?.channel || 'public_chat',
				channelUserId: channelInfo?.channelUserId || null,
				channelUserName: channelInfo?.channelUserName || null,
				channelMetadata: channelInfo?.channelMetadata || null,
				contextData: channelInfo?.contextData || null,
				llmContextHints: channelInfo?.llmContextHints || null
            });
            sessionId = session.id;
        }

		//console.log(session)
		// ============================================
		// 📷 CHECK FOR PENDING IMAGE CLARIFICATION
		// ============================================
		if (!image && session.pending_image) {
			console.log('📷 User responding to image intent clarification');
			
			// Load agent if not already loaded
			if (!agent) {
				agent = await AgentService.getAgent(session.agent_id);
				if (!agent) {
					throw new Error('Agent not found');
				}
			}
			
			const pendingImage = await this._getPendingImage(sessionId);
			
			// Check agent capabilities
			const hasShopify = agent.shopify_store_url && agent.shopify_access_token;
			const hasProducts = agent.kb_metadata?.has_products || false;
			const canSearchProducts = hasShopify || hasProducts;
			
			// For agents WITHOUT products, just process the image with LLM
			if (!canSearchProducts) {
				console.log('📷 Non-product agent - processing image directly with LLM');
				
				// Continue to normal image processing (will use LLM to analyze)
				// Don't return here - let it fall through to normal processing
				// But we need to restore the image since we cleared pending_image
				image = pendingImage.image;
				message = message || pendingImage.original_message || 'Please analyze this image';
				
				// Fall through to normal image processing below...
			} else {
				// Agent HAS products - handle the choice
				const intentChoice = this._detectIntentChoice(message);
				
				if (intentChoice === 'product_search') {
					console.log('📷 User chose: PRODUCT SEARCH');
					return this.sendMessage({
						sessionId,
						agentId,
						message: pendingImage.original_message || 'Find similar products',
						image: pendingImage.image,
						userId,
						channelInfo
					});
				}
				
				if (intentChoice === 'complaint_evidence') {
					console.log('📷 User chose: COMPLAINT');
					// Initialize complaint state
					const complaintState = {
						active: true,
						type: 'UNKNOWN',
						order_number: null,
						awaiting_images: true,
						images_collected: [{
							url: pendingImage.image,
							added_at: pendingImage.stored_at,
							message: pendingImage.original_message
						}],
						initiated_at: new Date().toISOString()
					};
					
					await this._updateSessionComplaintState(sessionId, complaintState);
					
					// Ask for order details
					const followupResponse = agent.sessionContext?.channel === 'whatsapp'
						? `📷 Shukriya! Main ne aapki image complaint ke liye save kar li hai.\n\nAb please apna order number share karein (jaise CZ-123456) taake main aapki madad kar sakoon.`
						: `📷 Thank you! I've saved your image for the complaint.\n\nPlease share your order number (e.g., CZ-123456) so I can help you further.`;
					
					const formattedResponse = markdown.formatResponse(followupResponse);
					
					const assistantMessageId = await this._saveMessage({
						sessionId,
						role: 'assistant',
						content: formattedResponse.text,
						contentHtml: formattedResponse.html,
						contentMarkdown: formattedResponse.markdown,
						sources: [],
						images: [],
						products: [],
						functionCalls: [],
						cost: 0,
						costBreakdown: { final_cost: 0 },
						tokensInput: 0,
						tokensOutput: 0,
						metadata: { complaint_flow_started: true }
					});
					
					await this._updateSessionStats(sessionId, 0);
					
					releaseLock();
					
					return {
						session_id: sessionId,
						message_id: assistantMessageId,
						agent_transfer: false,
						interaction_closed: false,
						response: {
							text: formattedResponse.text,
							html: formattedResponse.html,
							markdown: formattedResponse.markdown
						},
						sources: [],
						images: [],
						products: [],
						function_calls: [],
						llm_decision: { complaint_flow_started: true },
						cost: 0,
						cost_breakdown: { final_cost: 0 }
					};
				}
			
				if (intentChoice === 'other') {
					console.log('📷 User chose: OTHER - asking what they need');
					// Clear the image and ask what they need
					const followupResponse = `No problem! What would you like help with today?`;
					const formattedResponse = markdown.formatResponse(followupResponse);
					
					const assistantMessageId = await this._saveMessage({
						sessionId,
						role: 'assistant',
						content: formattedResponse.text,
						cost: 0
					});
					
					releaseLock();
					
					return {
						session_id: sessionId,
						message_id: assistantMessageId,
						response: { text: formattedResponse.text },
						cost: 0
					};
				}
			
				// Couldn't understand - ask again
				console.log('📷 Could not understand intent choice - asking again');
				const retryResponse = `I didn't quite catch that. Would you like me to:\n\n1️⃣ Find similar products\n2️⃣ Help with a problem/complaint\n\nJust reply with 1 or 2!`;
				const formattedResponse = markdown.formatResponse(retryResponse);
				
				// Re-store the pending image
				await this._storePendingImage(sessionId, pendingImage.image, pendingImage.original_message);
				
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					cost: 0
				});
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					response: { text: formattedResponse.text },
					cost: 0
				};
			}
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
			channel_caller_id: session.channel_user_id,
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

			// Classify image intent: complaint evidence vs product search
			const imageIntent = await this._classifyImageIntent(session, history, message, image);
			
			console.log(`📷 Image Intent: ${imageIntent.intent} (confidence: ${imageIntent.confidence}, source: ${imageIntent.source})`);
			
			// ============================================
			// 📷 BATCH IMAGE HANDLING - Silent collection
			// ============================================
			if (imageIntent.intent === 'batch_image_skip') {
				console.log(`📷 Batch image #${imageIntent.images_count} - collecting silently (no response)`);
				
				// ✅ IMPORTANT: Save the image to complaint state before returning!
				const complaintState = session.complaint_state || {};
				complaintState.images_collected = complaintState.images_collected || [];
				complaintState.images_collected.push({
					url: image,
					added_at: new Date().toISOString(),
					message: message || null
				});
				await this._updateSessionComplaintState(sessionId, complaintState);
				console.log(`📷 Image saved to complaint state. Total images: ${complaintState.images_collected.length}`);
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: userMessageId,
					agent_transfer: false,
					interaction_closed: false,
					skip_response: true,  // 🔑 Tell PHP to not send to WhatsApp
					response: {
						text: '',
						html: '',
						markdown: ''
					},
					sources: [],
					images: [],
					products: [],
					function_calls: [],
					llm_decision: {
						batch_image_collected: true,
						images_count: complaintState.images_collected.length,
						awaiting: imageIntent.awaiting
					},
					cost: 0,
					cost_breakdown: { final_cost: 0 }
				};
			}
			
			// ============================================
			// 📷 BATCH IMAGE WITH ORDER REMINDER
			// ============================================
			if (imageIntent.intent === 'batch_image_reminder') {
				console.log(`📷 Image #${imageIntent.images_count} received - sending order reminder`);
				
				// ✅ IMPORTANT: Save the image to complaint state before returning!
				const complaintState = session.complaint_state || {};
				complaintState.images_collected = complaintState.images_collected || [];
				complaintState.images_collected.push({
					url: image,
					added_at: new Date().toISOString(),
					message: message || null
				});
				await this._updateSessionComplaintState(sessionId, complaintState);
				console.log(`📷 Image saved to complaint state. Total images: ${complaintState.images_collected.length}`);
				
				const customerLang = this._detectCustomerLanguage(history, message);
				const isUrdu = customerLang === 'urdu';
				
				const reminderResponse = isUrdu
					? `📷 Image mil gayi (${complaintState.images_collected.length} images collected). Ab please apna order number share karein taake main ticket create kar sakoon.`
					: `📷 Image received (${complaintState.images_collected.length} images collected). Please share your order number so I can create the ticket.`;
				
				const formattedResponse = markdown.formatResponse(reminderResponse);
				
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					contentHtml: formattedResponse.html,
					contentMarkdown: formattedResponse.markdown,
					cost: 0
				});
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					agent_transfer: false,
					interaction_closed: false,
					response: {
						text: formattedResponse.text,
						html: formattedResponse.html,
						markdown: formattedResponse.markdown
					},
					sources: [],
					images: [],
					products: [],
					function_calls: [],
					llm_decision: {
						image_collected: true,
						images_count: complaintState.images_collected.length,
						awaiting_order_info: true
					},
					cost: 0,
					cost_breakdown: { final_cost: 0 }
				};
			}
			
			// ============================================
			// 🛡️ POST-TICKET IMAGE - Late image after ticket created
			// ============================================
			if (imageIntent.intent === 'post_ticket_image') {
				console.log(`📷 Late image received after ticket creation - acknowledging gracefully`);
				
				const customerLang = this._detectCustomerLanguage(history, message);
				const isUrdu = customerLang === 'urdu';
				
				// Acknowledge the image without starting a new complaint
				const acknowledgment = isUrdu
					? `📷 Aapki image mil gayi. Aapka ticket pehle se create ho chuka hai aur hamari team jald aap se contact karegi.`
					: `📷 Thank you for sharing the image. Your ticket has already been created and our team will contact you shortly.`;
				
				const formattedResponse = markdown.formatResponse(acknowledgment);
				
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					contentHtml: formattedResponse.html,
					contentMarkdown: formattedResponse.markdown,
					cost: 0
				});
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					agent_transfer: false,
					interaction_closed: false,
					response: {
						text: formattedResponse.text,
						html: formattedResponse.html,
						markdown: formattedResponse.markdown
					},
					sources: [],
					images: [],
					products: [],
					function_calls: [],
					llm_decision: {
						post_ticket_image: true,
						ticket_already_created: true
					},
					cost: 0,
					cost_breakdown: { final_cost: 0 }
				};
			}
			
			// ============================================
			// 📋 ORDER SCREENSHOT PATH
			// ============================================
			if (imageIntent.intent === 'order_screenshot') {
				console.log('📋 Processing image as ORDER SCREENSHOT');
				
				// Check if agent has order lookup capability
				const hasShopify = agent.shopify_store_url && agent.shopify_access_token;
				const hasKbWithShopify = agent.kb_id; // KB might have Shopify connected
				
				if (!hasShopify && !hasKbWithShopify) {
					console.log('⚠️ Agent has no order lookup capability');
					
					// Graceful fallback - acknowledge and ask for manual input
					const fallbackResponse = `I can see this is an order-related screenshot. However, I'm not able to look up order details automatically. Could you please provide your order number, and I'll help you from there?`;
					
					const formattedResponse = markdown.formatResponse(fallbackResponse);
					
					const assistantMessageId = await this._saveMessage({
						sessionId,
						role: 'assistant',
						content: formattedResponse.text,
						contentHtml: formattedResponse.html,
						contentMarkdown: formattedResponse.markdown,
						sources: [],
						images: [],
						products: [],
						functionCalls: [],
						cost: 0,
						metadata: { 
							image_provided: true, 
							image_intent: 'order_screenshot',
							no_shopify_capability: true
						}
					});
					
					await this._updateSessionStats(sessionId, 0);
				
					releaseLock();
					
					return {
						session_id: sessionId,
						message_id: assistantMessageId,
						response: {
							text: formattedResponse.text,
							html: formattedResponse.html,
							markdown: formattedResponse.markdown
						},
						sources: [],
						images: [],
						products: [],
						cost: 0
					};
				}
				
				// Extract order information from screenshot
				const orderExtraction = await this._extractOrderFromScreenshot(image, message, agent);
				
				let totalCost = orderExtraction.extraction_cost || 0;
				
				// Handle low confidence extractions
				if (orderExtraction.confidence === 'low' && orderExtraction.success) {
					console.log(`⚠️ Low confidence extraction: ${orderExtraction.order_number}`);
					
					// Ask for confirmation
					const confirmResponse = `I can see an order in your screenshot, but the image quality makes it a bit hard to read. I found what looks like order number **${orderExtraction.order_number}**. Is that correct? Or would you like to type it directly?`;
					
					const formattedResponse = markdown.formatResponse(confirmResponse);
					
					const assistantMessageId = await this._saveMessage({
						sessionId,
						role: 'assistant',
						content: formattedResponse.text,
						contentHtml: formattedResponse.html,
						contentMarkdown: formattedResponse.markdown,
						sources: [],
						images: [],
						products: [],
						functionCalls: [],
						cost: totalCost,
						metadata: { 
							image_provided: true, 
							image_intent: 'order_screenshot',
							extracted_order: orderExtraction.order_number,
							confidence: 'low',
							awaiting_confirmation: true
						}
					});
					
					await this._updateSessionStats(sessionId, totalCost);
					
					releaseLock();
					
					return {
						session_id: sessionId,
						message_id: assistantMessageId,
						response: {
							text: formattedResponse.text,
							html: formattedResponse.html,
							markdown: formattedResponse.markdown
						},
						sources: [],
						images: [],
						products: [],
						cost: totalCost,
						extracted_order_number: orderExtraction.order_number,
						confidence: 'low'
					};
				}
				
				if (orderExtraction.success && orderExtraction.order_number) {
					console.log(`✅ Extracted order number: ${orderExtraction.order_number} (confidence: ${orderExtraction.confidence})`);
					
					// Look up order status using the extracted order number
					const orderResult = await this._handleOrderStatusCheck(agent, {
						order_number: orderExtraction.order_number
					});
					
					// Add order lookup cost if any
					if (orderResult.cost) {
						totalCost += orderResult.cost;
					}
					
					if (orderResult.success && orderResult.found) {
						const order = orderResult.order;
						
						// Detect language from recent messages
						const recentMessages = history.slice(-3).map(m => m.content || '').join(' ');
						const isUrdu = /[\u0600-\u06FF]/.test(recentMessages) || 
							/\b(kya|hai|mera|order|status|batao|chahiye|dekhna|dikhao)\b/i.test(recentMessages);
						
						// Build personalized response
						let responseText;
						const customerName = order.customer_first_name || orderExtraction.customer_name?.split(' ')[0];
						
						if (isUrdu) {
							responseText = customerName 
								? `${customerName}, Calza se order karne ka shukriya! `
								: '';
							responseText += `Maine aapke screenshot se order details nikal liye hain:\n\n`;
							responseText += `📦 **Order Details:**\n`;
							responseText += `• Order Number: ${order.order_number}\n`;
							responseText += `• Order Date: ${order.order_date}\n`;
							responseText += `• Status: ${order.status_description}\n`;
							if (order.delivery_date) {
								responseText += `• Delivered: ${order.delivery_date}\n`;
							} else if (order.shipped_date) {
								responseText += `• Shipped: ${order.shipped_date}\n`;
							}
							if (order.tracking?.number) {
								responseText += `• Tracking: ${order.tracking.number}\n`;
							}
							responseText += `\nKya aur koi madad chahiye?`;
						} else {
							responseText = customerName 
								? `Thank you ${customerName} for your order with us! `
								: '';
							responseText += `I've extracted the order details from your screenshot:\n\n`;
							responseText += `📦 **Order Details:**\n`;
							responseText += `• Order Number: ${order.order_number}\n`;
							responseText += `• Order Date: ${order.order_date}\n`;
							responseText += `• Status: ${order.status_description}\n`;
							if (order.delivery_date) {
								responseText += `• Delivered: ${order.delivery_date}\n`;
							} else if (order.shipped_date) {
								responseText += `• Shipped: ${order.shipped_date}\n`;
							}
							if (order.tracking?.number) {
								responseText += `• Tracking: ${order.tracking.number}\n`;
							}
							responseText += `\nIs there anything else I can help you with?`;
						}
						
						const formattedResponse = markdown.formatResponse(responseText);
						
						const assistantMessageId = await this._saveMessage({
							sessionId,
							role: 'assistant',
							content: formattedResponse.text,
							contentHtml: formattedResponse.html,
							contentMarkdown: formattedResponse.markdown,
							sources: [],
							images: [],
							products: [],
							functionCalls: [{
								name: 'check_order_status',
								arguments: { order_number: orderExtraction.order_number },
								result: { success: true, found: true }
							}],
							cost: totalCost,
							metadata: { 
								image_provided: true,
								image_intent: 'order_screenshot',
								extracted_order: orderExtraction.order_number,
								order_found: true,
								extraction_confidence: orderExtraction.confidence,
								source_type: orderExtraction.source_type
							}
						});
						
						await this._updateSessionStats(sessionId, totalCost);
						
						releaseLock();
						
						return {
							session_id: sessionId,
							message_id: assistantMessageId,
							response: {
								text: formattedResponse.text,
								html: formattedResponse.html,
								markdown: formattedResponse.markdown
							},
							sources: [],
							images: [],
							products: [],
							function_calls: [{
								name: 'check_order_status',
								result: { success: true, found: true }
							}],
							cost: totalCost,
							extracted_order_number: orderExtraction.order_number,
							order_found: true,
							order_details: {
								order_number: order.order_number,
								status: order.status,
								status_description: order.status_description,
								order_date: order.order_date,
								delivery_date: order.delivery_date
							}
						};
						
					} else {
						// Order not found - ask for verification
						console.log(`⚠️ Order not found: ${orderExtraction.order_number}`);
						
						const notFoundResponse = orderResult.searched_variants 
							? `I extracted order number **${orderExtraction.order_number}** from your screenshot, but couldn't find it. I also tried: ${orderResult.searched_variants.join(', ')}.\n\nCould you please verify the order number or provide the email/phone used for the order?`
							: `I extracted order number **${orderExtraction.order_number}** from your screenshot, but couldn't find it in our system.\n\nCould you please verify the order number or provide the email/phone used for the order?`;
						
						const formattedResponse = markdown.formatResponse(notFoundResponse);
						
						const assistantMessageId = await this._saveMessage({
							sessionId,
							role: 'assistant',
							content: formattedResponse.text,
							contentHtml: formattedResponse.html,
							contentMarkdown: formattedResponse.markdown,
							sources: [],
							images: [],
							products: [],
							functionCalls: [{
								name: 'check_order_status',
								arguments: { order_number: orderExtraction.order_number },
								result: { success: false, found: false }
							}],
							cost: totalCost,
							metadata: { 
								image_provided: true,
								image_intent: 'order_screenshot',
								extracted_order: orderExtraction.order_number,
								order_found: false
							}
						});
						
						await this._updateSessionStats(sessionId, totalCost);
						
						releaseLock();
						
						return {
							session_id: sessionId,
							message_id: assistantMessageId,
							response: {
								text: formattedResponse.text,
								html: formattedResponse.html,
								markdown: formattedResponse.markdown
							},
							sources: [],
							images: [],
							products: [],
							cost: totalCost,
							extracted_order_number: orderExtraction.order_number,
							order_found: false
						};
					}
					
				} else if (orderExtraction.email || orderExtraction.phone) {
					// ============================================
					// 📧 NO ORDER NUMBER, BUT HAVE EMAIL/PHONE
					// ============================================
					// Try to look up order using email or phone
					console.log(`📧 No order number found, trying lookup by email: ${orderExtraction.email}, phone: ${orderExtraction.phone}`);
					
					const orderResult = await this._handleOrderStatusCheck(agent, {
						email: orderExtraction.email,
						phone: orderExtraction.phone
					});
					
					if (orderResult.cost) {
						totalCost += orderResult.cost;
					}
					
					if (orderResult.success && orderResult.found) {
						const order = orderResult.order;
						
						// Detect language from recent messages
						const recentMessages = history.slice(-3).map(m => m.content || '').join(' ');
						const isUrdu = /[\u0600-\u06FF]/.test(recentMessages) || 
							/\b(kya|hai|mera|order|status|batao|chahiye|dekhna|dikhao)\b/i.test(recentMessages);
						
						// Build personalized response
						let responseText;
						const customerName = order.customer_first_name || orderExtraction.customer_name?.split(' ')[0];
						const searchedBy = orderExtraction.email ? 'email' : 'phone number';
						
						if (isUrdu) {
							responseText = customerName 
								? `${customerName}, maine aapki ${searchedBy} se order dhundh liya!\n\n`
								: `Maine aapki ${searchedBy} se order dhundh liya!\n\n`;
							responseText += `📦 **Order Details:**\n`;
							responseText += `• Order Number: ${order.order_number}\n`;
							responseText += `• Order Date: ${order.order_date}\n`;
							responseText += `• Status: ${order.status_description}\n`;
							if (order.delivery_date) {
								responseText += `• Delivery Date: ${order.delivery_date}\n`;
							}
							responseText += `\n📍 Shipping to: ${order.shipping_address || order.shipping_city || 'N/A'}`;
						} else {
							responseText = customerName 
								? `${customerName}, I found your order using the ${searchedBy} from your screenshot!\n\n`
								: `I found your order using the ${searchedBy} from your screenshot!\n\n`;
							responseText += `📦 **Order Details:**\n`;
							responseText += `• Order Number: ${order.order_number}\n`;
							responseText += `• Order Date: ${order.order_date}\n`;
							responseText += `• Status: ${order.status_description}\n`;
							if (order.delivery_date) {
								responseText += `• Delivery Date: ${order.delivery_date}\n`;
							}
							responseText += `\n📍 Shipping to: ${order.shipping_address || order.shipping_city || 'N/A'}`;
						}
						
						// Add items if available
						if (order.items && order.items.length > 0) {
							responseText += `\n\n🛍️ **Items:**\n`;
							order.items.forEach(item => {
								responseText += `• ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}\n`;
							});
						}
						
						responseText += `\n\nIs there anything else I can help you with?`;
						
						const formattedResponse = markdown.formatResponse(responseText);
						
						const assistantMessageId = await this._saveMessage({
							sessionId,
							role: 'assistant',
							content: formattedResponse.text,
							contentHtml: formattedResponse.html,
							contentMarkdown: formattedResponse.markdown,
							sources: [],
							images: [],
							products: [],
							functionCalls: [{
								function_id: uuidv4(),
								function_name: 'check_order_status',
								arguments: { email: orderExtraction.email, phone: orderExtraction.phone },
								result: orderResult,
								status: 'success'
							}],
							cost: totalCost,
							metadata: { 
								image_provided: true, 
								image_intent: 'order_screenshot',
								searched_by: searchedBy,
								order_found: true
							}
						});
						
						await this._updateSessionStats(sessionId, totalCost);
						
						releaseLock();
						
						return {
							session_id: sessionId,
							message_id: assistantMessageId,
							response: {
								text: formattedResponse.text,
								html: formattedResponse.html,
								markdown: formattedResponse.markdown
							},
							sources: [],
							images: [],
							products: [],
							cost: totalCost,
							order_found: true,
							searched_by: searchedBy
						};
					} else {
						// Email/phone found but no order matched
						console.log(`❌ Order lookup by email/phone failed`);
						
						const notFoundResponse = `I can see the ${orderExtraction.email ? 'email' : 'phone number'} in your screenshot, but I couldn't find a matching order. This could happen if:\n\n• The order was placed with different contact details\n• The order is from a different store\n\nCould you please provide your order number directly? (e.g., CZ-123456)`;
						
						const formattedResponse = markdown.formatResponse(notFoundResponse);
						
						const assistantMessageId = await this._saveMessage({
							sessionId,
							role: 'assistant',
							content: formattedResponse.text,
							contentHtml: formattedResponse.html,
							contentMarkdown: formattedResponse.markdown,
							cost: totalCost,
							metadata: { 
								image_provided: true,
								image_intent: 'order_screenshot',
								searched_by: orderExtraction.email ? 'email' : 'phone',
								order_found: false
							}
						});
						
						await this._updateSessionStats(sessionId, totalCost);
						
						releaseLock();
						
						return {
							session_id: sessionId,
							message_id: assistantMessageId,
							response: {
								text: formattedResponse.text,
								html: formattedResponse.html,
								markdown: formattedResponse.markdown
							},
							sources: [],
							images: [],
							products: [],
							cost: totalCost,
							order_found: false
						};
					}
					
				} else {
					// Couldn't extract order number, email, or phone
					console.log(`❌ Failed to extract any identifiable information from screenshot`);
					
					const extractionFailedResponse = orderExtraction.error 
						? `I can see this appears to be an order-related screenshot, but I had trouble reading it (${orderExtraction.error}). Could you please type your order number directly? (e.g., CZ-123456)`
						: `I can see this is an order-related screenshot, but I couldn't clearly read the order number, email, or phone number. Could you please type your order number directly? (e.g., CZ-123456)\n\nAlternatively, you can provide the email or phone number used for the order.`;
					
					const formattedResponse = markdown.formatResponse(extractionFailedResponse);
					
					const assistantMessageId = await this._saveMessage({
						sessionId,
						role: 'assistant',
						content: formattedResponse.text,
						contentHtml: formattedResponse.html,
						contentMarkdown: formattedResponse.markdown,
						sources: [],
						images: [],
						products: [],
						functionCalls: [],
						cost: totalCost,
						metadata: { 
							image_provided: true,
							image_intent: 'order_screenshot',
							extraction_failed: true,
							extraction_error: orderExtraction.error
						}
					});
					
					await this._updateSessionStats(sessionId, totalCost);
					
					releaseLock();
					
					return {
						session_id: sessionId,
						message_id: assistantMessageId,
						response: {
							text: formattedResponse.text,
							html: formattedResponse.html,
							markdown: formattedResponse.markdown
						},
						sources: [],
						images: [],
						products: [],
						cost: totalCost,
						extraction_failed: true
					};
				}
			}
			
			// ============================================
			// 🤖 LLM ANALYSIS PATH (Non-product agents)
			// ============================================
			if (imageIntent.intent === 'llm_analysis') {
				console.log('🤖 Routing to LLM for image analysis (no product search)');
				
				// Build simple prompt for image analysis
				const systemPrompt = this._buildSystemPromptWithStrategy(
					agent.instructions,
					agent.conversation_strategy,
					agent.greeting,
					isFirstMessage,
					agent.kb_metadata,
					agent
				);
				
				const messages = [
					{ role: 'system', content: systemPrompt },
					...history.map(msg => ({ role: msg.role, content: msg.content })),
					{
						role: 'user',
						content: [
							{ type: 'text', text: message || 'Please analyze this image and help me with it.' },
							{ type: 'image_url', image_url: { url: image, detail: 'high' } }
						]
					}
				];
				
				const model = agent.chat_model || 'gpt-4o-mini';
				
				const completion = await this._callLLM(messages, {
					model: agent.chat_model || 'gpt-4o-mini',
					temperature: parseFloat(agent.temperature) || 0.7,
					max_tokens: agent.max_tokens || 4096,
					json_mode: true
				});

				const aiMessage = { content: completion.content };
				let llmDecision;
				
				try {
					llmDecision = JSON.parse(aiMessage.content);
				} catch (error) {
					llmDecision = {
						response: aiMessage.content || "I've analyzed your image. How can I help you with it?",
						knowledge_search_needed: false,
						function_call_needed: false
					};
				}
				
				// Calculate cost
				const llmCost = CostCalculator.calculateChatCost({
					prompt_tokens: completion.usage.prompt_tokens,
					completion_tokens: completion.usage.completion_tokens,
					cached_tokens: 0
				}, model);
				
				const formattedResponse = markdown.formatResponse(llmDecision.response);
				
				// Save and return response
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					contentHtml: formattedResponse.html,
					contentMarkdown: formattedResponse.markdown,
					sources: [],
					images: [],
					products: [],
					functionCalls: [],
					cost: llmCost.final_cost,
					costBreakdown: llmCost,
					tokensInput: completion.usage.prompt_tokens,
					tokensOutput: completion.usage.completion_tokens,
					metadata: { image_provided: true, image_intent: 'llm_analysis' }
				});
				
				await this._updateSessionStats(sessionId, llmCost.final_cost);
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					agent_transfer: llmDecision.agent_transfer || false,
					interaction_closed: false,
					response: {
						text: formattedResponse.text,
						html: formattedResponse.html,
						markdown: formattedResponse.markdown
					},
					sources: [],
					images: [],
					products: [],
					function_calls: [],
					llm_decision: llmDecision,
					cost: llmCost.final_cost,
					cost_breakdown: llmCost
				};
			}
			
			// ============================================
			// ❓ UNKNOWN INTENT - ASK USER
			// ============================================
			if (imageIntent.intent === 'unknown') {
				console.log('❓ Unknown image intent - asking user for clarification');
				
				// Check agent capabilities
				const hasShopify = agent.shopify_store_url && agent.shopify_access_token;
				const hasProducts = agent.kb_metadata?.has_products || false;
				const canSearchProducts = hasShopify || hasProducts;
				
				// Store image in session for later processing
				await this._storePendingImage(sessionId, image, message);
				
				// Build clarification response based on agent capabilities
				let clarificationResponse;
				
				if (canSearchProducts) {
					// Agent has products - offer product search option
					clarificationResponse = agent.sessionContext?.channel === 'whatsapp'
						? `📷 Mujhe aapki image mil gayi!\n\nAap kya karna chahte hain?\n\n1️⃣ Similar products dhundna\n2️⃣ Order mein problem report karna\n3️⃣ Kuch aur`
						: `📷 I received your image! What would you like me to do?\n\n1️⃣ Find similar products\n2️⃣ Report a problem with my order\n3️⃣ Something else`;
				} else {
					// Agent has NO products - don't offer product search
					clarificationResponse = agent.sessionContext?.channel === 'whatsapp'
						? `📷 Mujhe aapki image mil gayi!\n\nIs image ke baare mein aap kya jaanna chahte hain? Kindly thodi details share karein.`
						: `📷 I received your image! Could you please tell me what you'd like to know about it or how I can help?`;
				}
				
				const formattedResponse = markdown.formatResponse(clarificationResponse);
				
				// Save assistant message (minimal cost - no LLM call)
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					contentHtml: formattedResponse.html,
					contentMarkdown: formattedResponse.markdown,
					sources: [],
					images: [],
					products: [],
					functionCalls: [],
					cost: 0,
					costBreakdown: { final_cost: 0, operations: [] },
					tokensInput: 0,
					tokensOutput: 0,
					processingTimeMs: 0,
					agentTransferRequested: false,
					metadata: {
						image_provided: true,
						image_intent: 'unknown',
						awaiting_clarification: true
					}
				});
				
				// Update session stats
				await this._updateSessionStats(sessionId, 0);
				
				releaseLock();
				
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					agent_transfer: false,
					interaction_closed: false,
					show_feedback_prompt: false,
					response: {
						text: formattedResponse.text,
						html: formattedResponse.html,
						markdown: formattedResponse.markdown
					},
					sources: [],
					images: [],
					products: [],
					function_calls: [],
					llm_decision: {
						image_intent: 'unknown',
						awaiting_clarification: true
					},
					context_used: {
						knowledge_base_chunks: 0,
						conversation_history_messages: history.length
					},
					agent_metadata: {
						agent_id: agent.id,
						agent_name: agent.name,
						provider: 'none',
						model: 'none'
					},
					cost: 0,
					cost_breakdown: { final_cost: 0 }
				};
			}

			// ============================================
			// 📷 COMPLAINT EVIDENCE PATH
			// ============================================
			if (imageIntent.intent === 'complaint_evidence') {
				console.log('📷 Routing to COMPLAINT EVIDENCE handler');
				// Handle complaint image
				const complaintResult = await this._handleComplaintImage(
					session, 
					image, 
					message, 
					history, 
					agent, 
					imageIntent
				);
				
				const { llmDecision, llmCost, complaintState } = complaintResult;
				
				// Execute function if requested (create_ticket)
				// ============================================
				// 🔧 EXECUTE FUNCTION AND CALL LLM WITH RESULT
				// ============================================
				let executedFunctionCalls = [];

				if (llmDecision.function_call_needed && llmDecision.function_name) {
					console.log(`🔧 Executing function: ${llmDecision.function_name}`);
					
					// Check if we should skip (missing required args)
					const shouldSkipFunction = this._shouldSkipFunctionCall(
						llmDecision.function_name,
						llmDecision.function_arguments,
						agent
					);
					
					if (shouldSkipFunction.skip) {
						console.log(`⏭️ Skipping function call: ${shouldSkipFunction.reason}`);
						llmDecision.function_call_needed = false;
					} else {
						// Find function definition
						const builtInFunctions = ['check_order_status'];
						const isBuiltInFunction = builtInFunctions.includes(llmDecision.function_name);
						
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
								
								console.log(`✅ Function executed:`, llmDecision.function_name, JSON.stringify(functionResult));
								
								executedFunctionCalls.push({
									function_id: uuidv4(),
									function_name: llmDecision.function_name,
									arguments: llmDecision.function_arguments,
									result: functionResult,
									status: 'success'
								});
								
								await db.query(
									`UPDATE yovo_tbl_aiva_chat_sessions 
									 SET last_function_executed_at = NOW() 
									 WHERE id = ?`,
									[sessionId]
								);
								console.log('📍 Marked function execution time');

								// ============================================
								// 🔄 CALL LLM AGAIN WITH FUNCTION RESULT
								// ============================================
								if (functionResult.success) {
									console.log('🔄 Calling LLM again with function result...');
									
									// Build system prompt for followup
									const systemPrompt = this._buildSystemPromptWithStrategy(
										agent.instructions,
										agent.conversation_strategy,
										agent.greeting,
										false,
										agent.kb_metadata,
										agent
									);
									
									const followupMessages = [
										{ role: 'system', content: systemPrompt },
										...history.map(msg => ({ role: msg.role, content: msg.content })),
										{
											role: 'user',
											content: [
												{ type: 'text', text: message || 'Here is the image for my complaint' },
												{ type: 'image_url', image_url: { url: image, detail: 'low' } }
											]
										},
										{ role: 'assistant', content: JSON.stringify(llmDecision) },
										{
											role: 'user',
											content: `[FUNCTION RESULT for ${llmDecision.function_name}]:
				${JSON.stringify(functionResult, null, 2)}

				RESPONSE INSTRUCTIONS:
1. If result contains any ID/number (ticket_number, order_number, etc.), your response MUST include it
2. Keep response SHORT and DIRECT - no extra commentary
3. Do NOT describe/acknowledge images or thank for sharing pictures
4. Match customer's language (English or Roman Urdu). Must respond in the same language
5. Do NOT set function_call_needed=true

IMPORTANT: If result has success=true with a ticket_number or reference number, respond with ONLY:
- English: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [Ticket Number]. Our team will contact you shortly."
- Urdu: "Hum mazarat khuwan hain ap ki is pareshani ki waja say. Ap ka concern note kar leya gya hai. Aapka ticket number [NUMBER] hai. Humari team jald az jald aap se contact karegi."

Respond in valid JSON format.`
										}
									];
									
									const followupCompletion = await this._callLLM(followupMessages, {
										model: agent.chat_model || 'gpt-4o-mini',
										temperature: parseFloat(agent.temperature) || 0.7,
										max_tokens: 500,
										json_mode: true,
										hasVision: true
									});
									
									// Add followup cost
									complaintResult.llmCost = CostCalculator.combineCosts([
										complaintResult.llmCost, 
										followupCompletion.cost
									]);
									console.log('💰 Followup LLM cost:', followupCompletion.cost.final_cost);
									
									try {
										const finalDecision = JSON.parse(followupCompletion.content);
										llmDecision.response = finalDecision.response;
										llmDecision.function_call_needed = false;
										
										// Preserve other decisions
										if (finalDecision.conversation_complete !== undefined) {
											llmDecision.conversation_complete = finalDecision.conversation_complete;
										}
										if (finalDecision.user_wants_to_end !== undefined) {
											llmDecision.user_wants_to_end = finalDecision.user_wants_to_end;
										}
										
										const customerLanguage = this._detectCustomerLanguage(history, message);
										llmDecision.response = this._sanitizeTicketResponse(
											llmDecision.response,
											functionResult,
											llmDecision.function_name,
											customerLanguage
										);

										console.log('✅ Final response after function call generated');
									} catch (parseError) {
										console.error('❌ Failed to parse followup response:', parseError.message);
										// Try to extract response from partial JSON
										if (followupCompletion.content) {
											const responseMatch = followupCompletion.content.match(/"response"\s*:\s*"([^"]+)"/);
											if (responseMatch) {
												llmDecision.response = responseMatch[1];
											}
										}
									}
									
									// ============================================
									// 🎫 SANITIZE RESPONSE - Inject/Clean ticket numbers
									// ============================================
									const customerLanguage = this._detectCustomerLanguage(history, message);
									llmDecision.response = this._sanitizeTicketResponse(
										llmDecision.response,
										functionResult,
										llmDecision.function_name,
										customerLanguage
									)
								}
								else {
									// Function returned success: false (API error, not exception)
									console.log(`⚠️ Function ${llmDecision.function_name} returned success: false`);
									
									const customerLanguage = this._detectCustomerLanguage(history, message);
									const isUrdu = customerLanguage === 'urdu';
									
									// Provide safe fallback response without any placeholders
									llmDecision.response = isUrdu
										? "Maaf karein, aapki request process karte waqt masla aaya. Humari team jald aap se contact karegi. Aapka concern note kar liya gaya hai."
										: "We apologize, there was an issue processing your request. Our team will contact you shortly. Your concern has been noted.";
									
									llmDecision.agent_transfer = true; // Flag for human follow-up
									
									// Update function call status
									if (executedFunctionCalls.length > 0) {
										executedFunctionCalls[executedFunctionCalls.length - 1].status = 'api_error';
										executedFunctionCalls[executedFunctionCalls.length - 1].result = functionResult;
									}
								}
								
								// Update complaint state after successful function
								const funcNameLower = llmDecision.function_name.toLowerCase();
								if (funcNameLower.includes('ticket') || funcNameLower.includes('complaint')) {
									complaintState.awaiting_images = false;
									complaintState.ticket_created = true;
									await this._updateSessionComplaintState(sessionId, complaintState);
									await this._clearComplaintState(sessionId);
								}
								
							} catch (funcError) {
								console.error(`❌ Function execution failed:`, funcError.message);
								
								executedFunctionCalls.push({
									function_id: uuidv4(),
									function_name: llmDecision.function_name,
									arguments: llmDecision.function_arguments,
									error: funcError.message,
									status: 'error'
								});
								
								await db.query(
									`UPDATE yovo_tbl_aiva_chat_sessions 
									 SET last_function_executed_at = NOW() 
									 WHERE id = ?`,
									[sessionId]
								);
								console.log('📍 Marked function execution time');

								
								llmDecision.response = "I apologize, but I encountered an issue while processing your request. Please try again.";
							}
						} else {
							console.warn(`⚠️ Function not found or inactive: ${llmDecision.function_name}`);
						}
					}
				}
				
				// Format response
				const formattedResponse = markdown.formatResponse(llmDecision.response);
				
				// Calculate total cost
				const totalCost = CostCalculator.combineCosts([complaintResult.llmCost || llmCost]);
				if (userAnalysisCost > 0) {
					totalCost.final_cost += userAnalysisCost;
				}
				
				// Save assistant message
				const assistantMessageId = await this._saveMessage({
					sessionId,
					role: 'assistant',
					content: formattedResponse.text,
					contentHtml: formattedResponse.html,
					contentMarkdown: formattedResponse.markdown,
					sources: [],
					images: [],
					products: [],
					functionCalls: executedFunctionCalls,
					cost: totalCost.final_cost,
					costBreakdown: totalCost,
					tokensInput: 0,
					tokensOutput: 0,
					processingTimeMs: 0,
					agentTransferRequested: llmDecision.agent_transfer || false,
					metadata: {
						image_provided: true,
						image_intent: 'complaint_evidence',
						complaint_type: complaintState?.type,
						images_collected: complaintState?.images_collected?.length || 1
					}
				});
				
				// Update session stats
				await this._updateSessionStats(sessionId, totalCost.final_cost);
				
				releaseLock();
				
				// Return complaint evidence response
				return {
					session_id: sessionId,
					message_id: assistantMessageId,
					agent_transfer: llmDecision.agent_transfer || false,
					interaction_closed: llmDecision.conversation_complete && llmDecision.user_wants_to_end,
					show_feedback_prompt: llmDecision.conversation_complete && llmDecision.user_wants_to_end,
					response: {
						text: formattedResponse.text,
						html: formattedResponse.html,
						markdown: formattedResponse.markdown
					},
					sources: [],
					images: [],
					products: [],
					function_calls: executedFunctionCalls,
					llm_decision: {
						...llmDecision,
						image_intent: 'complaint_evidence',
						complaint_state: complaintState
					},
					context_used: {
						knowledge_base_chunks: 0,
						conversation_history_messages: history.length,
						complaint_images_collected: complaintState?.images_collected?.length || 1
					},
					agent_metadata: {
						agent_id: agent.id,
						agent_name: agent.name,
						provider: 'openai',
						model: agent.chat_model || 'gpt-4o-mini',
						temperature: agent.temperature || 0.7
					},
					cost: totalCost.final_cost,
					cost_breakdown: totalCost,
					user_analysis_cost: userAnalysisCost
				};
			}
			
			// ============================================
			// 🛍️ PRODUCT SEARCH PATH (Original flow)
			// ============================================
			console.log('🛍️ Routing to PRODUCT SEARCH handler');
			
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
								
								releaseLock();
								
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
								
								releaseLock();

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
							const analysisMessages = [{
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
							];
							
							const analysisCompletion = await this._callLLM(analysisMessages, {
								model: agent.chat_model || 'gpt-4o-mini',
								max_tokens: 150,
								temperature: 0.3,
								json_mode: true,
								hasVision: true
							});

							const analysisText = analysisCompletion.content
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

									releaseLock();
									
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
                            const analysisCost = analysisCompletion.cost;
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

            const completion = await this._callLLM(messages, {
				model: agent.chat_model || 'gpt-4o-mini',
				temperature: parseFloat(agent.temperature) || 0.7,
				max_tokens: agent.max_tokens || 4096,
				json_mode: true,
				hasVision: true  // Image is included
			});

			const aiMessage = { content: completion.content };
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
			const llmCost = completion.cost;

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

			releaseLock();
			
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
        // 📝 NO IMAGE - SMART MODEL ROUTING FLOW
        // ============================================

        console.log('📝 No image detected - Using smart model routing');

		// ============================================
		// 🎯 STEP 1: CLASSIFY MESSAGE (Always cheap model)
		// ============================================
		let classification = null;
		let classificationCost = 0;
		const useSmartRouting = this._isSmartRoutingEnabled(agent);
		
		if (useSmartRouting) {
			classification = await this._classifyMessageComplexity(
				message,
				session,
				false,  // no image
				history
			);
			classificationCost = classification.classification_cost || 0;
		} else {
			// Default classification when smart routing is disabled
			classification = {
				intent: 'COMPLEX',
				complexity: 'COMPLEX',
				reason: 'Smart routing disabled - using full flow',
				detected_language: 'en'
			};
			console.log('🤖 Smart routing disabled - using agent default model');
		}

		// ============================================
		// 🤖 STEP 2: SELECT MODEL (Based on complexity + active complaint)
		// ============================================
		const selectedModel = this._selectModelForMessage(classification, agent, session);

		// ============================================
		// 🚨 PRE-LLM COMPLAINT DETECTION (For weaker models like 4o-mini)
		// ============================================
		// Detect complaint keywords in user message and initialize complaint state
		// This ensures complaint flow works even if LLM doesn't set complaint_context
		const isEcommerceAgent = agent.shopify_store_url && agent.shopify_access_token;
		
		// Check if ticket was recently created (within last 5 minutes)
		const recentAssistantMsgs = history.filter(m => m.role === 'assistant').slice(-3);
		const ticketJustCreated = recentAssistantMsgs.some(m => 
			m.content?.includes('ticket number') || 
			m.content?.includes('Ticket Number') ||
			m.content?.includes('ticket_number') ||
			m.content?.includes('CZ-373') ||  // Ticket ID pattern
			m.content?.includes('concern note kar') ||
			m.content?.includes('concern has been noted') ||
			m.content?.includes('complaint has been registered') ||
			m.content?.includes('team will contact')
		);
		
		// Check if this is a follow-up question, not a new complaint
		const msgLower = message.toLowerCase();
		const isFollowUpQuestion = (
			msgLower.includes('kab tak') ||  // How long
			msgLower.includes('kitna time') ||  // How much time
			msgLower.includes('when will') ||
			msgLower.includes('how long') ||
			msgLower.includes('theek hai') ||  // Ok (acknowledgment)
			msgLower.includes('acha') ||
			msgLower.includes('jaldi') ||  // Quickly
			/^(theek|ok|okay|acha|alright|fine|thanks|thank)\s*$/i.test(msgLower.trim())  // Just acknowledgment
		);
		
		// ============================================
		// 🛡️ CLEANUP: Clear stale UNKNOWN complaints from race conditions
		// ============================================
		// When user sends batch images, sometimes the second image arrives after ticket
		// was created, creating a new UNKNOWN complaint. Clear it if:
		// 1. Ticket was just created AND
		// 2. User sends acknowledgment OR complaint type is UNKNOWN
		if (isEcommerceAgent && session.complaint_state?.active) {
			const isUnknownComplaint = session.complaint_state.type === 'UNKNOWN';
			const isSimpleAck = /^(ok|okay|thanks|thank you|alright|shukriya|theek hai|theek)\s*$/i.test(msgLower.trim());
			
			if (ticketJustCreated && (isUnknownComplaint || isSimpleAck)) {
				console.log(`🧹 Clearing stale complaint state: type=${session.complaint_state.type}, ticketJustCreated=true, isSimpleAck=${isSimpleAck}`);
				await this._clearComplaintState(session.id);
				session.complaint_state = null;
			}
		}
		
		if (isEcommerceAgent && !session.complaint_state?.active) {
			const complaintTriggers = [
				'complaint', 'problem', 'issue', 'wrong', 'damaged', 'broken', 'defective',
				'not working', 'bad quality', 'poor quality', 'torn', 'missing',
				'wrong color', 'wrong size', 'different', 'not what i ordered',
				'galat', 'kharab', 'toot', 'masla', 'shikayat', 'problem hai',
				// NEW: Color mismatch patterns
				'received a different', 'got a different', 'sent wrong',
				'ordered blue', 'ordered red', 'ordered black', 'ordered white', 'ordered gray', 'ordered grey',
				'received blue', 'received red', 'received black', 'received white', 'received gray', 'received grey',
				'but i received', 'but i got', 'but they sent',
				// NEW: Size mismatch patterns  
				'ordered size', 'received size', 'wrong fit', 'doesn\'t fit', 'too small', 'too big', 'too large'
			];
			
			let hasComplaintKeyword = complaintTriggers.some(trigger => msgLower.includes(trigger));
			
			// NEW: Detect "ordered X but received Y" pattern (color mismatch)
			const colorMismatchPattern = /ordered\s+(?:a\s+)?(\w+)\s+.*(?:received|got)\s+(?:a\s+)?(\w+)/i;
			const colorMismatchMatch = msgLower.match(colorMismatchPattern);
			if (colorMismatchMatch && colorMismatchMatch[1] !== colorMismatchMatch[2]) {
				hasComplaintKeyword = true;
				console.log(`🎨 Color mismatch detected: ordered ${colorMismatchMatch[1]}, received ${colorMismatchMatch[2]}`);
			}
			
			// ============================================
			// 🛡️ SAFEGUARD: Don't re-trigger if ticket just created
			// ============================================
			if (hasComplaintKeyword && ticketJustCreated) {
				console.log(`🛡️ PRE-LLM: Complaint keyword detected but ticket just created - skipping re-initialization`);
				// Don't initialize new complaint - user is likely asking follow-up
			} else if (hasComplaintKeyword && isFollowUpQuestion) {
				console.log(`🛡️ PRE-LLM: Complaint keyword in follow-up question - skipping re-initialization`);
				// Don't initialize - this is a follow-up like "kab tak masla hal ho ga"
			} else if (hasComplaintKeyword) {
				console.log(`🚨 PRE-LLM: Complaint detected in message - initializing complaint state`);
				
				// Detect complaint type
				let complaintType = 'UNKNOWN';
				
				// Color complaints - check for color words or mismatch pattern
				const colorWords = ['color', 'colour', 'blue', 'red', 'black', 'white', 'gray', 'grey', 'brown', 'green', 'pink', 'yellow'];
				const hasColorWord = colorWords.some(c => msgLower.includes(c));
				if (msgLower.includes('wrong color') || msgLower.includes('galat color') || 
					colorMismatchMatch || hasColorWord) {
					complaintType = 'COLOR_ISSUE';
				} else if (msgLower.includes('wrong size') || msgLower.includes('size') || 
						   msgLower.includes('doesn\'t fit') || msgLower.includes('too small') || 
						   msgLower.includes('too big')) {
					complaintType = 'WRONG_SIZE';
				} else if (msgLower.includes('damaged') || msgLower.includes('broken') || msgLower.includes('toot')) {
					complaintType = 'DAMAGED';
				} else if (msgLower.includes('defective') || msgLower.includes('quality') || msgLower.includes('kharab')) {
					complaintType = 'QUALITY_ISSUE';
				} else if (msgLower.includes('missing') || msgLower.includes('not in package')) {
					complaintType = 'MISSING_ITEM';
				} else if (msgLower.includes('different') || msgLower.includes('not what i ordered')) {
					complaintType = 'WRONG_ITEM';
				}
				
				// Initialize complaint state
				const newComplaintState = {
					active: true,
					type: complaintType,
					order_number: null,
					awaiting_images: complaintType !== 'MISSING_ITEM',  // No images needed for missing item
					images_collected: [],
					initiated_at: new Date().toISOString()
				};
				
				await this._updateSessionComplaintState(session.id, newComplaintState);
				session.complaint_state = newComplaintState;  // Update local reference
				
				console.log(`📝 Complaint state initialized: ${complaintType}`);
			}
		}

        // Build enhanced system prompt with strategy
        const systemPrompt = this._buildSystemPromptWithStrategy(
            agent.instructions,
            agent.conversation_strategy,
            agent.greeting,
            isFirstMessage,
            agent.kb_metadata,
            agent
        );
		
		//console.log('@@@@@@@@', systemPrompt);
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

		// ============================================
		// 📷 INJECT COMPLAINT STATE CONTEXT (E-commerce only)
		// ============================================
		// Only for Shopify-connected agents with active complaints
		const isEcommerceForContext = agent.shopify_store_url && agent.shopify_access_token;
		
		if (isEcommerceForContext && session.complaint_state?.active) {
			const imgCount = session.complaint_state.images_collected?.length || 0;
			let orderNum = session.complaint_state.order_number;
			const complaintType = session.complaint_state.type || 'Unknown';
			
			// Also check if user's current message looks like an order number
			const orderPattern = /\b(\d{5,8}|CZ-?\d{5,8})\b/i;
			const orderMatch = message.match(orderPattern);
			if (!orderNum && orderMatch) {
				orderNum = orderMatch[1];
				console.log(`📋 Detected order number in message: ${orderNum}`);
				
				// Update complaint state with order number
				session.complaint_state.order_number = orderNum;
				await this._updateSessionComplaintState(session.id, session.complaint_state);
			}
			
			let complaintContext;
			
			if (imgCount === 0) {
				// No images yet - guide LLM to ask for images
				complaintContext = `
[SYSTEM NOTE - ACTIVE COMPLAINT]:
- Complaint type: ${complaintType}
- Status: Waiting for evidence images

⚠️ CRITICAL INSTRUCTIONS:
1. Customer has filed a complaint about: ${complaintType}
2. You MUST ask customer to share pictures/photos of the issue
3. DO NOT ask for email or phone number - we already have that
4. DO NOT create ticket yet - we need images first
5. Keep response short and focused on getting images

Example response: "I understand you received the wrong color. Please share pictures of the product you received so we can process your complaint."`;
			} else if (!orderNum) {
				// Have images, need order number
				complaintContext = `
[SYSTEM NOTE - COMPLAINT STATE]:
- Active complaint: ${complaintType}
- Images already collected: ${imgCount} image(s) ✅
- Order number: Not provided yet

⚠️ CRITICAL INSTRUCTIONS:
1. Customer has ALREADY shared ${imgCount} image(s)
2. DO NOT ask for images again
3. DO NOT ask for email or phone - we already have that
4. Ask for Order Number/ID only
5. Keep response short

Example response: "Thank you for the pictures. Please share your order number so I can create a complaint ticket."`;
			} else {
				// Have both images and order - ready for ticket
				complaintContext = `
[SYSTEM NOTE - COMPLAINT STATE]:
- Active complaint: ${complaintType}
- Images already collected: ${imgCount} image(s) ✅
- Order number: ${orderNum} ✅

⚠️ CRITICAL: Customer has already shared ${imgCount} image(s) AND order number ${orderNum}.
DO NOT ask for images, order number, email, or phone again. 
You MUST proceed to create the ticket now using create_ticket function with:
- order_no: "${orderNum.replace(/^CZ-?/i, '')}"
- ticket_type: "Product"
- ticket_sub_type: "${complaintType}"`;
			}

			// Insert complaint context as a system message before user's message
			messages.splice(messages.length - 1, 0, {
				role: 'system',
				content: complaintContext
			});
			
			console.log(`📷 Injected complaint context: ${imgCount} images, order: ${orderNum || 'pending'}`);
		}

		//console.log(systemPrompt)
		//console.log(messages);
		
		// ============================================
		// 🤖 STEP 4: CALL LLM (With selected model)
		// ============================================
		console.log(`🚀 Calling LLM: ${selectedModel} (${classification.intent}/${classification.complexity})`);

		const completion = await this._callLLM(messages, {
			model: selectedModel,
			temperature: parseFloat(agent.temperature) || 0.7,
			max_tokens: agent.max_tokens || 4096,
			json_mode: true
		});

		const aiMessage = { content: completion.content };

		// Cost already calculated by LLMService - add classification cost
		let llmCost = completion.cost;
		if (classificationCost > 0) {
			llmCost.final_cost = (llmCost.final_cost || 0) + classificationCost;
			llmCost.classification_cost = classificationCost;
			console.log(`💰 Added classification cost: $${classificationCost.toFixed(6)}`);
		}

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
			// 📅 VALIDATE DATE-BASED REASONING
			// ============================================
			const dateValidation = this._validateDateReasoning(llmDecision);
			
			if (dateValidation.checked && !dateValidation.valid) {
				console.log('🔄 Correcting LLM date reasoning error...');
				
				// Check if LLM wrongly approved something that should be rejected
				if (dateValidation.llm_values.validation_passed && !dateValidation.corrected.validation_passed) {
					console.log('🚨 LLM incorrectly approved - generating rejection');
					
					// Generate rejection using the policy info from LLM's own response
					llmDecision.response = this._generatePolicyRejectionMessage(
						dateValidation,
						llmDecision.complaint_context
					);
					
					// Prevent further processing
					llmDecision.function_call_needed = false;
					llmDecision.knowledge_search_needed = false;
					llmDecision.product_search_needed = false;
					llmDecision.conversation_complete = true;
					
					console.log('✅ Response corrected to rejection');
				}
				
				// Update the validation object with corrected values
				llmDecision.date_validation = {
					...llmDecision.date_validation,
					...dateValidation.corrected,
					was_corrected: true,
					original_values: dateValidation.llm_values
				};
			}

			// ============================================
			// 📷 OVERRIDE: E-commerce complaint flow safeguard
			// ============================================
			// Only apply to e-commerce agents (Shopify connected)
			const isEcommerceAgent = agent.shopify_store_url && agent.shopify_access_token;
			
			// ============================================
			// 🚨 CRITICAL: Prevent repeated order status checks during complaints
			// ============================================
			// If user is complaining AND LLM wants to call check_order_status AGAIN,
			// override to create_ticket instead
			if (isEcommerceAgent && 
				['COMPLAINT_NEW', 'COMPLAINT_CONTINUE'].includes(classification?.intent) &&
				llmDecision.function_call_needed && 
				llmDecision.function_name === 'check_order_status') {
				
				// Check if we recently showed order status (in last 3 assistant messages)
				const recentAssistantMsgs = history.filter(m => m.role === 'assistant').slice(-3);
				const recentlyShowedOrder = recentAssistantMsgs.some(m => 
					m.content?.includes('Order Number') || 
					m.content?.includes('CZ-') ||
					m.content?.includes('Tracking') ||
					m.content?.includes('shipped')
				);
				
				// Extract order number from history
				const historyText = history.map(h => h.content || '').join(' ');
				const orderMatch = historyText.match(/CZ-?(\d{5,8})/i);
				const orderNumber = orderMatch ? orderMatch[1] : null;
				
				if (recentlyShowedOrder && orderNumber) {
					console.log(`🚨 OVERRIDE: User complaining after seeing order ${orderNumber} - switching from check_order_status to create_ticket`);
					
					// Override to create ticket instead of checking order again
					llmDecision.function_name = 'create_ticket';
					llmDecision.function_arguments = {
						event: 'create_ticket',
						order_no: orderNumber,
						ticket_type: 'Product',
						ticket_sub_type: 'Courier Related',  // Default for "not received"
						customer_phone: channelInfo?.channelUserId || llmDecision.function_arguments?.phone || null,
						customer_name: channelInfo?.channelUserName || null
					};
					llmDecision.response = "I understand you haven't received your order. Let me create a complaint ticket for you so our team can investigate this.";
					
					console.log(`📋 New function: create_ticket with order ${orderNumber}`);
				}
			}
			
			if (isEcommerceAgent && session.complaint_state?.active) {
				const hasImages = session.complaint_state?.images_collected?.length > 0;
				
				// Get order number from state OR detect from current message
				let detectedOrderNum = session.complaint_state?.order_number;
				if (!detectedOrderNum && hasImages) {
					const orderPattern = /\b(\d{5,8}|CZ-?\d{5,8})\b/i;
					const orderMatch = message.match(orderPattern);
					if (orderMatch) {
						detectedOrderNum = orderMatch[1];
					}
				}
				
				// Use LLM's structured output instead of keyword parsing
				const complaintContext = llmDecision.complaint_context || {};
				const isLLMAskingForImages = complaintContext.awaiting_more_images === true ||
											 complaintContext.ready_for_ticket === false && !complaintContext.order_number;
				
				// If we have both images AND order, but LLM still not triggering ticket creation
				if (hasImages && detectedOrderNum && !llmDecision.function_call_needed) {
					// Check if LLM didn't realize we have everything needed
					const shouldCreateTicket = isLLMAskingForImages || 
											   (complaintContext.ready_for_ticket === false && hasImages);
					
					if (shouldCreateTicket) {
						console.log(`⚠️ E-commerce override: Have ${session.complaint_state.images_collected.length} images + order ${detectedOrderNum}`);
						console.log(`🔄 Triggering create_ticket function`);
						
						// Override to create ticket
						llmDecision.function_call_needed = true;
						llmDecision.function_name = 'create_ticket';
						llmDecision.function_arguments = {
							event: 'create_ticket',
							order_no: detectedOrderNum.replace(/^CZ-?/i, ''),
							ticket_type: 'Product',
							ticket_sub_type: session.complaint_state.type || 'Unknown',
							image_urls: session.complaint_state.images_collected.map(img => img.url),
							customer_phone: channelInfo?.channelUserId || null,
							customer_name: channelInfo?.channelUserName || null
						};
						llmDecision.response = "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [Ticket Number]. Our team will contact you shortly.";
					}
				}
			}

			// ============================================
			// 🚨 EMPTY RESPONSE FALLBACK (SMART)
			// ============================================
			if (!llmDecision.response || llmDecision.response.trim() === '') {
				console.log('⚠️ LLM returned empty response - checking for actionable data...');
				
				// Check if agent has Shopify integration
				const hasShopify = agent.shopify_store_url && agent.shopify_access_token;
				
				// ============================================
				// CASE 1: LLM provided order_number - ONLY for Shopify agents
				// ============================================
				if (hasShopify && llmDecision.order_number && !llmDecision.function_call_needed) {
					console.log('🔧 LLM provided order_number without response - auto-triggering check_order_status');
					
					llmDecision.function_call_needed = true;
					llmDecision.function_name = 'check_order_status';
					llmDecision.function_arguments = {
						order_number: llmDecision.order_number,
						email: llmDecision.email || null,
						phone: llmDecision.phone || null
					};
					llmDecision.response = "Let me check your order status...";
				}
				// ============================================
				// CASE 2: LLM provided complaint context - ONLY for Shopify agents
				// ============================================
				else if (hasShopify && llmDecision.complaint_context && llmDecision.complaint_context.order_number) {
					console.log('📋 LLM provided complaint context - generating acknowledgment');
					
					const orderNum = llmDecision.complaint_context.order_number;
					llmDecision.function_call_needed = true;
					llmDecision.function_name = 'check_order_status';
					llmDecision.function_arguments = { order_number: orderNum };
					llmDecision.response = "Let me look up your order details...";
				}
				// ============================================
				// CASE 3: LLM wants to call a function but no response
				// ============================================
				else if (llmDecision.function_call_needed && llmDecision.function_name) {
					console.log('🔧 LLM wants function call but no response - generating placeholder');
					llmDecision.response = "Let me help you with that...";
				}
				// ============================================
				// CASE 4: Trivial messages (greetings, thanks, bye)
				// ============================================
				else if (this._isTrivialMessage(message)) {
					const lowerMsg = message.toLowerCase().trim();
					
					if (/^(hi|hello|hey|hii+|helo+|assalam|aoa|salam)/i.test(lowerMsg)) {
						llmDecision.response = agent.greeting || "Hello! How can I help you today?";
						console.log('👋 Using greeting response');
					} else if (/^(thanks|thank|shukriya|thx|ty)/i.test(lowerMsg)) {
						llmDecision.response = "You're welcome! Is there anything else I can help you with?";
					} else if (/^(bye|goodbye|allah\s*hafiz|khuda\s*hafiz)/i.test(lowerMsg)) {
						llmDecision.response = "Goodbye! Feel free to reach out if you need any help. Allah Hafiz!";
						llmDecision.conversation_complete = true;
						llmDecision.user_wants_to_end = true;
					} else {
						llmDecision.response = "I understand. How can I assist you further?";
					}
				}
				// ============================================
				// CASE 5: Looks like order identifier - ONLY for Shopify agents
				// ============================================
				else if (hasShopify && this._looksLikeOrderIdentifier(message)) {
					console.log('🔍 Message looks like order identifier - auto-triggering lookup');
					
					const identifier = this._parseOrderIdentifier(message);
					llmDecision.function_call_needed = true;
					llmDecision.function_name = 'check_order_status';
					llmDecision.function_arguments = identifier;
					llmDecision.response = "Let me look that up for you...";
				}
				// ============================================
				// CASE 6: Truly empty - ask for clarification
				// ============================================
				else {
					llmDecision.response = "I apologize, but I couldn't process that properly. Could you please provide more details or rephrase your request?";
					console.log('❌ Empty response with no actionable data - using fallback');
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
			
			// ============================================
			// 🔍 FORCE KB SEARCH FOR KNOWLEDGE_QUERY INTENT
			// ============================================
			// If classifier determined this is a knowledge query, force KB search
			if (classification?.intent === 'KNOWLEDGE_QUERY' && 
				agent.kb_id && 
				!llmDecision.knowledge_search_needed &&
				searchMode !== 'never') {
				
				console.log('🔍 [OVERRIDE] KNOWLEDGE_QUERY intent detected → Forcing KB search');
				llmDecision.knowledge_search_needed = true;
				llmDecision.knowledge_search_query = llmDecision.knowledge_search_query || message;
				
				// Also prevent premature agent transfer
				if (llmDecision.agent_transfer && !llmDecision.knowledge_search_needed) {
					console.log('🚫 [OVERRIDE] Preventing agent_transfer before KB search');
					llmDecision.agent_transfer = false;
				}
			}
			
			// ============================================
			// 🚫 PREVENT AGENT TRANSFER WITHOUT SEARCHING FIRST
			// ============================================
			// If LLM wants to transfer but hasn't searched KB yet, force search first
			if (llmDecision.agent_transfer && 
				agent.kb_id && 
				!llmDecision.knowledge_search_needed &&
				searchMode !== 'never' &&
				!isTrivialMsg) {
				
				console.log('🔍 [OVERRIDE] Preventing agent_transfer - forcing KB search first');
				llmDecision.agent_transfer = false;
				llmDecision.knowledge_search_needed = true;
				llmDecision.knowledge_search_query = llmDecision.knowledge_search_query || message;
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
		// 📝 TRACK COMPLAINT STATE FROM LLM RESPONSE
		// ============================================
		// Check if LLM is asking for complaint images or if complaint context changed
		const updatedComplaintState = await this._checkAndUpdateComplaintState(
			sessionId,
			llmDecision,
			session.complaint_state
		);

		if (updatedComplaintState && updatedComplaintState.awaiting_images) {
			console.log('📷 Bot is now awaiting complaint images');
		}

		// ============================================
		// 🚨 HALLUCINATION PREVENTION: Force check_order_status
		// ============================================
		// If user provided an order number and LLM responded with order details
		// but DIDN'T call check_order_status, the LLM is hallucinating!
		const hasShopifyForHallCheck = agent.shopify_store_url && agent.shopify_access_token;
		
		if (hasShopifyForHallCheck && 
			classification?.intent === 'ORDER_STATUS' && 
			!llmDecision.function_call_needed) {
			
			// Check if user message looks like an order number
			const orderNumberMatch = message.match(/\b(\d{5,8}|CZ-?\d{5,8})\b/i);
			
			// Check if LLM response contains order details (likely hallucinated)
			const responseHasOrderDetails = llmDecision.response && (
				llmDecision.response.includes('Order Number:') ||
				llmDecision.response.includes('CZ-') ||
				llmDecision.response.includes('Tracking ID:') ||
				llmDecision.response.includes('Shipped') ||
				llmDecision.response.includes('Delivered') ||
				llmDecision.response.match(/LE\d{10}/i)  // Leopards tracking pattern
			);
			
			if (orderNumberMatch && responseHasOrderDetails) {
				console.log(`🚨 HALLUCINATION DETECTED: LLM provided order details without calling check_order_status!`);
				console.log(`📋 Forcing check_order_status for order: ${orderNumberMatch[1]}`);
				
				// Override to force function call
				llmDecision.function_call_needed = true;
				llmDecision.function_name = 'check_order_status';
				llmDecision.function_arguments = {
					order_number: orderNumberMatch[1].replace(/^CZ-?/i, '')
				};
				llmDecision.response = "Let me check your order status...";
			} else if (orderNumberMatch && !llmDecision.function_call_needed) {
				// User provided order number but LLM didn't call function
				console.log(`📋 Order number detected but function not called - triggering check_order_status`);
				
				llmDecision.function_call_needed = true;
				llmDecision.function_name = 'check_order_status';
				llmDecision.function_arguments = {
					order_number: orderNumberMatch[1].replace(/^CZ-?/i, '')
				};
				llmDecision.response = "Let me look up your order...";
			}
		}

		// ============================================
		// 🔧 HANDLE FUNCTION CALLS (from JSON decision)
		// ============================================
		let executedFunctionCalls = [];

		if (llmDecision && llmDecision.function_call_needed && llmDecision.function_name) {
			console.log(`🔧 Function call requested: ${llmDecision.function_name}`);
			console.log(`📋 Arguments:`, llmDecision.function_arguments);
			
			// ============================================
			// 🔄 AUTO-INJECT STATIC/DERIVABLE PARAMETERS
			// ============================================
			if (!llmDecision.function_arguments) {
				llmDecision.function_arguments = {};
			}
			
			// Auto-inject for create_ticket function
			if (llmDecision.function_name === 'create_ticket') {
				const args = llmDecision.function_arguments;
				
				// 1. Static: event is always "create_ticket"
				if (!args.event) {
					args.event = 'create_ticket';
					console.log('📝 Auto-injected: event = "create_ticket"');
				}
				
				// 2. Derive ticket_type from context (default to "Product" for product issues)
				if (!args.ticket_type) {
					args.ticket_type = 'Product';  // Default - most complaints are product-related
					console.log('📝 Auto-injected: ticket_type = "Product"');
				}
				
				// 3. Derive ticket_sub_type from context/complaint keywords
				if (!args.ticket_sub_type) {
					const msgLower = message.toLowerCase();
					const historyText = history.slice(-5).map(h => h.content || '').join(' ').toLowerCase();
					const context = msgLower + ' ' + historyText;
					
					if (context.includes('not received') || context.includes('nahi mila') || context.includes('haven\'t received') || context.includes('didn\'t receive') || context.includes('delivery')) {
						args.ticket_sub_type = 'Courier Related';
					} else if (context.includes('damaged') || context.includes('broken') || context.includes('toot')) {
						args.ticket_sub_type = 'Damaged Article';
					} else if (context.includes('wrong color') || context.includes('color') || context.includes('galat color')) {
						args.ticket_sub_type = 'Color Issue';
					} else if (context.includes('missing') || context.includes('incomplete')) {
						args.ticket_sub_type = 'Missing Article';
					} else if (context.includes('courier') || context.includes('delivery') || context.includes('leopard')) {
						args.ticket_sub_type = 'Courier Related';
					} else if (context.includes('store') || context.includes('staff') || context.includes('service')) {
						args.ticket_sub_type = 'Store Related';
					} else {
						args.ticket_sub_type = 'Courier Related';  // Default for "not received" type issues
					}
					console.log(`📝 Auto-derived: ticket_sub_type = "${args.ticket_sub_type}"`);
				}
				
				// 4. Auto-inject order_no from recent context if available
				if (!args.order_no) {
					// Check history for order numbers mentioned
					const historyText = history.slice(-5).map(h => h.content || '').join(' ');
					const orderMatch = historyText.match(/CZ-?(\d{5,8})/i) || historyText.match(/Order Number:?\s*CZ-?(\d{5,8})/i);
					if (orderMatch) {
						args.order_no = orderMatch[1];
						console.log(`📝 Auto-injected from context: order_no = "${args.order_no}"`);
					}
				}
				
				// 5. Auto-inject customer info from channelInfo if not provided
				if (!args.customer_phone && channelInfo?.channelUserId) {
					args.customer_phone = channelInfo.channelUserId;
					console.log(`📝 Auto-injected from channel: customer_phone = "${args.customer_phone}"`);
				}
				if (!args.customer_name && channelInfo?.channelUserName) {
					args.customer_name = channelInfo.channelUserName;
					console.log(`📝 Auto-injected from channel: customer_name = "${args.customer_name}"`);
				}
				
				console.log(`📋 Final create_ticket arguments:`, args);
			}
			
			// ============================================
			// 🛡️ GUARD: Don't call function if required arguments are missing
			// ============================================
			const shouldSkipFunction = this._shouldSkipFunctionCall(
				llmDecision.function_name, 
				llmDecision.function_arguments,
				agent
			);
			
			if (shouldSkipFunction.skip) {
				console.log(`⏭️ Skipping function call: ${shouldSkipFunction.reason}`);
				llmDecision.function_call_needed = false;
				// Keep the response as-is (LLM already asked for the missing info)
			} else {
				
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
						
						console.log(`✅ Function executed:`, llmDecision.function_name, JSON.stringify(functionResult));
						
						executedFunctionCalls.push({
							function_id: uuidv4(),
							function_name: llmDecision.function_name,
							arguments: llmDecision.function_arguments,
							result: functionResult,
							status: 'success'
						});
						
						// ============================================
						// 🎫 CLEAR COMPLAINT STATE AFTER TICKET CREATION
						// ============================================
						if (llmDecision.function_name === 'create_ticket' && functionResult.success) {
							const ticketNumber = functionResult.result?.ticketNumber || 
											   functionResult.result?.id || 
											   functionResult.ticket_number ||
											   functionResult.data?.ticket_number;
							
							if (ticketNumber) {
								console.log(`🎫 Ticket created successfully: ${ticketNumber} - clearing complaint state`);
								await this._clearComplaintState(sessionId);
								session.complaint_state = null;  // Clear local reference too
							}
						}
						
						await db.query(
							`UPDATE yovo_tbl_aiva_chat_sessions 
							 SET last_function_executed_at = NOW() 
							 WHERE id = ?`,
							[sessionId]
						);
						console.log('📍 Marked function execution time');
						// ============================================
						// 📝 SAVE ORDER INFO TO COMPLAINT STATE
						// ============================================
						// If we're in an active complaint and just looked up an order,
						// save the order details to complaint state for later use
						if (llmDecision.function_name === 'check_order_status' && 
							session.complaint_state?.active && 
							functionResult.success && 
							functionResult.found && 
							functionResult.order?.order_number) {
							
							const updatedComplaintState = {
								...session.complaint_state,
								order_number: functionResult.order.order_number,
								delivery_date: functionResult.order.delivery_date || null,
								customer_name: functionResult.order.customer_name || null,
								customer_email: functionResult.order.customer_email || null,
								customer_phone: functionResult.order.customer_phone || null
							};
							await this._updateSessionComplaintState(sessionId, updatedComplaintState);
							console.log(`📝 Saved order ${functionResult.order.order_number} to complaint state`);
							
							// Also update the local session object for this request
							session.complaint_state = updatedComplaintState;
						}
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
								content: `[FUNCTION RESULT for ${llmDecision.function_name}]:
							${JSON.stringify(functionResult, null, 2)}

							${session.complaint_state?.active ? `
⚠️ ACTIVE COMPLAINT CONTEXT: ${session.complaint_state.type || 'Unknown'}
- Current Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
- Note: Process all complaints regardless of time elapsed. The 48-hour policy is informational only.
` : ''}

RESPONSE INSTRUCTIONS:
1. If result contains any ID/number (ticket_number, order_number, etc.), your response MUST include it
2. Keep response SHORT and DIRECT - no extra commentary
3. Match customer's language (English or Roman Urdu). Must respond in the same language
4. Do NOT set function_call_needed=true

IMPORTANT: If result has success=true with a ticket_number:
- English: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [Ticket Number]. Our team will contact you shortly."
- Urdu: "Hum mazarat khuwan hai ap ki is pareshani ki waja say. Ap ka concern note kar leya gya hai. Aapka ticket number [NUMBER] hai. Humari team jald az jald aap se contact karegi."

Respond in valid JSON format.`
}
						];
						
						const functionFollowupCompletion = await this._callLLM(messagesWithFunctionResult, {
							model: selectedModel,
							temperature: parseFloat(agent.temperature) || 0.7,
							max_tokens: agent.max_tokens || 4096,
							json_mode: true
						});

						// Cost already calculated by LLMService
						const secondCallCost = functionFollowupCompletion.cost;
						
						console.log('💰 Function followup LLM cost:', secondCallCost.final_cost);
						llmCost = CostCalculator.combineCosts([llmCost, secondCallCost]);
						
						// Parse final response
						try {
							const finalDecision = JSON.parse(functionFollowupCompletion.content);
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
							
							const customerLanguage = this._detectCustomerLanguage(history, message);
							llmDecision.response = this._sanitizeTicketResponse(
								llmDecision.response,
								functionResult,
								llmDecision.function_name,
								customerLanguage
							);
							
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
					
						await db.query(
							`UPDATE yovo_tbl_aiva_chat_sessions 
							 SET last_function_executed_at = NOW() 
							 WHERE id = ?`,
							[sessionId]
						);
						console.log('📍 Marked function execution time');


						// Update response to indicate failure
						llmDecision.response = "I apologize, but I encountered an issue while processing your request. Please try again or let me know how else I can help.";
					}
				} else {
					console.warn(`⚠️ Function not found or inactive: ${llmDecision.function_name}`);
					llmDecision.response = "I apologize, but I'm unable to perform that action at the moment. How else can I help you?";
				}
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
					const finalCompletion = await this._callLLM(messagesWithContext, {
						model: selectedModel,
						temperature: parseFloat(agent.temperature) || 0.7,
						max_tokens: 2048,
						json_mode: true
					});

					const finalMessage = { content: finalCompletion.content };
					const finishReason = 'stop'; // LLMService handles this internally
					
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
						const secondCallCost = finalCompletion.cost;

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
                    topK: 10,
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
CRITICAL INSTRUCTIONS FOR ANSWERING:
1. EXTRACT SPECIFIC FACTS: Quote exact numbers, names, prices, features from the results
2. BE PRECISE: If results mention "Free Version, Trial Version, Personal" - count them and say "there are 3 versions"
3. USE THE DATA: Don't say "not specified" if the information IS in the results, even partially
4. COMBINE INFORMATION: If data is spread across multiple sources, combine it into one answer
5. LIST WHAT YOU FOUND: If asked "how many packages", list each one you see in the results
6. CONFIDENCE: If you see specific data in results, state it confidently without hedging

WRONG: "The exact number is not specified in the available information"
RIGHT: "Based on the information, there are 4 packages: Free Version, Trial Version (14 days), Personal (Rs. 2,100/month), and Enterprise"

Answer the user's question using ONLY the search results above.
DO NOT say "I need to search" - you already have the results.
DO NOT set knowledge_search_needed=true again.

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
						const finalCompletion = await this._callLLM(messagesWithContext, {
							model: selectedModel,
							temperature: parseFloat(agent.temperature) || 0.7,
							max_tokens: 4096,
							json_mode: true
						});

						const finalMessage = { content: finalCompletion.content };
						const finishReason = 'stop';
						
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
							const secondCallCost = finalCompletion.cost;

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
		
		releaseLock();
		
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
                model: selectedModel,
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

		const languageEnforcement = `
		⚠️ CRITICAL LANGUAGE RULES (CHECK BEFORE EVERY RESPONSE):
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		BANNED HINDI WORDS - NEVER USE THESE:
		❌ kripya → ✅ please / meherbani se
		❌ dhanyavaad → ✅ shukriya / thank you
		❌ namaste → ✅ Assalam-o-Alaikum / Hello
		❌ swagat → ✅ khush aamdeed / welcome
		❌ sahayata → ✅ madad / help
		❌ uplabdh → ✅ available / dastiyab
		❌ jankari → ✅ maloomat / information
		❌ vishesh → ✅ khaas / special
		❌ sampark → ✅ rabta / contact

		LANGUAGE MATCHING:
		- Customer writes in English → Reply 100% in English
		- Customer writes in Urdu/Roman Urdu → Reply in Roman Urdu (Pakistani)
		
		BEFORE GENERATING ANY RESPONSE, CHECK THE CUSTOMER'S LANGUAGE:

		1. Customer's message is in ENGLISH → Your ENTIRE response MUST be in ENGLISH
		2. Customer's message is in URDU/Roman Urdu → Your ENTIRE response MUST be in Roman Urdu
		3. If mixed → Use the DOMINANT language

		⚠️ The examples in these instructions show responses in ONE language for illustration.
		   YOU MUST TRANSLATE the example response to match the customer's language!

		SELF-CHECK:
		- What language did customer use? → [detect]
		- Is my response in that same language? → [verify]
		- If NO → REWRITE in correct language before responding
		━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

		`;

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
		
		systemPrompt = dateHeader + languageEnforcement + systemPrompt;
		
		const stayInRoleInstructions = `
============================================================
🎯 CRITICAL: ONLY ANSWER FROM YOUR INSTRUCTIONS & KNOWLEDGE BASE
============================================================
You are a specialized agent. You can ONLY help with topics covered in:
1. Your base instructions (above)
2. Your knowledge base (if available)

FOR ANY QUESTION OR REQUEST NOT COVERED IN YOUR INSTRUCTIONS OR KNOWLEDGE BASE:
- Do NOT attempt to answer from your general knowledge
- Do NOT make up information
- Follow the fallback/escalation instructions defined in your base instructions above
- If no fallback is defined, politely acknowledge the request and offer to forward it to the appropriate team
============================================================
`;
		
		const fallbackEnforcementInstructions = `
============================================================
⚠️ CRITICAL: FALLBACK BEHAVIOR FOR UNCOVERED REQUESTS
============================================================

WHEN A REQUEST IS NOT EXPLICITLY COVERED IN YOUR BASE INSTRUCTIONS:

1. DO NOT say "I cannot help", "I'm unable to", "I cannot update", etc.
2. DO NOT redirect to website for requests that need human attention
3. DO NOT refuse or decline the request

INSTEAD, YOU MUST:
1. Acknowledge the request politely
2. Say you have noted it and forwarded to the team
3. Set agent_transfer = true in your JSON response

MANDATORY RESPONSE FORMAT FOR UNCOVERED REQUESTS:

English:
{
  "response": "I have noted down your request and forwarded it to our customer service team. Our team will get back to you shortly.",
  "agent_transfer": true,
  "conversation_complete": false,
  "user_wants_to_end": false
}

Urdu:
{
  "response": "Aapki request note kar li gayi hai aur humari customer service team ko forward kar di gayi hai. Humari team jald aap se contact karegi.",
  "agent_transfer": true,
  "conversation_complete": false,
  "user_wants_to_end": false
}

EXAMPLES OF REQUESTS THAT NEED FALLBACK:
- Change contact number/address on order
- Order modification requests
- Payment issues not in instructions
- Account-related queries
- Refund requests outside normal policy
- Any request requiring manual intervention

FORBIDDEN RESPONSES:
❌ "I cannot help with this"
❌ "I'm unable to update..."
❌ "Please contact customer support through our website"
❌ "This is outside my scope"
❌ Any refusal or decline

✅ ALWAYS acknowledge + forward + set agent_transfer = true

============================================================
`;

		// ============================================
		// 📱 CHANNEL CONTEXT INJECTION
		// ============================================
		let channelContextPrompt = '';
		if (agent?.sessionContext) {
			const ctx = agent.sessionContext;
			
			channelContextPrompt = `
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
			if (ctx.channel_user_id) {
				channelContextPrompt += `Caller ID: ${ctx.channel_user_id}\n`;
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
		}
		
		systemPrompt += channelContextPrompt;
		systemPrompt += stayInRoleInstructions;
		systemPrompt += fallbackEnforcementInstructions;
		systemPrompt += this._getDateValidationInstructions();
		
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
	
	}
		// ============================================
		// 🔍 DETECT WHAT USER HAS ALREADY DEFINED
		// ============================================
		const coverage = this._detectInstructionCoverage(baseInstructions);
		
		//console.log('📋 Instruction coverage:', JSON.stringify(coverage));

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
	  
	  // ============================================
      // 🆕 DATE VALIDATION (Required for time-based policies)
      // ============================================
      "date_validation": {
        "required": false,
        "policy_type": null,
        "current_date": null,
        "comparison_date": null,
        "days_elapsed": null,
        "threshold_days": null,
        "threshold_description": null,
        "validation_passed": null,
        "calculation_shown": null
      },
     
      // 🆕 COMPLAINT CONTEXT (Required for complaints)
      "complaint_context": {
        "complaint_type": null,
        "requires_date_check": false,
        "order_number": null,
        "delivery_date": null,
        "delivery_status": null
      }
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
	 - You must always follow the instructions and knowledge base. Never ever generate response to the questions which are not covered in instructions or Knowledge base

	ORDER PROCESSING RULES:
	1. Check if you have order functions → Use them
	2. Check your instructions for order process → Follow them
	3. If you have Shopify products → Share purchase URLs
	4. If none of above → Offer human agent transfer
	5. NEVER generate fake order confirmations

	STRICTLY OFF-LIMITS TOPICS (ALWAYS DECLINE):
	- You must always follow the instructions and knowledge base. Never ever generate response to the questions which are not covered in instructions or Knowledge base
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
				const paramNames = fn.parameters?.properties 
					? Object.keys(fn.parameters.properties) 
					: [];
				const requiredParams = fn.parameters?.required || [];
				
				instructions += `
			${index + 1}. **${fn.name}**
			   Description: ${fn.description || 'No description provided'}
			   Parameters: ${JSON.stringify(fn.parameters || {}, null, 2).split('\n').map((line, i) => i === 0 ? line : '   ' + line).join('\n')}
			   
			   ⚠️ EXACT parameter names to use: ${paramNames.map(p => `"${p}"`).join(', ')}
			   ${requiredParams.length > 0 ? `Required: ${requiredParams.map(p => `"${p}"`).join(', ')}` : ''}
			`;
			});

				let exampleArgs = '{}';
				if (activeFunctions.length > 0) {
					const firstFunc = activeFunctions[0];
					const props = firstFunc.parameters?.properties || {};
					const exampleObj = {};
					for (const [paramName, paramDef] of Object.entries(props)) {
						// Create example value based on type
						if (paramDef.type === 'string') {
							exampleObj[paramName] = `<${paramName}_value>`;
						} else if (paramDef.type === 'number' || paramDef.type === 'integer') {
							exampleObj[paramName] = 0;
						} else if (paramDef.type === 'boolean') {
							exampleObj[paramName] = true;
						} else if (paramDef.type === 'array') {
							exampleObj[paramName] = [];
						} else {
							exampleObj[paramName] = `<${paramName}_value>`;
						}
					}
					exampleArgs = JSON.stringify(exampleObj, null, 4);
				}

				instructions += `

		--------------------------------------------------------------------
		HOW TO CALL A FUNCTION
		--------------------------------------------------------------------

		When you need to call a function, include these fields in your JSON response:

		{
		  "response": "Brief message to user",
		  "function_call_needed": true,
		  "function_name": "exact_function_name",
		  "function_arguments": ${exampleArgs}
		}

		⚠️ CRITICAL: Use the EXACT parameter names from the function schema above.
		   - If schema says "orderno" → use "orderno" (NOT "order_no" or "order_number")
		   - If schema says "ticketsubtype" → use "ticketsubtype" (NOT "ticket_sub_type")
		   - Copy parameter names EXACTLY as shown in the Parameters JSON above.
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
	 * Get conversation history with context-aware limiting
	 * @param {string} sessionId - Session ID
	 * @param {number} limit - Number of messages
	 * @param {Object} session - Session object (optional, for optimization)
	 * @returns {Promise<Array>} Messages
	 */
	async getConversationHistory(sessionId, limit = 20, session = null) {
		// ============================================
		// 📍 CONTEXT-AWARE HISTORY LIMITING
		// ============================================
		// After function execution, limit history to prevent
		// LLM confusion with resolved contexts (e.g., complaints)
		
		let effectiveLimit = limit;
		
		try {
			// Get session if not provided
			if (!session) {
				const [sessions] = await db.query(
					`SELECT last_function_executed_at FROM yovo_tbl_aiva_chat_sessions WHERE id = ?`,
					[sessionId]
				);
				session = sessions[0];
			}
			
			if (session?.last_function_executed_at) {
				const timeSinceFunction = Date.now() - new Date(session.last_function_executed_at).getTime();
				const minutesSinceFunction = timeSinceFunction / 60000;
				
				// If function was executed in last 5 minutes, limit history
				if (minutesSinceFunction < 5) {
					effectiveLimit = Math.min(limit, 4);
					console.log(`📍 Limiting history to ${effectiveLimit} - function executed ${Math.round(minutesSinceFunction)} min ago`);
				}
			}
		} catch (e) {
			// On error, use default limit
			console.warn('Could not check function execution time:', e.message);
		}
		
		const [messages] = await db.query(
			`SELECT * FROM yovo_tbl_aiva_chat_messages 
			 WHERE session_id = ? 
			 ORDER BY created_at DESC 
			 LIMIT ?`,
			[sessionId, effectiveLimit]
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

	// ============================================
	// 🎯 SMART MODEL ROUTING SYSTEM
	// ============================================

	/**
	 * Classify message complexity and intent using lightweight LLM call
	 * This determines which model and prompt to use for the main response
	 * 
	 * @param {string} message - User's message
	 * @param {Object} sessionState - Current session state
	 * @param {boolean} hasImage - Whether message includes an image
	 * @param {Array} recentHistory - Last few messages for context
	 * @returns {Promise<Object>} Classification result
	 */
	async _classifyMessageComplexity(message, sessionState, hasImage, recentHistory = []) {
		console.log('🎯 Running lightweight message classification...');
		
		// Build minimal context from recent history
		const historyContext = recentHistory.slice(-3).map(m => 
			`${m.role}: ${(m.content || '').substring(0, 100)}`
		).join('\n');
		
		// Check if we recently discussed an order (for complaint detection)
		const recentAssistantMsg = recentHistory.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
		const discussedOrder = recentAssistantMsg.includes('Order Number') || 
							   recentAssistantMsg.includes('order') ||
							   recentAssistantMsg.includes('CZ-');
		
		// Check if bot ASKED for order status info (not complaint)
		const askedForOrderInfo = recentAssistantMsg.toLowerCase().includes('order id') ||
								  recentAssistantMsg.toLowerCase().includes('order number') ||
								  recentAssistantMsg.toLowerCase().includes('check your order') ||
								  recentAssistantMsg.toLowerCase().includes('order status');
		
		// Check if ticket was just created
		const recentAssistantMsgs = recentHistory.filter(m => m.role === 'assistant').slice(-3);
		const ticketJustCreated = recentAssistantMsgs.some(m => 
			m.content?.toLowerCase().includes('ticket number') || 
			m.content?.includes('ticket_number') ||
			m.content?.includes('CZ-373') ||
			m.content?.toLowerCase().includes('concern note kar') ||
			m.content?.toLowerCase().includes('concern has been noted') ||
			m.content?.toLowerCase().includes('complaint has been registered') ||
			m.content?.toLowerCase().includes('team will contact')
		);
		
		// Check if user's recent message asked for order status (not complaint)
		const recentUserMsgs = recentHistory.filter(m => m.role === 'user').slice(-3);
		const userAskedOrderStatus = recentUserMsgs.some(m => 
			m.content?.toLowerCase().includes('order status') ||
			m.content?.toLowerCase().includes('where is my order') ||
			m.content?.toLowerCase().includes('track my order') ||
			m.content?.toLowerCase().includes('check order')
		);
		
		// Detect complaint keywords in current message
		const msgLower = message.toLowerCase();
		const complaintKeywords = ['not received', 'haven\'t received', 'didn\'t receive', 'wrong', 'damaged', 
								   'broken', 'problem', 'issue', 'complaint', 'missing', 'nahi mila', 'nahi aya'];
		const hasComplaintKeyword = complaintKeywords.some(k => msgLower.includes(k));
		
		// Detect if current message is just a number (order number / phone)
		const isJustNumber = /^\d{5,12}$/.test(message.trim());
		
		// Detect if this is a follow-up question (not a new complaint)
		const isFollowUpQuestion = (
			msgLower.includes('kab tak') ||  // How long
			msgLower.includes('kitna time') ||  // How much time
			msgLower.includes('kitni der') ||  // How long
			msgLower.includes('when will') ||
			msgLower.includes('how long') ||
			msgLower.includes('how much time')
		);
		
		const classifierPrompt = `Classify this customer service message for routing.

CONTEXT:
- Has image: ${hasImage ? 'yes' : 'no'}
- Active complaint: ${sessionState?.complaint_state?.active ? 'yes' : 'no'}
- Images collected: ${sessionState?.complaint_state?.images_collected?.length || 0}
- Order number known: ${sessionState?.complaint_state?.order_number ? 'yes' : 'no'}
- Just discussed order: ${discussedOrder ? 'yes' : 'no'}
- Bot asked for order info: ${askedForOrderInfo ? 'yes' : 'no'}
- User asked for order status recently: ${userAskedOrderStatus ? 'yes' : 'no'}
- Contains complaint words: ${hasComplaintKeyword ? 'yes' : 'no'}
- Message is just a number: ${isJustNumber ? 'yes' : 'no'}
- Ticket was just created: ${ticketJustCreated ? 'yes' : 'no'}
- Is asking about time/duration: ${isFollowUpQuestion ? 'yes' : 'no'}
${historyContext ? `\nRecent conversation:\n${historyContext}` : ''}

MESSAGE: "${message}"

CRITICAL RULES:
1. If user says "not received", "haven't received", "didn't get" AFTER order status was shown → COMPLAINT_NEW
2. If user asked "order status" recently and now provides a number → ORDER_STATUS (not COMPLAINT_CONTINUE)
3. If bot asked for order number FOR ORDER STATUS and user provides number → ORDER_STATUS
4. Only use COMPLAINT_CONTINUE if user is clearly continuing a complaint conversation
5. "ok thanks" or "thanks" = SIMPLE_REPLY, NOT a complaint continuation
6. If ticket was just created and user asks "kab tak" / "how long" → KNOWLEDGE_QUERY (asking about resolution time)
7. If ticket just created and message has "masla" but is a QUESTION about timing → KNOWLEDGE_QUERY, not a new complaint

Classify as ONE of these intents:
- GREETING: Hi, hello, thanks, bye, pleasantries
- ORDER_STATUS: Check order, where is my order, track order, order number provided FOR STATUS CHECK
- PRODUCT_INQUIRY: Price, availability, show products, product questions
- COMPLAINT_NEW: Starting a NEW complaint (not received, damaged, wrong item, problem, issue, missing)
- COMPLAINT_CONTINUE: Continuing existing complaint ONLY IF currently discussing complaint details
- KNOWLEDGE_QUERY: FAQ question, policy question, general information, resolution time questions
- SIMPLE_REPLY: Yes, no, ok, thanks, acknowledgments
- COMPLEX: Multi-part question, ambiguous, needs careful handling

And classify complexity:
- SIMPLE: Greetings, yes/no, single clear intent
- MEDIUM: Order lookup, product search, knowledge query
- COMPLEX: Complaints, multi-step flows, policy decisions, escalations

Reply ONLY with JSON:
{"intent": "...", "complexity": "SIMPLE|MEDIUM|COMPLEX", "reason": "brief explanation", "detected_language": "en|ur"}`;

		try {
			const startTime = Date.now();
			
			const completion = await this._callLLM(
				[{ role: 'user', content: classifierPrompt }],
				{
					model: 'gpt-4o-mini',  // Always use cheapest model for classification
					max_tokens: 80,
					temperature: 0.1,
					json_mode: true
				}
			);
			
			let result = JSON.parse(completion.content);
			const classificationTime = Date.now() - startTime;
			
			// POST-CLASSIFICATION OVERRIDE: Complaint keywords after order discussion = COMPLAINT
			if (hasComplaintKeyword && discussedOrder && result.intent === 'ORDER_STATUS') {
				console.log('🔄 Override: Complaint keywords detected after order discussion → COMPLAINT_NEW');
				result.intent = 'COMPLAINT_NEW';
				result.complexity = 'COMPLEX';
				result.reason = 'User reporting issue after order status shown';
			}
			
			// POST-CLASSIFICATION OVERRIDE: If user asked for order status and provides number, it's ORDER_STATUS
			// BUT ONLY if there's no active complaint
			if (userAskedOrderStatus && isJustNumber && result.intent === 'COMPLAINT_CONTINUE' && 
				!sessionState?.complaint_state?.active) {
				console.log('🔄 Override: User asked for order status then provided number → ORDER_STATUS');
				result.intent = 'ORDER_STATUS';
				result.complexity = 'MEDIUM';
				result.reason = 'User providing order number for status check';
			}
			
			// POST-CLASSIFICATION OVERRIDE: Maintain COMPLAINT_CONTINUE when active complaint
			// If there's an active complaint and user provides order number, keep it as complaint
			if (sessionState?.complaint_state?.active && 
				isJustNumber && 
				result.intent === 'ORDER_STATUS') {
				console.log(`🔄 Override: Active complaint (${sessionState.complaint_state.type}) + order number → COMPLAINT_CONTINUE`);
				result.intent = 'COMPLAINT_CONTINUE';
				result.complexity = 'COMPLEX';
				result.reason = `User providing order number for active ${sessionState.complaint_state.type} complaint`;
			}
			
			// POST-CLASSIFICATION OVERRIDE: Follow-up question after ticket creation
			if (ticketJustCreated && isFollowUpQuestion) {
				if (result.intent === 'COMPLAINT_NEW' || result.intent === 'COMPLAINT_CONTINUE' || result.intent === 'ORDER_STATUS') {
					console.log('🔄 Override: Follow-up question after ticket creation → KNOWLEDGE_QUERY');
					result.intent = 'KNOWLEDGE_QUERY';
					result.complexity = 'SIMPLE';
					result.reason = 'User asking follow-up question about ticket resolution time';
				}
			}
			
			// POST-CLASSIFICATION OVERRIDE: "ok thanks" should be SIMPLE_REPLY
			if (/^(ok|okay|thanks|thank you|alright|shukriya|theek hai)\s*$/i.test(msgLower.trim())) {
				if (result.intent !== 'SIMPLE_REPLY' && result.intent !== 'GREETING') {
					console.log('🔄 Override: Simple acknowledgment → SIMPLE_REPLY');
					result.intent = 'SIMPLE_REPLY';
					result.complexity = 'SIMPLE';
					result.reason = 'Simple acknowledgment message';
				}
			}
			
			// POST-CLASSIFICATION OVERRIDE: Don't classify as complaint if ticket just created
			if (ticketJustCreated && (result.intent === 'COMPLAINT_NEW' || result.intent === 'COMPLAINT_CONTINUE')) {
				console.log('🔄 Override: Ticket just created - treating as follow-up question → KNOWLEDGE_QUERY');
				result.intent = 'KNOWLEDGE_QUERY';
				result.complexity = 'SIMPLE';
				result.reason = 'Post-ticket follow-up question';
			}
			
			console.log(`🎯 Classification: ${result.intent} (${result.complexity}) - ${classificationTime}ms - $${completion.cost?.final_cost?.toFixed(6) || '0'}`);
			console.log(`   Reason: ${result.reason}`);
			
			return {
				intent: result.intent || 'COMPLEX',
				complexity: result.complexity || 'COMPLEX',
				reason: result.reason,
				detected_language: result.detected_language || 'en',
				classification_cost: completion.cost?.final_cost || 0,
				classification_time: classificationTime
			};
			
		} catch (error) {
			console.error('❌ Classification failed, defaulting to COMPLEX:', error.message);
			return {
				intent: 'COMPLEX',
				complexity: 'COMPLEX',
				reason: 'Classification failed - using safe default',
				detected_language: 'en',
				classification_cost: 0,
				classification_time: 0,
				error: error.message
			};
		}
	}

	/**
	 * Select the appropriate model based on classification and agent config
	 * 
	 * @param {Object} classification - Result from _classifyMessageComplexity
	 * @param {Object} agent - Agent configuration
	 * @returns {string} Model identifier to use
	 */
	_selectModelForMessage(classification, agent, session = null) {
		const { intent, complexity } = classification;
		
		// Get the agent's default model (or sensible fallback)
		const defaultModel = agent.chat_model || 'gpt-4o-mini';
		
		// Model tiers from agent config
		// If tier-specific models not set, use agent's default model
		const models = {
			simple: agent.model_simple || defaultModel,
			medium: agent.model_medium || defaultModel,
			complex: agent.model_complex || defaultModel  // Use agent's default, NOT gpt-4o
		};
		
		// Override: If agent only has one model configured, use it for everything
		if (!agent.model_simple && !agent.model_medium && !agent.model_complex) {
			console.log(`🤖 Using agent's default model for all: ${defaultModel}`);
			return defaultModel;
		}
		
		// ============================================
		// 🚨 ACTIVE COMPLAINT OVERRIDE (highest priority)
		// ============================================
		// If there's an active complaint, ALWAYS use complex model
		// This ensures complaint instructions are followed properly
		if (session?.complaint_state?.active) {
			console.log(`🤖 Selected model: ${models.complex} (ACTIVE COMPLAINT: ${session.complaint_state.type} → forced COMPLEX)`);
			return models.complex;
		}
		
		// ============================================
		// INTENT-BASED OVERRIDES (highest priority)
		// ============================================
		// Complaints ALWAYS use complex model regardless of complexity classification
		const alwaysComplexIntents = ['COMPLAINT_NEW', 'COMPLAINT_CONTINUE', 'COMPLEX'];
		if (alwaysComplexIntents.includes(intent)) {
			console.log(`🤖 Selected model: ${models.complex} (intent: ${intent} → forced COMPLEX)`);
			return models.complex;
		}
		
		// Simple intents always use simple model
		const alwaysSimpleIntents = ['GREETING', 'SIMPLE_REPLY'];
		if (alwaysSimpleIntents.includes(intent)) {
			console.log(`🤖 Selected model: ${models.simple} (intent: ${intent} → forced SIMPLE)`);
			return models.simple;
		}
		
		// ============================================
		// COMPLEXITY-BASED SELECTION (for other intents)
		// ============================================
		let selectedModel;
		
		switch (complexity) {
			case 'SIMPLE':
				selectedModel = models.simple;
				break;
			case 'COMPLEX':
				selectedModel = models.complex;
				break;
			default:
				selectedModel = models.medium;
		}
		
		console.log(`🤖 Selected model: ${selectedModel} (intent: ${intent}, complexity: ${complexity})`);
		return selectedModel;
	}

	/**
	 * Build optimized prompt based on classification
	 * Returns smaller, focused prompts for simple intents
	 * 
	 * @param {Object} classification - Result from _classifyMessageComplexity
	 * @param {Object} agent - Agent configuration
	 * @param {Object} session - Current session
	 * @param {boolean} isFirstMessage - Whether this is the first message
	 * @returns {Object} Prompt configuration
	 */
	_buildOptimizedPrompt(classification, agent, session, isFirstMessage) {
		const { intent, complexity, detected_language } = classification;
		
		// Base context every prompt needs
		const baseContext = `You are ${agent.name || 'an AI assistant'}.
Current date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Language: Respond in ${detected_language === 'ur' ? 'Roman Urdu (Pakistani Urdu, NOT Hindi)' : 'English'}`;

		// SIMPLE intents - minimal prompt
		if (complexity === 'SIMPLE' && ['GREETING', 'SIMPLE_REPLY'].includes(intent)) {
			return {
				type: 'minimal',
				systemPrompt: `${baseContext}

${isFirstMessage && agent.greeting ? `Greeting: ${agent.greeting}` : 'Be friendly and helpful. Keep responses brief.'}

Respond naturally and briefly.`,
				includeHistory: false,  // Don't need history for "Hi"
				includeFunctions: false,
				includeJsonFormat: false  // Simple text response is fine
			};
		}
		
		// ORDER_STATUS - focused prompt
		if (intent === 'ORDER_STATUS') {
			return {
				type: 'order_focused',
				systemPrompt: `${baseContext}

TASK: Help customer check their order status.

RULES:
1. If customer provides order number, email, or phone - call check_order_status function
2. If customer just asks "where is my order" on WhatsApp - use their phone number (channelUserId) to search
3. Present order status clearly with: Order Number, Date, Status, Expected Delivery
4. If tracking available, include tracking link

${agent.order_instructions || ''}

Respond in JSON format:
{
  "response": "your response text",
  "function_call_needed": true/false,
  "function_name": "check_order_status",
  "function_arguments": {"order_number": "...", "phone": "...", "email": "..."}
}`,
				includeHistory: true,
				includeFunctions: ['check_order_status'],
				includeJsonFormat: true
			};
		}
		
		// PRODUCT_INQUIRY - focused prompt
		if (intent === 'PRODUCT_INQUIRY') {
			return {
				type: 'product_focused',
				systemPrompt: `${baseContext}

TASK: Help customer find products.

RULES:
1. Search for products based on customer's request
2. Show relevant products with: Name, Price, Available Sizes
3. Include product images when available
4. Provide purchase links

${agent.product_instructions || ''}

Respond in JSON format:
{
  "response": "your response text",
  "product_search_needed": true/false,
  "product_search_query": "search terms",
  "product_search_type": "multi"
}`,
				includeHistory: true,
				includeFunctions: false,
				includeJsonFormat: true
			};
		}
		
		// KNOWLEDGE_QUERY - focused prompt
		if (intent === 'KNOWLEDGE_QUERY') {
			return {
				type: 'knowledge_focused',
				systemPrompt: `${baseContext}

TASK: Answer customer's question from your knowledge base.

${agent.core_instructions || agent.instructions || ''}

If you cannot answer from your knowledge, say so and offer to help differently.

Respond in JSON format:
{
  "response": "your response text",
  "knowledge_search_needed": true/false,
  "knowledge_search_query": "search terms if needed"
}`,
				includeHistory: true,
				includeFunctions: false,
				includeJsonFormat: true
			};
		}
		
		// COMPLAINT_NEW, COMPLAINT_CONTINUE, COMPLEX - full prompt
		// These need the complete agent instructions
		return {
			type: 'full',
			systemPrompt: null,  // Signal to use full _buildSystemPromptWithStrategy
			includeHistory: true,
			includeFunctions: true,
			includeJsonFormat: true,
			useFullPromptBuilder: true
		};
	}

	/**
	 * Check if smart routing is enabled for this agent
	 * 
	 * @param {Object} agent - Agent configuration
	 * @returns {boolean} Whether to use smart routing
	 */
	_isSmartRoutingEnabled(agent) {
		// Smart routing is enabled if:
		// 1. Agent explicitly enables it, OR
		// 2. Agent has different models configured for different tiers
		
		if (agent.smart_routing_enabled === true) return true;
		if (agent.smart_routing_enabled === false) return false;
		
		// Auto-detect: if agent has tier-specific models, enable routing
		const hasTieredModels = agent.model_simple || agent.model_medium || agent.model_complex;
		
		return hasTieredModels;
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
                const axiosConfig = {
					method: func.api_method || 'POST',
					url: url,
					headers: headers,
					data: func.api_method !== 'GET' ? args : undefined,
					timeout: func.timeout_ms || 30000
				};

				// Skip SSL verification if configured (for self-signed certificates)
				if (func.skip_ssl_verify && url.startsWith('https://')) {
					axiosConfig.httpsAgent = new https.Agent({
						rejectUnauthorized: false
					});
					console.log('⚠️ SSL verification disabled for function:', functionName);
				}

				const response = await axios(axiosConfig);
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
                    
					customer_name: order.customer_name || null,
                    customer_first_name: order.customer_first_name || null,
					
                    // Order Details
                    items: formattedItems,
                    item_count: order.item_count,
                    total_price: `${order.currency} ${order.total_price}`,
                    order_date: new Date(order.created_at).toLocaleDateString('en-PK', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    // ADD THESE NEW FIELDS:
                    shipped_date: order.shipped_at 
                        ? new Date(order.shipped_at).toLocaleDateString('en-PK', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })
                        : null,
                    delivery_date: order.delivered_at 
                        ? new Date(order.delivered_at).toLocaleDateString('en-PK', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                        })
                        : null,
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
====================================================================
🎉 PERSONALIZED GREETING (MUST INCLUDE IF CUSTOMER NAME AVAILABLE)
====================================================================

IF customer_name or customer_first_name is available, START your response with a personalized thank you:

ENGLISH:
"Thank you [customer_first_name] for placing the order with us! Here are your order details:"

URDU/Roman Urdu:
"[customer_first_name], Calza se order karne ka shukriya! Yeh hain aapke order ki details:"

RULES:
- Use the customer's first name and Last Name naturally
- If customer_name is NULL or empty, skip the personalized greeting and go straight to order details
- This greeting goes BEFORE the order details, not after
- Keep it friendly and warm

====================================================================
FORMAT YOUR RESPONSE BASED ON ORDER STATUS:

⚠️ CRITICAL: RESPOND IN THE SAME LANGUAGE AS THE CUSTOMER'S LAST MESSAGE
- If customer asked in ENGLISH → Respond 100% in English
- If customer asked in URDU/Roman Urdu → Respond in Roman Urdu
- NEVER mix languages or default to one language

====================================================================
📅 DATE FIELDS EXPLAINED (USE THESE EXACTLY - DO NOT MAKE UP DATES):
====================================================================
- order_date: When order was PLACED (e.g., "November 25, 2025")
- shipped_date: When order was DISPATCHED (may be null if not shipped yet)
- delivery_date: When order was DELIVERED (may be null if not delivered yet)

⚠️ NEVER invent or guess dates! Use ONLY what is provided above.
⚠️ If delivery_date is null, do NOT say a delivery date - say "not delivered yet"

====================================================================
IF STATUS = "processing" (Order not yet dispatched):
====================================================================
- Tell customer their order is confirmed and being prepared
- order_date is available, shipped_date and delivery_date are NULL
- If customer asks about tracking:
  * English: "Your order has not been dispatched yet. Once dispatched, you'll receive the tracking number via email/SMS."
  * Urdu: "Aapka order abhi dispatch nahi hua. Jaise hi dispatch hoga, aapko tracking number mil jayega."
- DO NOT say "tracking number not found" or "could not find tracking"

====================================================================
IF STATUS = "shipped" / "in_transit" / "out_for_delivery":
====================================================================
- Use shipped_date for when it was dispatched
- delivery_date will be NULL (not delivered yet)
- Format:
  * Order Number: [number]
  * Order Date: [order_date]
  * Shipped Date: [shipped_date]
  * Status: In Transit
  * Courier: [company]
  * Tracking ID: [number]
  * Track Here: [url]

====================================================================
IF STATUS = "delivered":
====================================================================
- Use delivery_date for when it was delivered (this comes from system data)
- Example: "Your order was delivered on [delivery_date]"
- Ask if they need any help with the product

FORMAT:
  * Order Number: [number]
  * Order Date: [order_date]  
  * Delivered On: [delivery_date]   ← USE THIS EXACT FIELD
  * Status: Delivered

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
4. For orders not yet delivered, calculate expected delivery as order_date + 3-5 working days
5. Be reassuring and helpful
6. ⚠️ CRITICAL: NEVER MAKE UP DATES - Use ONLY order_date, shipped_date, delivery_date provided
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
	
	// Add this helper method to ChatService class
	_getDateValidationInstructions() {
		return `
	   --------------------------------------------------------------------
	   📅 MANDATORY DATE REASONING (For ANY time-based policy)
	   --------------------------------------------------------------------
	   
	   When ANY policy involves a TIME LIMIT (e.g., "within 48 hours", "7 days", "30 days"):
	   
	   YOU MUST fill the date_validation object with your calculations!
	   
	   STEP 1: Identify if date validation is needed
	   - Does this situation involve a time-based policy?
	   - Examples: return windows, complaint deadlines, warranty periods
	   
	   STEP 2: Show your calculation (MANDATORY)
	   {
		 "date_validation": {
		   "required": true,
		   "policy_type": "48-hour complaint window",
		   "current_date": "December 11, 2025",
		   "comparison_date": "November 19, 2025",
		   "days_elapsed": 22,
		   "threshold_days": 2,
		   "threshold_description": "48 hours = 2 days",
		   "validation_passed": false,
		   "calculation_shown": "December 11 - November 19 = 22 days. 22 > 2, so FAILED"
		 }
	   }
	   
	   STEP 3: Make decision BASED ON YOUR CALCULATION
	   - If validation_passed = true → Proceed with the request
	   - If validation_passed = false → Reject/decline with explanation
	   
	   ⚠️ CRITICAL RULES:
	   1. ALWAYS show calculation_shown with your math
	   2. NEVER proceed with time-sensitive requests if validation_passed = false
	   3. Your response MUST match your validation result
	   4. If days_elapsed > threshold_days → validation_passed MUST be false
	   
	   EXAMPLE - 48-hour policy FAILED:
	   Current: December 11, 2025
	   Delivery: November 19, 2025
	   Calculation: 22 days elapsed > 2 days threshold
	   validation_passed: false
	   Response: "I'm sorry, but this request can only be processed within 48 hours..."
	   
	   EXAMPLE - 48-hour policy PASSED:
	   Current: December 11, 2025
	   Delivery: December 10, 2025
	   Calculation: 1 day elapsed <= 2 days threshold
	   validation_passed: true
	   Response: "I can help you with this. Please share pictures..."
	   
	   --------------------------------------------------------------------
	`;
	}
	
	/**
	 * Validates LLM's date-based reasoning - GENERIC, works with any time policy
	 * @param {Object} llmDecision - The parsed LLM response
	 * @returns {Object} Validation result with corrections if needed
	 */
	_validateDateReasoning(llmDecision) {
		const dateValidation = llmDecision.date_validation;
		
		// If no date validation required or not provided, skip
		if (!dateValidation || !dateValidation.required) {
			return { valid: true, checked: false };
		}
		
		console.log('📅 Validating LLM date reasoning...');
		console.log('   LLM provided:', JSON.stringify(dateValidation, null, 2));
		
		// Parse the dates the LLM provided
		const currentDate = this._parseFlexibleDate(dateValidation.current_date);
		const comparisonDate = this._parseFlexibleDate(dateValidation.comparison_date);
		
		if (!currentDate || !comparisonDate) {
			console.log('⚠️ Could not parse dates for validation');
			return { valid: true, checked: false, reason: 'Could not parse dates' };
		}
		
		// Calculate actual days elapsed
		const actualDaysElapsed = Math.floor(
			(currentDate - comparisonDate) / (1000 * 60 * 60 * 24)
		);
		
		const llmDaysElapsed = parseInt(dateValidation.days_elapsed);
		const threshold = parseInt(dateValidation.threshold_days);
		
		// Check if LLM calculated correctly (allow 1 day variance for timezone issues)
		const calculationCorrect = Math.abs(actualDaysElapsed - llmDaysElapsed) <= 1;
		
		// Check if LLM's decision matches the calculation
		const shouldPass = actualDaysElapsed <= threshold;
		const llmSaysPass = dateValidation.validation_passed === true;
		
		console.log(`📊 Date Validation Check:`);
		console.log(`   Policy: ${dateValidation.policy_type || 'Unknown'}`);
		console.log(`   Current Date: ${dateValidation.current_date}`);
		console.log(`   Comparison Date: ${dateValidation.comparison_date}`);
		console.log(`   LLM calculated: ${llmDaysElapsed} days`);
		console.log(`   Actual calculation: ${actualDaysElapsed} days`);
		console.log(`   Threshold: ${threshold} days (${dateValidation.threshold_description || ''})`);
		console.log(`   LLM says passed: ${llmSaysPass}`);
		console.log(`   Should pass: ${shouldPass}`);
		console.log(`   Calculation correct: ${calculationCorrect}`);
		
		// Check for errors
		if (!calculationCorrect) {
			console.log(`🚨 LLM CALCULATION ERROR: ${llmDaysElapsed} vs actual ${actualDaysElapsed}`);
		}
		
		if (llmSaysPass !== shouldPass) {
			console.log(`🚨 LLM DECISION ERROR: Said ${llmSaysPass ? 'PASS' : 'FAIL'} but should ${shouldPass ? 'PASS' : 'FAIL'}`);
		}
		
		if (!calculationCorrect || llmSaysPass !== shouldPass) {
			return {
				valid: false,
				checked: true,
				error_type: !calculationCorrect ? 'calculation_error' : 'decision_error',
				llm_values: {
					days_elapsed: llmDaysElapsed,
					validation_passed: llmSaysPass
				},
				corrected: {
					days_elapsed: actualDaysElapsed,
					validation_passed: shouldPass,
					calculation_shown: `${dateValidation.current_date} - ${dateValidation.comparison_date} = ${actualDaysElapsed} days. ${actualDaysElapsed} ${shouldPass ? '<=' : '>'} ${threshold} threshold.`
				},
				policy_type: dateValidation.policy_type,
				threshold_days: threshold,
				threshold_description: dateValidation.threshold_description
			};
		}
		
		console.log('✅ LLM date reasoning validated successfully');
		return { valid: true, checked: true };
	}

	/**
	 * Parse various date formats flexibly
	 */
	_parseFlexibleDate(dateStr) {
		if (!dateStr) return null;
		
		// Try direct parsing
		let date = new Date(dateStr);
		if (!isNaN(date.getTime())) return date;
		
		// Try common formats
		// "December 11, 2025" or "November 19, 2025"
		const monthDayYear = dateStr.match(/(\w+)\s+(\d+),?\s+(\d{4})/);
		if (monthDayYear) {
			date = new Date(`${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]}`);
			if (!isNaN(date.getTime())) return date;
		}
		
		// "11 December 2025"
		const dayMonthYear = dateStr.match(/(\d+)\s+(\w+)\s+(\d{4})/);
		if (dayMonthYear) {
			date = new Date(`${dayMonthYear[2]} ${dayMonthYear[1]}, ${dayMonthYear[3]}`);
			if (!isNaN(date.getTime())) return date;
		}
		
		// "2025-12-11"
		const isoFormat = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
		if (isoFormat) {
			date = new Date(dateStr);
			if (!isNaN(date.getTime())) return date;
		}
		
		return null;
	}

	/**
	 * Generate rejection message based on policy context
	 * Uses the LLM's own policy information - NOT hardcoded
	 */
	_generatePolicyRejectionMessage(validationResult, complaintContext) {
		const policyType = validationResult.policy_type || 'time-sensitive request';
		const threshold = validationResult.threshold_description || `${validationResult.threshold_days} days`;
		const daysElapsed = validationResult.corrected.days_elapsed;
		
		// Get order/date info from complaint context
		const orderNumber = complaintContext?.order_number || '';
		const deliveryDate = complaintContext?.delivery_date || validationResult.llm_values?.comparison_date || 'the delivery date';
		
		// Format delivery date nicely
		let formattedDeliveryDate = deliveryDate;
		const parsedDate = this._parseFlexibleDate(deliveryDate);
		if (parsedDate) {
			formattedDeliveryDate = parsedDate.toLocaleDateString('en-US', {
				month: 'long',
				day: 'numeric',
				year: 'numeric'
			});
		}
		
		// Build rejection message
		const orderRef = orderNumber ? ` Your order ${orderNumber.includes('CZ-') ? orderNumber : 'CZ-' + orderNumber}` : ' Your order';
		
		return `I'm sorry, but ${policyType} can only be processed within ${threshold} of delivery.${orderRef} was delivered on ${formattedDeliveryDate}, which is ${daysElapsed} days ago. Unfortunately, we cannot process this request as it exceeds the ${threshold} window.`;
	}
	
	/**
	 * Classify if incoming image is for complaint evidence or product search
	 * Uses 3-tier approach: Session State → Keywords → LLM (cost-optimized)
	 * 
	 * @param {Object} session - Current chat session
	 * @param {Array} history - Conversation history
	 * @param {string} message - Current user message
	 * @returns {Promise<Object>} Classification result
	 */
	async _classifyImageIntent(session, history, message, image) {
		console.log('📷 Classifying image intent...');
		
		// Get agent to check capabilities
		const agent = await AgentService.getAgent(session.agent_id);
		const hasShopify = agent?.shopify_store_url && agent?.shopify_access_token;
		const hasProducts = agent?.kb_metadata?.has_products || false;
		const canSearchProducts = hasShopify || hasProducts;
		
		// ============================================
		// 🛡️ CHECK IF TICKET WAS JUST CREATED (handle race conditions)
		// ============================================
		const recentAssistantMsgs = history.filter(m => m.role === 'assistant').slice(-3);
		const ticketJustCreated = recentAssistantMsgs.some(m => 
			m.content?.includes('ticket number') || 
			m.content?.includes('Ticket Number') ||
			m.content?.includes('ticket_number') ||
			m.content?.includes('concern note kar') ||
			m.content?.includes('concern has been noted') ||
			m.content?.includes('complaint has been registered') ||
			m.content?.includes('team will contact') ||
			m.content?.includes('Our team will contact')
		);
		
		if (ticketJustCreated) {
			console.log('📷 Ticket just created - image is likely extra/late batch image');
			return {
				intent: 'post_ticket_image',
				confidence: 'high',
				source: 'ticket_just_created',
				reason: 'Ticket was recently created, ignoring late image'
			};
		}
		
		const orderScreenshotKeywords = [
			// Order-related terms
			'order number', 'order #', 'order status', 'order confirmation',
			'tracking', 'shipment', 'delivery', 'delivered', 'dispatched',
			'invoice', 'receipt', 'confirmation', 'booking',
			// Screenshot context
			'screenshot', 'screen shot', 'ss', 'pic of order', 'order pic',
			'here is my order', 'my order', 'yeh mera order', 'mera order',
			// Email/notification context  
			'got this email', 'received this', 'ye email aayi', 'notification',
			// Status inquiry with image
			'check this', 'is order ka status', 'order ki detail', 'kahan hai mera order'
		];
		
		// ============================================
		// TIER 0: Agent Capability Check
		// ============================================
		if (!canSearchProducts) {
			console.log('📷 Agent has no product search capability - routing to LLM analysis');
			return { 
				intent: 'llm_analysis', 
				confidence: 'high', 
				source: 'no_product_capability',
				reason: 'Agent does not have products or Shopify integration'
			};
		}
		
		// ============================================
		// TIER 1: Session State Check (FREE - DB lookup)
		// ============================================
		const complaintState = session.complaint_state;
		
		if (complaintState && complaintState.active) {
			const imageCount = complaintState.images_collected?.length || 0;
			
			// Check if we recently saved an image (within 30 seconds) - indicates batch upload
			const lastImageTime = complaintState.images_collected?.[imageCount - 1]?.added_at;
			const timeSinceLastImage = lastImageTime ? 
				(Date.now() - new Date(lastImageTime).getTime()) : Infinity;
			const isBatchUpload = timeSinceLastImage < 30000; // 30 seconds
			
			// Use state flags instead of keyword parsing (language-agnostic)
			const awaitingImages = complaintState.awaiting_images === true;
			const awaitingOrder = imageCount > 0 && !complaintState.order_number;
			
			// If this looks like a batch upload (multiple images within 30s)
			// and we've already asked for something, return special intent for silent collection
			if (isBatchUpload && imageCount > 0) {
				console.log(`📷 Batch image detected (#${imageCount + 1}) - will collect silently`);
				return {
					intent: 'batch_image_skip',
					confidence: 'high',
					source: 'batch_detection',
					images_count: imageCount + 1,
					awaiting: awaitingOrder ? 'order_info' : (awaitingImages ? 'more_images' : 'unknown')
				};
			}
			
			// If we have images but no order number, and user sends another image
			// Send a reminder about order info
			if (awaitingOrder && imageCount > 0) {
				console.log(`📷 Image received but still waiting for order info`);
				return {
					intent: 'batch_image_reminder',
					confidence: 'high',
					source: 'awaiting_order_info',
					images_count: imageCount + 1,
					awaiting_order_info: true
				};
			}
			
			// ✅ FIX: If complaint is active, ANY image is complaint evidence
			// This catches the first image or images sent when not in batch mode
			console.log(`📷 Active complaint detected - treating image as complaint evidence`);
			return {
				intent: 'complaint_evidence',
				confidence: 'high',
				source: 'active_complaint_state',
				complaint_type: complaintState.type || 'UNKNOWN',
				images_count: imageCount,
				order_number: complaintState.order_number
			};
		}
		
		// ============================================
		// TIER 2: Keyword Analysis (FREE - string matching)
		// ============================================
		const recentMessages = history.slice(-5);
		const recentText = recentMessages
			.map(m => m.content || '')
			.join(' ')
			.toLowerCase();
		
		// Include current message
		const fullContext = (recentText + ' ' + (message || '')).toLowerCase();
		
		// Complaint-related keywords (English + Urdu)
		const complaintKeywords = [
			// Problem descriptions
			'damaged', 'broken', 'defective', 'torn', 'rough', 'quality issue', 'not new',
			'missing', 'wrong color', 'wrong size', 'manufacturing', 'stitching', 'defect',
			// Action phrases
			'share picture', 'send photo', 'upload image', 'show you', 'here is',
			'complaint', 'problem with order', 'issue with', 'not working', 'received damaged',
			// Urdu keywords
			'tasveer', 'picture bhejo', 'photo bhejo', 'image bhejo',
			'kharab', 'tuta', 'toota', 'phat', 'phata', 'masla', 'problem',
			'ghalat color', 'ghalat size', 'nuqs'
		];
		
		// Product search keywords (English + Urdu)
		const productKeywords = [
			// Search intent
			'show me', 'find similar', 'find like this', 'search for', 'looking for',
			'like this', 'similar to', 'match this', 'same as this', 'is jaisa',
			// Purchase intent
			'price of', 'cost of', 'how much', 'kitne ka', 'kimat',
			'available in', 'stock mein', 'buy this', 'purchase', 'order this',
			// Urdu product keywords
			'dikhao', 'dikha do', 'yeh chahiye', 'aisa', 'is jaisa', 'milta julta'
		];
		
		// Bot asking for images (high priority)
		const botAskingForImages = [
			'share picture', 'share photo', 'send picture', 'send photo',
			'upload image', 'tasveer bhejo', 'photo share', 'picture share',
			'please share', 'kindly share', 'share images', 'send images'
		];
		
		// Check if bot recently asked for complaint images
		const botAskedForImages = recentMessages
			.filter(m => m.role === 'assistant')
			.slice(-2)
			.some(m => botAskingForImages.some(phrase => 
				(m.content || '').toLowerCase().includes(phrase)
			));
		
		if (botAskedForImages) {
			console.log('📷 Intent: COMPLAINT_EVIDENCE (bot asked for images)');
			return { 
				intent: 'complaint_evidence', 
				confidence: 'high', 
				source: 'bot_request' 
			};
		}
		
		// Score keywords
		const complaintScore = complaintKeywords.filter(k => fullContext.includes(k)).length;
		const productScore = productKeywords.filter(k => fullContext.includes(k)).length;
		const orderScreenshotScore = orderScreenshotKeywords.filter(k => fullContext.includes(k)).length;
		
		console.log(`📊 Keyword scores - Complaint: ${complaintScore}, Product: ${productScore}, OrderScreenshot: ${orderScreenshotScore}`);
		
		// Order screenshot has highest priority if keywords match
		if (orderScreenshotScore >= 1 && complaintScore === 0) {
			console.log('📷 Intent: ORDER_SCREENSHOT (from keywords)');
			return { intent: 'order_screenshot', confidence: 'medium', source: 'keywords' };
		}
		
		console.log(`📊 Keyword scores - Complaint: ${complaintScore}, Product: ${productScore}`);
		
		// Clear complaint winner
		if (complaintScore >= 2 && productScore === 0) {
			console.log('📷 Intent: COMPLAINT_EVIDENCE (from keywords)');
			return { intent: 'complaint_evidence', confidence: 'medium', source: 'keywords' };
		}
		
		// Clear product winner
		if (productScore >= 1 && complaintScore === 0) {
			console.log('📷 Intent: PRODUCT_SEARCH (from keywords)');
			return { intent: 'product_search', confidence: 'medium', source: 'keywords' };
		}
		
		// No clear context - check if we should use vision LLM
		const hasMessage = message && message.trim().length > 5;  // More than just "hi" or "yes"
		const isAmbiguous = this._isAmbiguousImageMessage(message);

		// If no keywords matched but we have an image, use vision to classify
		if (complaintScore === 0 && productScore === 0 && orderScreenshotScore === 0) {
			// Don't return unknown - fall through to vision-based classification
			console.log('📷 No keyword context - will use vision LLM to classify image');
		} else if (complaintScore === 0 && productScore === 0) {
			// Has some text but no complaint/product keywords - check for product search
			console.log('📷 Intent: PRODUCT_SEARCH (no complaint context found)');
			return { intent: 'product_search', confidence: 'medium', source: 'default' };
		}
		
		// ============================================
		// TIER 3: Vision LLM Classification (when no clear keyword context)
		// ============================================
		console.log('🔍 Using vision LLM to classify image content');
		
		// Build minimal context (only last 3 messages)
		const minimalHistory = recentMessages.slice(-3).map(m => 
			`${m.role.toUpperCase()}: ${(m.content || '').substring(0, 200)}`
		).join('\n');
		
		const intentPrompt = `Classify user intent for an e-commerce customer service chat.

Recent conversation:
${minimalHistory}

User just sent an IMAGE with message: "${message || '[no text, just image]'}"

Analyze the IMAGE content and classify as ONE of:
A) order_screenshot - Screenshot of order confirmation, invoice, receipt, tracking page, or delivery notification. Look for:
   - Order numbers (e.g., "CZ-123456", "#123456", "Order #")
   - Dates, amounts, tracking info
   - Email confirmations or app screenshots showing order details
   - "Thank you for your purchase" or similar confirmation text
   
B) complaint_evidence - User reporting a problem with a RECEIVED product:
   - Damaged/defective product photo
   - Wrong item received
   - Quality issues visible in image
   
C) product_search - User wants to find or buy products:
   - Product photo they want to find similar items
   - Style inspiration image
   - "Find me this" type requests

CLASSIFICATION RULES:
- If image contains ANY order-related text (Order #, Invoice, Tracking, Confirmation, "Thank you for your purchase") → order_screenshot
- If image shows a DAMAGED/DEFECTIVE physical product → complaint_evidence
- If image shows a product the user wants to BUY/FIND → product_search
- Screenshots of websites/apps showing order info → order_screenshot (NOT product_search)
- When uncertain between order_screenshot and product_search, prefer order_screenshot if any order text visible

Reply ONLY with JSON: {"intent": "order_screenshot" or "complaint_evidence" or "product_search", "reason": "brief explanation"}`;

		try {
			// Use vision-capable model with actual image
			const completion = await this._callLLM(
				[{ 
					role: 'user', 
					content: [
						{ type: 'text', text: intentPrompt },
						{ 
							type: 'image_url', 
							image_url: { 
								url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
								detail: 'low'  // Low detail for classification (cheaper)
							} 
						}
					]
				}],
				{
					model: 'gpt-4o-mini',  // Vision-capable and cheap
					max_tokens: 100,
					temperature: 0.1,
					json_mode: true,
					hasVision: true
				}
			);
			
			const result = JSON.parse(completion.content);
			
			console.log(`📷 Vision Intent: ${result.intent.toUpperCase()} (reason: ${result.reason})`);
			console.log(`💰 Vision classification cost: $${completion.cost.final_cost.toFixed(6)}`);
			
			return {
				intent: result.intent,
				confidence: 'high',
				source: 'vision_llm',
				reason: result.reason,
				llm_cost: completion.cost.final_cost
			};
			
		} catch (error) {
			console.error('❌ Vision intent classification failed:', error.message);
			// Return unknown only if vision fails
			return { intent: 'unknown', confidence: 'low', source: 'vision_error', error: error.message };
		}
	}

	/**
	 * Extract order information from an order screenshot using vision
	 * 
	 * @param {string} image - Base64 or URL of the image
	 * @param {string} message - User's accompanying message
	 * @param {Object} agent - Agent configuration
	 * @returns {Promise<Object>} Extracted order info
	 */
	async _extractOrderFromScreenshot(image, message, agent) {
		console.log('🔍 Extracting order information from screenshot...');
		
		const extractionPrompt = `You are an OCR specialist for e-commerce order screenshots.

Analyze this image which appears to be a screenshot of an order confirmation, invoice, receipt, tracking page, or delivery notification.

Extract the following information if visible:

1. ORDER NUMBER - Look for patterns like:
   - "CZ-123456" or "CZ123456" (Calza format with CZ prefix)
   - "#123456" or "Order #123456" or "Order Number: 123456"
   - "ORD-123456" or similar prefixed formats
   - Any prominent alphanumeric order identifier
   - If you see just digits like "236126", note it (may need CZ- prefix added)

2. EMAIL ADDRESS - Customer email if visible (e.g., "customer@gmail.com")

3. PHONE NUMBER - Customer phone if visible (with or without country code)

4. ORDER DATE - When the order was placed

5. CUSTOMER NAME - If visible on the order

6. ORDER STATUS - (Confirmed, Processing, Shipped, Delivered, etc.)

7. TRACKING NUMBER - Courier tracking number if visible

8. TOTAL AMOUNT - Order total with currency if visible

9. SOURCE TYPE - What kind of screenshot is this:
   - email_confirmation (order confirmation email)
   - app_screenshot (mobile app order screen)
   - website_screenshot (browser order page)
   - tracking_page (courier/delivery tracking)
   - sms_notification (text message)
   - invoice (formal invoice document)
   - order_details (order detail page)
   - other

IMPORTANT RULES:
- Extract the EXACT order number as displayed (preserve any prefix like "CZ-")
- If you see "Order #123456", extract as "123456" (without the #)
- If multiple order numbers visible, extract the most prominent one
- For phone numbers, include country code if visible (e.g., "+92" or "03xx")
- Set confidence to "high" if key info (order number OR email OR phone) is clearly visible
- Set confidence to "medium" if partially visible or unclear
- Set confidence to "low" if you're guessing or image is blurry
- Return null for any field that is not visible or unclear

Reply ONLY with valid JSON:
{
  "order_number": "extracted order number or null",
  "order_number_raw": "exactly as shown in image or null",
  "email": "customer email or null",
  "phone": "customer phone or null",
  "order_date": "date string or null",
  "customer_name": "name or null",
  "order_status": "status or null",
  "tracking_number": "tracking number or null",
  "total_amount": "amount with currency or null",
  "confidence": "high/medium/low",
  "source_type": "email_confirmation/app_screenshot/website_screenshot/tracking_page/sms_notification/invoice/order_details/other",
  "notes": "any relevant observations"
}`;

		try {
			const completion = await this._callLLM(
				[
					{ role: 'system', content: extractionPrompt },
					{
						role: 'user',
						content: [
							{ 
								type: 'text', 
								text: message 
									? `User message: "${message}"\n\nExtract order information from the attached screenshot.`
									: 'Extract order information from this order screenshot.'
							},
							{ 
								type: 'image_url', 
								image_url: { url: image, detail: 'high' } 
							}
						]
					}
				],
				{
					model: 'gpt-4o-mini',
					max_tokens: 400,
					temperature: 0.1,
					json_mode: true,
					hasVision: true
				}
			);
			
			let result;
			try {
				result = JSON.parse(completion.content);
			} catch (parseError) {
				console.error('❌ Failed to parse extraction result:', completion.content);
				return {
					order_number: null,
					email: null,
					phone: null,
					confidence: 'failed',
					success: false,
					error: 'Failed to parse extraction result',
					extraction_cost: completion.cost?.final_cost || 0
				};
			}
			
			// Normalize order number format
			let normalizedOrderNumber = result.order_number;
			if (normalizedOrderNumber) {
				// Remove common prefixes that aren't part of the actual order number
				normalizedOrderNumber = normalizedOrderNumber
					.replace(/^(Order\s*)?#?\s*/i, '')
					.replace(/^(ORD[-_]?)/i, '')
					.trim();
				
				// For Calza-style orders, ensure CZ- prefix
				if (/^\d{5,7}$/.test(normalizedOrderNumber)) {
					// Pure digits - likely needs CZ- prefix for Calza
					normalizedOrderNumber = `CZ-${normalizedOrderNumber}`;
					console.log(`📋 Added CZ- prefix: ${normalizedOrderNumber}`);
				} else if (/^CZ[-_]?\d+/i.test(normalizedOrderNumber)) {
					// Already has CZ prefix, normalize format
					normalizedOrderNumber = normalizedOrderNumber
						.toUpperCase()
						.replace(/^CZ[-_]?/, 'CZ-');
				}
			}
			
			console.log(`📋 Extracted order info:`, {
				raw: result.order_number_raw,
				normalized: normalizedOrderNumber,
				email: result.email,
				phone: result.phone,
				confidence: result.confidence,
				source: result.source_type
			});
			console.log(`💰 Extraction cost: $${completion.cost?.final_cost?.toFixed(6) || '0.000000'}`);
			
			return {
				order_number: normalizedOrderNumber,
				order_number_raw: result.order_number_raw || result.order_number,
				email: result.email || null,
				phone: result.phone || null,
				order_date: result.order_date,
				customer_name: result.customer_name,
				order_status: result.order_status,
				tracking_number: result.tracking_number,
				total_amount: result.total_amount,
				confidence: result.confidence || 'medium',
				source_type: result.source_type || 'other',
				notes: result.notes,
				extraction_cost: completion.cost?.final_cost || 0,
				success: !!(normalizedOrderNumber || result.email || result.phone)
			};
			
		} catch (error) {
			console.error('❌ Order extraction failed:', error.message);
			return {
				order_number: null,
				email: null,
				phone: null,
				confidence: 'failed',
				success: false,
				error: error.message,
				extraction_cost: 0
			};
		}
	}
	
	/**
	 * Handle image submitted as complaint evidence
	 * Collects image, updates state, and continues complaint flow
	 * 
	 * @param {Object} session - Current chat session
	 * @param {string} image - Base64 or URL of the image
	 * @param {string} message - User's message with the image
	 * @param {Array} history - Conversation history
	 * @param {Object} agent - Agent configuration
	 * @param {Object} imageIntent - Classification result from _classifyImageIntent
	 * @returns {Promise<Object>} Response object
	 */
	async _handleComplaintImage(session, image, message, history, agent, imageIntent) {
		console.log('📷 Processing image as COMPLAINT EVIDENCE');
		
		const sessionId = session.id;
		let complaintState = session.complaint_state || {};
		
		// Initialize complaint state if not exists
		if (!complaintState.active) {
			complaintState = {
				active: true,
				type: imageIntent.complaint_type || 'UNKNOWN',
				order_number: imageIntent.order_number || null,
				delivery_date: imageIntent.delivery_date || null,
				awaiting_images: true,
				images_collected: [],
				initiated_at: new Date().toISOString(),
				customer_email: imageIntent.customer_email || null,
				customer_phone: imageIntent.customer_phone || null
			};
		}
		
		// Add current image to collected images
		complaintState.images_collected = complaintState.images_collected || [];
		complaintState.images_collected.push({
			url: image,
			added_at: new Date().toISOString(),
			message: message || null
		});
		
		console.log(`📷 Images collected: ${complaintState.images_collected.length}`);
		
		// Update session with new complaint state
		await this._updateSessionComplaintState(sessionId, complaintState);
		
		// Build system prompt for complaint image handling
		const systemPrompt = this._buildComplaintImagePrompt(agent, complaintState, history);
		
		// Build messages - include the image for LLM to see
		const messages = [
			{ role: 'system', content: systemPrompt },
			...history.map(msg => ({ role: msg.role, content: msg.content })),
			{
				role: 'user',
				content: [
					{ type: 'text', text: message || 'Here is the image for my complaint' },
					{ type: 'image_url', image_url: { url: image, detail: 'high' } }
				]
			}
		];
		
		const model = agent.chat_model || 'gpt-4o-mini';
		
		// Call LLM with complaint context
		const completion = await this._callLLM(messages, {
			model: model,
			temperature: parseFloat(agent.temperature) || 0.7,
			max_tokens: agent.max_tokens || 2048,
			json_mode: true,
			hasVision: true
		});

		const aiMessage = { content: completion.content };
		let llmDecision;
		
		try {
			llmDecision = JSON.parse(aiMessage.content);
			console.log('🤖 LLM Response (complaint image):', JSON.stringify(llmDecision, null, 2));
		} catch (error) {
			console.error('❌ Failed to parse complaint image LLM response:', error.message);
			llmDecision = {
				response: "Thank you for sharing the image. I've noted this for your complaint. Is there anything else you'd like to add?",
				function_call_needed: false,
				conversation_complete: false
			};
		}
		
		// Check if LLM wants to create ticket now
		if (llmDecision.function_call_needed && llmDecision.function_name) {
			console.log(`🔧 Function call requested in complaint flow: ${llmDecision.function_name}`);
			console.log(`📋 Arguments:`, llmDecision.function_arguments);
			
			// Add complaint context to arguments if relevant
			if (!llmDecision.function_arguments) {
				llmDecision.function_arguments = {};
			}
			
			// Auto-inject complaint data for ticket/complaint-related functions
			const funcNameLower = llmDecision.function_name.toLowerCase();
			if (funcNameLower.includes('ticket') || funcNameLower.includes('complaint')) {
				// Inject collected images into function arguments
				if (complaintState.images_collected?.length > 0 && !llmDecision.function_arguments.image_urls) {
					llmDecision.function_arguments.image_urls = complaintState.images_collected.map(img => img.url);
					console.log(`📷 Auto-injected ${complaintState.images_collected.length} images into function args`);
				}
				
				// Inject order number if available
				if (complaintState.order_number && !llmDecision.function_arguments.order_no) {
					llmDecision.function_arguments.order_no = complaintState.order_number.replace(/^CZ-?/i, '');
					console.log(`📋 Auto-injected order number: ${complaintState.order_number}`);
				}
				
				// Inject complaint type
				if (complaintState.type && !llmDecision.function_arguments.ticket_sub_type) {
					llmDecision.function_arguments.ticket_sub_type = complaintState.type;
				}
			}
			
			// Update complaint state - mark function requested
			// Note: Actual function execution and result handling happens in sendMessage
			complaintState.awaiting_images = false;
			complaintState.function_requested = llmDecision.function_name;
			await this._updateSessionComplaintState(sessionId, complaintState);
		} else {
			// No function called - but we've processed an image
			// Use LLM's structured output instead of keyword parsing (language-agnostic)
			const complaintContext = llmDecision.complaint_context || {};
			
			// LLM tells us directly if it wants more images or is ready for ticket
			const askingForMoreImages = complaintContext.awaiting_more_images === true;
			const readyForTicket = complaintContext.ready_for_ticket === true;
			const hasOrderNumber = !!complaintContext.order_number || !!complaintState.order_number;
			
			// If we have images and LLM is NOT asking for more images, stop waiting
			if (complaintState.images_collected?.length > 0 && !askingForMoreImages) {
				console.log(`📷 Images collected (${complaintState.images_collected.length}), awaiting_images = false`);
				complaintState.awaiting_images = false;
				await this._updateSessionComplaintState(sessionId, complaintState);
			}
		}
		
		// Calculate cost
		const llmCost = completion.cost;
		
		// Add intent classification cost if any
		if (imageIntent.llm_cost) {
			llmCost.final_cost += imageIntent.llm_cost;
		}
		
		console.log('💰 Complaint image handling cost:', llmCost.final_cost);
		
		return {
			llmDecision,
			llmCost,
			complaintState,
			imageProcessedAs: 'complaint_evidence'
		};
	}

	/**
	 * Build system prompt for complaint image handling
	 * @private
	 */
	_buildComplaintImagePrompt(agent, complaintState, history) {
		const todayFormatted = new Date().toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
		
		return `
	============================================================
	📅 CURRENT DATE: ${todayFormatted}
	============================================================

	${agent.instructions || ''}

	============================================================
	📷 COMPLAINT IMAGE CONTEXT
	============================================================

	This user is submitting an image as EVIDENCE for a complaint.
	DO NOT treat this as a product search request.

	COMPLAINT DETAILS:
	- Type: ${complaintState.type || 'Not yet identified'}
	- Order Number: ${complaintState.order_number || 'Not yet provided'}
	- Delivery Date: ${complaintState.delivery_date || 'Unknown'}
	- Images Already Collected: ${complaintState.images_collected?.length || 0}

	YOUR TASK:
	1. Acknowledge receiving the image
	2. Examine the image - describe what you see (damaged part, defect, etc.)
	3. If you have enough information (order number + images), proceed to create ticket
	4. If missing order number, ask for it
	5. If user wants to add more images, allow them

	DO NOT:
	- Search for products
	- Suggest similar items
	- Treat this as a shopping query

	YOU MUST RESPOND IN VALID JSON FORMAT:
	{
	  "response": "Your response acknowledging the complaint image",
	  "product_search_needed": false,
	  "product_search_type": "none",
	  "knowledge_search_needed": false,
	  "function_call_needed": true/false,
	  "function_name": "create_ticket" (if ready to create),
	  "function_arguments": {
		"event": "create_ticket",
		"ticket_type": "Product",
		"ticket_sub_type": "${complaintState.type || 'Damaged Article'}",
		"order_no": "${complaintState.order_number || ''}",
		"image_urls": []
	  },
	  "complaint_context": {
		"complaint_type": "${complaintState.type || 'UNKNOWN'}",
		"order_number": "${complaintState.order_number || ''}",
		"awaiting_more_images": true/false,
		"ready_for_ticket": true/false
	  },
	  "conversation_complete": false,
	  "user_wants_to_end": false
	}
	`;
	}

	/**
	 * Update session complaint state in database
	 * @private
	 */
	async _updateSessionComplaintState(sessionId, complaintState) {
		try {
			await db.query(
				`UPDATE yovo_tbl_aiva_chat_sessions 
				 SET complaint_state = ?
				 WHERE id = ?`,
				[JSON.stringify(complaintState), sessionId]
			);
			console.log('✅ Session complaint state updated');
		} catch (error) {
			console.error('❌ Failed to update complaint state:', error.message);
		}
	}

	/**
	 * Check LLM response for complaint image request and update session state
	 * Call this after parsing LLM decision to track when bot asks for images
	 * 
	 * @param {string} sessionId - Session ID
	 * @param {Object} llmDecision - Parsed LLM response
	 * @param {Object} currentState - Current complaint state (can be null)
	 */
	async _checkAndUpdateComplaintState(sessionId, llmDecision, currentState) {
		// Phrases that indicate bot is asking for complaint images
		const imageRequestPhrases = [
			'share picture', 'share photo', 'send picture', 'send photo',
			'upload image', 'share images', 'send images',
			'tasveer bhejo', 'photo share', 'picture share',
			'please share', 'kindly share'
		];
		
		const response = (llmDecision.response || '').toLowerCase();
		const isAskingForImages = imageRequestPhrases.some(phrase => response.includes(phrase));
		
		// Check for complaint context in LLM decision
		const complaintContext = llmDecision.complaint_context;
		const hasComplaintContext = complaintContext && 
			(complaintContext.complaint_type || complaintContext.order_number || complaintContext.awaiting_images);
		
		// If bot is asking for images OR LLM indicates complaint context
		if (isAskingForImages || hasComplaintContext) {
			const newState = {
				active: true,
				type: complaintContext?.complaint_type || currentState?.type || 'UNKNOWN',
				order_number: complaintContext?.order_number || currentState?.order_number || null,
				delivery_date: complaintContext?.delivery_date || currentState?.delivery_date || null,
				awaiting_images: isAskingForImages || complaintContext?.awaiting_images || false,
				images_collected: currentState?.images_collected || [],
				initiated_at: currentState?.initiated_at || new Date().toISOString(),
				customer_email: complaintContext?.customer_email || currentState?.customer_email || null,
				customer_phone: complaintContext?.customer_phone || currentState?.customer_phone || null
			};
			
			// If date validation was done, capture the result
			if (llmDecision.date_validation) {
				newState.validation_checked = true;
				newState.validation_passed = llmDecision.date_validation.validation_passed;
			}
			
			console.log('📝 Updating complaint state:', JSON.stringify(newState, null, 2));
			await this._updateSessionComplaintState(sessionId, newState);
			
			return newState;
		}
		
		// Check if complaint flow is complete (ticket created or rejected)
		if (currentState?.active) {
			const completionPhrases = [
				'ticket number', 'ticket has been created', 'noted your query',
				'cannot process this complaint', 'outside 48 hour', '48 hours ago'
			];
			
			const isComplaintComplete = completionPhrases.some(phrase => response.includes(phrase));
			
			if (isComplaintComplete) {
				console.log('🏁 Complaint flow complete - resetting state');
				const finalState = {
					...currentState,
					active: false,
					awaiting_images: false,
					completed_at: new Date().toISOString()
				};
				await this._updateSessionComplaintState(sessionId, finalState);
				return finalState;
			}
		}
		
		return currentState;
	}

	/**
	 * Clear complaint state (call when starting fresh or after ticket creation)
	 */
	async _clearComplaintState(sessionId) {
		await this._updateSessionComplaintState(sessionId, null);
		console.log('🧹 Complaint state cleared');
	}
	
	/**
	 * Store pending image in session for later processing
	 * @private
	 */
	async _storePendingImage(sessionId, image, originalMessage) {
		const pendingImage = {
			image: image,
			original_message: originalMessage,
			stored_at: new Date().toISOString()
		};
		
		await db.query(
			`UPDATE yovo_tbl_aiva_chat_sessions 
			 SET pending_image = ?
			 WHERE id = ?`,
			[JSON.stringify(pendingImage), sessionId]
		);
		
		console.log('📷 Pending image stored for session:', sessionId);
	}

	/**
	 * Get and clear pending image from session
	 * @private
	 */
	async _getPendingImage(sessionId) {
		const [rows] = await db.query(
			`SELECT pending_image FROM yovo_tbl_aiva_chat_sessions WHERE id = ?`,
			[sessionId]
		);
		
		if (!rows[0]?.pending_image) return null;
		
		const pendingImage = typeof rows[0].pending_image === 'string' 
			? JSON.parse(rows[0].pending_image) 
			: rows[0].pending_image;
		
		// Clear pending image
		await db.query(
			`UPDATE yovo_tbl_aiva_chat_sessions SET pending_image = NULL WHERE id = ?`,
			[sessionId]
		);
		
		console.log('📷 Retrieved and cleared pending image');
		return pendingImage;
	}

	/**
	 * Detect user's intent choice from their response
	 * @private
	 */
	_detectIntentChoice(message) {
		const lower = (message || '').toLowerCase().trim();
		
		// Product search indicators
		const productPatterns = [
			/^1/, /one/i, /first/i, /pehla/i,
			/similar/i, /product/i, /find/i, /search/i, /dhund/i, /dikhao/i,
			/buy/i, /purchase/i, /kharid/i
		];
		
		// Complaint indicators
		const complaintPatterns = [
			/^2/, /two/i, /second/i, /doosra/i, /dusra/i,
			/problem/i, /issue/i, /complaint/i, /report/i, /damaged/i,
			/masla/i, /kharab/i, /broken/i, /defect/i
		];
		
		// Something else
		const otherPatterns = [
			/^3/, /three/i, /third/i, /teesra/i,
			/other/i, /else/i, /aur/i, /different/i
		];
		
		if (productPatterns.some(p => p.test(lower))) {
			return 'product_search';
		}
		
		if (complaintPatterns.some(p => p.test(lower))) {
			return 'complaint_evidence';
		}
		
		if (otherPatterns.some(p => p.test(lower))) {
			return 'other';
		}
		
		return null; // Couldn't determine
	}
	
	/**
	 * Check if message with image is ambiguous (could be product search OR complaint)
	 * @private
	 */
	_isAmbiguousImageMessage(message) {
		if (!message) return true;
		
		const lower = message.toLowerCase().trim();
		
		// Generic questions that don't indicate clear intent
		const ambiguousPatterns = [
			// English ambiguous
			/^what('?s| is) this\??!?$/i,
			/^what is this\??!?$/i,
			/^is this\??!?$/i,
			/^can you (help|tell|check|see|look)\??!?$/i,
			/^help( me)?\??!?$/i,
			/^check (this|it|please)\??!?$/i,
			/^look at this\??!?$/i,
			/^see this\??!?$/i,
			/^here\??!?$/i,
			/^this\??!?$/i,
			
			// Urdu/Roman Urdu ambiguous
			/^ye+h? kya hai\??!?$/i,
			/^kya hai ye+h?\??!?$/i,
			/^dekh(o|ein|na)?\??!?$/i,
			/^ye+h? dekh(o|ein|na)?\??!?$/i,
			/^check kar(o|ein|na)?\??!?$/i,
			/^madad\??!?$/i,
			
			// Very short messages (less context)
			/^.{1,10}$/  // 10 chars or less
		];
		
		return ambiguousPatterns.some(pattern => pattern.test(lower));
	}
	
	/**
	 * Check if message looks like an order identifier (order number, phone, email)
	 * @private
	 */
	_looksLikeOrderIdentifier(message) {
		if (!message) return false;
		
		const trimmed = message.trim();
		
		// Order number patterns (CZ-123456, #1234, 233280, etc.)
		if (/^(CZ-?)?\d{4,10}(_\d+)?$/i.test(trimmed)) return true;
		if (/^#?\d{4,8}$/i.test(trimmed)) return true;
		if (/^ORD-?\d+$/i.test(trimmed)) return true;
		
		// Phone number patterns
		if (/^(\+?92|0)?3\d{9}$/.test(trimmed.replace(/[\s-]/g, ''))) return true;  // Pakistani
		if (/^\+?\d{10,15}$/.test(trimmed.replace(/[\s-]/g, ''))) return true;  // International
		
		// Email pattern
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
		
		return false;
	}

	/**
	 * Parse message to extract order identifier type
	 * @private
	 */
	_parseOrderIdentifier(message) {
		const trimmed = message.trim();
		
		// Email
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			return { email: trimmed, order_number: null, phone: null };
		}
		
		// Phone number (Pakistani or international)
		const phoneClean = trimmed.replace(/[\s-]/g, '');
		if (/^(\+?92|0)?3\d{9}$/.test(phoneClean) || /^\+?\d{10,15}$/.test(phoneClean)) {
			return { phone: trimmed, order_number: null, email: null };
		}
		
		// Order number (default)
		// Clean up common prefixes
		let orderNum = trimmed;
		if (/^\d+$/.test(orderNum) && !orderNum.startsWith('CZ-')) {
			orderNum = `CZ-${orderNum}`;  // Auto-add CZ- prefix for bare numbers
		}
		
		return { order_number: orderNum, email: null, phone: null };
	}
	
	/**
	 * Check if function call should be skipped due to missing required arguments
	 * Uses function schema to determine required parameters
	 * @private
	 */
	_shouldSkipFunctionCall(functionName, args, agent) {
		// Find function definition
		const func = agent.functions?.find(f => f.name === functionName);
		
		// Built-in functions schema
		const builtInSchemas = {
			'check_order_status': {
				// At least ONE of these must be provided (OR logic)
				oneOf: ['order_number', 'email', 'phone']
			}
		};
		
		// Get schema - either from function definition or built-in
		let schema = null;
		
		if (func?.parameters) {
			schema = typeof func.parameters === 'string' 
				? JSON.parse(func.parameters) 
				: func.parameters;
		} else if (builtInSchemas[functionName]) {
			schema = builtInSchemas[functionName];
		}
		
		if (!schema) {
			// No schema found - allow execution
			return { skip: false };
		}
		
		// ============================================
		// CHECK: "oneOf" - at least one must be provided
		// ============================================
		if (schema.oneOf && Array.isArray(schema.oneOf)) {
			const hasAtLeastOne = schema.oneOf.some(param => {
				const value = args?.[param];
				return value !== null && value !== undefined && value.toString().trim() !== '';
			});
			
			if (!hasAtLeastOne) {
				return {
					skip: true,
					reason: `${functionName} requires at least one of: ${schema.oneOf.join(', ')} - all are empty`
				};
			}
		}
		
		// ============================================
		// CHECK: "required" - all must be provided (standard JSON schema)
		// ============================================
		if (schema.required && Array.isArray(schema.required)) {
			const missingParams = schema.required.filter(param => {
				const value = args?.[param];
				return value === null || value === undefined || value.toString().trim() === '';
			});
			
			if (missingParams.length > 0) {
				return {
					skip: true,
					reason: `${functionName} missing required parameters: ${missingParams.join(', ')}`
				};
			}
		}
		
		return { skip: false };
	}
	
	/**
	 * Sanitize response after ticket/complaint function execution
	 * - If ticket_number exists in result: inject it into response
	 * - If ticket_number missing but response has placeholder: use fallback response
	 * @private
	 */
	_sanitizeTicketResponse(response, functionResult, functionName, customerLanguage = 'english') {
		if (!response) return response;
		
		// Extract ticket number from various possible locations in function result
		const ticketNumber = functionResult?.ticket_number || 
							 functionResult?.data?.ticket_number || 
							 functionResult?.ticketNumber ||
							 functionResult?.data?.ticketNumber ||
							 functionResult?.reference_number ||
							 functionResult?.data?.reference_number ||
							 functionResult?.id ||
							 functionResult?.data?.id;
		
		// Placeholder patterns to look for
		const placeholderPatterns = [
			/\[Ticket Number\]/gi,
			/\[NUMBER\]/gi,
			/\[ticket_number\]/gi,
			/\{ticket_number\}/gi,
			/\{Ticket Number\}/gi,
			/\[TICKET\]/gi,
			/\[Reference Number\]/gi,
			/\[ID\]/gi
		];
		
		// Check if response contains any placeholders
		const hasPlaceholder = placeholderPatterns.some(pattern => pattern.test(response));
		
		// Case 1: We have actual ticket number - inject it
		if (ticketNumber) {
			let sanitizedResponse = response;
			placeholderPatterns.forEach(pattern => {
				sanitizedResponse = sanitizedResponse.replace(pattern, ticketNumber);
			});
			console.log(`🎫 Injected ticket number: ${ticketNumber} into response`);
			return sanitizedResponse;
		}
		
		// Case 2: No ticket number but response has placeholder - use fallback
		if (hasPlaceholder) {
			console.log(`⚠️ Response has placeholder but no ticket number - using fallback`);
			
			// Check if function actually failed
			const functionFailed = !functionResult?.success;
			
			if (functionFailed) {
				// Function failed - apologize and offer escalation
				const isUrdu = customerLanguage === 'urdu' || /urdu|roman/i.test(customerLanguage);
				return isUrdu 
					? "Maaf karein, aapki request process karte waqt kuch masla aa gaya. Humari team se koi jald aap se contact karega."
					: "We apologize, there was an issue processing your request. Our team will contact you shortly to assist.";
			} else {
				// Function succeeded but no ticket number in response - remove placeholder mention
				let cleanResponse = response;
				placeholderPatterns.forEach(pattern => {
					cleanResponse = cleanResponse.replace(pattern, '');
				});
				// Clean up any "ticket number: " or similar prefixes left orphaned
				cleanResponse = cleanResponse
					.replace(/ticket number:\s*\./gi, '')
					.replace(/aapka ticket number\s*hai\./gi, 'aapki request note kar li gayi hai.')
					.replace(/your ticket number is\s*\./gi, 'your request has been noted.')
					.replace(/\s{2,}/g, ' ')
					.trim();
				return cleanResponse;
			}
		}
		
		// Case 3: No placeholder in response - return as-is
		return response;
	}

	/**
	 * Detect customer language from message history
	 * @private
	 */
	_detectCustomerLanguage(history, currentMessage) {
		const recentText = [
			currentMessage || '',
			...(history || []).slice(-3).map(m => m.content || '')
		].join(' ').toLowerCase();
		
		// Urdu/Roman Urdu indicators
		const urduPatterns = /\b(kya|hai|mera|aap|hum|yeh|nahi|kaise|chahiye|shukriya|please|order|parcel|aaya|gaya|wala|wali|karein|dijiye|batao|bhejo)\b/i;
		
		if (urduPatterns.test(recentText)) {
			return 'urdu';
		}
		
		return 'english';
	}
}

module.exports = new ChatService();