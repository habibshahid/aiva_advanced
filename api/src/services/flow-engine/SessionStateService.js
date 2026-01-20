/**
 * Session State Service
 * 
 * Manages session lifecycle and flow state for Flow Engine v2.
 * 
 * EXISTING COLUMNS (always available):
 * - id, tenant_id, agent_id, channel, channel_user_id, channel_user_name
 * - channel_metadata, context_data, llm_context_hints
 * - user_id, session_name, status, metadata, start_time, end_time
 * 
 * NEW COLUMNS (added by migration):
 * - session_status, soft_closed_at, last_activity_at
 * - active_flow, paused_flows, context_memory
 * 
 * CHANNEL is ENUM: whatsapp, web_chat, public_chat, fb_pages, fb_messenger,
 *                  instagram, instagram_dm, twitter, twitter_dm, email,
 *                  linkedin_feed, sms, voice, api
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../../config/database');

class SessionStateService {

    // Valid channel enum values
    static VALID_CHANNELS = [
        'whatsapp', 'web_chat', 'public_chat', 'fb_pages', 'fb_messenger',
        'instagram', 'instagram_dm', 'twitter', 'twitter_dm', 'email',
        'linkedin_feed', 'sms', 'voice', 'api'
    ];

    /**
     * Session status constants
     */
    static STATUS = {
        ACTIVE: 'active',
        SOFT_CLOSED: 'soft_closed',
        CLOSED: 'closed'
    };

    // Cache for column existence checks
    static _columnCache = null;

    /**
     * Check which columns exist in the sessions table
     */
    static async _checkColumns() {
        if (this._columnCache) {
            return this._columnCache;
        }

        try {
            const [columns] = await db.query(`
                SELECT COLUMN_NAME FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                AND table_name = 'yovo_tbl_aiva_chat_sessions'
                AND column_name IN ('session_status', 'soft_closed_at', 'last_activity_at', 
                                    'active_flow', 'paused_flows', 'context_memory')
            `);

            const found = columns.map(c => c.COLUMN_NAME);
            
            this._columnCache = {
                hasSessionStatus: found.includes('session_status'),
                hasSoftClosedAt: found.includes('soft_closed_at'),
                hasLastActivityAt: found.includes('last_activity_at'),
                hasActiveFlow: found.includes('active_flow'),
                hasPausedFlows: found.includes('paused_flows'),
                hasContextMemory: found.includes('context_memory'),
                hasNewColumns: found.length >= 4
            };

            console.log('📊 Session columns check:', this._columnCache);
            return this._columnCache;

        } catch (error) {
            console.error('Error checking columns:', error);
            return {
                hasSessionStatus: false,
                hasSoftClosedAt: false,
                hasLastActivityAt: false,
                hasActiveFlow: false,
                hasPausedFlows: false,
                hasContextMemory: false,
                hasNewColumns: false
            };
        }
    }

    /**
     * Map channel string to valid ENUM value
     */
    static _mapChannel(channelId) {
        if (!channelId) return 'api';
        
        const channelPart = channelId.includes(':') ? channelId.split(':')[0].toLowerCase() : channelId.toLowerCase();
        
        // Direct match
        if (this.VALID_CHANNELS.includes(channelPart)) {
            return channelPart;
        }
        
        // Common mappings
        const mappings = {
            'test': 'api',
            'wa': 'whatsapp',
            'webchat': 'web_chat',
            'web': 'web_chat',
            'chat': 'public_chat',
            'facebook': 'fb_messenger',
            'fb': 'fb_messenger',
            'ig': 'instagram',
            'insta': 'instagram',
            'tw': 'twitter',
            'x': 'twitter'
        };
        
        return mappings[channelPart] || 'api';
    }

    /**
     * Get or create session with flow state
     */
    static async getOrCreateSession(sessionId, agentId, channelId, customerInfo = {}) {
        try {
            // Try to get existing session by ID
            if (sessionId) {
                const session = await this.getSession(sessionId);
                if (session && session.status !== 'ended') {
                    // Reactivate if soft-closed
                    if (session.session_status === this.STATUS.SOFT_CLOSED) {
                        await this.reactivateSession(sessionId);
                        session.session_status = this.STATUS.ACTIVE;
                        console.log(`🔄 Reactivated soft-closed session ${sessionId}`);
                    }
                    await this._updateLastActivity(sessionId);
                    return session;
                }
            }

            // Extract channel user ID from channelId
            const channelUserId = this._extractChannelUserId(channelId);
            const cols = await this._checkColumns();

            // Try to find existing active session for this user
            let query, params;
            
            if (cols.hasSessionStatus) {
                query = `SELECT * FROM yovo_tbl_aiva_chat_sessions 
                         WHERE agent_id = ? 
                           AND channel_user_id = ?
                           AND session_status IN ('active', 'soft_closed')
                         ORDER BY start_time DESC LIMIT 1`;
            } else {
                query = `SELECT * FROM yovo_tbl_aiva_chat_sessions 
                         WHERE agent_id = ? 
                           AND channel_user_id = ?
                           AND status = 'active'
                         ORDER BY start_time DESC LIMIT 1`;
            }
            params = [agentId, channelUserId];

            const [existingSessions] = await db.query(query, params);

            if (existingSessions.length > 0) {
                const session = this._parseSessionJson(existingSessions[0]);
                
                // Reactivate if soft-closed
                if (cols.hasSessionStatus && session.session_status === this.STATUS.SOFT_CLOSED) {
                    await this.reactivateSession(session.id);
                    session.session_status = this.STATUS.ACTIVE;
                    console.log(`🔄 Reactivated existing session ${session.id} for user ${channelUserId}`);
                }
                
                await this._updateLastActivity(session.id);
                return session;
            }

            // Create new session
            return await this._createSession(agentId, channelId, channelUserId, customerInfo);

        } catch (error) {
            console.error('Error in SessionStateService.getOrCreateSession:', error);
            throw error;
        }
    }

    /**
     * Extract channel user ID from channelId string
     */
    static _extractChannelUserId(channelId) {
        if (!channelId) return null;
        if (channelId.includes(':')) {
            return channelId.split(':').pop();
        }
        return channelId;
    }

    /**
     * Get session by ID
     */
    static async getSession(sessionId) {
        try {
            const [sessions] = await db.query(
                `SELECT * FROM yovo_tbl_aiva_chat_sessions WHERE id = ?`,
                [sessionId]
            );

            if (sessions.length === 0) {
                return null;
            }

            return this._parseSessionJson(sessions[0]);
        } catch (error) {
            console.error('Error in SessionStateService.getSession:', error);
            return null;
        }
    }

    /**
     * Update session activity timestamp
     */
    static async _updateLastActivity(sessionId) {
        try {
            const cols = await this._checkColumns();
            if (cols.hasLastActivityAt) {
                await db.query(
                    `UPDATE yovo_tbl_aiva_chat_sessions SET last_activity_at = NOW() WHERE id = ?`,
                    [sessionId]
                );
            }
        } catch (error) {
            // Non-critical
        }
    }

    /**
     * Soft close session (user said thanks/bye but might come back)
     */
    static async softCloseSession(sessionId) {
        try {
            const cols = await this._checkColumns();
            
            if (cols.hasSessionStatus && cols.hasSoftClosedAt) {
                await db.query(
                    `UPDATE yovo_tbl_aiva_chat_sessions 
                     SET session_status = 'soft_closed', soft_closed_at = NOW()
                     WHERE id = ? AND session_status = 'active'`,
                    [sessionId]
                );
                console.log(`🔕 Soft-closed session ${sessionId}`);
            }
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.softCloseSession:', error);
            return false;
        }
    }

    /**
     * Hard close session (explicit end or timeout)
     */
    static async closeSession(sessionId) {
        try {
            const cols = await this._checkColumns();
            
            let query;
            if (cols.hasSessionStatus) {
                query = `UPDATE yovo_tbl_aiva_chat_sessions 
                         SET session_status = 'closed', status = 'ended', 
                             active_flow = NULL, end_time = NOW()
                         WHERE id = ?`;
            } else {
                query = `UPDATE yovo_tbl_aiva_chat_sessions 
                         SET status = 'ended', end_time = NOW()
                         WHERE id = ?`;
            }
            
            await db.query(query, [sessionId]);
            console.log(`🔴 Closed session ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.closeSession:', error);
            return false;
        }
    }

    /**
     * Reactivate soft-closed session
     */
    static async reactivateSession(sessionId) {
        try {
            const cols = await this._checkColumns();
            
            if (cols.hasSessionStatus) {
                let query = `UPDATE yovo_tbl_aiva_chat_sessions 
                             SET session_status = 'active', soft_closed_at = NULL`;
                if (cols.hasLastActivityAt) {
                    query += `, last_activity_at = NOW()`;
                }
                query += ` WHERE id = ?`;
                await db.query(query, [sessionId]);
            }
            
            console.log(`🔄 Reactivated session ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.reactivateSession:', error);
            return false;
        }
    }

    // ========================================================================
    // FLOW STATE MANAGEMENT
    // ========================================================================

    /**
     * Set the active flow for a session
     */
    static async setActiveFlow(sessionId, flowState) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasActiveFlow) {
                console.log('⚠️ active_flow column not available');
                return false;
            }

            let query = `UPDATE yovo_tbl_aiva_chat_sessions SET active_flow = ?`;
            if (cols.hasLastActivityAt) {
                query += `, last_activity_at = NOW()`;
            }
            query += ` WHERE id = ?`;

            await db.query(query, [JSON.stringify(flowState), sessionId]);
            console.log(`📌 Set active flow for session ${sessionId}: ${flowState.flow_id}`);
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.setActiveFlow:', error);
            return false;
        }
    }

    /**
     * Update the current step in active flow
     */
    static async updateFlowStep(sessionId, newStep, additionalParams = {}) {
        try {
            const session = await this.getSession(sessionId);
            if (!session || !session.active_flow) {
                return false;
            }

            const activeFlow = session.active_flow;
            activeFlow.current_step = newStep;
            activeFlow.params_collected = {
                ...activeFlow.params_collected,
                ...additionalParams
            };

            for (const key of Object.keys(additionalParams)) {
                const idx = activeFlow.params_pending?.indexOf(key);
                if (idx > -1) {
                    activeFlow.params_pending.splice(idx, 1);
                }
            }

            return await this.setActiveFlow(sessionId, activeFlow);
        } catch (error) {
            console.error('Error in SessionStateService.updateFlowStep:', error);
            return false;
        }
    }

    /**
     * Pause current flow and push to stack
     */
    static async pauseCurrentFlow(sessionId, reason = null) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasActiveFlow || !cols.hasPausedFlows) {
                return null;
            }

            const session = await this.getSession(sessionId);
            if (!session || !session.active_flow) {
                return null;
            }

            const activeFlow = { ...session.active_flow };
            activeFlow.paused_at = new Date().toISOString();
            activeFlow.pause_reason = reason;
            activeFlow.status = 'paused';

            const pausedFlows = session.paused_flows || [];
            pausedFlows.push(activeFlow);

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET active_flow = NULL, paused_flows = ?
                 WHERE id = ?`,
                [JSON.stringify(pausedFlows), sessionId]
            );

            console.log(`⏸️ Paused flow ${activeFlow.flow_id} for session ${sessionId}`);
            return activeFlow;
        } catch (error) {
            console.error('Error in SessionStateService.pauseCurrentFlow:', error);
            return null;
        }
    }

    /**
     * Resume most recent paused flow
     */
    static async resumePausedFlow(sessionId) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasActiveFlow || !cols.hasPausedFlows) {
                return null;
            }

            const session = await this.getSession(sessionId);
            if (!session) {
                return null;
            }

            const pausedFlows = session.paused_flows || [];
            
            let flowToResume = null;
            for (let i = pausedFlows.length - 1; i >= 0; i--) {
                if (pausedFlows[i].status === 'paused') {
                    flowToResume = pausedFlows.splice(i, 1)[0];
                    break;
                }
            }

            if (!flowToResume) {
                return null;
            }

            flowToResume.resumed_at = new Date().toISOString();
            delete flowToResume.paused_at;
            delete flowToResume.pause_reason;
            flowToResume.status = 'active';

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET active_flow = ?, paused_flows = ?
                 WHERE id = ?`,
                [JSON.stringify(flowToResume), JSON.stringify(pausedFlows), sessionId]
            );

            console.log(`▶️ Resumed flow ${flowToResume.flow_id} for session ${sessionId}`);
            return flowToResume;
        } catch (error) {
            console.error('Error in SessionStateService.resumePausedFlow:', error);
            return null;
        }
    }

    /**
     * Complete current flow
     */
    static async completeFlow(sessionId, result = {}) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasActiveFlow) {
                return null;
            }

            const session = await this.getSession(sessionId);
            if (!session || !session.active_flow) {
                return null;
            }

            const completedFlow = { ...session.active_flow };
            completedFlow.completed_at = new Date().toISOString();
            completedFlow.result = result;
            completedFlow.status = 'completed';

            const pausedFlows = session.paused_flows || [];
            pausedFlows.push(completedFlow);

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET active_flow = NULL, paused_flows = ?
                 WHERE id = ?`,
                [JSON.stringify(pausedFlows), sessionId]
            );

            console.log(`✅ Completed flow ${completedFlow.flow_id} for session ${sessionId}`);
            return completedFlow;
        } catch (error) {
            console.error('Error in SessionStateService.completeFlow:', error);
            return null;
        }
    }

    /**
     * Abandon current flow without completing
     */
    static async abandonFlow(sessionId, reason = null) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasActiveFlow) {
                return true;
            }

            const session = await this.getSession(sessionId);
            if (!session || !session.active_flow) {
                return true;
            }

            const abandonedFlow = { ...session.active_flow };
            abandonedFlow.abandoned_at = new Date().toISOString();
            abandonedFlow.abandon_reason = reason;
            abandonedFlow.status = 'abandoned';

            const pausedFlows = session.paused_flows || [];
            pausedFlows.push(abandonedFlow);

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET active_flow = NULL, paused_flows = ?
                 WHERE id = ?`,
                [JSON.stringify(pausedFlows), sessionId]
            );

            console.log(`❌ Abandoned flow ${abandonedFlow.flow_id} for session ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.abandonFlow:', error);
            return false;
        }
    }

    /**
     * Clear all paused flows for a session
     */
    static async clearPausedFlows(sessionId) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasPausedFlows) {
                return true;
            }

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET paused_flows = '[]'
                 WHERE id = ?`,
                [sessionId]
            );

            console.log(`🧹 Cleared paused flows for session ${sessionId}`);
            return true;
        } catch (error) {
            console.error('Error in SessionStateService.clearPausedFlows:', error);
            return false;
        }
    }

    // ========================================================================
    // CONTEXT MEMORY
    // ========================================================================

    /**
     * Update context memory with new facts
     */
    static async updateContextMemory(sessionId, newFacts) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasContextMemory) {
                return null;
            }

            const session = await this.getSession(sessionId);
            if (!session) {
                return null;
            }

            const existingMemory = session.context_memory || {
                customer_info: {},
                known_orders: [],
                mentioned_products: [],
                sentiment: 'neutral',
                language: null
            };

            const mergedMemory = this._mergeContextMemory(existingMemory, newFacts);

            await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions SET context_memory = ? WHERE id = ?`,
                [JSON.stringify(mergedMemory), sessionId]
            );

            return mergedMemory;
        } catch (error) {
            console.error('Error in SessionStateService.updateContextMemory:', error);
            return null;
        }
    }

    // ========================================================================
    // CLEANUP METHODS
    // ========================================================================

    /**
     * Close expired soft-closed sessions
     */
    static async closeExpiredSessions(timeoutMinutes = 30) {
        try {
            const cols = await this._checkColumns();
            if (!cols.hasSessionStatus || !cols.hasSoftClosedAt) {
                return { closed: 0 };
            }

            const [result] = await db.query(
                `UPDATE yovo_tbl_aiva_chat_sessions 
                 SET session_status = 'closed', status = 'ended', end_time = NOW()
                 WHERE session_status = 'soft_closed' 
                 AND soft_closed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
                [timeoutMinutes]
            );

            const closed = result.affectedRows || 0;
            if (closed > 0) {
                console.log(`🧹 Closed ${closed} expired soft-closed sessions`);
            }
            return { closed };
        } catch (error) {
            console.error('Error in closeExpiredSessions:', error);
            return { closed: 0 };
        }
    }

    /**
     * Run full cleanup
     */
    static async runCleanup(timeoutMinutes = 30) {
        return await this.closeExpiredSessions(timeoutMinutes);
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Create a new session
     */
    static async _createSession(agentId, channelId, channelUserId, customerInfo = {}) {
        const cols = await this._checkColumns();
        const id = uuidv4();

        // Map to valid channel enum value
        const channel = this._mapChannel(channelId);

        // Get tenant_id from agent
        const [agents] = await db.query('SELECT tenant_id FROM yovo_tbl_aiva_agents WHERE id = ?', [agentId]);
        if (agents.length === 0) {
            throw new Error(`Agent ${agentId} not found`);
        }
        const tenantId = agents[0].tenant_id;

        try {
            // Build dynamic insert based on available columns
            let columns = ['id', 'tenant_id', 'agent_id', 'channel', 'channel_user_id', 'channel_user_name', 'status'];
            let placeholders = ['?', '?', '?', '?', '?', '?', "'active'"];
            let values = [id, tenantId, agentId, channel, channelUserId, customerInfo.name || null];

            if (cols.hasSessionStatus) {
                columns.push('session_status');
                placeholders.push("'active'");
            }
            if (cols.hasLastActivityAt) {
                columns.push('last_activity_at');
                placeholders.push('NOW()');
            }
            if (cols.hasContextMemory) {
                columns.push('context_memory');
                placeholders.push('?');
                values.push(JSON.stringify({
                    customer_info: {
                        phone: customerInfo.phone || channelUserId,
                        name: customerInfo.name || null
                    },
                    known_orders: [],
                    mentioned_products: [],
                    sentiment: 'neutral',
                    language: null
                }));
            }

            const query = `INSERT INTO yovo_tbl_aiva_chat_sessions (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
            await db.query(query, values);

            console.log(`🆕 Created new session ${id} for agent ${agentId}, user ${channelUserId}`);

            return {
                id,
                tenant_id: tenantId,
                agent_id: agentId,
                channel,
                channel_user_id: channelUserId,
                session_status: this.STATUS.ACTIVE,
                status: 'active',
                active_flow: null,
                paused_flows: [],
                context_memory: {
                    customer_info: {
                        phone: customerInfo.phone || channelUserId,
                        name: customerInfo.name || null
                    },
                    known_orders: [],
                    mentioned_products: [],
                    sentiment: 'neutral',
                    language: null
                }
            };

        } catch (error) {
            console.error('Error creating session:', error);
            throw error;
        }
    }

    /**
     * Parse JSON fields from database row
     */
    static _parseSessionJson(row) {
        const session = { ...row };

        const jsonFields = ['active_flow', 'paused_flows', 'context_memory', 'complaint_state', 
                           'metadata', 'channel_metadata', 'context_data'];
        for (const field of jsonFields) {
            if (session[field] && typeof session[field] === 'string') {
                try {
                    session[field] = JSON.parse(session[field]);
                } catch (e) {
                    session[field] = field === 'paused_flows' ? [] : null;
                }
            }
        }

        if (!Array.isArray(session.paused_flows)) {
            session.paused_flows = [];
        }

        return session;
    }

    /**
     * Merge context memory intelligently
     */
    static _mergeContextMemory(existing, newFacts) {
        const merged = { ...existing };

        if (newFacts.customer_name || newFacts.name) {
            merged.customer_info = merged.customer_info || {};
            merged.customer_info.name = newFacts.customer_name || newFacts.name;
        }
        if (newFacts.customer_phone || newFacts.phone) {
            merged.customer_info = merged.customer_info || {};
            merged.customer_info.phone = newFacts.customer_phone || newFacts.phone;
        }
        if (newFacts.customer_email || newFacts.email) {
            merged.customer_info = merged.customer_info || {};
            merged.customer_info.email = newFacts.customer_email || newFacts.email;
        }

        if (newFacts.order_number) {
            merged.known_orders = merged.known_orders || [];
            if (!merged.known_orders.includes(newFacts.order_number)) {
                merged.known_orders.push(newFacts.order_number);
            }
        }

        if (newFacts.product_name || newFacts.product_id) {
            merged.mentioned_products = merged.mentioned_products || [];
            merged.mentioned_products.push({
                name: newFacts.product_name,
                id: newFacts.product_id,
                mentioned_at: new Date().toISOString()
            });
            if (merged.mentioned_products.length > 10) {
                merged.mentioned_products = merged.mentioned_products.slice(-10);
            }
        }

        if (newFacts.sentiment) {
            merged.sentiment = newFacts.sentiment;
        }
        if (newFacts.language) {
            merged.language = newFacts.language;
        }

        return merged;
    }
}

module.exports = SessionStateService;