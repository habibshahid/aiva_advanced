'use strict';
/**
 * Migration: Add Model Provider to Chat Sessions
 * 
 * This migration adds:
 * - model_provider: Tracks which LLM provider was used for the session (openai, deepseek, anthropic)
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting model_provider column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_chat_sessions table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_chat_sessions does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_chat_sessions exists');
      
      // =================================================================
      // 2. Add model_provider column
      // =================================================================
      console.log('Checking model_provider column...');
      
      const [modelProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'model_provider'
      `);
      
      if (modelProviderCol.length > 0) {
        console.log('✓ Column model_provider already exists');
      } else {
        console.log('Adding model_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN model_provider varchar(50) DEFAULT 'openai'
          COMMENT 'LLM provider used for this session (openai, deepseek, anthropic)'
          AFTER metadata
        `);
        
        console.log('✓ Successfully added model_provider column');
      }
      
      // =================================================================
      // 3. Add index on model_provider for analytics
      // =================================================================
      console.log('Checking model_provider index...');
      
      const [modelProviderIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_model_provider'
      `);
      
      if (modelProviderIdx.length > 0) {
        console.log('✓ Index idx_model_provider already exists');
      } else {
        console.log('Adding idx_model_provider index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_model_provider (model_provider)
        `);
        console.log('✓ Successfully added idx_model_provider index');
      }
      
      // =================================================================
      // 4. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'model_provider'
      `);
      
      console.log('✓ Verification - column after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ model_provider column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back model_provider column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_chat_sessions does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Drop index
      // =================================================================
      console.log('Dropping idx_model_provider index...');
      
      const [idx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_model_provider'
      `);
      
      if (idx.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          DROP KEY idx_model_provider
        `);
        console.log('✓ Dropped idx_model_provider index');
      } else {
        console.log('✓ Index idx_model_provider does not exist');
      }
      
      // =================================================================
      // 3. Drop column
      // =================================================================
      console.log('Dropping model_provider column...');
      
      const [col] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'model_provider'
      `);
      
      if (col.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          DROP COLUMN model_provider
        `);
        console.log('✓ Dropped model_provider column');
      } else {
        console.log('✓ Column model_provider does not exist');
      }
      
      console.log('✓ model_provider column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};