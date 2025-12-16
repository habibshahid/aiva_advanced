'use strict';
/**
 * Migration: Fix complaint_state Column Type
 * 
 * This migration changes the complaint_state column from ENUM/VARCHAR to JSON:
 * - Fixes "Data too long for column 'complaint_state'" error
 * - Allows storing larger JSON objects including images_collected array
 * - DROPS existing indexes first (JSON columns can't have direct indexes)
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
      // 2. DROP INDEXES FIRST (JSON columns cannot have direct indexes)
      // =================================================================
      console.log('Dropping any existing indexes on complaint_state...');
      
      const indexesToDrop = ['idx_complaint_state', 'idx_tenant_complaint_state'];
      
      for (const indexName of indexesToDrop) {
        try {
          const [idx] = await db.query(`
            SELECT INDEX_NAME
            FROM information_schema.STATISTICS 
            WHERE table_schema = DATABASE() 
              AND table_name = 'yovo_tbl_aiva_chat_sessions' 
              AND index_name = '${indexName}'
          `);
          
          if (idx.length > 0) {
            await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP KEY ${indexName}`);
            console.log(`✓ Dropped ${indexName} index`);
          } else {
            console.log(`  Index ${indexName} does not exist, skipping`);
          }
        } catch (e) {
          console.log(`  Could not drop ${indexName}: ${e.message}`);
        }
      }
      
      // =================================================================
      // 3. Check current column definition
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
      // 4. Check if already JSON type
      // =================================================================
      if (col.DATA_TYPE === 'json') {
        console.log('✓ Column complaint_state is already JSON type, skipping migration');
        return;
      }
      
      // =================================================================
      // 5. Handle existing data
      // =================================================================
      console.log('Checking for existing data in complaint_state...');
      
      const [existingData] = await db.query(`
        SELECT COUNT(*) as count
        FROM yovo_tbl_aiva_chat_sessions
        WHERE complaint_state IS NOT NULL AND complaint_state != ''
      `);
      
      console.log(`Found ${existingData[0].count} sessions with existing complaint_state data`);
      
      // =================================================================
      // 6. Convert column to JSON type
      // =================================================================
      console.log('Converting complaint_state column to JSON type...');
      
      // If ENUM, we need to drop and recreate (can't directly alter ENUM to JSON)
      if (col.DATA_TYPE === 'enum') {
        console.log('Column is ENUM - dropping and recreating as JSON...');
        
        // Clear any data first (ENUM values won't convert to JSON properly)
        await db.query(`
          UPDATE yovo_tbl_aiva_chat_sessions 
          SET complaint_state = NULL
        `);
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          DROP COLUMN complaint_state
        `);
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_state json DEFAULT NULL
          COMMENT 'Tracks active complaint flow (type, order_number, images_collected, etc.)'
          AFTER status
        `);
        
        console.log('✓ Successfully recreated complaint_state as JSON');
        
      } else {
        // VARCHAR or other type - can use MODIFY
        // First clean invalid JSON
        if (existingData[0].count > 0) {
          console.log('Cleaning up invalid JSON data...');
          
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
      }
      
      // =================================================================
      // 7. Verify the change
      // =================================================================
      console.log('Verifying column change...');
      
      const [newColumns] = await db.query(`
        SELECT COLUMN_TYPE, DATA_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_state'
      `);
      
      if (newColumns.length > 0 && newColumns[0].DATA_TYPE === 'json') {
        console.log(`✓ Verification: ${newColumns[0].COLUMN_TYPE} (data_type: ${newColumns[0].DATA_TYPE})`);
        console.log('✓ complaint_state column migration completed successfully!');
      } else {
        throw new Error('Column was not converted to JSON type');
      }
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back complaint_state column migration...');
      console.log('⚠ Warning: Rolling back to ENUM will lose any JSON data!');
      
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
      // 2. Check current column type
      // =================================================================
      const [columns] = await db.query(`
        SELECT DATA_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_state'
      `);
      
      if (columns.length === 0) {
        console.log('⚠ Column complaint_state does not exist, skipping rollback');
        return;
      }
      
      if (columns[0].DATA_TYPE !== 'json') {
        console.log('⚠ Column is not JSON type, skipping rollback');
        return;
      }
      
      // =================================================================
      // 3. Drop JSON column and recreate as ENUM
      // =================================================================
      console.log('Dropping JSON column and recreating as ENUM...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        DROP COLUMN complaint_state
      `);
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        ADD COLUMN complaint_state ENUM('none', 'detected', 'acknowledged', 'investigating', 'escalated', 'resolved', 'closed') DEFAULT 'none'
        COMMENT 'Tracks complaint lifecycle throughout the conversation'
        AFTER status
      `);
      
      // =================================================================
      // 4. Recreate indexes
      // =================================================================
      console.log('Recreating indexes...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        ADD KEY idx_complaint_state (complaint_state)
      `);
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_chat_sessions 
        ADD KEY idx_tenant_complaint_state (tenant_id, complaint_state)
      `);
      
      console.log('✓ complaint_state column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};