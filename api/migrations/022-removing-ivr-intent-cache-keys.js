/**
 * Migration: Simplify Intent Audio Configuration
 * 
 * Changes:
 * - Remove audio_source ENUM (was: uploaded, generated, auto_cache, realtime)
 * - Add auto_regenerate BOOLEAN (for kb_lookup intents - regenerate if audio deleted)
 * 
 * New simplified model:
 * - response_audio_id: UUID of audio file (always required for playback)
 * - response_text: Text used to generate audio (kept for reference/regeneration)
 * - auto_regenerate: If true and audio_id is null, regenerate on first call
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting Simplify Intent Audio Configuration migration...');
      
      // =================================================================
      // 1. Check if auto_regenerate column exists
      // =================================================================
      console.log('Adding auto_regenerate column to yovo_tbl_aiva_ivr_intents...');
      
      const [autoRegenColumn] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      if (autoRegenColumn.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_intents 
          ADD COLUMN auto_regenerate TINYINT(1) DEFAULT 1
          AFTER response_audio_id
        `);
        console.log('✓ Added auto_regenerate column');
      } else {
        console.log('✓ auto_regenerate column already exists');
      }
      
      // =================================================================
      // 2. Migrate existing data based on audio_source
      // =================================================================
      console.log('Migrating existing audio_source values to auto_regenerate...');
      
      // Check if audio_source column exists before migrating
      const [audioSourceColumn] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'audio_source'
      `);
      
      if (audioSourceColumn.length > 0) {
        // Migrate: auto_cache/realtime -> auto_regenerate = 1
        //          uploaded/generated -> auto_regenerate = 0
        await db.query(`
          UPDATE yovo_tbl_aiva_ivr_intents 
          SET auto_regenerate = CASE 
              WHEN audio_source IN ('auto_cache', 'realtime') THEN 1
              ELSE 0
          END
        `);
        console.log('✓ Migrated existing audio_source values to auto_regenerate');
      } else {
        console.log('✓ audio_source column does not exist, skipping data migration');
      }
      
      // =================================================================
      // 3. Verify migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [columns] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      console.log(`✓ auto_regenerate column: ${columns.length > 0 ? 'exists' : 'missing'}`);
      
      console.log('✓ Simplify Intent Audio Configuration migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back Simplify Intent Audio Configuration migration...');
      
      // =================================================================
      // 1. Remove auto_regenerate column
      // =================================================================
      console.log('Removing auto_regenerate column from yovo_tbl_aiva_ivr_intents...');
      
      const [autoRegenColumn] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      if (autoRegenColumn.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_intents 
          DROP COLUMN auto_regenerate
        `);
        console.log('✓ Removed auto_regenerate column');
      } else {
        console.log('✓ auto_regenerate column does not exist');
      }
      
      console.log('✓ Simplify Intent Audio Configuration rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};