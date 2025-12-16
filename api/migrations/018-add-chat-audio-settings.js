'use strict';
/**
 * Migration: Add Chat Audio Settings to Agents
 * 
 * This migration adds support for chat-specific audio settings:
 * - chat_stt_provider: Speech-to-text provider for chat audio messages
 * - chat_tts_provider: Text-to-speech provider for chat audio responses  
 * - chat_tts_model: TTS model (e.g., 'whisper-1', 'tts-1')
 * - chat_tts_voice: Voice for TTS output
 * - chat_audio_response: Whether to generate audio responses in chat
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting chat audio settings migration...');
      
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
      
      const [chatSttProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_stt_provider'
      `);
      
      if (chatSttProviderCol.length > 0) {
        console.log('✓ Column chat_stt_provider already exists');
      } else {
        console.log('Adding chat_stt_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_stt_provider varchar(50) DEFAULT 'openai'
          COMMENT 'STT provider for chat audio messages (openai, soniox, deepgram)'
          AFTER knowledge_search_mode
        `);
        
        console.log('✓ Successfully added chat_stt_provider column');
      }
      
      // =================================================================
      // 3. Add chat_tts_provider column
      // =================================================================
      console.log('Checking chat_tts_provider column...');
      
      const [chatTtsProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_tts_provider'
      `);
      
      if (chatTtsProviderCol.length > 0) {
        console.log('✓ Column chat_tts_provider already exists');
      } else {
        console.log('Adding chat_tts_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_tts_provider varchar(50) DEFAULT 'openai'
          COMMENT 'TTS provider for chat audio responses (openai, uplift, azure)'
          AFTER chat_stt_provider
        `);
        
        console.log('✓ Successfully added chat_tts_provider column');
      }
      
      // =================================================================
      // 4. Add chat_tts_model column
      // =================================================================
      console.log('Checking chat_tts_model column...');
      
      const [chatTtsModelCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_tts_model'
      `);
      
      if (chatTtsModelCol.length > 0) {
        console.log('✓ Column chat_tts_model already exists');
      } else {
        console.log('Adding chat_tts_model column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_tts_model varchar(100) DEFAULT 'tts-1'
          COMMENT 'TTS model for chat audio responses'
          AFTER chat_tts_provider
        `);
        
        console.log('✓ Successfully added chat_tts_model column');
      }
      
      // =================================================================
      // 5. Add chat_tts_voice column
      // =================================================================
      console.log('Checking chat_tts_voice column...');
      
      const [chatTtsVoiceCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_tts_voice'
      `);
      
      if (chatTtsVoiceCol.length > 0) {
        console.log('✓ Column chat_tts_voice already exists');
      } else {
        console.log('Adding chat_tts_voice column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_tts_voice varchar(100) DEFAULT 'nova'
          COMMENT 'Voice for chat TTS output'
          AFTER chat_tts_model
        `);
        
        console.log('✓ Successfully added chat_tts_voice column');
      }
      
      // =================================================================
      // 6. Add chat_audio_response column
      // =================================================================
      console.log('Checking chat_audio_response column...');
      
      const [chatAudioResponseCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'chat_audio_response'
      `);
      
      if (chatAudioResponseCol.length > 0) {
        console.log('✓ Column chat_audio_response already exists');
      } else {
        console.log('Adding chat_audio_response column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN chat_audio_response tinyint(1) DEFAULT 0
          COMMENT 'Whether to generate audio responses in chat'
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
          AND column_name IN ('chat_stt_provider', 'chat_tts_provider', 'chat_tts_model', 'chat_tts_voice', 'chat_audio_response')
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('✓ Verification - columns after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ Chat audio settings migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back chat audio settings migration...');
      
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
      // 2. Drop columns
      // =================================================================
      const columnsToDrop = [
        'chat_stt_provider',
        'chat_tts_provider', 
        'chat_tts_model',
        'chat_tts_voice',
        'chat_audio_response'
      ];
      
      for (const columnName of columnsToDrop) {
        console.log(`Dropping ${columnName} column...`);
        
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
      
      console.log('✓ Chat audio settings rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};