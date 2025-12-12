'use strict';
/**
 * Migration: Add Pending Image to Chat Sessions
 * 
 * This migration adds:
 * - pending_image: Stores image data when user uploads without clear intent
 *                  Allows asking user what they want to do with the image
 *                  Structure: { image: base64/url, original_message: string, stored_at: ISO date }
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting pending_image column migration...');
      
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
      // 2. Add pending_image column
      // =================================================================
      console.log('Checking pending_image column...');
      
      const [pendingImageCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'pending_image'
      `);
      
      if (pendingImageCol.length > 0) {
        console.log('✓ Column pending_image already exists');
      } else {
        console.log('Adding pending_image column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN pending_image json DEFAULT NULL
          COMMENT 'Stores image awaiting user intent clarification (product search vs complaint)'
        `);
        
        console.log('✓ Successfully added pending_image column');
      }
      
      // =================================================================
      // 3. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'pending_image'
      `);
      
      console.log('✓ Verification - column after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ pending_image column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back pending_image column migration...');
      
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
      // 2. Drop pending_image column
      // =================================================================
      console.log('Dropping pending_image column...');
      
      const [col] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'pending_image'
      `);
      
      if (col.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          DROP COLUMN pending_image
        `);
        console.log('✓ Dropped pending_image column');
      } else {
        console.log('✓ Column pending_image does not exist');
      }
      
      console.log('✓ pending_image column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};