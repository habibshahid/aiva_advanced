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

const db = require('../db');

module.exports = {
    name: '006_simplify_intent_audio',
    
    async up() {
        console.log('Running migration: Simplify Intent Audio Configuration');
        
        try {
            // 1. Add auto_regenerate column
            await db.query(`
                ALTER TABLE yovo_tbl_aiva_ivr_intents 
                ADD COLUMN IF NOT EXISTS auto_regenerate TINYINT(1) DEFAULT 1
                AFTER response_audio_id
            `);
            console.log('✓ Added auto_regenerate column');
            
            // 2. Migrate existing data: 
            // - auto_cache -> auto_regenerate = 1
            // - realtime -> auto_regenerate = 1 (will generate on first call)
            // - uploaded/generated -> auto_regenerate = 0 (manual management)
            await db.query(`
                UPDATE yovo_tbl_aiva_ivr_intents 
                SET auto_regenerate = CASE 
                    WHEN audio_source IN ('auto_cache', 'realtime') THEN 1
                    ELSE 0
                END
            `);
            console.log('✓ Migrated existing audio_source values to auto_regenerate');
            
            // 3. Drop audio_source column (optional - can keep for backward compatibility)
            // For now, let's keep it but make it nullable/deprecated
            // await db.query(`ALTER TABLE yovo_tbl_aiva_ivr_intents DROP COLUMN audio_source`);
            
            console.log('✓ Migration complete: Intent audio configuration simplified');
            
        } catch (error) {
            console.error('Migration failed:', error);
            throw error;
        }
    },
    
    async down() {
        console.log('Rolling back migration: Simplify Intent Audio Configuration');
        
        try {
            // Remove auto_regenerate column
            await db.query(`
                ALTER TABLE yovo_tbl_aiva_ivr_intents 
                DROP COLUMN IF EXISTS auto_regenerate
            `);
            console.log('✓ Removed auto_regenerate column');
            
        } catch (error) {
            console.error('Rollback failed:', error);
            throw error;
        }
    }
};