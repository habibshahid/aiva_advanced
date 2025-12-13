'use strict';
/**
 * Migration: Add skip_ssl_verify to Functions
 * 
 * This migration adds:
 * - skip_ssl_verify: Boolean flag to disable SSL certificate verification for API endpoints
 *                    Useful for internal APIs with self-signed certificates or incomplete SSL chains
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting skip_ssl_verify column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_functions table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_functions'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_functions does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_functions exists');
      
      // =================================================================
      // 2. Add skip_ssl_verify column
      // =================================================================
      console.log('Checking skip_ssl_verify column...');
      
      const [skipSslCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_functions' 
          AND column_name = 'skip_ssl_verify'
      `);
      
      if (skipSslCol.length > 0) {
        console.log('✓ Column skip_ssl_verify already exists');
      } else {
        console.log('Adding skip_ssl_verify column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_functions 
          ADD COLUMN skip_ssl_verify tinyint(1) DEFAULT 0
          COMMENT 'Skip SSL certificate verification for this endpoint (use for self-signed certs)'
          AFTER api_headers
        `);
        
        console.log('✓ Successfully added skip_ssl_verify column');
      }
      
      // =================================================================
      // 3. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_functions' 
          AND column_name = 'skip_ssl_verify'
      `);
      
      console.log('✓ Verification - column after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
        console.log(`    Comment: ${col.COLUMN_COMMENT}`);
      });
      
      console.log('✓ skip_ssl_verify column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back skip_ssl_verify column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_functions'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_functions does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Drop skip_ssl_verify column
      // =================================================================
      console.log('Dropping skip_ssl_verify column...');
      
      const [col] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_functions' 
          AND column_name = 'skip_ssl_verify'
      `);
      
      if (col.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_functions 
          DROP COLUMN skip_ssl_verify
        `);
        console.log('✓ Dropped skip_ssl_verify column');
      } else {
        console.log('✓ Column skip_ssl_verify does not exist');
      }
      
      console.log('✓ skip_ssl_verify column rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};