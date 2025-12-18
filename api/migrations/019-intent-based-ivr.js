/**
 * Migration: Intent IVR Tables
 * 
 * Creates tables for Intent-based IVR system:
 * - yovo_tbl_aiva_ivr_config: Agent-level IVR configuration
 * - yovo_tbl_aiva_ivr_intents: Intent definitions with trigger phrases
 * - yovo_tbl_aiva_ivr_audio: Pre-recorded/generated audio files
 * - yovo_tbl_aiva_ivr_segments: Audio segments for template assembly
 * - yovo_tbl_aiva_ivr_templates: Response templates with variable slots
 * - yovo_tbl_aiva_ivr_response_cache: Cached TTS responses
 * - yovo_tbl_aiva_ivr_variable_cache: Cached variable audio (names, amounts, etc.)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting Intent IVR tables migration...');
      
      // =================================================================
      // 1. Add provider enum value 'intent-ivr' to agents table
      // =================================================================
      console.log('Adding intent-ivr to provider enum...');
      
      const [providerEnum] = await db.query(`
        SELECT COLUMN_TYPE 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'provider'
      `);
      
      if (providerEnum.length > 0) {
        const currentEnum = providerEnum[0].COLUMN_TYPE;
        
        if (!currentEnum.includes('intent-ivr')) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_agents 
            MODIFY COLUMN provider ENUM('openai', 'deepgram', 'custom', 'intent-ivr') DEFAULT 'openai'
          `);
          console.log('✓ Added intent-ivr to provider enum');
        } else {
          console.log('✓ intent-ivr already in provider enum');
        }
      }
      
      // =================================================================
      // 2. Create yovo_tbl_aiva_ivr_config table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_config table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_config (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- STT configuration
          stt_provider VARCHAR(50) DEFAULT 'soniox',
          stt_model VARCHAR(100) DEFAULT 'stt-rt-preview',
          language_hints JSON,
          
          -- Intent classification
          classifier_type ENUM('llm', 'embedding', 'keyword') DEFAULT 'llm',
          classifier_model VARCHAR(100) DEFAULT 'llama-3.3-70b-versatile',
          classifier_temperature DECIMAL(2,1) DEFAULT 0.3,
          confidence_threshold DECIMAL(3,2) DEFAULT 0.70,
          
          -- TTS for auto-generation
          tts_provider VARCHAR(50) DEFAULT 'uplift',
          tts_voice VARCHAR(100) DEFAULT 'ur-PK-female',
          tts_model VARCHAR(100) DEFAULT NULL,
          tts_output_format VARCHAR(50) DEFAULT 'mulaw_8000',
          
          -- Caching strategy
          enable_response_cache TINYINT(1) DEFAULT 1,
          cache_ttl_days INT DEFAULT 30,
          cache_max_size_mb INT DEFAULT 500,
          enable_variable_cache TINYINT(1) DEFAULT 1,
          
          -- Fallback handling
          max_fallback_count INT DEFAULT 3,
          fallback_audio_id VARCHAR(36) DEFAULT NULL,
          transfer_audio_id VARCHAR(36) DEFAULT NULL,
          default_transfer_queue VARCHAR(100) DEFAULT 'support',
          
          -- Greeting & closing
          greeting_audio_id VARCHAR(36) DEFAULT NULL,
          closing_audio_id VARCHAR(36) DEFAULT NULL,
          please_wait_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- KB integration
          enable_kb_lookup TINYINT(1) DEFAULT 1,
          kb_lookup_prefix_audio_id VARCHAR(36) DEFAULT NULL,
          kb_no_result_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Metrics
          total_calls INT DEFAULT 0,
          cache_hits INT DEFAULT 0,
          cache_misses INT DEFAULT 0,
          total_cost_saved DECIMAL(10,4) DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_agent_unique (agent_id),
          KEY idx_tenant (tenant_id),
          
          CONSTRAINT fk_ivr_config_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_config_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_config table');
      
      // =================================================================
      // 3. Create yovo_tbl_aiva_ivr_audio table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_audio table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_audio (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Audio identification
          name VARCHAR(100) NOT NULL,
          description TEXT DEFAULT NULL,
          
          -- Source tracking
          source_type ENUM('uploaded', 'generated_dashboard', 'generated_auto') NOT NULL,
          source_text TEXT DEFAULT NULL,
          
          -- File info
          file_path VARCHAR(500) NOT NULL,
          file_format ENUM('mulaw_8000', 'pcm16_8000', 'pcm16_16000', 'pcm16_24000', 'mp3', 'wav') DEFAULT 'mulaw_8000',
          file_size_bytes INT DEFAULT NULL,
          duration_ms INT DEFAULT NULL,
          
          -- TTS generation info (if generated)
          tts_provider VARCHAR(50) DEFAULT NULL,
          tts_voice VARCHAR(100) DEFAULT NULL,
          tts_model VARCHAR(100) DEFAULT NULL,
          tts_cost DECIMAL(10,6) DEFAULT NULL,
          
          -- Metadata
          language VARCHAR(10) DEFAULT 'ur',
          tags JSON,
          
          -- Usage tracking
          usage_count INT DEFAULT 0,
          last_used_at TIMESTAMP NULL DEFAULT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          KEY idx_agent (agent_id),
          KEY idx_tenant (tenant_id),
          KEY idx_source (source_type),
          KEY idx_name (agent_id, name),
          
          CONSTRAINT fk_ivr_audio_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_audio_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_audio table');
      
      // =================================================================
      // 4. Create yovo_tbl_aiva_ivr_intents table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_intents table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_intents (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Intent identification
          intent_name VARCHAR(100) NOT NULL,
          intent_type ENUM('static', 'kb_lookup', 'function_call', 'transfer', 'collect_input') DEFAULT 'static',
          description TEXT DEFAULT NULL,
          
          -- Trigger configuration
          trigger_phrases JSON NOT NULL,
          trigger_keywords JSON,
          confidence_threshold DECIMAL(3,2) DEFAULT 0.70,
          
          -- Response configuration
          response_text TEXT DEFAULT NULL,
          response_audio_id VARCHAR(36) DEFAULT NULL,
          audio_source ENUM('uploaded', 'generated', 'auto_cache', 'realtime') DEFAULT 'realtime',
          
          -- Template reference (for dynamic responses)
          template_id VARCHAR(36) DEFAULT NULL,
          
          -- KB integration (for kb_lookup type)
          kb_search_query_template VARCHAR(500) DEFAULT NULL,
          kb_response_prefix_audio_id VARCHAR(36) DEFAULT NULL,
          kb_response_suffix_audio_id VARCHAR(36) DEFAULT NULL,
          kb_no_result_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Action configuration
          action_type ENUM('respond', 'transfer', 'function_call', 'collect_input', 'end_call') DEFAULT 'respond',
          action_config JSON,
          
          -- Transfer specific
          transfer_queue VARCHAR(100) DEFAULT NULL,
          transfer_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Function specific
          function_name VARCHAR(100) DEFAULT NULL,
          function_id VARCHAR(36) DEFAULT NULL,
          
          -- Follow-up
          follow_up_intent_id VARCHAR(36) DEFAULT NULL,
          collect_input_config JSON,
          
          -- Ordering & status
          priority INT DEFAULT 0,
          is_active TINYINT(1) DEFAULT 1,
          
          -- Metrics
          match_count INT DEFAULT 0,
          last_matched_at TIMESTAMP NULL DEFAULT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          KEY idx_agent_active (agent_id, is_active),
          KEY idx_tenant (tenant_id),
          KEY idx_intent_type (intent_type),
          KEY idx_priority (agent_id, priority DESC),
          
          CONSTRAINT fk_ivr_intents_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_intents_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_intents_audio FOREIGN KEY (response_audio_id) 
            REFERENCES yovo_tbl_aiva_ivr_audio(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_intents table');
      
      // =================================================================
      // 5. Create yovo_tbl_aiva_ivr_segments table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_segments table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_segments (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Segment identification
          segment_key VARCHAR(100) NOT NULL,
          segment_type ENUM('prefix', 'suffix', 'connector', 'standalone') NOT NULL,
          
          -- Content
          text_content TEXT NOT NULL,
          audio_id VARCHAR(36) DEFAULT NULL,
          audio_source ENUM('uploaded', 'generated') DEFAULT 'generated',
          
          -- Metadata
          language VARCHAR(10) DEFAULT 'ur',
          duration_ms INT DEFAULT NULL,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_segment_key (agent_id, segment_key),
          KEY idx_tenant (tenant_id),
          
          CONSTRAINT fk_ivr_segments_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_segments_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_segments_audio FOREIGN KEY (audio_id) 
            REFERENCES yovo_tbl_aiva_ivr_audio(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_segments table');
      
      // =================================================================
      // 6. Create yovo_tbl_aiva_ivr_templates table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_templates table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_templates (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Template identification
          template_name VARCHAR(100) NOT NULL,
          description TEXT DEFAULT NULL,
          
          -- Template structure
          template_structure JSON NOT NULL,
          /*
          Example structure:
          [
            {"type": "segment", "key": "greeting"},
            {"type": "variable", "name": "customer_name", "format": "name"},
            {"type": "segment", "key": "order_prefix"},
            {"type": "variable", "name": "order_no", "format": "spell_digits"},
            ...
          ]
          */
          
          -- Variables required
          required_variables JSON NOT NULL,
          
          -- Data source
          data_source_function VARCHAR(100) DEFAULT NULL,
          data_source_function_id VARCHAR(36) DEFAULT NULL,
          
          -- Prefix/Suffix audio
          prefix_audio_id VARCHAR(36) DEFAULT NULL,
          suffix_audio_id VARCHAR(36) DEFAULT NULL,
          
          -- Usage tracking
          usage_count INT DEFAULT 0,
          last_used_at TIMESTAMP NULL DEFAULT NULL,
          
          is_active TINYINT(1) DEFAULT 1,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_template_name (agent_id, template_name),
          KEY idx_tenant (tenant_id),
          
          CONSTRAINT fk_ivr_templates_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_templates_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_templates table');
      
      // =================================================================
      // 7. Create yovo_tbl_aiva_ivr_response_cache table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_response_cache table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_response_cache (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Cache key (hash of normalized response text)
          cache_key VARCHAR(64) NOT NULL,
          
          -- Original response
          response_text TEXT NOT NULL,
          response_text_normalized TEXT NOT NULL,
          
          -- Intent reference (optional)
          intent_id VARCHAR(36) DEFAULT NULL,
          
          -- Audio file
          audio_file_path VARCHAR(500) NOT NULL,
          audio_format VARCHAR(20) DEFAULT 'mulaw_8000',
          duration_ms INT DEFAULT NULL,
          file_size_bytes INT DEFAULT NULL,
          
          -- TTS info
          tts_provider VARCHAR(50) DEFAULT NULL,
          tts_voice VARCHAR(100) DEFAULT NULL,
          tts_cost DECIMAL(10,6) DEFAULT NULL,
          
          -- Usage tracking
          hit_count INT DEFAULT 0,
          last_used_at TIMESTAMP NULL DEFAULT NULL,
          
          -- Cache management
          expires_at TIMESTAMP NULL DEFAULT NULL,
          is_pinned TINYINT(1) DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_cache_key (agent_id, cache_key),
          KEY idx_tenant (tenant_id),
          KEY idx_last_used (last_used_at),
          KEY idx_expires (expires_at),
          KEY idx_intent (intent_id),
          
          CONSTRAINT fk_ivr_cache_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_cache_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_response_cache table');
      
      // =================================================================
      // 8. Create yovo_tbl_aiva_ivr_variable_cache table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_variable_cache table...');
      
      await db.query(`
        CREATE TABLE IF NOT EXISTS yovo_tbl_aiva_ivr_variable_cache (
          id VARCHAR(36) PRIMARY KEY,
          agent_id VARCHAR(36) NOT NULL,
          tenant_id VARCHAR(36) NOT NULL,
          
          -- Variable identification
          variable_type VARCHAR(50) NOT NULL,
          variable_value VARCHAR(500) NOT NULL,
          variable_value_normalized VARCHAR(500) NOT NULL,
          
          -- Audio
          audio_file_path VARCHAR(500) NOT NULL,
          audio_format VARCHAR(20) DEFAULT 'mulaw_8000',
          duration_ms INT DEFAULT NULL,
          file_size_bytes INT DEFAULT NULL,
          
          -- TTS info
          tts_provider VARCHAR(50) DEFAULT NULL,
          tts_voice VARCHAR(100) DEFAULT NULL,
          tts_cost DECIMAL(10,6) DEFAULT NULL,
          
          -- Usage tracking
          hit_count INT DEFAULT 0,
          last_used_at TIMESTAMP NULL DEFAULT NULL,
          
          -- Cache management
          expires_at TIMESTAMP NULL DEFAULT NULL,
          is_pinned TINYINT(1) DEFAULT 0,
          
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE KEY idx_var_value (agent_id, variable_type, variable_value_normalized),
          KEY idx_tenant (tenant_id),
          KEY idx_type (variable_type),
          KEY idx_hit_count (hit_count DESC),
          KEY idx_last_used (last_used_at),
          
          CONSTRAINT fk_ivr_var_cache_agent FOREIGN KEY (agent_id) 
            REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
          CONSTRAINT fk_ivr_var_cache_tenant FOREIGN KEY (tenant_id) 
            REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      
      console.log('✓ Created yovo_tbl_aiva_ivr_variable_cache table');
      
      // =================================================================
      // 9. Verify all tables were created
      // =================================================================
      console.log('Verifying migration...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME LIKE 'yovo_tbl_aiva_ivr_%'
        ORDER BY TABLE_NAME
      `);
      
      console.log('✓ IVR tables created:');
      tables.forEach(t => console.log(`  - ${t.TABLE_NAME}`));
      
      console.log('✓ Intent IVR tables migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back Intent IVR tables migration...');
      
      // Drop tables in reverse order (respecting foreign keys)
      const tablesToDrop = [
        'yovo_tbl_aiva_ivr_variable_cache',
        'yovo_tbl_aiva_ivr_response_cache',
        'yovo_tbl_aiva_ivr_templates',
        'yovo_tbl_aiva_ivr_segments',
        'yovo_tbl_aiva_ivr_intents',
        'yovo_tbl_aiva_ivr_audio',
        'yovo_tbl_aiva_ivr_config'
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
      
      // Remove intent-ivr from provider enum
      console.log('Removing intent-ivr from provider enum...');
      
      const [agentsWithIvr] = await db.query(`
        SELECT COUNT(*) as count FROM yovo_tbl_aiva_agents WHERE provider = 'intent-ivr'
      `);
      
      if (agentsWithIvr[0].count > 0) {
        console.error(`✗ Cannot remove intent-ivr: ${agentsWithIvr[0].count} agents are using it`);
        console.error('  Please update these agents first');
      } else {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          MODIFY COLUMN provider ENUM('openai', 'deepgram', 'custom') DEFAULT 'openai'
        `);
        console.log('✓ Removed intent-ivr from provider enum');
      }
      
      console.log('✓ Intent IVR tables rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};
