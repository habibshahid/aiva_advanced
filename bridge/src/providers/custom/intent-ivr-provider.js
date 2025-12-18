/**
 * Migration: Add auto_regenerate Column to IVR Intents
 * 
 * Adds column for:
 * - auto_regenerate: Boolean flag to enable auto-generation and caching of audio
 * 
 * This simplifies the audio source system by replacing the complex
 * audio_source ENUM with a simple boolean flag:
 * - When true: Auto-generate and cache audio on first call if no audio file exists
 * - When false: Only use manually uploaded/generated audio files
 * 
 * Default is true for backward compatibility with auto_cache behavior.
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting IVR auto_regenerate Column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_ivr_intents table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_intents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_ivr_intents does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_ivr_intents exists');
      
      // =================================================================
      // 2. Add auto_regenerate column
      // =================================================================
      console.log('Adding auto_regenerate column...');
      
      const [autoRegenerateCol] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      if (autoRegenerateCol.length === 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_ivr_intents 
          ADD COLUMN auto_regenerate TINYINT(1) DEFAULT 1 
          COMMENT 'Auto-generate and cache audio on first call if no audio file exists'
          AFTER response_audio_id
        `);
        console.log('✓ Added auto_regenerate column');
        
        // =================================================================
        // 3. Migrate existing data from audio_source
        // =================================================================
        console.log('Migrating existing audio_source values...');
        
        // Check if audio_source column exists
        const [audioSourceCol] = await db.query(`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_ivr_intents' 
            AND column_name = 'audio_source'
        `);
        
        if (audioSourceCol.length > 0) {
          // Migrate values:
          // - auto_cache, realtime -> auto_regenerate = 1
          // - uploaded, generated -> auto_regenerate = 0 (manual management)
          await db.query(`
            UPDATE yovo_tbl_aiva_ivr_intents 
            SET auto_regenerate = CASE 
              WHEN audio_source IN ('auto_cache', 'realtime') THEN 1
              WHEN audio_source IN ('uploaded', 'generated') THEN 0
              ELSE 1
            END
          `);
          console.log('✓ Migrated existing audio_source values to auto_regenerate');
        } else {
          console.log('✓ No audio_source column found, using default values');
        }
        
      } else {
        console.log('✓ auto_regenerate column already exists');
      }
      
      // =================================================================
      // 4. Verify migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [columns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      if (columns.length > 0) {
        console.log(`✓ Column verified:`);
        console.log(`  - ${columns[0].COLUMN_NAME}: ${columns[0].COLUMN_TYPE} (default: ${columns[0].COLUMN_DEFAULT})`);
      }
      
      // Show sample data
      const [sample] = await db.query(`
        SELECT id, intent_name, auto_regenerate 
        FROM yovo_tbl_aiva_ivr_intents 
        LIMIT 5
      `);
      
      if (sample.length > 0) {
        console.log(`✓ Sample data (${sample.length} rows):`);
        sample.forEach(row => {
          console.log(`  - ${row.intent_name}: auto_regenerate=${row.auto_regenerate}`);
        });
      }
      
      console.log('✓ IVR auto_regenerate Column migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back IVR auto_regenerate Column migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND TABLE_NAME = 'yovo_tbl_aiva_ivr_intents'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_ivr_intents does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Remove auto_regenerate column
      // =================================================================
      console.log('Checking auto_regenerate column...');
      
      const [col] = await db.query(`
        SELECT COLUMN_NAME 
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_ivr_intents' 
          AND column_name = 'auto_regenerate'
      `);
      
      if (col.length > 0) {
        await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_intents DROP COLUMN auto_regenerate`);
        console.log('✓ Dropped auto_regenerate column');
      } else {
        console.log('✓ auto_regenerate column does not exist');
      }
      
      console.log('✓ IVR auto_regenerate Column rollback completed!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};