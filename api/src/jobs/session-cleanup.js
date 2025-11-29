/**
 * Session Cleanup Job
 * Auto-closes inactive sessions after 5 minutes
 */
const db = require('../config/database');

class SessionCleanup {
  /**
   * Close sessions inactive for more than 5 minutes
   */
  async closeInactiveSessions() {
    try {
      console.log('🧹 Running session cleanup job...');
      
      // Find active sessions with last message > 5 minutes ago
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

      if (inactiveSessions.length === 0) {
        console.log('✅ No inactive sessions to close');
        return { closed: 0 };
      }

      console.log(`📊 Found ${inactiveSessions.length} inactive sessions`);

      // Close each session
      let closedCount = 0;
      for (const session of inactiveSessions) {
        try {
          // Update session status
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

          closedCount++;
          console.log(`✅ Closed inactive session: ${session.session_id}`);
        } catch (error) {
          console.error(`❌ Failed to close session ${session.session_id}:`, error);
        }
      }

      console.log(`🎉 Session cleanup complete: ${closedCount}/${inactiveSessions.length} closed`);
      
      return {
        checked: inactiveSessions.length,
        closed: closedCount
      };

    } catch (error) {
      console.error('❌ Session cleanup job failed:', error);
      throw error;
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