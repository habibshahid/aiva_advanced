'use strict';
/**
 * Migration: Add Custom Voice Provider Support
 * 
 * This migration adds support for the custom voice provider:
 * - Adds 'custom' to provider enum in yovo_tbl_aiva_agents
 * - Adds tts_provider column (enum: 'uplift', 'azure')
 * - Adds custom_voice column (varchar: voice ID)
 * - Adds language_hints column (json: STT language hints)
 * - Adds llm_model column (varchar: Groq/OpenAI model)
 * - Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting custom voice provider migration...');
      
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
      // 2. Check and update provider enum to include 'custom'
      // =================================================================
      console.log('Checking provider enum values...');
      
      const [providerCol] = await db.query(`
        SELECT COLUMN_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'provider'
      `);
      
      if (providerCol.length === 0) {
        console.log('⚠ Column provider does not exist, skipping enum update');
      } else {
        const currentType = providerCol[0].COLUMN_TYPE;
        console.log(`Current provider enum: ${currentType}`);
        
        if (currentType.includes('custom')) {
          console.log('✓ Provider enum already includes "custom"');
        } else {
          console.log('Adding "custom" to provider enum...');
          
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_agents 
            MODIFY COLUMN provider enum('openai','deepgram','custom') DEFAULT 'openai'
          `);
          
          console.log('✓ Successfully added "custom" to provider enum');
        }
      }
      
      // =================================================================
      // 3. Add tts_provider column
      // =================================================================
      console.log('Checking tts_provider column...');
      
      const [ttsProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'tts_provider'
      `);
      
      if (ttsProviderCol.length > 0) {
        console.log('✓ Column tts_provider already exists');
      } else {
        console.log('Adding tts_provider column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN tts_provider enum('uplift','azure','openai') DEFAULT 'openai'
          COMMENT 'TTS provider for custom voice provider (Uplift AI or Azure or OpenAI)'
          AFTER deepgram_language
        `);
        
        console.log('✓ Successfully added tts_provider column');
      }
      
      // =================================================================
      // 4. Add custom_voice column
      // =================================================================
      console.log('Checking custom_voice column...');
      
      const [customVoiceCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'custom_voice'
      `);
      
      if (customVoiceCol.length > 0) {
        console.log('✓ Column custom_voice already exists');
      } else {
        console.log('Adding custom_voice column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN custom_voice varchar(100) DEFAULT 'ur-PK-female'
          COMMENT 'Voice ID for custom provider (Uplift or Azure voice)'
          AFTER tts_provider
        `);
        
        console.log('✓ Successfully added custom_voice column');
      }
      
      // =================================================================
      // 5. Add language_hints column
      // =================================================================
      console.log('Checking language_hints column...');
      
      const [langHintsCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'language_hints'
      `);
      
      if (langHintsCol.length > 0) {
        console.log('✓ Column language_hints already exists');
      } else {
        console.log('Adding language_hints column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN language_hints json DEFAULT NULL
          COMMENT 'Language hints for Soniox STT in custom provider (e.g., ["ur", "en"])'
          AFTER custom_voice
        `);
        
        console.log('✓ Successfully added language_hints column');
      }
      
      // =================================================================
      // 6. Add llm_model column
      // =================================================================
      console.log('Checking llm_model column...');
      
      const [llmModelCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'llm_model'
      `);
      
      if (llmModelCol.length > 0) {
        console.log('✓ Column llm_model already exists');
      } else {
        console.log('Adding llm_model column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD COLUMN llm_model varchar(100) DEFAULT 'llama-3.3-70b-versatile'
          COMMENT 'LLM model for custom provider (Groq or OpenAI model)'
          AFTER language_hints
        `);
        
        console.log('✓ Successfully added llm_model column');
      }
      
      // =================================================================
      // 7. Add index for tts_provider (optional, for reporting)
      // =================================================================
      console.log('Checking idx_tts_provider index...');
      
      const [ttsProviderIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND index_name = 'idx_tts_provider'
      `);
      
      if (ttsProviderIdx.length > 0) {
        console.log('✓ Index idx_tts_provider already exists');
      } else {
        console.log('Adding idx_tts_provider index...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          ADD KEY idx_tts_provider (tts_provider)
        `);
        
        console.log('✓ Successfully added idx_tts_provider index');
      }
      
      // =================================================================
      // 8. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name IN ('provider', 'tts_provider', 'custom_voice', 'language_hints', 'llm_model')
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('✓ Verification - columns after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ Custom voice provider migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back custom voice provider migration...');
      
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
      // 2. Check if any agents are using custom provider
      // =================================================================
      console.log('Checking for agents using custom provider...');
      
      const [customAgents] = await db.query(`
        SELECT COUNT(*) as count
        FROM yovo_tbl_aiva_agents
        WHERE provider = 'custom'
      `);
      
      if (customAgents[0].count > 0) {
        console.error(`✗ Cannot rollback: ${customAgents[0].count} agents are using custom provider`);
        console.error('  Please update these agents to use openai or deepgram first');
        throw new Error('Rollback would break existing agents - aborted for safety');
      }
      
      console.log('✓ No agents using custom provider');
      
      // =================================================================
      // 3. Drop index
      // =================================================================
      console.log('Dropping idx_tts_provider index...');
      
      const [ttsProviderIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND index_name = 'idx_tts_provider'
      `);
      
      if (ttsProviderIdx.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP KEY idx_tts_provider
        `);
        console.log('✓ Dropped idx_tts_provider index');
      } else {
        console.log('✓ Index idx_tts_provider does not exist');
      }
      
      // =================================================================
      // 4. Drop llm_model column
      // =================================================================
      console.log('Dropping llm_model column...');
      
      const [llmModelCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'llm_model'
      `);
      
      if (llmModelCol.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP COLUMN llm_model
        `);
        console.log('✓ Dropped llm_model column');
      } else {
        console.log('✓ Column llm_model does not exist');
      }
      
      // =================================================================
      // 5. Drop language_hints column
      // =================================================================
      console.log('Dropping language_hints column...');
      
      const [langHintsCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'language_hints'
      `);
      
      if (langHintsCol.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP COLUMN language_hints
        `);
        console.log('✓ Dropped language_hints column');
      } else {
        console.log('✓ Column language_hints does not exist');
      }
      
      // =================================================================
      // 6. Drop custom_voice column
      // =================================================================
      console.log('Dropping custom_voice column...');
      
      const [customVoiceCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'custom_voice'
      `);
      
      if (customVoiceCol.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP COLUMN custom_voice
        `);
        console.log('✓ Dropped custom_voice column');
      } else {
        console.log('✓ Column custom_voice does not exist');
      }
      
      // =================================================================
      // 7. Drop tts_provider column
      // =================================================================
      console.log('Dropping tts_provider column...');
      
      const [ttsProviderCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_agents' 
          AND column_name = 'tts_provider'
      `);
      
      if (ttsProviderCol.length > 0) {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_agents 
          DROP COLUMN tts_provider
        `);
        console.log('✓ Dropped tts_provider column');
      } else {
        console.log('✓ Column tts_provider does not exist');
      }
      
      // =================================================================
      // 8. Revert provider enum (remove 'custom')
      // =================================================================
      console.log('Reverting provider enum...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_agents 
        MODIFY COLUMN provider enum('openai','deepgram') DEFAULT 'openai'
      `);
      
      console.log('✓ Reverted provider enum to (openai, deepgram)');
      
      console.log('✓ Custom voice provider rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};
