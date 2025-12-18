/**
 * Migration: IVR Unmatched Queries & Audio Caching
 * 
 * Creates/alters tables for:
 * - yovo_tbl_aiva_ivr_unmatched_queries: Track queries that don't match any intent
 * - yovo_tbl_aiva_ivr_audio: Add columns for TTS-generated audio tracking
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting IVR Unmatched Queries migration...');
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_ivr_unmatched_queries table
      // =================================================================
      console.log('Creating yovo_tbl_aiva_ivr_unmatched_queries table...');
      
      const [existingTable] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_unmatched_queries'
      `);
      
      if (existingTable.length === 0) {
        await db.query(`
          CREATE TABLE yovo_tbl_aiva_ivr_unmatched_queries (
            id VARCHAR(36) PRIMARY KEY,
            agent_id VARCHAR(36) NOT NULL,
            transcript TEXT NOT NULL,
            session_id VARCHAR(100) DEFAULT NULL,
            caller_id VARCHAR(50) DEFAULT NULL,
            closest_intents JSON DEFAULT NULL COMMENT 'Array of {intent_id, intent_name, score, threshold}',
            suggested_intent VARCHAR(100) DEFAULT NULL COMMENT 'LLM suggested intent name',
            suggested_description TEXT DEFAULT NULL COMMENT 'LLM description of what user wanted',
            query_timestamp DATETIME DEFAULT NULL,
            resolved_intent_id VARCHAR(36) DEFAULT NULL COMMENT 'If an intent was created from this query',
            resolved_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            
            KEY idx_agent_id (agent_id),
            KEY idx_session_id (session_id),
            KEY idx_created_at (created_at),
            KEY idx_transcript (transcript(100)),
            KEY idx_resolved (resolved_intent_id),
            KEY idx_suggested_intent (suggested_intent),
            
            CONSTRAINT fk_unmatched_queries_agent FOREIGN KEY (agent_id) 
              REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
            CONSTRAINT fk_unmatched_queries_intent FOREIGN KEY (resolved_intent_id) 
              REFERENCES yovo_tbl_aiva_ivr_intents(id) ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `);
        console.log('✓ Created yovo_tbl_aiva_ivr_unmatched_queries table');
      } else {
        console.log('✓ yovo_tbl_aiva_ivr_unmatched_queries table already exists');
        
        // Add suggested_intent column if missing
        const [suggestedCol] = await db.query(`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_unmatched_queries' 
            AND column_name = 'suggested_intent'
        `);
        
        if (suggestedCol.length === 0) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_ivr_unmatched_queries 
            ADD COLUMN suggested_intent VARCHAR(100) DEFAULT NULL COMMENT 'LLM suggested intent name' AFTER closest_intents,
            ADD COLUMN suggested_description TEXT DEFAULT NULL COMMENT 'LLM description of what user wanted' AFTER suggested_intent,
            ADD KEY idx_suggested_intent (suggested_intent)
          `);
          console.log('✓ Added suggested_intent columns');
        }
      }
      
      // =================================================================
      // 2. Add is_generated column to yovo_tbl_aiva_ivr_audio
      // =================================================================
      console.log('Adding is_generated column to ivr_audio...');
      
      const [isGeneratedCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_audio' 
          AND column_name = 'is_generated'
      `);
      
      if (isGeneratedCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_audio 
          ADD COLUMN is_generated TINYINT(1) DEFAULT 0 
          COMMENT 'True if generated via TTS' 
          AFTER duration_ms
        `);
        console.log('✓ Added is_generated column');
      } else {
        console.log('✓ is_generated column already exists');
      }
      
      // =================================================================
      // 3. Add cache_key column to yovo_tbl_aiva_ivr_audio
      // =================================================================
      console.log('Adding cache_key column to ivr_audio...');
      
      const [cacheKeyCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_audio' 
          AND column_name = 'cache_key'
      `);
      
      if (cacheKeyCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_audio 
          ADD COLUMN cache_key VARCHAR(255) DEFAULT NULL 
          COMMENT 'Cache key for response caching' 
          AFTER source_text
        `);
        console.log('✓ Added cache_key column');
      } else {
        console.log('✓ cache_key column already exists');
      }
      
      // =================================================================
      // 4. Add index for cache_key
      // =================================================================
      console.log('Adding idx_cache_key index...');
      
      const [cacheKeyIdx] = await db.query(`
        SELECT INDEX_NAME 
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_audio' 
          AND index_name = 'idx_cache_key'
      `);
      
      if (cacheKeyIdx.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_audio 
          ADD KEY idx_cache_key (cache_key)
        `);
        console.log('✓ Added idx_cache_key index');
      } else {
        console.log('✓ idx_cache_key index already exists');
      }
      
      // =================================================================
      // 5. Verify migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_unmatched_queries'
      `);
      
      const [columns] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_audio' 
          AND column_name IN ('is_generated', 'cache_key')
      `);
      
      console.log(`✓ Unmatched queries table: ${tables.length > 0 ? 'exists' : 'missing'}`);
      console.log(`✓ Audio table new columns: ${columns.length}/2`);
      
      console.log('✓ IVR Unmatched Queries migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back IVR Unmatched Queries migration...');
      
      // =================================================================
      // 1. Drop yovo_tbl_aiva_ivr_unmatched_queries table
      // =================================================================
      console.log('Dropping yovo_tbl_aiva_ivr_unmatched_queries table...');
      
      const [existingTable] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_unmatched_queries'
      `);
      
      if (existingTable.length > 0) {
        await db.query(`DROP TABLE yovo_tbl_aiva_ivr_unmatched_queries`);
        console.log('✓ Dropped yovo_tbl_aiva_ivr_unmatched_queries table');
      } else {
        console.log('✓ Table yovo_tbl_aiva_ivr_unmatched_queries does not exist');
      }
      
      // =================================================================
      // 2. Remove columns from yovo_tbl_aiva_ivr_audio
      // =================================================================
      console.log('Removing added columns from ivr_audio...');
      
      // Drop index first
      const [cacheKeyIdx] = await db.query(`
        SELECT INDEX_NAME 
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_audio' 
          AND index_name = 'idx_cache_key'
      `);
      
      if (cacheKeyIdx.length > 0) {
        await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_audio DROP KEY idx_cache_key`);
        console.log('✓ Dropped idx_cache_key index');
      }
      
      // Drop columns
      const columnsToRemove = ['cache_key', 'is_generated'];
      
      for (const colName of columnsToRemove) {
        const [col] = await db.query(`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_audio' 
            AND column_name = '${colName}'
        `);
        
        if (col.length > 0) {
          await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_audio DROP COLUMN ${colName}`);
          console.log(`✓ Dropped ${colName} column`);
        }
      }
      
      console.log('✓ IVR Unmatched Queries rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};