'use strict';
/**
 * Migration: Add Sort Optimization Indexes for Chat Sessions
 * 
 * Fixes: "Out of sort memory" error when fetching/sorting chat sessions
 * 
 * The issue occurs because:
 * 1. Large row sizes (JSON/TEXT columns)
 * 2. Missing composite index for tenant_id + start_time sort
 * 
 * This migration adds:
 * - idx_tenant_start_time: Composite index for efficient tenant filtering + date sorting
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting sort optimization indexes migration...');
      
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
        console.log('⚠ Table yovo_tbl_aiva_chat_sessions does not exist, skipping migration');
        return;
      }
      
      // =================================================================
      // 2. Add composite index for tenant_id + start_time (DESC)
      // =================================================================
      console.log('Checking idx_tenant_start_time index...');
      
      const [tenantStartIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_tenant_start_time'
      `);
      
      if (tenantStartIdx.length > 0) {
        console.log('✓ Index idx_tenant_start_time already exists');
      } else {
        console.log('Adding idx_tenant_start_time composite index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_tenant_start_time (tenant_id, start_time DESC)
        `);
        console.log('✓ Successfully added idx_tenant_start_time index');
      }
      
      // =================================================================
      // 3. Add composite index for tenant_id + agent_id + start_time
      // =================================================================
      console.log('Checking idx_tenant_agent_start index...');
      
      const [tenantAgentStartIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_tenant_agent_start'
      `);
      
      if (tenantAgentStartIdx.length > 0) {
        console.log('✓ Index idx_tenant_agent_start already exists');
      } else {
        console.log('Adding idx_tenant_agent_start composite index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_tenant_agent_start (tenant_id, agent_id, start_time DESC)
        `);
        console.log('✓ Successfully added idx_tenant_agent_start index');
      }
      
      // =================================================================
      // 4. Verify
      // =================================================================
      console.log('Verifying migration...');
      
      const [indexes] = await db.query(`
        SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions'
          AND index_name IN ('idx_tenant_start_time', 'idx_tenant_agent_start')
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `);
      
      console.log('✓ Indexes after migration:');
      indexes.forEach(idx => {
        console.log(`  - ${idx.INDEX_NAME}: ${idx.COLUMN_NAME}`);
      });
      
      console.log('✓ Sort optimization indexes migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back sort optimization indexes migration...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table does not exist, skipping rollback');
        return;
      }
      
      // Drop indexes
      const indexesToDrop = ['idx_tenant_start_time', 'idx_tenant_agent_start'];
      
      for (const indexName of indexesToDrop) {
        const [idx] = await db.query(`
          SELECT INDEX_NAME
          FROM information_schema.STATISTICS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_chat_sessions' 
            AND index_name = '${indexName}'
        `);
        
        if (idx.length > 0) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_chat_sessions 
            DROP KEY ${indexName}
          `);
          console.log(`✓ Dropped ${indexName} index`);
        }
      }
      
      console.log('✓ Rollback completed');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};