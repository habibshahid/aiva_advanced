'use strict';
/**
 * Migration: Add Channel and Context to Chat Sessions
 * 
 * This migration adds:
 * - channel: Identifies the source of the chat (whatsapp, web_chat, etc.)
 * - channel_user_id: External user identifier from the channel (phone number, email, etc.)
 * - channel_user_name: Display name from the channel
 * - channel_metadata: Additional channel-specific data (JSON)
 * - context_data: Custom context passed at session creation (JSON)
 * - llm_context_hints: Special instructions for LLM based on channel (JSON)
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting chat session channel migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_chat_sessions table exists...');
      
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
      
      console.log('✓ Table yovo_tbl_aiva_chat_sessions exists');
      
      // =================================================================
      // 2. Add channel column
      // =================================================================
      console.log('Checking channel column...');
      
      const [channelCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'channel'
      `);
      
      if (channelCol.length > 0) {
        console.log('✓ Column channel already exists');
      } else {
        console.log('Adding channel column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN channel enum(
            'whatsapp',
            'web_chat',
            'public_chat',
            'fb_pages',
            'fb_messenger',
            'instagram',
            'instagram_dm',
            'twitter',
            'twitter_dm',
            'email',
            'linkedin_feed',
            'sms',
            'voice',
            'api'
          ) DEFAULT 'public_chat'
          COMMENT 'Channel/platform where the chat originated'
          AFTER agent_id
        `);
        
        console.log('✓ Successfully added channel column');
      }
      
      // =================================================================
      // 3. Add channel_user_id column
      // =================================================================
      console.log('Checking channel_user_id column...');
      
      const [channelUserIdCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'channel_user_id'
      `);
      
      if (channelUserIdCol.length > 0) {
        console.log('✓ Column channel_user_id already exists');
      } else {
        console.log('Adding channel_user_id column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN channel_user_id varchar(255) DEFAULT NULL
          COMMENT 'External user ID from channel (phone number, email, social ID, etc.)'
          AFTER channel
        `);
        
        console.log('✓ Successfully added channel_user_id column');
      }
      
      // =================================================================
      // 4. Add channel_user_name column
      // =================================================================
      console.log('Checking channel_user_name column...');
      
      const [channelUserNameCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'channel_user_name'
      `);
      
      if (channelUserNameCol.length > 0) {
        console.log('✓ Column channel_user_name already exists');
      } else {
        console.log('Adding channel_user_name column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN channel_user_name varchar(255) DEFAULT NULL
          COMMENT 'Display name from channel (WhatsApp name, profile name, etc.)'
          AFTER channel_user_id
        `);
        
        console.log('✓ Successfully added channel_user_name column');
      }
      
      // =================================================================
      // 5. Add channel_metadata column
      // =================================================================
      console.log('Checking channel_metadata column...');
      
      const [channelMetadataCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'channel_metadata'
      `);
      
      if (channelMetadataCol.length > 0) {
        console.log('✓ Column channel_metadata already exists');
      } else {
        console.log('Adding channel_metadata column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN channel_metadata json DEFAULT NULL
          COMMENT 'Channel-specific metadata (profile pic URL, verified status, etc.)'
          AFTER channel_user_name
        `);
        
        console.log('✓ Successfully added channel_metadata column');
      }
      
      // =================================================================
      // 6. Add context_data column
      // =================================================================
      console.log('Checking context_data column...');
      
      const [contextDataCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'context_data'
      `);
      
      if (contextDataCol.length > 0) {
        console.log('✓ Column context_data already exists');
      } else {
        console.log('Adding context_data column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN context_data json DEFAULT NULL
          COMMENT 'Custom context data passed at session creation (CRM data, order info, etc.)'
          AFTER channel_metadata
        `);
        
        console.log('✓ Successfully added context_data column');
      }
      
      // =================================================================
      // 7. Add llm_context_hints column
      // =================================================================
      console.log('Checking llm_context_hints column...');
      
      const [llmContextCol] = await db.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name = 'llm_context_hints'
      `);
      
      if (llmContextCol.length > 0) {
        console.log('✓ Column llm_context_hints already exists');
      } else {
        console.log('Adding llm_context_hints column...');
        
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD COLUMN llm_context_hints text DEFAULT NULL
          COMMENT 'Special LLM instructions based on channel (formatting rules, language hints, etc.)'
          AFTER context_data
        `);
        
        console.log('✓ Successfully added llm_context_hints column');
      }
      
      // =================================================================
      // 8. Add indexes
      // =================================================================
      console.log('Checking indexes...');
      
      // Index on channel
      const [channelIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_channel'
      `);
      
      if (channelIdx.length > 0) {
        console.log('✓ Index idx_channel already exists');
      } else {
        console.log('Adding idx_channel index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_channel (channel)
        `);
        console.log('✓ Successfully added idx_channel index');
      }
      
      // Index on channel_user_id
      const [channelUserIdIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_channel_user_id'
      `);
      
      if (channelUserIdIdx.length > 0) {
        console.log('✓ Index idx_channel_user_id already exists');
      } else {
        console.log('Adding idx_channel_user_id index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_channel_user_id (channel_user_id)
        `);
        console.log('✓ Successfully added idx_channel_user_id index');
      }
      
      // Composite index for channel + user lookups
      const [channelUserCompositeIdx] = await db.query(`
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND index_name = 'idx_channel_user_lookup'
      `);
      
      if (channelUserCompositeIdx.length > 0) {
        console.log('✓ Index idx_channel_user_lookup already exists');
      } else {
        console.log('Adding idx_channel_user_lookup composite index...');
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_sessions 
          ADD KEY idx_channel_user_lookup (agent_id, channel, channel_user_id)
        `);
        console.log('✓ Successfully added idx_channel_user_lookup index');
      }
      
      // =================================================================
      // 9. Verify the changes
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyColumns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_chat_sessions' 
          AND column_name IN ('channel', 'channel_user_id', 'channel_user_name', 'channel_metadata', 'context_data', 'llm_context_hints')
        ORDER BY ORDINAL_POSITION
      `);
      
      console.log('✓ Verification - columns after migration:');
      verifyColumns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
      });
      
      console.log('✓ Chat session channel migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back chat session channel migration...');
      
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
        console.log('⚠ Table yovo_tbl_aiva_chat_sessions does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Drop indexes
      // =================================================================
      const indexesToDrop = ['idx_channel', 'idx_channel_user_id', 'idx_channel_user_lookup'];
      
      for (const indexName of indexesToDrop) {
        console.log(`Dropping ${indexName} index...`);
        
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
        } else {
          console.log(`✓ Index ${indexName} does not exist`);
        }
      }
      
      // =================================================================
      // 3. Drop columns
      // =================================================================
      const columnsToDrop = ['llm_context_hints', 'context_data', 'channel_metadata', 'channel_user_name', 'channel_user_id', 'channel'];
      
      for (const columnName of columnsToDrop) {
        console.log(`Dropping ${columnName} column...`);
        
        const [col] = await db.query(`
          SELECT COLUMN_NAME
          FROM information_schema.COLUMNS 
          WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_chat_sessions' 
            AND column_name = '${columnName}'
        `);
        
        if (col.length > 0) {
          await db.query(`
            ALTER TABLE yovo_tbl_aiva_chat_sessions 
            DROP COLUMN ${columnName}
          `);
          console.log(`✓ Dropped ${columnName} column`);
        } else {
          console.log(`✓ Column ${columnName} does not exist`);
        }
      }
      
      console.log('✓ Chat session channel rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};