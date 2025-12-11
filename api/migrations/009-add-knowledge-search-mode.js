'use strict';
/**
 * Migration: Add Knowledge Search Mode to Agents
 * 
 * This migration adds a column to control knowledge base search behavior per agent:
 * - 'always': Force KB search for all non-trivial messages
 * - 'never': Disable KB search entirely  
 * - 'auto': Let LLM decide when to search (default, current behavior)
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting knowledge_search_mode migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_agents table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_agents does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_agents exists');
      
      // =================================================================
      // 2. Add knowledge_search_mode column
      // =================================================================
      console.log('Checking knowledge_search_mode column...');
      
      const [knowledgeSearchModeCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'knowledge_search_mode'
      `);
      
      if (knowledgeSearchModeCol.length > 0) {
        console.log('✓ Column knowledge_search_mode already exists');
      } else {
        console.log('Adding knowledge_search_mode column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN knowledge_search_mode enum('always','never','auto') DEFAULT 'auto'
          COMMENT 'always=force KB search, never=skip KB search, auto=LLM decides'
          AFTER kb_id
        `);
        
        console.log('✓ Successfully added knowledge_search_mode column');
      }
      
      // =================================================================
      // 3. Add index for knowledge_search_mode (optional, for reporting)
      // =================================================================
      console.log('Checking idx_knowledge_search_mode index...');
      
      const [searchModeIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND index_name = 'idx_knowledge_search_mode'
      `);
      
      if (searchModeIdx.length > 0) {
        console.log('✓ Index idx_knowledge_search_mode already exists');
      } else {
        console.log('Adding idx_knowledge_search_mode index...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD KEY idx_knowledge_search_mode (knowledge_search_mode)
        `);
        
        console.log('✓ Successfully added idx_knowledge_search_mode index');
      }
      
      // =================================================================
      // 4. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'knowledge_search_mode'
      `);
      
      console.log('✓ Verification - column after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
        console.log(`    Comment: ${col.COLUMN_COMMENT}`);
      });
      
      console.log('✓ Knowledge search mode migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back knowledge_search_mode migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_agents does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Drop index
      // =================================================================
      console.log('Dropping idx_knowledge_search_mode index...');
      
      const [searchModeIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND index_name = 'idx_knowledge_search_mode'
      `);
      
      if (searchModeIdx.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP KEY idx_knowledge_search_mode
        `);
        console.log('✓ Dropped idx_knowledge_search_mode index');
      } else {
        console.log('✓ Index idx_knowledge_search_mode does not exist');
      }
      
      // =================================================================
      // 3. Drop knowledge_search_mode column
      // =================================================================
      console.log('Dropping knowledge_search_mode column...');
      
      const [knowledgeSearchModeCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'knowledge_search_mode'
      `);
      
      if (knowledgeSearchModeCol.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP COLUMN knowledge_search_mode
        `);
        console.log('✓ Dropped knowledge_search_mode column');
      } else {
        console.log('✓ Column knowledge_search_mode does not exist');
      }
      
      console.log('✓ Knowledge search mode rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};