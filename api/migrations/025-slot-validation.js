'use strict';

/**
 * Migration: IVR Slot Validation & Localization Config
 * 
 * Adds/verifies columns for dynamic language-driven slot validation:
 * 
 * yovo_tbl_aiva_ivr_config:
 * - llm_provider: LLM provider for slot validation (openai, groq, anthropic)
 * - llm_model: LLM model for slot validation
 * - slot_validation_enabled: Enable/disable LLM-based slot validation
 * - wait_acknowledgment: Custom message when user needs time
 * - correction_acknowledgment: Custom message when correcting a slot
 * - no_match_text: Fallback text when no intent matches
 * - no_match_audio_id: Audio to play when no intent matches
 * 
 * yovo_tbl_aiva_ivr_flow_steps:
 * - slot_label: User-friendly label for the slot (e.g., "انوائس نمبر")
 * - confirmation_text: Custom confirmation message template
 * - invalid_response_text: Custom message when slot value is invalid
 * - max_retries: Max retries for this specific step
 * - on_invalid_action: Action when max retries exceeded
 * 
 * yovo_tbl_aiva_ivr_flows:
 * - on_invalid_text: Default message when step input is invalid
 * - on_invalid_action: Default action when step retries exceeded
 * - max_retries: Default max retries per step
 * - on_timeout_text: Message when step times out
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
      console.log('Starting IVR Slot Validation & Localization Config migration...');
      console.log('='.repeat(60));
      
      // =================================================================
      // 1. yovo_tbl_aiva_ivr_config columns
      // =================================================================
      console.log('\n1. Checking yovo_tbl_aiva_ivr_config table...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        console.log('✓ Table exists, adding/verifying columns...');
        
        // llm_provider for slot validation
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'llm_provider',
          `ENUM('openai', 'groq', 'anthropic') DEFAULT 'openai' COMMENT 'LLM provider for slot validation'`
        );
        
        // llm_model for slot validation
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'llm_model',
          `VARCHAR(100) DEFAULT 'gpt-4o-mini' COMMENT 'LLM model for slot validation'`
        );
        
        // slot_validation_enabled
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'slot_validation_enabled',
          `TINYINT(1) DEFAULT 1 COMMENT 'Enable LLM-based slot validation for flows'`
        );
        
        // wait_acknowledgment
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'wait_acknowledgment',
          `TEXT DEFAULT NULL COMMENT 'Custom message when user needs time (e.g., checking invoice)'`
        );
        
        // correction_acknowledgment
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'correction_acknowledgment',
          `TEXT DEFAULT NULL COMMENT 'Custom message when user wants to correct a slot'`
        );
        
        // no_match_text
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'no_match_text',
          `TEXT DEFAULT NULL COMMENT 'Fallback TTS message when no intent matches'`
        );
        
        // no_match_audio_id
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_config',
          'no_match_audio_id',
          `VARCHAR(36) DEFAULT NULL COMMENT 'Audio to play when no intent matches'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_config does not exist, skipping');
      }
      
      // =================================================================
      // 2. yovo_tbl_aiva_ivr_flows columns
      // =================================================================
      console.log('\n2. Checking yovo_tbl_aiva_ivr_flows table...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        console.log('✓ Table exists, adding/verifying columns...');
        
        // on_invalid_text - flow-level default invalid message
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'on_invalid_text',
          `TEXT DEFAULT NULL COMMENT 'Default message when step input is invalid'`
        );
        
        // on_invalid_action - flow-level default action
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'on_invalid_action',
          `ENUM('retry', 'skip', 'transfer', 'end') DEFAULT 'skip' COMMENT 'Default action when step retries exceeded'`
        );
        
        // max_retries - flow-level default
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'max_retries',
          `INT DEFAULT 2 COMMENT 'Default max retries per step'`
        );
        
        // on_timeout_text - timeout message
        await addColumnIfNotExists(
          'yovo_tbl_aiva_ivr_flows',
          'on_timeout_text',
          `TEXT DEFAULT NULL COMMENT 'Message when step times out'`
        );
        
      } else {
        console.log('⚠ Table yovo_tbl_aiva_ivr_flows does not exist, skipping');
      }
      
      // =================================================================
      // 4. Verify migration
      // =================================================================
      console.log('\n' + '='.repeat(60));
      console.log('Verification Summary:');
      console.log('='.repeat(60));
      
      // Verify ivr_config columns
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        const [configCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_config' 
            AND column_name IN (
              'llm_provider', 'llm_model', 'slot_validation_enabled',
              'wait_acknowledgment', 'correction_acknowledgment', 
              'no_match_text', 'no_match_audio_id'
            )
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_ivr_config: ${configCols.length}/7 columns`);
        configCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      // Verify flows columns
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        const [flowsCols] = await db.query(`
          SELECT COLUMN_NAME, COLUMN_TYPE 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_flows' 
            AND column_name IN (
              'on_invalid_text', 'on_invalid_action', 'max_retries', 'on_timeout_text'
            )
          ORDER BY ORDINAL_POSITION
        `);
        console.log(`\nyovo_tbl_aiva_ivr_flows: ${flowsCols.length}/4 columns`);
        flowsCols.forEach(c => console.log(`  - ${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`));
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✓ IVR Slot Validation & Localization Config migration completed!');
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
      console.log('Rolling back IVR Slot Validation & Localization Config migration...');
      
      // =================================================================
      // 1. Remove columns from ivr_config
      // =================================================================
      console.log('\n1. Removing columns from yovo_tbl_aiva_ivr_config...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_config')) {
        const configColumns = [
          'llm_provider',
          'llm_model',
          'slot_validation_enabled',
          'wait_acknowledgment',
          'correction_acknowledgment',
          'no_match_text',
          'no_match_audio_id'
        ];
        
        for (const col of configColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_ivr_config', col);
        }
      }
      
      // =================================================================
      // 2. Remove columns from flows
      // =================================================================
      console.log('\n2. Removing columns from yovo_tbl_aiva_ivr_flows...');
      
      if (await tableExists('yovo_tbl_aiva_ivr_flows')) {
        const flowsColumns = [
          'on_invalid_text',
          'on_invalid_action',
          'max_retries',
          'on_timeout_text'
        ];
        
        for (const col of flowsColumns) {
          await dropColumnIfExists('yovo_tbl_aiva_ivr_flows', col);
        }
      }
      
      console.log('\n✓ IVR Slot Validation & Localization Config rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};