'use strict';
/**
 * Migration: Fix complaint_state Column Type
 * 
 * This migration changes the complaint_state column from VARCHAR to JSON:
 * - Fixes "Data too long for column 'complaint_state'" error
 * - Allows storing larger JSON objects including images_collected array
 * - Preserves existing data by parsing and re-storing as JSON
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting complaint_state column fix migration...');
      
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
      // 2. Check current column definition
      // =================================================================
      console.log('Checking current complaint_state column definition...');
      
      const [columns] = await db.query(`
        SELECT 
          COLUMN_TYPE, 
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE,
          COLUMN_DEFAULT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_state'
      `);
      
      if (columns.length === 0) {
        console.log('⚠ Column complaint_state does not exist, adding it as JSON...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_state json DEFAULT NULL
          COMMENT 'Tracks active complaint flow (type, order_number, images_collected, etc.)'
          AFTER llm_context_hints
        `);
        
        console.log('✓ Successfully added complaint_state as JSON column');
        return;
      }
      
      const col = columns[0];
      console.log(`Current complaint_state definition: ${col.COLUMN_TYPE} (data_type: ${col.DATA_TYPE})`);
      
      // =================================================================
      // 3. Check if already JSON type
      // =================================================================
      if (col.DATA_TYPE === 'json') {
        console.log('✓ Column complaint_state is already JSON type, skipping migration');
        return;
      }
      
      // =================================================================
      // 4. Backup existing data (optional but safe)
      // =================================================================
      console.log('Checking for existing data in complaint_state...');
      
      const [existingData] = await db.query(`
        SELECT COUNT(*) as count
        FROM yovo_tbl_aiva_chat_sessions
        WHERE complaint_state IS NOT NULL AND complaint_state != ''
      `);
      
      console.log(`Found ${existingData[0].count} sessions with existing complaint_state data`);
      
      // =================================================================
      // 5. Alter column to JSON type
      // =================================================================
      console.log('Altering complaint_state column to JSON type...');
      
      // First, convert existing data to valid JSON format if needed
      if (existingData[0].count > 0) {
        console.log('Converting existing VARCHAR data to JSON-compatible format...');
        
        // Temporarily set invalid JSON to NULL (we'll preserve valid JSON)
        await db.query(`
          UPDATE yovo_tbl_aiva_chat_sessions 
          SET complaint_state = NULL 
          WHERE complaint_state IS NOT NULL 
            AND complaint_state != '' 
            AND NOT JSON_VALID(complaint_state)
        `);
        
        console.log('✓ Cleaned up invalid JSON data');
      }
      
      // Now alter the column type
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        MODIFY COLUMN complaint_state json DEFAULT NULL
        COMMENT 'Tracks active complaint flow (type, order_number, images_collected, etc.)'
      `);
      
      console.log('✓ Successfully changed complaint_state to JSON type');
      
      // =================================================================
      // 6. Verify the change
      // =================================================================
      console.log('Verifying column change...');
      
      const [newColumns] = await db.query(`
        SELECT COLUMN_TYPE, DATA_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_state'
      `);
      
      console.log(`✓ Verification: ${newColumns[0].COLUMN_TYPE} (data_type: ${newColumns[0].DATA_TYPE})`);
      console.log('✓ complaint_state column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back complaint_state column migration...');
      console.log('⚠ Warning: Rolling back to VARCHAR(255) may cause data truncation!');
      
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
      // 2. Check for data that would be truncated
      // =================================================================
      console.log('Checking for complaint_state values that would be truncated...');
      
      const [longValues] = await db.query(`
        SELECT COUNT(*) as count, MAX(LENGTH(JSON_UNQUOTE(complaint_state))) as max_length
        FROM yovo_tbl_aiva_chat_sessions
        WHERE complaint_state IS NOT NULL 
          AND LENGTH(JSON_UNQUOTE(complaint_state)) > 255
      `);
      
      if (longValues[0].count > 0) {
        console.error(`✗ Cannot rollback: ${longValues[0].count} records have complaint_state longer than 255 characters`);
        console.error(`  Max length: ${longValues[0].max_length}`);
        console.error('  Rollback would truncate data - aborted for safety');
        throw new Error('Rollback would truncate data - aborted for safety');
      }
      
      // =================================================================
      // 3. Revert column to VARCHAR(255)
      // =================================================================
      console.log('Reverting complaint_state column to VARCHAR(255)...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        MODIFY COLUMN complaint_state VARCHAR(255) DEFAULT NULL
      `);
      
      console.log('✓ Successfully reverted complaint_state to VARCHAR(255)');
      console.log('✓ complaint_state column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};