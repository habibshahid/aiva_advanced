/**
 * Migration: Add LLM Provider Columns to IVR Config
 * 
 * Adds columns for:
 * - classifier_provider: Select between groq/openai for intent classification
 * - kb_response_provider: Select LLM provider for KB response generation
 * - kb_response_model: Select LLM model for KB responses
 * - not_found_message: Fallback TTS text when no intent matches
 * 
 * These enable separate LLM selection for classification vs KB responses,
 * which is important because Groq is fast but has limited Urdu support,
 * while OpenAI GPT-4o-mini has excellent Urdu understanding and generation.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting IVR LLM Provider Columns migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_ivr_config table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_config'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_ivr_config does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_ivr_config exists');
      
      // =================================================================
      // 2. Add classifier_provider column
      // =================================================================
      console.log('Adding classifier_provider column...');
      
      const [classifierProviderCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_config' 
          AND column_name = 'classifier_provider'
      `);
      
      if (classifierProviderCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_config 
          ADD COLUMN classifier_provider ENUM('groq', 'openai') DEFAULT 'groq' 
          COMMENT 'LLM provider for intent classification - Groq is faster, OpenAI better for Urdu'
          AFTER classifier_type
        `);
        console.log('✓ Added classifier_provider column');
      } else {
        console.log('✓ classifier_provider column already exists');
      }
      
      // =================================================================
      // 3. Add kb_response_provider column
      // =================================================================
      console.log('Adding kb_response_provider column...');
      
      const [kbResponseProviderCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_config' 
          AND column_name = 'kb_response_provider'
      `);
      
      if (kbResponseProviderCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_config 
          ADD COLUMN kb_response_provider ENUM('groq', 'openai') DEFAULT 'openai' 
          COMMENT 'LLM provider for KB response generation - OpenAI recommended for Urdu'
          AFTER enable_kb_lookup
        `);
        console.log('✓ Added kb_response_provider column');
      } else {
        console.log('✓ kb_response_provider column already exists');
      }
      
      // =================================================================
      // 4. Add kb_response_model column
      // =================================================================
      console.log('Adding kb_response_model column...');
      
      const [kbResponseModelCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_config' 
          AND column_name = 'kb_response_model'
      `);
      
      if (kbResponseModelCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_config 
          ADD COLUMN kb_response_model VARCHAR(100) DEFAULT 'gpt-4o-mini' 
          COMMENT 'LLM model for KB response generation'
          AFTER kb_response_provider
        `);
        console.log('✓ Added kb_response_model column');
      } else {
        console.log('✓ kb_response_model column already exists');
      }
      
      // =================================================================
      // 5. Add not_found_message column
      // =================================================================
      console.log('Adding not_found_message column...');
      
      const [notFoundMessageCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_config' 
          AND column_name = 'not_found_message'
      `);
      
      if (notFoundMessageCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_config 
          ADD COLUMN not_found_message TEXT 
          COMMENT 'Fallback TTS message when no intent matches'
          AFTER fallback_audio_id
        `);
        
        // Set default value for existing rows (Urdu fallback message)
        await db.query(`
          UPDATE yovo_tbl_aiva_ivr_config 
          SET not_found_message = 'معذرت، میں آپ کی بات نہیں سمجھ سکا۔ براہ کرم دوبارہ کوشش کریں۔'
          WHERE not_found_message IS NULL
        `);
        console.log('✓ Added not_found_message column with default Urdu text');
      } else {
        console.log('✓ not_found_message column already exists');
      }
      
      // =================================================================
      // 6. Verify migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [columns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_config' 
          AND column_name IN ('classifier_provider', 'kb_response_provider', 'kb_response_model', 'not_found_message')
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log(`✓ New columns added: ${columns.length}/4`);
      columns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT || 'NULL'})`);
      });
      
      console.log('✓ IVR LLM Provider Columns migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back IVR LLM Provider Columns migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_config'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_ivr_config does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Remove columns
      // =================================================================
      const columnsToRemove = [
        'classifier_provider',
        'kb_response_provider', 
        'kb_response_model',
        'not_found_message'
      ];
      
      for (const colName of columnsToRemove) {
        console.log(`Checking ${colName} column...`);
        
        const [col] = await db.query(`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_config' 
            AND column_name = '${colName}'
        `);
        
        if (col.length > 0) {
          await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_config DROP COLUMN ${colName}`);
          console.log(`✓ Dropped ${colName} column`);
        } else {
          console.log(`✓ ${colName} column does not exist`);
        }
      }
      
      console.log('✓ IVR LLM Provider Columns rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};