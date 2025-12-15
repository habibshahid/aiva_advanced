'use strict';
/**
 * Migration: Add Chat Audio Configuration to Agents
 * 
 * This migration adds columns for chat audio (STT/TTS) settings:
 * - chat_stt_provider: Speech-to-Text provider (openai, groq, deepgram, soniox)
 * - chat_stt_model: STT model name (whisper-1, whisper-large-v3, nova-2, stt-async-preview)
 * - chat_tts_provider: Text-to-Speech provider (openai, azure, uplift)
 * - chat_tts_voice: TTS voice name (nova, shimmer, ayesha, en-US-JennyNeural, etc.)
 * - chat_audio_response: Auto-generate audio response for voice messages
 * 
 * These are SEPARATE from voice call settings (tts_provider, voice, custom_voice)
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting chat audio configuration migration...');
      
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
      // 2. Add chat_stt_provider column
      // =================================================================
      console.log('Checking chat_stt_provider column...');
      
      const [sttProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_stt_provider'
      `);
      
      if (sttProviderCol.length > 0) {
        console.log('✓ Column chat_stt_provider already exists');
      } else {
        console.log('Adding chat_stt_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_stt_provider ENUM('openai', 'groq', 'deepgram', 'soniox') DEFAULT 'openai'
          COMMENT 'Speech-to-Text provider for chat audio messages'
          AFTER tts_provider
        `);
        
        console.log('✓ Successfully added chat_stt_provider column');
      }
      
      // =================================================================
      // 3. Add chat_stt_model column
      // =================================================================
      console.log('Checking chat_stt_model column...');
      
      const [sttModelCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_stt_model'
      `);
      
      if (sttModelCol.length > 0) {
        console.log('✓ Column chat_stt_model already exists');
      } else {
        console.log('Adding chat_stt_model column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_stt_model VARCHAR(100) DEFAULT 'whisper-1'
          COMMENT 'STT model: whisper-1, whisper-large-v3, nova-2, stt-async-preview'
          AFTER chat_stt_provider
        `);
        
        console.log('✓ Successfully added chat_stt_model column');
      }
      
      // =================================================================
      // 4. Add chat_tts_provider column
      // =================================================================
      console.log('Checking chat_tts_provider column...');
      
      const [ttsProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_tts_provider'
      `);
      
      if (ttsProviderCol.length > 0) {
        console.log('✓ Column chat_tts_provider already exists');
      } else {
        console.log('Adding chat_tts_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_tts_provider ENUM('openai', 'azure', 'uplift') DEFAULT 'openai'
          COMMENT 'Text-to-Speech provider for chat audio responses'
          AFTER chat_stt_model
        `);
        
        console.log('✓ Successfully added chat_tts_provider column');
      }
      
      // =================================================================
      // 5. Add chat_tts_voice column
      // =================================================================
      console.log('Checking chat_tts_voice column...');
      
      const [ttsVoiceCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_tts_voice'
      `);
      
      if (ttsVoiceCol.length > 0) {
        console.log('✓ Column chat_tts_voice already exists');
      } else {
        console.log('Adding chat_tts_voice column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_tts_voice VARCHAR(100) DEFAULT 'nova'
          COMMENT 'TTS voice: nova, shimmer, alloy, ayesha, en-US-JennyNeural, etc.'
          AFTER chat_tts_provider
        `);
        
        console.log('✓ Successfully added chat_tts_voice column');
      }
      
      // =================================================================
      // 6. Add chat_audio_response column
      // =================================================================
      console.log('Checking chat_audio_response column...');
      
      const [audioResponseCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_audio_response'
      `);
      
      if (audioResponseCol.length > 0) {
        console.log('✓ Column chat_audio_response already exists');
      } else {
        console.log('Adding chat_audio_response column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_audio_response TINYINT(1) DEFAULT 1
          COMMENT 'Auto-generate TTS audio response when user sends voice message'
          AFTER chat_tts_voice
        `);
        
        console.log('✓ Successfully added chat_audio_response column');
      }
      
      // =================================================================
      // 7. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name LIKE 'chat_%'
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('✓ Verification - chat audio columns after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ Chat audio configuration migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back chat audio configuration migration...');
      
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
      // 2. Drop columns in reverse order
      // =================================================================
      const columnsToDrop = [
        'chat_audio_response',
        'chat_tts_voice',
        'chat_tts_provider',
        'chat_stt_model',
        'chat_stt_provider'
      ];
      
      for (const columnName of columnsToDrop) {
        console.log(`Checking ${columnName} column...`);
        
        const [col] = await db.query(`
          SELECT COLUMN_NAME
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_agents' 
            AND column_name = '${columnName}'
        `);
        
        if (col.length > 0) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_agents 
            DROP COLUMN ${columnName}
          `);
          console.log(`✓ Dropped ${columnName} column`);
        } else {
          console.log(`✓ Column ${columnName} does not exist`);
        }
      }
      
      console.log('✓ Chat audio configuration rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};