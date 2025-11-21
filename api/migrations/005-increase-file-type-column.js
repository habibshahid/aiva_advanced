'use strict';
/**
 * Migration: Increase file_type Column Size in yovo_tbl_aiva_documents
 * 
 * This migration increases the file_type column from VARCHAR(50) to VARCHAR(100):
 * - Supports longer MIME types (e.g., Office document types)
 * - No data loss - all existing values are preserved
 * - Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting file_type column size increase migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_documents table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_documents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_documents does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_documents exists');
      
      // =================================================================
      // 2. Check current column definition
      // =================================================================
      console.log('Checking current file_type column definition...');
      
      const [columns] = await db.query(`
        SELECT 
          COLUMN_TYPE, 
          CHARACTER_MAXIMUM_LENGTH,
          IS_NULLABLE,
          COLUMN_DEFAULT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_documents' 
          AND column_name = 'file_type'
      `);
      
      if (columns.length === 0) {
        console.log('⚠ Column file_type does not exist in yovo_tbl_aiva_documents, skipping migration');
        return;
      }
      
      const col = columns[0];
      console.log(`Current file_type definition: ${col.COLUMN_TYPE} (length: ${col.CHARACTER_MAXIMUM_LENGTH})`);
      
      // =================================================================
      // 3. Check if already migrated
      // =================================================================
      if (col.CHARACTER_MAXIMUM_LENGTH >= 100) {
        console.log('✓ Column file_type is already VARCHAR(100) or larger, skipping migration');
        return;
      }
      
      // =================================================================
      // 4. Check for data that might be affected
      // =================================================================
      console.log('Checking for file_type values longer than 50 characters...');
      
      const [longValues] = await db.query(`
        SELECT COUNT(*) as count, MAX(LENGTH(file_type)) as max_length
        FROM yovo_tbl_aiva_documents
        WHERE LENGTH(file_type) > 50
      `);
      
      if (longValues[0].count > 0) {
        console.log(`⚠ Found ${longValues[0].count} records with file_type longer than 50 characters`);
        console.log(`  Max length found: ${longValues[0].max_length}`);
      } else {
        console.log('✓ No records with file_type > 50 characters');
      }
      
      // =================================================================
      // 5. Alter column to VARCHAR(100)
      // =================================================================
      console.log('Altering file_type column to VARCHAR(100)...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_documents 
        MODIFY COLUMN file_type VARCHAR(100) DEFAULT NULL
        COMMENT 'File MIME type (e.g., application/pdf, image/png)'
      `);
      
      console.log('✓ Successfully increased file_type to VARCHAR(100)');
      
      // =================================================================
      // 6. Verify the change
      // =================================================================
      console.log('Verifying column change...');
      
      const [newColumns] = await db.query(`
        SELECT COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_documents' 
          AND column_name = 'file_type'
      `);
      
      console.log(`✓ Verification: ${newColumns[0].COLUMN_TYPE} (length: ${newColumns[0].CHARACTER_MAXIMUM_LENGTH})`);
      console.log('✓ File type column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back file_type column size increase migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_documents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_documents does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Check for data that would be truncated
      // =================================================================
      console.log('Checking for file_type values longer than 50 characters...');
      
      const [longValues] = await db.query(`
        SELECT COUNT(*) as count, MAX(LENGTH(file_type)) as max_length
        FROM yovo_tbl_aiva_documents
        WHERE LENGTH(file_type) > 50
      `);
      
      if (longValues[0].count > 0) {
        console.error(`✗ Cannot rollback: ${longValues[0].count} records have file_type longer than 50 characters`);
        console.error(`  Max length: ${longValues[0].max_length}`);
        console.error('  Truncating would result in data loss!');
        throw new Error('Rollback would truncate data - aborted for safety');
      }
      
      // =================================================================
      // 3. Revert column to VARCHAR(50)
      // =================================================================
      console.log('Reverting file_type column to VARCHAR(50)...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_documents 
        MODIFY COLUMN file_type VARCHAR(50) DEFAULT NULL
      `);
      
      console.log('✓ Successfully reverted file_type to VARCHAR(50)');
      console.log('✓ File type column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};