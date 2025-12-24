'use strict';

/**
 * Migration: IVR Multi-Language Support & Missing Columns
 * 
 * Adds columns NOT covered by previous migrations:
 * 
 * yovo_tbl_aiva_agents:
 * - supported_languages: JSON array of language codes
 * - default_language: Default language code
 * - language_detection_enabled: Auto-detect user language
 * - tts_voices: JSON map of language -> voice ID
 * 
 * yovo_tbl_aiva_ivr_config:
 * - greeting_text: TTS text for greeting (complements greeting_audio_id)
 * 
 * yovo_tbl_aiva_ivr_flows:
 * - on_error_text: Message when error occurs
 * 
 * yovo_tbl_aiva_ivr_flow_steps:
 * - prompt_audio_source: How audio was created (none/uploaded/generated/template)
 * - on_invalid_template_id: Template for invalid responses
 * - response_template_id: Template for response step
 * - Multi-language columns: prompt_text_ur, prompt_audio_id_ur, etc.
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    // Helper function to safely add a column
    async function addColumnIfNotExists(tableName, columnName, columnDef) {
      const [exists] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = '${tableName}' 
          AND column_name = '${columnName}'
      `);
      
      if (exists.length === 0) {
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
        console.log(`✓ Added ${columnName} to ${tableName}`);
        return true;
      } else {
        console.log(`✓ ${columnName} already exists in ${tableName}`);
        return false;
      }
    }
    
    // Helper to check if table exists
    async function tableExists(tableName) {
      const [exists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = '${tableName}'
      `);
      return exists.length > 0;
    }
    
    try {
      console.log('Starting IVR Multi-Language Support migration...');
      console.log('='.repeat(60));
      
      // =================================================================
      // 1. yovo_tbl_aiva_agents - Language support columns
      // =================================================================
      console.log('\n1. Adding language support to yovo_tbl_aiva_agents...');
      
      if (await tableExists('yovo_tbl_aiva_agents')) {
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_agents',
          'supported_languages',
          `JSON DEFAULT NULL COMMENT 'Array of supported language codes ["en", "ur"]'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_agents',
          'default_language',
          `VARCHAR(10) DEFAULT 'en' COMMENT 'Default language code'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_agents',
          'language_detection_enabled',
          `TINYINT(1) DEFAULT 1 COMMENT 'Auto-detect user language from STT'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_agents',
          'tts_voices',
          `JSON DEFAULT NULL COMMENT 'Map of language code to TTS voice ID {"en": "aria", "ur": "urdu-female"}'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_agents does not exist, skipping');
      }
      
      // =================================================================
      // 2. yovo_tbl_aiva_ivr_config - Greeting text
      // =================================================================
      console.log('\n2. Adding greeting_text to yovo_tbl_aiva_ivr_config...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'greeting_text',
          `TEXT DEFAULT NULL COMMENT 'TTS text for greeting (used if no audio_id)'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'closing_text',
          `TEXT DEFAULT NULL COMMENT 'TTS text for closing message'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'please_wait_text',
          `TEXT DEFAULT NULL COMMENT 'TTS text for please wait message'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_config does not exist, skipping');
      }
      
      // =================================================================
      // 3. yovo_tbl_aiva_ivr_flows - Error text
      // =================================================================
      console.log('\n3. Adding error handling text to yovo_tbl_aiva_ivr_flows...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'on_error_text',
          `TEXT DEFAULT NULL COMMENT 'Message when error occurs'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'intro_text_ur',
          `TEXT DEFAULT NULL COMMENT 'Urdu intro text for multi-language'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'intro_audio_id_ur',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Urdu intro audio for multi-language'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flows does not exist, skipping');
      }
      
      // =================================================================
      // 4. yovo_tbl_aiva_ivr_flow_steps - Template IDs and multi-language
      // =================================================================
      console.log('\n4. Adding columns to yovo_tbl_aiva_ivr_flow_steps...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flow_steps')) {
        
        // Template reference columns (IDs pointing to yovo_tbl_aiva_ivr_templates)
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'prompt_template_id',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Template ID for prompt audio'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'confirm_template_id',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Template ID for confirmation audio'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'on_invalid_template_id',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Template ID for invalid response audio'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'response_template_id',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Template ID for response step type'`
        );
        
        // Audio source tracking
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'prompt_audio_type',
          `ENUM('none', 'library', 'template') DEFAULT 'none' COMMENT 'How prompt audio was selected'`
        );
        
        // User-friendly slot label
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'slot_label',
          `VARCHAR(100) DEFAULT NULL COMMENT 'User-friendly label for slot (e.g., "invoice number", "انوائس نمبر")'`
        );
        
        // Multi-language: Urdu versions
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'prompt_text_ur',
          `TEXT DEFAULT NULL COMMENT 'Urdu prompt text'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'prompt_audio_id_ur',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Urdu prompt audio ID'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'confirm_template_ur',
          `TEXT DEFAULT NULL COMMENT 'Urdu confirmation template text'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'confirm_audio_id_ur',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Urdu confirmation audio ID'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'on_invalid_text_ur',
          `TEXT DEFAULT NULL COMMENT 'Urdu invalid response text'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'on_invalid_audio_id_ur',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Urdu invalid response audio ID'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'retry_prompt_text_ur',
          `TEXT DEFAULT NULL COMMENT 'Urdu retry prompt text'`
        );
        
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flow_steps',
          'retry_prompt_audio_id_ur',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Urdu retry prompt audio ID'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flow_steps does not exist, skipping');
      }
      
      // =================================================================
      // 5. Verify migration
      // =================================================================
      console.log('\n' + '='.repeat(60));
      console.log('Verification Summary:');
      console.log('='.repeat(60));
      
      // Verify agents columns
      if (await tableExists('yovo_tbl_aiva_agents')) {
        const [agentCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_agents' 
            AND column_name IN (
              'supported_languages', 'default_language', 
              'language_detection_enabled', 'tts_voices'
            )
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_agents language columns: ${agentCols.length}/4`);
        agentCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      // Verify ivr_config columns
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        const [configCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_config' 
            AND column_name IN ('greeting_text', 'closing_text', 'please_wait_text')
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_ivr_config text columns: ${configCols.length}/3`);
        configCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      // Verify flows columns
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        const [flowsCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_flows' 
            AND column_name IN ('on_error_text', 'intro_text_ur', 'intro_audio_id_ur')
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_ivr_flows new columns: ${flowsCols.length}/3`);
        flowsCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      // Verify flow_steps columns
      if (await tableExists('yovo_tbl_aiva_ivr_flow_steps')) {
        const [stepsCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_flow_steps' 
            AND column_name IN (
              'prompt_template_id', 'confirm_template_id', 'on_invalid_template_id', 
              'response_template_id', 'prompt_audio_type', 'slot_label',
              'prompt_text_ur', 'prompt_audio_id_ur', 'confirm_template_ur',
              'confirm_audio_id_ur', 'on_invalid_text_ur', 'on_invalid_audio_id_ur',
              'retry_prompt_text_ur', 'retry_prompt_audio_id_ur'
            )
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_ivr_flow_steps new columns: ${stepsCols.length}/14`);
        stepsCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✓ IVR Multi-Language Support migration completed!');
      console.log('='.repeat(60) + '\n');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    // Helper to safely drop a column
    async function dropColumnIfExists(tableName, columnName) {
      const [exists] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = '${tableName}' 
          AND column_name = '${columnName}'
      `);
      
      if (exists.length > 0) {
        await db.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
        console.log(`✓ Dropped ${columnName} from ${tableName}`);
        return true;
      } else {
        console.log(`✓ ${columnName} does not exist in ${tableName}`);
        return false;
      }
    }
    
    // Helper to check if table exists
    async function tableExists(tableName) {
      const [exists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = '${tableName}'
      `);
      return exists.length > 0;
    }
    
    try {
      console.log('Rolling back IVR Multi-Language Support migration...');
      
      // =================================================================
      // 1. Remove columns from agents
      // =================================================================
      console.log('\n1. Removing columns from yovo_tbl_aiva_agents...');
      
      if (await tableExists('yovo_tbl_aiva_agents')) {
        const agentColumns = [
          'supported_languages',
          'default_language',
          'language_detection_enabled',
          'tts_voices'
        ];
        
        for (const col of agentColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_agents', col);
        }
      }
      
      // =================================================================
      // 2. Remove columns from ivr_config
      // =================================================================
      console.log('\n2. Removing columns from yovo_tbl_aiva_ivr_config...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        const configColumns = [
          'greeting_text',
          'closing_text',
          'please_wait_text'
        ];
        
        for (const col of configColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_ivr_config', col);
        }
      }
      
      // =================================================================
      // 3. Remove columns from flows
      // =================================================================
      console.log('\n3. Removing columns from yovo_tbl_aiva_ivr_flows...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        const flowsColumns = [
          'on_error_text',
          'intro_text_ur',
          'intro_audio_id_ur'
        ];
        
        for (const col of flowsColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_ivr_flows', col);
        }
      }
      
      // =================================================================
      // 4. Remove columns from flow_steps
      // =================================================================
      console.log('\n4. Removing columns from yovo_tbl_aiva_ivr_flow_steps...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flow_steps')) {
        const stepsColumns = [
          'prompt_template_id',
          'confirm_template_id',
          'on_invalid_template_id',
          'response_template_id',
          'prompt_audio_type',
          'slot_label',
          'prompt_text_ur',
          'prompt_audio_id_ur',
          'confirm_template_ur',
          'confirm_audio_id_ur',
          'on_invalid_text_ur',
          'on_invalid_audio_id_ur',
          'retry_prompt_text_ur',
          'retry_prompt_audio_id_ur'
        ];
        
        for (const col of stepsColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_ivr_flow_steps', col);
        }
      }
      
      console.log('\n✓ IVR Multi-Language Support rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};