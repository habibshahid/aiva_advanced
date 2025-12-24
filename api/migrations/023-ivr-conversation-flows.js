/**
 * Migration: IVR Conversation Flows
 * 
 * Creates tables for multi-turn conversation flows in Intent IVR:
 * - yovo_tbl_aiva_ivr_flows: Flow definitions (e.g., AC Installation, Order Status)
 * - yovo_tbl_aiva_ivr_flow_steps: Steps within each flow (slots to collect, confirmations)
 * - yovo_tbl_aiva_ivr_flow_sessions: Runtime state per call session
 * 
 * This enables:
 * - Multi-turn slot filling conversations
 * - Confirmation steps ("Is that correct?")
 * - Conditional branching
 * - Function calling when all slots are filled
 * - WhatsApp notification on completion
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting IVR Conversation Flows migration...');
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_ivr_flows table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_flows table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_flows (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Flow identification
          flow_name VARCHAR(100) NOT NULL,
          flow_key VARCHAR(50) NOT NULL,
          description TEXT DEFAULT NULL,
          
          -- Trigger configuration
          trigger_intent_id VARCHAR(36) DEFAULT NULL,
          trigger_phrases JSON DEFAULT NULL,
          
          -- Greeting/Introduction
          intro_text TEXT DEFAULT NULL,
          intro_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Completion action
          on_complete_action ENUM('function_call', 'transfer', 'respond', 'end_call') DEFAULT 'respond',
          on_complete_function_id VARCHAR(36) DEFAULT NULL,
          on_complete_function_name VARCHAR(100) DEFAULT NULL,
          on_complete_args_mapping JSON DEFAULT NULL,
          on_complete_transfer_queue VARCHAR(100) DEFAULT NULL,
          on_complete_response_text TEXT DEFAULT NULL,
          on_complete_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- WhatsApp notification
          send_whatsapp_on_complete TINYINT(1) DEFAULT 0,
          whatsapp_template_name VARCHAR(100) DEFAULT NULL,
          whatsapp_template_vars JSON DEFAULT NULL,
          
          -- Cancellation handling
          cancel_phrases JSON DEFAULT NULL,
          on_cancel_response_text TEXT DEFAULT NULL,
          on_cancel_audio_id VARCHAR(36) DEFAULT NULL,
          on_cancel_action ENUM('end_call', 'transfer', 'main_menu') DEFAULT 'end_call',
          
          -- Timeout & error handling
          step_timeout_seconds INT DEFAULT 30,
          max_retries_per_step INT DEFAULT 3,
          on_timeout_action ENUM('retry', 'skip', 'transfer', 'end') DEFAULT 'retry',
          on_timeout_audio_id VARCHAR(36) DEFAULT NULL,
          on_error_transfer_queue VARCHAR(100) DEFAULT NULL,
          on_error_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- After completion
          ask_anything_else TINYINT(1) DEFAULT 1,
          anything_else_text VARCHAR(500) DEFAULT 'Is there anything else I can help you with?',
          anything_else_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Closing
          closing_text VARCHAR(500) DEFAULT 'Thank you for calling. Goodbye!',
          closing_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Status & versioning
          is_active TINYINT(1) DEFAULT 1,
          version INT DEFAULT 1,
          
          -- Analytics
          total_started INT DEFAULT 0,
          total_completed INT DEFAULT 0,
          total_cancelled INT DEFAULT 0,
          total_timeout INT DEFAULT 0,
          avg_completion_seconds INT DEFAULT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_flow_key (agent_id, flow_key),
          KEY idx_agent (agent_id),
          KEY idx_tenant (tenant_id),
          KEY idx_trigger_intent (trigger_intent_id),
          KEY idx_active (is_active),
          
          CONSTRAINT fk_ivr_flows_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_flows_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_flows_trigger_intent FOREIGN KEY (trigger_intent_id) 
            REFERENCES yovo_tbl_aiva_ivr_intents(id) ON DELETE SET NULL,
          CONSTRAINT fk_ivr_flows_complete_function FOREIGN KEY (on_complete_function_id) 
            REFERENCES yovo_tbl_aiva_functions(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_flows table');
      
      // =================================================================
      // 2. Create yovo_tbl_aiva_ivr_flow_steps table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_flow_steps table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_flow_steps (
          id VARCHAR(36) PRIMARY KEY,
          flow_id VARCHAR(36) NOT NULL,
          
          -- Step identification
          step_order INT NOT NULL,
          step_key VARCHAR(50) NOT NULL,
          step_name VARCHAR(100) DEFAULT NULL,
          step_type ENUM('collect_slot', 'confirm', 'branch', 'function', 'respond', 'transfer') DEFAULT 'collect_slot',
          
          -- Prompt configuration
          prompt_text TEXT NOT NULL,
          prompt_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Slot configuration (for collect_slot type)
          slot_name VARCHAR(50) DEFAULT NULL,
          slot_type ENUM('name', 'phone', 'email', 'number', 'alphanumeric', 'address', 'city', 'date', 'time', 'yes_no', 'choice', 'freeform') DEFAULT 'freeform',
          slot_choices JSON DEFAULT NULL,
          is_required TINYINT(1) DEFAULT 1,
          
          -- Extraction hints for LLM/NER
          extraction_hints TEXT DEFAULT NULL,
          extraction_examples JSON DEFAULT NULL,
          
          -- Validation
          validation_regex VARCHAR(255) DEFAULT NULL,
          validation_min_length INT DEFAULT NULL,
          validation_max_length INT DEFAULT NULL,
          validation_min_value DECIMAL(15,2) DEFAULT NULL,
          validation_max_value DECIMAL(15,2) DEFAULT NULL,
          custom_validation_prompt TEXT DEFAULT NULL,
          
          -- Confirmation configuration (for collect_slot with confirm, or confirm type)
          requires_confirmation TINYINT(1) DEFAULT 0,
          confirm_template TEXT DEFAULT NULL,
          confirm_audio_id VARCHAR(36) DEFAULT NULL,
          confirm_slot VARCHAR(50) DEFAULT NULL,
          
          -- Error/retry handling
          on_invalid_text TEXT DEFAULT NULL,
          on_invalid_audio_id VARCHAR(36) DEFAULT NULL,
          on_empty_text TEXT DEFAULT NULL,
          on_empty_audio_id VARCHAR(36) DEFAULT NULL,
          retry_prompt_text TEXT DEFAULT NULL,
          retry_prompt_audio_id VARCHAR(36) DEFAULT NULL,
          retry_limit INT DEFAULT 3,
          on_retry_exceeded ENUM('skip', 'transfer', 'end', 'default_value') DEFAULT 'transfer',
          on_retry_exceeded_transfer_queue VARCHAR(100) DEFAULT NULL,
          default_value VARCHAR(255) DEFAULT NULL,
          
          -- Branching configuration (for branch type)
          branch_on_slot VARCHAR(50) DEFAULT NULL,
          branch_conditions JSON DEFAULT NULL,
          /*
          Example branch_conditions:
          [
            { "condition": "equals", "value": "yes", "goto_step_key": "ask_address" },
            { "condition": "equals", "value": "no", "goto_step_key": "re_ask_invoice" },
            { "condition": "default", "goto_step_key": "ask_clarification" }
          ]
          */
          
          -- Function configuration (for function type)
          function_id VARCHAR(36) DEFAULT NULL,
          function_name VARCHAR(100) DEFAULT NULL,
          function_args_mapping JSON DEFAULT NULL,
          store_result_as VARCHAR(50) DEFAULT NULL,
          
          -- Transfer configuration (for transfer type)
          transfer_queue VARCHAR(100) DEFAULT NULL,
          transfer_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Response configuration (for respond type)
          response_template TEXT DEFAULT NULL,
          response_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Navigation
          next_step_key VARCHAR(50) DEFAULT NULL,
          is_terminal TINYINT(1) DEFAULT 0,
          
          -- Skip conditions
          skip_if_slot_filled VARCHAR(50) DEFAULT NULL,
          skip_condition JSON DEFAULT NULL,
          
          -- Analytics
          times_reached INT DEFAULT 0,
          times_completed INT DEFAULT 0,
          times_failed INT DEFAULT 0,
          avg_attempts DECIMAL(3,2) DEFAULT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_step_order (flow_id, step_order),
          UNIQUE KEY idx_step_key (flow_id, step_key),
          KEY idx_flow (flow_id),
          KEY idx_slot_name (slot_name),
          KEY idx_step_type (step_type),
          
          CONSTRAINT fk_ivr_flow_steps_flow FOREIGN KEY (flow_id) 
            REFERENCES yovo_tbl_aiva_ivr_flows(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_flow_steps_function FOREIGN KEY (function_id) 
            REFERENCES yovo_tbl_aiva_functions(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_flow_steps table');
      
      // =================================================================
      // 3. Create yovo_tbl_aiva_ivr_flow_sessions table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_flow_sessions table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_flow_sessions (
          id VARCHAR(36) PRIMARY KEY,
          
          -- Session identification
          session_id VARCHAR(100) NOT NULL,
          call_log_id VARCHAR(36) DEFAULT NULL,
          flow_id VARCHAR(36) NOT NULL,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Caller information
          caller_phone VARCHAR(20) DEFAULT NULL,
          caller_id VARCHAR(100) DEFAULT NULL,
          
          -- Current position in flow
          current_step_id VARCHAR(36) DEFAULT NULL,
          current_step_key VARCHAR(50) DEFAULT NULL,
          current_step_order INT DEFAULT 1,
          
          -- Collected slot data
          slots_data JSON DEFAULT NULL,
          /*
          Example slots_data:
          {
            "customer_name": "Habib",
            "invoice_no": "ABC-123",
            "address": "House 29, Street 6, Garden Town",
            "city": "Lahore"
          }
          */
          
          -- Confirmation state
          pending_confirmation VARCHAR(50) DEFAULT NULL,
          pending_confirmation_value TEXT DEFAULT NULL,
          
          -- Retry tracking
          current_step_attempts INT DEFAULT 0,
          total_retries INT DEFAULT 0,
          
          -- Session status
          status ENUM('in_progress', 'awaiting_input', 'awaiting_confirmation', 'executing_function', 'completed', 'cancelled', 'timeout', 'error', 'transferred') DEFAULT 'in_progress',
          
          -- Completion data
          function_result JSON DEFAULT NULL,
          function_error TEXT DEFAULT NULL,
          completion_message TEXT DEFAULT NULL,
          
          -- WhatsApp notification
          whatsapp_sent TINYINT(1) DEFAULT 0,
          whatsapp_sent_at TIMESTAMP NULL DEFAULT NULL,
          whatsapp_message_id VARCHAR(100) DEFAULT NULL,
          
          -- Conversation history within flow
          conversation_log JSON DEFAULT NULL,
          /*
          Example conversation_log:
          [
            { "timestamp": "...", "type": "agent", "text": "May I know your name?", "step": "ask_name" },
            { "timestamp": "...", "type": "customer", "text": "My name is Habib", "step": "ask_name" },
            { "timestamp": "...", "type": "system", "action": "slot_filled", "slot": "customer_name", "value": "Habib" }
          ]
          */
          
          -- Timing
          started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          completed_at TIMESTAMP NULL DEFAULT NULL,
          duration_seconds INT DEFAULT NULL,
          
          -- Error tracking
          last_error TEXT DEFAULT NULL,
          error_count INT DEFAULT 0,
          
          -- Transfer info
          transferred_to_queue VARCHAR(100) DEFAULT NULL,
          transferred_at TIMESTAMP NULL DEFAULT NULL,
          transfer_reason TEXT DEFAULT NULL,
          
          KEY idx_session (session_id),
          KEY idx_call_log (call_log_id),
          KEY idx_flow (flow_id),
          KEY idx_agent (agent_id),
          KEY idx_tenant (tenant_id),
          KEY idx_status (status),
          KEY idx_caller_phone (caller_phone),
          KEY idx_started_at (started_at),
          KEY idx_active_sessions (agent_id, status, started_at),
          
          CONSTRAINT fk_ivr_flow_sessions_flow FOREIGN KEY (flow_id) 
            REFERENCES yovo_tbl_aiva_ivr_flows(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_flow_sessions_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_flow_sessions_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_flow_sessions table');
      
      // =================================================================
      // 4. Add flow_id column to yovo_tbl_aiva_ivr_intents
      // =================================================================
      console.log('Adding flow_id column to yovo_tbl_aiva_ivr_intents...');
      
      const [flowIdColumn] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'flow_id'
      `);
      
      if (flowIdColumn.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_intents 
          ADD COLUMN flow_id VARCHAR(36) DEFAULT NULL AFTER follow_up_intent_id,
          ADD KEY idx_flow (flow_id)
        `);
        console.log('✓ Added flow_id column to yovo_tbl_aiva_ivr_intents');
      } else {
        console.log('✓ flow_id column already exists in yovo_tbl_aiva_ivr_intents');
      }
      
      // =================================================================
      // 5. Add 'flow' to intent_type enum
      // =================================================================
      console.log('Checking intent_type enum for flow value...');
      
      const [intentTypeEnum] = await db.query(`
        SELECT COLUMN_TYPE 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'intent_type'
      `);
      
      if (intentTypeEnum.length > 0) {
        const currentEnum = intentTypeEnum[0].COLUMN_TYPE;
        
        if (!currentEnum.includes('flow')) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_ivr_intents 
            MODIFY COLUMN intent_type ENUM('static', 'kb_lookup', 'function_call', 'transfer', 'collect_input', 'flow') DEFAULT 'static'
          `);
          console.log('✓ Added flow to intent_type enum');
        } else {
          console.log('✓ flow already in intent_type enum');
        }
      }
      
      // =================================================================
      // 6. Create indexes for performance
      // =================================================================
      console.log('Creating additional indexes...');
      
      // Index for finding active sessions by caller
      const [callerSessionIdx] = await db.query(`
        SELECT INDEX_NAME 
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_flow_sessions' 
          AND index_name = 'idx_caller_active'
      `);
      
      if (callerSessionIdx.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_flow_sessions 
          ADD KEY idx_caller_active (caller_phone, status)
        `);
        console.log('✓ Added idx_caller_active index');
      }
      
      // =================================================================
      // 7. Create helper view for flow analytics
      // =================================================================
      console.log('Creating flow analytics view...');
      
      await db.query(`
        CREATE OR REPLACE VIEW vw_ivr_flow_analytics AS
        SELECT 
          f.id as flow_id,
          f.flow_name,
          f.flow_key,
          f.agent_id,
          COUNT(fs.id) as total_sessions,
          SUM(CASE WHEN fs.status = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
          SUM(CASE WHEN fs.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_sessions,
          SUM(CASE WHEN fs.status = 'timeout' THEN 1 ELSE 0 END) as timeout_sessions,
          SUM(CASE WHEN fs.status = 'error' THEN 1 ELSE 0 END) as error_sessions,
          SUM(CASE WHEN fs.status = 'transferred' THEN 1 ELSE 0 END) as transferred_sessions,
          SUM(CASE WHEN fs.status = 'in_progress' THEN 1 ELSE 0 END) as active_sessions,
          ROUND(AVG(fs.duration_seconds), 2) as avg_duration_seconds,
          ROUND(AVG(fs.total_retries), 2) as avg_retries,
          ROUND(
            SUM(CASE WHEN fs.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(fs.id), 0), 
            2
          ) as completion_rate_percent
        FROM yovo_tbl_aiva_ivr_flows f
        LEFT JOIN yovo_tbl_aiva_ivr_flow_sessions fs ON f.id = fs.flow_id
        GROUP BY f.id, f.flow_name, f.flow_key, f.agent_id
      `);
      
      console.log('✓ Created vw_ivr_flow_analytics view');
      
      // =================================================================
      // 8. Create helper view for step analytics
      // =================================================================
      console.log('Creating step analytics view...');
      
      await db.query(`
        CREATE OR REPLACE VIEW vw_ivr_step_analytics AS
        SELECT 
          s.id as step_id,
          s.flow_id,
          s.step_key,
          s.step_name,
          s.step_type,
          s.slot_name,
          s.times_reached,
          s.times_completed,
          s.times_failed,
          s.avg_attempts,
          ROUND(
            s.times_completed * 100.0 / NULLIF(s.times_reached, 0), 
            2
          ) as success_rate_percent,
          f.flow_name,
          f.agent_id
        FROM yovo_tbl_aiva_ivr_flow_steps s
        JOIN yovo_tbl_aiva_ivr_flows f ON s.flow_id = f.id
        ORDER BY f.id, s.step_order
      `);
      
      console.log('✓ Created vw_ivr_step_analytics view');
      
      // =================================================================
      // 9. Verify migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME IN (
            'yovo_tbl_aiva_ivr_flows',
            'yovo_tbl_aiva_ivr_flow_steps',
            'yovo_tbl_aiva_ivr_flow_sessions'
          )
        ORDER BY TABLE_NAME
      `);
      
      const [views] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.VIEWS 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME LIKE 'vw_ivr_%'
      `);
      
      console.log('✓ Flow tables created:');
      tables.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
      
      console.log('✓ Analytics views created:');
      views.forEach(v => console.log(`  - ${v.TABLE_NAME}`));
      
      console.log('✓ IVR Conversation Flows migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back IVR Conversation Flows migration...');
      
      // =================================================================
      // 1. Drop views first
      // =================================================================
      console.log('Dropping analytics views...');
      
      await db.query(`DROP VIEW IF EXISTS vw_ivr_step_analytics`);
      console.log('✓ Dropped vw_ivr_step_analytics view');
      
      await db.query(`DROP VIEW IF EXISTS vw_ivr_flow_analytics`);
      console.log('✓ Dropped vw_ivr_flow_analytics view');
      
      // =================================================================
      // 2. Remove flow_id column from intents table
      // =================================================================
      console.log('Removing flow_id column from yovo_tbl_aiva_ivr_intents...');
      
      const [flowIdColumn] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'flow_id'
      `);
      
      if (flowIdColumn.length > 0) {
        // Drop index first
        try {
          await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_intents DROP KEY idx_flow`);
        } catch (e) {
          // Index might not exist
        }
        await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_intents DROP COLUMN flow_id`);
        console.log('✓ Removed flow_id column');
      } else {
        console.log('✓ flow_id column does not exist');
      }
      
      // =================================================================
      // 3. Revert intent_type enum
      // =================================================================
      console.log('Reverting intent_type enum...');
      
      const [startFlowIntents] = await db.query(`
        SELECT COUNT(*) as count FROM yovo_tbl_aiva_ivr_intents WHERE intent_type = 'flow'
      `);
      
      if (startFlowIntents[0].count > 0) {
        console.log(`  ⚠️ ${startFlowIntents[0].count} intents use flow type - updating to static`);
        await db.query(`
          UPDATE yovo_tbl_aiva_ivr_intents SET intent_type = 'static' WHERE intent_type = 'flow'
        `);
      }
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_ivr_intents 
        MODIFY COLUMN intent_type ENUM('static', 'kb_lookup', 'function_call', 'transfer', 'collect_input') DEFAULT 'static'
      `);
      console.log('✓ Reverted intent_type enum');
      
      // =================================================================
      // 4. Drop tables in reverse order (respecting foreign keys)
      // =================================================================
      const tablesToDrop = [
        'yovo_tbl_aiva_ivr_flow_sessions',
        'yovo_tbl_aiva_ivr_flow_steps',
        'yovo_tbl_aiva_ivr_flows'
      ];
      
      for (const tableName of tablesToDrop) {
        console.log(`Dropping ${tableName}...`);
        
        const [exists] = await db.query(`
          SELECT TABLE_NAME 
          FROM information_schema.TABLES 
          WHERE table_schema = DATABASE() 
            AND TABLE_NAME = '${tableName}'
        `);
        
        if (exists.length > 0) {
          await db.query(`DROP TABLE ${tableName}`);
          console.log(`✓ Dropped ${tableName}`);
        } else {
          console.log(`✓ Table ${tableName} does not exist`);
        }
      }
      
      console.log('✓ IVR Conversation Flows rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};