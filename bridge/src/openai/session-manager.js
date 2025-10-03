/**
 * Session Manager - Manages OpenAI session lifecycle
 */

const OpenAIRealtimeClient = require('./realtime-client');
const CostCalculator = require('./cost-calculator');
const ContextInjector = require('../functions/context-injector');
const logger = require('../utils/logger');

class SessionManager {
    constructor(apiKey, profitMargin = 20) {
        this.apiKey = apiKey;
        this.sessions = new Map();
        this.costCalculator = new CostCalculator(profitMargin);
        this.contextInjector = new ContextInjector();
    }
    
    /**
     * Create a new session
     */
    async createSession(sessionId, config = {}) {
        try {
            logger.info(`Creating session: ${sessionId}`);
            
            // Create OpenAI client
            const client = new OpenAIRealtimeClient(this.apiKey, {
                model: config.model || process.env.OPENAI_MODEL || 'gpt-4o-mini-realtime-preview-2024-12-17',
                voice: config.voice || 'shimmer',
                temperature: config.temperature || 0.6,
                maxResponseTokens: config.maxResponseTokens || 200
            });
            
            // Connect to OpenAI
            await client.connect();
            
            // Initialize cost tracking
            this.costCalculator.initSession(sessionId, client.options.model);
            
            // Initialize context
            this.contextInjector.initSession(sessionId);
            
            // Store session
            const session = {
                id: sessionId,
                client: client,
                config: config,
                startTime: Date.now(),
                isActive: true,
                rtpInfo: config.rtpInfo || null,
                callerId: config.callerId || 'unknown',
                lastActivity: Date.now()
            };
            
            this.sessions.set(sessionId, session);
            
            logger.info(`Session created successfully: ${sessionId}`);
            return session;
            
        } catch (error) {
            logger.error(`Failed to create session ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Configure session with instructions and tools
     */
    async configureSession(sessionId, instructions, tools = [], language = 'ur') {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        
        try {
            // Get base instructions
            let fullInstructions = instructions;
            
            // Add context if available
            const contextString = this.contextInjector.generateContextString(sessionId);
            if (contextString) {
                fullInstructions += contextString;
            }
            
            // Configure the session
            await session.client.configureSession(fullInstructions, tools, language);
            
            session.lastActivity = Date.now();
            
            logger.info(`Session configured: ${sessionId}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to configure session ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Update session instructions dynamically (with context)
     */
    async updateInstructions(sessionId, baseInstructions) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        
        try {
            // Add context to instructions
            const contextString = this.contextInjector.generateContextString(sessionId);
            const fullInstructions = baseInstructions + (contextString || '');
            
            await session.client.updateInstructions(fullInstructions);
            
            session.lastActivity = Date.now();
            
            logger.debug(`Instructions updated for session: ${sessionId}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to update instructions for ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Add function result to context and update instructions
     */
    async addFunctionResultToContext(sessionId, functionName, args, result, baseInstructions) {
        try {
            // Add to context
            this.contextInjector.addFunctionResult(sessionId, functionName, args, result);
            
            // Update instructions with new context
            if (baseInstructions) {
                await this.updateInstructions(sessionId, baseInstructions);
            }
            
            logger.debug(`Function result added to context: ${functionName}`);
            return true;
            
        } catch (error) {
            logger.error(`Failed to add function result to context:`, error);
            return false;
        }
    }
    
    /**
     * Get session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    
    /**
     * Get all active sessions
     */
    getActiveSessions() {
        return Array.from(this.sessions.values()).filter(s => s.isActive);
    }
    
    /**
     * Track audio input
     */
    startAudioInput(sessionId) {
        this.costCalculator.startAudioInput(sessionId);
    }
    
    stopAudioInput(sessionId) {
        this.costCalculator.stopAudioInput(sessionId);
    }
    
    /**
     * Track audio output
     */
    startAudioOutput(sessionId) {
        this.costCalculator.startAudioOutput(sessionId);
    }
    
    stopAudioOutput(sessionId) {
        this.costCalculator.stopAudioOutput(sessionId);
    }
    
    /**
     * Update token usage
     */
    updateTokenUsage(sessionId, usage) {
        this.costCalculator.updateTokenUsage(sessionId, usage);
    }
    
    /**
     * Get current cost
     */
    getCurrentCost(sessionId) {
        return this.costCalculator.calculateCost(sessionId);
    }
    
    /**
     * Get session context
     */
    getSessionContext(sessionId) {
        return this.contextInjector.getFormattedContext(sessionId);
    }
    
    /**
     * End session
     */
    async endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn(`Attempted to end non-existent session: ${sessionId}`);
            return null;
        }
        
        try {
            logger.info(`Ending session: ${sessionId}`);
            
            // Get final cost
            const finalCost = this.costCalculator.endSession(sessionId);
            
            // Disconnect client
            if (session.client) {
                await session.client.disconnect();
            }
            
            // Clear context
            this.contextInjector.clearSession(sessionId);
            
            // Mark as inactive
            session.isActive = false;
            session.endTime = Date.now();
            
            // Remove from active sessions
            this.sessions.delete(sessionId);
            
            logger.info(`Session ended: ${sessionId}`, {
                duration: ((session.endTime - session.startTime) / 1000).toFixed(2) + 's',
                cost: finalCost?.formatted.finalCost
            });
            
            return {
                sessionId,
                startTime: session.startTime,
                endTime: session.endTime,
                duration: session.endTime - session.startTime,
                cost: finalCost
            };
            
        } catch (error) {
            logger.error(`Error ending session ${sessionId}:`, error);
            throw error;
        }
    }
    
    /**
     * Cleanup stale sessions
     */
    cleanupStaleSessions(timeoutMs = 300000) {
		const now = Date.now();
		const staleSessions = [];
		
		for (const [sessionId, session] of this.sessions.entries()) {
			if (!session.isActive) continue;
			
			const timeSinceActivity = now - session.lastActivity;
			
			// Don't cleanup if:
			// 1. Recent activity (within timeout)
			// 2. Audio is currently being transmitted
			// 3. Response is in progress
			const client = session.client;
			const isTransmitting = client && client.isConnected;
			
			if (timeSinceActivity > timeoutMs && !isTransmitting) {
				logger.warn(`Session ${sessionId} inactive for ${(timeSinceActivity/1000).toFixed(0)}s`);
				staleSessions.push(sessionId);
			}
		}
		
		for (const sessionId of staleSessions) {
			logger.warn(`Cleaning up stale session: ${sessionId}`);
			this.endSession(sessionId).catch(err => {
				logger.error(`Error cleaning up session ${sessionId}:`, err);
			});
		}
		
		return staleSessions.length;
	}
    
    /**
     * Get statistics
     */
    getStats() {
        const sessions = Array.from(this.sessions.values());
        const activeSessions = sessions.filter(s => s.isActive);
        
        return {
            total: sessions.length,
            active: activeSessions.length,
            sessions: activeSessions.map(s => ({
                id: s.id,
                duration: ((Date.now() - s.startTime) / 1000).toFixed(2) + 's',
                callerId: s.callerId,
                lastActivity: new Date(s.lastActivity).toISOString()
            }))
        };
    }
}

module.exports = SessionManager;