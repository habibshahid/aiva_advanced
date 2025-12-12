'use strict';
/**
 * Migration: Add Complaint State to Chat Sessions
 * 
 * This migration adds:
 * - complaint_state: Tracks complaint lifecycle (none, detected, acknowledged, investigating, escalated, resolved, closed)
 * - complaint_metadata: JSON field for additional complaint details
 * - complaint_detected_at: Timestamp when complaint was first detected
 * - complaint_resolved_at: Timestamp when complaint was resolved
 * 
 * Idempotent - can be run multiple times safely
 * 
 * FIXED: Handles case where column exists with wrong type (JSON instead of ENUM)
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting complaint_state columns migration...');
      
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
      // 2. Check complaint_state column - FIX IF WRONG TYPE
      // =================================================================
      console.log('Checking complaint_state column...');
      
      const [complaintStateCol] = await db.query(`
        SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_state'
      `);
      
      if (complaintStateCol.length > 0) {
        const colType = complaintStateCol[0].DATA_TYPE;
        console.log(`  Found complaint_state column with type: ${colType}`);
        
        if (colType === 'json') {
          console.log('⚠ Column complaint_state is JSON type (wrong), dropping and recreating as ENUM...');
          
          // First drop any indexes that might exist on this column
          try {
            await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP KEY idx_complaint_state`);
            console.log('  Dropped existing idx_complaint_state index');
          } catch (e) {
            // Index might not exist, that's fine
          }
          
          try {
            await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP KEY idx_tenant_complaint_state`);
            console.log('  Dropped existing idx_tenant_complaint_state index');
          } catch (e) {
            // Index might not exist, that's fine
          }
          
          // Drop the JSON column
          await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP COLUMN complaint_state`);
          console.log('  Dropped JSON complaint_state column');
          
          // Recreate as ENUM
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_chat_sessions 
            ADD COLUMN complaint_state ENUM('none', 'detected', 'acknowledged', 'investigating', 'escalated', 'resolved', 'closed') DEFAULT 'none'
            COMMENT 'Tracks complaint lifecycle throughout the conversation'
            AFTER status
          `);
          console.log('✓ Recreated complaint_state as ENUM');
          
        } else if (colType === 'enum') {
          console.log('✓ Column complaint_state already exists as ENUM (correct type)');
        } else {
          console.log(`⚠ Column complaint_state has unexpected type: ${colType}, attempting to fix...`);
          await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP COLUMN complaint_state`);
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_chat_sessions 
            ADD COLUMN complaint_state ENUM('none', 'detected', 'acknowledged', 'investigating', 'escalated', 'resolved', 'closed') DEFAULT 'none'
            COMMENT 'Tracks complaint lifecycle throughout the conversation'
            AFTER status
          `);
          console.log('✓ Recreated complaint_state as ENUM');
        }
      } else {
        console.log('Adding complaint_state column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_state ENUM('none', 'detected', 'acknowledged', 'investigating', 'escalated', 'resolved', 'closed') DEFAULT 'none'
          COMMENT 'Tracks complaint lifecycle throughout the conversation'
          AFTER status
        `);
        
        console.log('✓ Successfully added complaint_state column');
      }
      
      // =================================================================
      // 3. Add complaint_metadata column
      // =================================================================
      console.log('Checking complaint_metadata column...');
      
      const [complaintMetadataCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_metadata'
      `);
      
      if (complaintMetadataCol.length > 0) {
        console.log('✓ Column complaint_metadata already exists');
      } else {
        console.log('Adding complaint_metadata column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_metadata JSON DEFAULT NULL
          COMMENT 'Additional complaint details (reason, category, sentiment, etc.)'
          AFTER complaint_state
        `);
        
        console.log('✓ Successfully added complaint_metadata column');
      }
      
      // =================================================================
      // 4. Add complaint_detected_at column
      // =================================================================
      console.log('Checking complaint_detected_at column...');
      
      const [complaintDetectedCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_detected_at'
      `);
      
      if (complaintDetectedCol.length > 0) {
        console.log('✓ Column complaint_detected_at already exists');
      } else {
        console.log('Adding complaint_detected_at column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_detected_at TIMESTAMP NULL DEFAULT NULL
          COMMENT 'Timestamp when complaint was first detected'
          AFTER complaint_metadata
        `);
        
        console.log('✓ Successfully added complaint_detected_at column');
      }
      
      // =================================================================
      // 5. Add complaint_resolved_at column
      // =================================================================
      console.log('Checking complaint_resolved_at column...');
      
      const [complaintResolvedCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'complaint_resolved_at'
      `);
      
      if (complaintResolvedCol.length > 0) {
        console.log('✓ Column complaint_resolved_at already exists');
      } else {
        console.log('Adding complaint_resolved_at column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN complaint_resolved_at TIMESTAMP NULL DEFAULT NULL
          COMMENT 'Timestamp when complaint was resolved'
          AFTER complaint_detected_at
        `);
        
        console.log('✓ Successfully added complaint_resolved_at column');
      }
      
      // =================================================================
      // 6. Add index on complaint_state (ENUM, not JSON - indexable)
      // =================================================================
      console.log('Checking complaint_state index...');
      
      const [complaintStateIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_complaint_state'
      `);
      
      if (complaintStateIdx.length > 0) {
        console.log('✓ Index idx_complaint_state already exists');
      } else {
        console.log('Adding idx_complaint_state index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_complaint_state (complaint_state)
        `);
        console.log('✓ Successfully added idx_complaint_state index');
      }
      
      // =================================================================
      // 7. Add composite index on tenant_id + complaint_state for analytics
      // =================================================================
      console.log('Checking tenant_complaint_state index...');
      
      const [tenantComplaintIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_tenant_complaint_state'
      `);
      
      if (tenantComplaintIdx.length > 0) {
        console.log('✓ Index idx_tenant_complaint_state already exists');
      } else {
        console.log('Adding idx_tenant_complaint_state index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_tenant_complaint_state (tenant_id, complaint_state)
        `);
        console.log('✓ Successfully added idx_tenant_complaint_state index');
      }
      
      // =================================================================
      // 8. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name IN ('complaint_state', 'complaint_metadata', 'complaint_detected_at', 'complaint_resolved_at')
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('✓ Verification - columns after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ complaint_state columns migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back complaint_state columns migration...');
      
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
      // 2. Drop indexes (safely, ignore errors if not exist)
      // =================================================================
      console.log('Dropping indexes...');
      
      try {
        const [tenantComplaintIdx] = await db.query(`
          SELECT INDEX_NAME
          FROM information_schema.STATISTICS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_chat_sessions' 
            AND index_name = 'idx_tenant_complaint_state'
        `);
        
        if (tenantComplaintIdx.length > 0) {
          await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP KEY idx_tenant_complaint_state`);
          console.log('✓ Dropped idx_tenant_complaint_state index');
        }
      } catch (e) {
        console.log('  idx_tenant_complaint_state index does not exist or already dropped');
      }
      
      try {
        const [complaintStateIdx] = await db.query(`
          SELECT INDEX_NAME
          FROM information_schema.STATISTICS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_chat_sessions' 
            AND index_name = 'idx_complaint_state'
        `);
        
        if (complaintStateIdx.length > 0) {
          await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP KEY idx_complaint_state`);
          console.log('✓ Dropped idx_complaint_state index');
        }
      } catch (e) {
        console.log('  idx_complaint_state index does not exist or already dropped');
      }
      
      // =================================================================
      // 3. Drop columns (in reverse order)
      // =================================================================
      const columnsToRemove = [
        'complaint_resolved_at',
        'complaint_detected_at',
        'complaint_metadata',
        'complaint_state'
      ];
      
      for (const columnName of columnsToRemove) {
        console.log(`Dropping ${columnName} column...`);
        
        const [col] = await db.query(`
          SELECT COLUMN_NAME
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_chat_sessions' 
            AND column_name = '${columnName}'
        `);
        
        if (col.length > 0) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_chat_sessions 
            DROP COLUMN ${columnName}
          `);
          console.log(`✓ Dropped ${columnName} column`);
        } else {
          console.log(`✓ Column ${columnName} does not exist`);
        }
      }
      
      console.log('✓ complaint_state columns rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};