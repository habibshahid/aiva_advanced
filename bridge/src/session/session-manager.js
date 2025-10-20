/**
 * Session Manager - Manages sessions for all providers
 * UPDATED: Provider-agnostic session management
 */

const logger = require('../utils/logger');

class SessionManager {
    constructor(profitMargin = 20) {
		this.sessions = new Map();
		this.profitMargin = profitMargin / 100; // Convert percentage to decimal
	}
    
    /**
     * Create a new session
     * UPDATED: Provider parameter added
     */
    createSession(sessionId, config = {}) {
        const session = {
            id: sessionId,
            provider: config.provider || 'openai',
            providerName: config.providerName || 'openai',
            created: Date.now(),
            lastActivity: Date.now(),
            
            // RTP info
            rtpInfo: config.rtpInfo || {},
            
            // Call info
            callerId: config.callerId || 'unknown',
            agentId: config.agentId || null,
            tenantId: config.tenantId || null,
            asteriskPort: config.asteriskPort || null,
            
            // Audio timing
            audioInput: {
                isActive: false,
                startTime: null,
                totalSeconds: 0
            },
            audioOutput: {
                isActive: false,
                startTime: null,
                totalSeconds: 0
            },
            
            // Provider-specific metrics
            metrics: {
                provider: config.provider || 'openai'
            },
            
            // Cost tracking
            cost: {
                base: 0,
                profit: 0,
                final: 0,
                breakdown: {}
            }
        };
        
        this.sessions.set(sessionId, session);
        logger.info(`Session created: ${sessionId} (${session.provider})`);
        
        return session;
    }
    
    /**
     * Update cost metrics from provider
     * UPDATED: Provider-agnostic cost handling
     */
    updateCostMetrics(sessionId, providerMetrics) {
		
        const session = this.sessions.get(sessionId);
        if (!session) {
            logger.warn(`Session not found: ${sessionId}`);
            return;
        }
        
        // Store provider metrics
        session.metrics = {
            ...session.metrics,
            ...providerMetrics
        };
        
        // Calculate costs
        const baseCost = providerMetrics.base_cost || 0;
        const profitAmount = baseCost * (this.profitMargin / 100);
        const finalCost = baseCost + profitAmount;
        
        session.cost = {
            base: baseCost,
            profit: profitAmount,
            final: finalCost,
            breakdown: providerMetrics.breakdown || {},
            provider: providerMetrics.provider
        };
        
        logger.debug(`Cost updated for ${sessionId}: $${finalCost.toFixed(4)}`);
    }
    
    /**
     * Get current cost
     */
    getCurrentCost(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        
        return {
            base_cost: session.cost.base,
            profit_amount: session.cost.profit,
            final_cost: session.cost.final,
            breakdown: session.cost.breakdown,
            provider: session.metrics.provider
        };
    }
    
    /**
     * Start audio input tracking
     */
    startAudioInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        if (!session.audioInput.isActive) {
            session.audioInput.isActive = true;
            session.audioInput.startTime = Date.now();
        }
    }
    
    /**
     * Stop audio input tracking
     */
    stopAudioInput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        if (session.audioInput.isActive) {
            const duration = (Date.now() - session.audioInput.startTime) / 1000;
            session.audioInput.totalSeconds += duration;
            session.audioInput.isActive = false;
            session.audioInput.startTime = null;
        }
    }
    
    /**
     * Start audio output tracking
     */
    startAudioOutput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        if (!session.audioOutput.isActive) {
            session.audioOutput.isActive = true;
            session.audioOutput.startTime = Date.now();
        }
    }
    
    /**
     * Stop audio output tracking
     */
    stopAudioOutput(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        
        if (session.audioOutput.isActive) {
            const duration = (Date.now() - session.audioOutput.startTime) / 1000;
            session.audioOutput.totalSeconds += duration;
            session.audioOutput.isActive = false;
            session.audioOutput.startTime = null;
        }
    }
    
    /**
     * Get session data
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    
    /**
     * End session and return final data
     */
    endSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        
        // Stop any active timers
        this.stopAudioInput(sessionId);
        this.stopAudioOutput(sessionId);
        
        const duration = Math.floor((Date.now() - session.created) / 1000);
        
        const finalData = {
            sessionId: sessionId,
            provider: session.provider,
            duration_seconds: duration,
            audio_input_seconds: Math.floor(session.audioInput.totalSeconds),
            audio_output_seconds: Math.floor(session.audioOutput.totalSeconds),
            metrics: session.metrics,
            cost: session.cost,
            callerId: session.callerId,
            agentId: session.agentId,
            tenantId: session.tenantId,
            asteriskPort: session.asteriskPort
        };
        
        this.sessions.delete(sessionId);
        logger.info(`Session ended: ${sessionId}`);
        
        return finalData;
    }
    
    /**
     * Cleanup stale sessions
     */
    cleanupStaleSessions(timeoutMs = 300000) {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now - session.lastActivity > timeoutMs) {
                this.endSession(sessionId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.info(`Cleaned up ${cleaned} stale sessions`);
        }
    }
}

module.exports = SessionManager;