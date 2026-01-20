/**
 * Session Cleanup Job
 * 
 * Auto-closes inactive sessions and cleans up:
 * - Inactive sessions (no messages for X minutes)
 * - Soft-closed sessions (user said bye, timeout expired)
 * - Old message buffers (from rapid-fire collection)
 * 
 * Runs every 1 minute
 */
const db = require('../config/database');

class SessionCleanup {
  
  /**
   * Default timeout in minutes
   */
  static DEFAULT_TIMEOUT = 30;

  /**
   * Close sessions inactive for more than the configured timeout
   */
  async closeInactiveSessions() {
    try {
      console.log('🧹 Running session cleanup job...');
      
      let totalClosed = 0;

      // ============================================
      // 1. LEGACY: Close inactive sessions (old way)
      // ============================================
      const [inactiveSessions] = await db.query(`
        SELECT DISTINCT 
          cs.id as session_id,
          cs.tenant_id,
          cs.agent_id,
          MAX(cm.created_at) as last_message_time
        FROM yovo_tbl_aiva_chat_sessions cs
        LEFT JOIN yovo_tbl_aiva_chat_messages cm ON cs.id = cm.session_id
        WHERE cs.status = 'active'
        GROUP BY cs.id, cs.tenant_id, cs.agent_id
        HAVING MAX(cm.created_at) < DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      `);

      if (inactiveSessions.length > 0) {
        console.log(`📊 Found ${inactiveSessions.length} inactive sessions (legacy)`);
        
        for (const session of inactiveSessions) {
          try {
            await db.query(
              `UPDATE yovo_tbl_aiva_chat_sessions 
               SET status = 'ended', 
                   end_time = NOW(),
                   metadata = JSON_SET(
                     COALESCE(metadata, '{}'),
                     '$.closure_reason', 'inactivity_timeout',
                     '$.auto_closed', true
                   )
               WHERE id = ?`,
              [session.session_id]
            );
            totalClosed++;
            console.log(`✅ Closed inactive session: ${session.session_id}`);
          } catch (error) {
            console.error(`❌ Failed to close session ${session.session_id}:`, error);
          }
        }
      }

      // ============================================
      // 2. FLOW ENGINE: Close sessions using new lifecycle
      // ============================================
      const flowEngineClosed = await this.closeFlowEngineSessions();
      totalClosed += flowEngineClosed;

      // ============================================
      // 3. FLOW ENGINE: Clean up message buffers
      // ============================================
      const buffersCleared = await this.cleanupMessageBuffers();

      // Summary
      if (totalClosed === 0 && buffersCleared === 0) {
        console.log('✅ No cleanup needed');
      } else {
        console.log(`🎉 Cleanup complete: ${totalClosed} sessions closed, ${buffersCleared} buffers cleared`);
      }

      return {
        closed: totalClosed,
        buffersCleared: buffersCleared
      };

    } catch (error) {
      console.error('❌ Session cleanup job failed:', error);
      throw error;
    }
  }

  /**
   * Close Flow Engine sessions (soft_closed → closed, inactive active → closed)
   */
  async closeFlowEngineSessions() {
    try {
      // Check if session_status column exists
      const [columns] = await db.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
        AND column_name = 'session_status'
      `);

      if (columns.length === 0) {
        // Column doesn't exist yet, skip Flow Engine cleanup
        return 0;
      }

      let totalClosed = 0;

      // Get agents with custom timeout settings
      const [agents] = await db.query(`
        SELECT id, session_timeout_minutes 
        FROM yovo_tbl_aiva_agents 
        WHERE session_timeout_minutes IS NOT NULL
      `);

      // Process each agent with custom timeout
      for (const agent of agents) {
        const timeout = agent.session_timeout_minutes || SessionCleanup.DEFAULT_TIMEOUT;

        // Close soft-closed sessions past timeout
        const [softResult] = await db.query(`
          UPDATE yovo_tbl_aiva_chat_sessions 
          SET session_status = 'closed', 
              status = 'ended',
              end_time = NOW()
          WHERE agent_id = ? 
            AND session_status = 'soft_closed' 
            AND soft_closed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
        `, [agent.id, timeout]);

        // Close inactive active sessions (using last_activity_at)
        const [activeResult] = await db.query(`
          UPDATE yovo_tbl_aiva_chat_sessions 
          SET session_status = 'closed', 
              status = 'ended',
              end_time = NOW()
          WHERE agent_id = ? 
            AND session_status = 'active' 
            AND last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
        `, [agent.id, timeout]);

        const closed = (softResult.affectedRows || 0) + (activeResult.affectedRows || 0);
        if (closed > 0) {
          console.log(`  Agent ${agent.id}: closed ${closed} sessions (timeout: ${timeout}min)`);
        }
        totalClosed += closed;
      }

      // Handle sessions from agents without custom timeout (use default)
      const [defaultSoftResult] = await db.query(`
        UPDATE yovo_tbl_aiva_chat_sessions cs
        LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
        SET cs.session_status = 'closed', 
            cs.status = 'ended',
            cs.end_time = NOW()
        WHERE cs.session_status = 'soft_closed' 
          AND cs.soft_closed_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          AND (a.session_timeout_minutes IS NULL OR a.id IS NULL)
      `, [SessionCleanup.DEFAULT_TIMEOUT]);

      const [defaultActiveResult] = await db.query(`
        UPDATE yovo_tbl_aiva_chat_sessions cs
        LEFT JOIN yovo_tbl_aiva_agents a ON cs.agent_id = a.id
        SET cs.session_status = 'closed', 
            cs.status = 'ended',
            cs.end_time = NOW()
        WHERE cs.session_status = 'active' 
          AND cs.last_activity_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          AND (a.session_timeout_minutes IS NULL OR a.id IS NULL)
      `, [SessionCleanup.DEFAULT_TIMEOUT]);

      totalClosed += (defaultSoftResult.affectedRows || 0) + (defaultActiveResult.affectedRows || 0);

      return totalClosed;

    } catch (error) {
      console.error('Flow Engine session cleanup error:', error);
      return 0;
    }
  }

  /**
   * Clean up old message buffers
   */
  async cleanupMessageBuffers() {
    try {
      // Check if table exists
      const [tables] = await db.query(`
        SELECT TABLE_NAME FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_message_buffer'
      `);

      if (tables.length === 0) {
        // Table doesn't exist yet
        return 0;
      }

      // Delete old processed buffers (older than 1 minute)
      const [result] = await db.query(`
        DELETE FROM yovo_tbl_aiva_message_buffer 
        WHERE status = 'done' 
          AND last_message_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      `);

      // Also delete stuck buffers (processing for more than 5 minutes)
      const [stuckResult] = await db.query(`
        DELETE FROM yovo_tbl_aiva_message_buffer 
        WHERE status = 'processing' 
          AND last_message_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      `);

      // Release expired locks
      await db.query(`
        UPDATE yovo_tbl_aiva_message_buffer 
        SET status = 'pending', lock_expires_at = NULL
        WHERE status = 'processing' 
          AND lock_expires_at < NOW()
      `);

      return (result.affectedRows || 0) + (stuckResult.affectedRows || 0);

    } catch (error) {
      console.error('Message buffer cleanup error:', error);
      return 0;
    }
  }

  /**
   * Start the cleanup job
   * Runs every 1 minute
   */
  start() {
    console.log('🚀 Starting session cleanup job (runs every 1 minute)');
    
    // Run immediately on start
    this.closeInactiveSessions();
    
    // Then run every 1 minute
    this.interval = setInterval(() => {
      this.closeInactiveSessions();
    }, 60000); // 60 seconds
  }

  /**
   * Stop the cleanup job
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      console.log('🛑 Session cleanup job stopped');
    }
  }
}

module.exports = new SessionCleanup();