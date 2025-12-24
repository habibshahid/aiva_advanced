'use strict';

/**
 * Migration: IVR Complete System with Multi-Language Support
 * 
 * Creates all tables for:
 * - Languages (20 supported)
 * - Audio Segments with multi-language content
 * - Audio Templates
 * - Conversation Flows with Steps
 * - I18n content storage
 * - TTS Cache
 * - Flow Sessions
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting IVR Complete System migration...');
      console.log('='.repeat(60));
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_languages
      // =================================================================
      console.log('\n1. Creating yovo_tbl_aiva_languages...');
      
      const [languagesExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_languages'
      `);
      
      if (languagesExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_languages', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          code: {
            type: Sequelize.STRING(10),
            allowNull: false,
            unique: true
          },
          name: {
            type: Sequelize.STRING(50),
            allowNull: false
          },
          native_name: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          direction: {
            type: Sequelize.ENUM('ltr', 'rtl'),
            defaultValue: 'ltr'
          },
          region: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          sort_order: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        // Insert default languages
        await db.query(`
          INSERT INTO yovo_tbl_aiva_languages (code, name, native_name, direction, region, sort_order) VALUES
          ('en', 'English', 'English', 'ltr', 'Global', 1),
          ('ur', 'Urdu', 'اردو', 'rtl', 'Pakistan', 2),
          ('ur-roman', 'Roman Urdu', 'Roman Urdu', 'ltr', 'Pakistan', 3),
          ('pa', 'Punjabi', 'پنجابی', 'ltr', 'Pakistan/India', 4),
          ('sd', 'Sindhi', 'سنڌي', 'rtl', 'Pakistan', 5),
          ('ps', 'Pashto', 'پښتو', 'rtl', 'Pakistan/Afghanistan', 6),
          ('bal', 'Balochi', 'بلوچی', 'rtl', 'Pakistan', 7),
          ('hi', 'Hindi', 'हिन्दी', 'ltr', 'India', 8),
          ('ta', 'Tamil', 'தமிழ்', 'ltr', 'India', 9),
          ('te', 'Telugu', 'తెలుగు', 'ltr', 'India', 10),
          ('bn', 'Bengali', 'বাংলা', 'ltr', 'India/Bangladesh', 11),
          ('mr', 'Marathi', 'मराठी', 'ltr', 'India', 12),
          ('gu', 'Gujarati', 'ગુજરાતી', 'ltr', 'India', 13),
          ('ar', 'Arabic', 'العربية', 'rtl', 'Middle East', 14),
          ('ar-eg', 'Arabic (Egyptian)', 'العربية المصرية', 'rtl', 'Egypt', 15),
          ('ar-sa', 'Arabic (Saudi)', 'العربية السعودية', 'rtl', 'Saudi Arabia', 16),
          ('es', 'Spanish', 'Español', 'ltr', 'Global', 17),
          ('fr', 'French', 'Français', 'ltr', 'Global', 18),
          ('de', 'German', 'Deutsch', 'ltr', 'Europe', 19),
          ('zh', 'Chinese', '中文', 'ltr', 'China', 20)
        `);
        
        console.log('✓ Created yovo_tbl_aiva_languages with 20 languages');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_languages already exists, skipping');
      }
      
      // =================================================================
      // 2. Create yovo_tbl_aiva_agent_languages
      // =================================================================
      console.log('\n2. Creating yovo_tbl_aiva_agent_languages...');
      
      const [agentLangExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agent_languages'
      `);
      
      if (agentLangExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_agent_languages', {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          language_code: {
            type: Sequelize.STRING(10),
            allowNull: false
          },
          is_default: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          tts_voice_id: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          tts_provider: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_agent_languages', ['agent_id'], {
          name: 'idx_agent_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_agent_languages', ['agent_id', 'language_code'], {
          name: 'idx_agent_lang',
          unique: true
        });
        
        console.log('✓ Created yovo_tbl_aiva_agent_languages');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_agent_languages already exists, skipping');
      }
      
      // =================================================================
      // 3. Create yovo_tbl_aiva_ivr_segments
      // =================================================================
      console.log('\n3. Creating yovo_tbl_aiva_ivr_segments...');
      
      const [segmentsExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_segments'
      `);
      
      if (segmentsExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_segments', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          tenant_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          segment_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          segment_type: {
            type: Sequelize.ENUM('prefix', 'connector', 'suffix', 'standalone', 'variable_prefix', 'variable_suffix'),
            defaultValue: 'standalone'
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          is_global: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_segments', ['tenant_id'], {
          name: 'idx_tenant_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_segments', ['agent_id', 'segment_key'], {
          name: 'idx_agent_segment',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_segments', ['segment_type'], {
          name: 'idx_segment_type'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_segments');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_segments already exists, skipping');
      }
      
      // =================================================================
      // 4. Create yovo_tbl_aiva_ivr_segment_content
      // =================================================================
      console.log('\n4. Creating yovo_tbl_aiva_ivr_segment_content...');
      
      const [segmentContentExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_segment_content'
      `);
      
      if (segmentContentExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_segment_content', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          segment_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          language_code: {
            type: Sequelize.STRING(10),
            allowNull: false
          },
          text_content: {
            type: Sequelize.TEXT,
            allowNull: false
          },
          audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          audio_url: {
            type: Sequelize.STRING(500),
            allowNull: true
          },
          audio_duration_ms: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          is_generated: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_segment_content', ['segment_id', 'language_code'], {
          name: 'idx_segment_lang',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_segment_content', ['language_code'], {
          name: 'idx_language_code'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_segment_content');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_segment_content already exists, skipping');
      }
      
      // =================================================================
      // 5. Create yovo_tbl_aiva_ivr_templates
      // =================================================================
      console.log('\n5. Creating yovo_tbl_aiva_ivr_templates...');
      
      const [templatesExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_templates'
      `);
      
      if (templatesExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_templates', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          tenant_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          template_name: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          template_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          template_structure: {
            type: Sequelize.JSON,
            allowNull: false
          },
          required_variables: {
            type: Sequelize.JSON,
            allowNull: true
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_templates', ['tenant_id'], {
          name: 'idx_tenant_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_templates', ['agent_id', 'template_key'], {
          name: 'idx_agent_template',
          unique: true
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_templates');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_templates already exists, skipping');
      }
      
      // =================================================================
      // 6. Create yovo_tbl_aiva_ivr_flows
      // =================================================================
      console.log('\n6. Creating yovo_tbl_aiva_ivr_flows...');
      
      const [flowsExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_flows'
      `);
      
      if (flowsExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_flows', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          tenant_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          flow_name: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          flow_key: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          trigger_phrases: {
            type: Sequelize.JSON,
            allowNull: true
          },
          intro_text: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          intro_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          intro_template_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          timeout_seconds: {
            type: Sequelize.INTEGER,
            defaultValue: 10
          },
          max_retries: {
            type: Sequelize.INTEGER,
            defaultValue: 3
          },
          on_complete_action: {
            type: Sequelize.ENUM('function_call', 'transfer', 'respond', 'end_call'),
            defaultValue: 'respond'
          },
          on_complete_function_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          on_complete_function_name: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          on_complete_transfer_queue: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          on_complete_message: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          on_complete_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          on_complete_template_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          send_whatsapp_on_complete: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          whatsapp_template_name: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          ask_anything_else: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          anything_else_message: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          anything_else_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          closing_message: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          closing_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          total_sessions: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          },
          completed_sessions: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flows', ['tenant_id'], {
          name: 'idx_tenant_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flows', ['agent_id', 'flow_key'], {
          name: 'idx_agent_flow',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flows', ['is_active'], {
          name: 'idx_active'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_flows');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flows already exists, skipping');
      }
      
      // =================================================================
      // 7. Create yovo_tbl_aiva_ivr_flow_steps
      // =================================================================
      console.log('\n7. Creating yovo_tbl_aiva_ivr_flow_steps...');
      
      const [stepsExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_flow_steps'
      `);
      
      if (stepsExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_flow_steps', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          flow_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          step_key: {
            type: Sequelize.STRING(50),
            allowNull: false
          },
          step_name: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          step_type: {
            type: Sequelize.ENUM('collect_slot', 'confirm', 'respond', 'branch', 'function', 'transfer'),
            defaultValue: 'collect_slot'
          },
          step_order: {
            type: Sequelize.INTEGER,
            allowNull: false
          },
          prompt_text: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          prompt_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          prompt_template_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          slot_name: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          slot_type: {
            type: Sequelize.ENUM('name', 'phone', 'email', 'number', 'alphanumeric', 'address', 'city', 'date', 'time', 'yes_no', 'choice', 'freeform'),
            allowNull: true
          },
          slot_validation: {
            type: Sequelize.JSON,
            allowNull: true
          },
          requires_confirmation: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          confirmation_template_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          confirmation_text: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          retry_prompt_text: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          retry_prompt_audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          max_attempts: {
            type: Sequelize.INTEGER,
            defaultValue: 3
          },
          on_max_attempts: {
            type: Sequelize.ENUM('skip', 'transfer', 'end_flow'),
            defaultValue: 'skip'
          },
          next_step_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          branch_conditions: {
            type: Sequelize.JSON,
            allowNull: true
          },
          function_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          function_name: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          transfer_queue: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          is_terminal: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            defaultValue: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_steps', ['flow_id'], {
          name: 'idx_flow_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_steps', ['flow_id', 'step_key'], {
          name: 'idx_flow_step',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_steps', ['flow_id', 'step_order'], {
          name: 'idx_flow_order'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_flow_steps');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flow_steps already exists, skipping');
      }
      
      // =================================================================
      // 8. Create yovo_tbl_aiva_ivr_i18n_content
      // =================================================================
      console.log('\n8. Creating yovo_tbl_aiva_ivr_i18n_content...');
      
      const [i18nExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_i18n_content'
      `);
      
      if (i18nExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_i18n_content', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          entity_type: {
            type: Sequelize.ENUM('flow', 'step', 'intent', 'template'),
            allowNull: false
          },
          entity_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          field_name: {
            type: Sequelize.STRING(50),
            allowNull: false
          },
          language_code: {
            type: Sequelize.STRING(10),
            allowNull: false
          },
          text_content: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          audio_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          audio_url: {
            type: Sequelize.STRING(500),
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_i18n_content', ['entity_type', 'entity_id', 'field_name', 'language_code'], {
          name: 'idx_unique_i18n',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_i18n_content', ['agent_id', 'language_code'], {
          name: 'idx_agent_lang'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_i18n_content');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_i18n_content already exists, skipping');
      }
      
      // =================================================================
      // 9. Create yovo_tbl_aiva_ivr_tts_cache
      // =================================================================
      console.log('\n9. Creating yovo_tbl_aiva_ivr_tts_cache...');
      
      const [ttsCacheExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_tts_cache'
      `);
      
      if (ttsCacheExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_tts_cache', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          text_hash: {
            type: Sequelize.STRING(64),
            allowNull: false
          },
          original_text: {
            type: Sequelize.TEXT,
            allowNull: false
          },
          language_code: {
            type: Sequelize.STRING(10),
            allowNull: false
          },
          voice_id: {
            type: Sequelize.STRING(100),
            allowNull: true
          },
          audio_url: {
            type: Sequelize.STRING(500),
            allowNull: false
          },
          audio_duration_ms: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          file_size_bytes: {
            type: Sequelize.INTEGER,
            allowNull: true
          },
          hit_count: {
            type: Sequelize.INTEGER,
            defaultValue: 1
          },
          last_used_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_tts_cache', ['agent_id', 'text_hash', 'language_code'], {
          name: 'idx_cache_lookup',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_tts_cache', ['hit_count'], {
          name: 'idx_hit_count'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_tts_cache');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_tts_cache already exists, skipping');
      }
      
      // =================================================================
      // 10. Create yovo_tbl_aiva_ivr_flow_sessions
      // =================================================================
      console.log('\n10. Creating yovo_tbl_aiva_ivr_flow_sessions...');
      
      const [sessionsExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_flow_sessions'
      `);
      
      if (sessionsExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_ivr_flow_sessions', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          session_id: {
            type: Sequelize.STRING(100),
            allowNull: false
          },
          flow_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          agent_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          tenant_id: {
            type: Sequelize.STRING(36),
            allowNull: false
          },
          caller_phone: {
            type: Sequelize.STRING(20),
            allowNull: true
          },
          language_code: {
            type: Sequelize.STRING(10),
            defaultValue: 'en'
          },
          current_step_id: {
            type: Sequelize.STRING(36),
            allowNull: true
          },
          current_step_key: {
            type: Sequelize.STRING(50),
            allowNull: true
          },
          collected_slots: {
            type: Sequelize.JSON,
            allowNull: true
          },
          context_data: {
            type: Sequelize.JSON,
            allowNull: true
          },
          status: {
            type: Sequelize.ENUM('active', 'completed', 'abandoned', 'transferred', 'error'),
            defaultValue: 'active'
          },
          started_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          completed_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          last_activity_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          },
          total_turns: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          }
        });
        
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_sessions', ['session_id'], {
          name: 'idx_session_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_sessions', ['session_id', 'flow_id'], {
          name: 'idx_session_flow',
          unique: true
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_sessions', ['status'], {
          name: 'idx_status'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_ivr_flow_sessions', ['tenant_id'], {
          name: 'idx_tenant_id'
        });
        
        console.log('✓ Created yovo_tbl_aiva_ivr_flow_sessions');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flow_sessions already exists, skipping');
      }
      
      // =================================================================
      // 11. Add flow_id to intents table if it exists
      // =================================================================
      console.log('\n11. Adding flow_id to intents table...');
      
      try {
        const [intentsExists] = await db.query(`
          SELECT TABLE_NAME 
          FROM information_schema.TABLES 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_intents'
        `);
        
        if (intentsExists.length > 0) {
          const [columnExists] = await db.query(`
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE table_schema = DATABASE() 
              AND table_name = 'yovo_tbl_aiva_ivr_intents'
              AND column_name = 'flow_id'
          `);
          
          if (columnExists.length === 0) {
            await db.query(`
              ALTER TABLE yovo_tbl_aiva_ivr_intents 
              ADD COLUMN flow_id VARCHAR(36) DEFAULT NULL AFTER function_id
            `);
            console.log('✓ Added flow_id column to intents table');
          } else {
            console.log('⚠ flow_id column already exists in intents table');
          }
        } else {
          console.log('⚠ Intents table does not exist, skipping');
        }
      } catch (err) {
        console.log('Note: Could not modify intents table:', err.message);
      }
      
      // =================================================================
      // Summary
      // =================================================================
      console.log('\n' + '='.repeat(60));
      console.log('✓ IVR Complete System migration completed successfully!');
      console.log('='.repeat(60));
      console.log('\nTables created:');
      console.log('  1. yovo_tbl_aiva_languages (20 languages)');
      console.log('  2. yovo_tbl_aiva_agent_languages');
      console.log('  3. yovo_tbl_aiva_ivr_segments');
      console.log('  4. yovo_tbl_aiva_ivr_segment_content');
      console.log('  5. yovo_tbl_aiva_ivr_templates');
      console.log('  6. yovo_tbl_aiva_ivr_flows');
      console.log('  7. yovo_tbl_aiva_ivr_flow_steps');
      console.log('  8. yovo_tbl_aiva_ivr_i18n_content');
      console.log('  9. yovo_tbl_aiva_ivr_tts_cache');
      console.log('  10. yovo_tbl_aiva_ivr_flow_sessions');
      console.log('='.repeat(60) + '\n');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Migration failed:', err);
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('Rolling back IVR Complete System migration...');
      
      // Drop in reverse order
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_flow_sessions')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_flow_sessions not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_tts_cache')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_tts_cache not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_i18n_content')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_i18n_content not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_flow_steps')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_flow_steps not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_flows')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_flows not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_templates')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_templates not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_segment_content')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_segment_content not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_ivr_segments')
        .catch(() => console.log('  Table yovo_tbl_aiva_ivr_segments not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_agent_languages')
        .catch(() => console.log('  Table yovo_tbl_aiva_agent_languages not found'));
      
      await queryInterface.dropTable('yovo_tbl_aiva_languages')
        .catch(() => console.log('  Table yovo_tbl_aiva_languages not found'));
      
      console.log('\n✓ Rollback completed successfully!');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Rollback failed:', err);
      throw err;
    }
  }
};