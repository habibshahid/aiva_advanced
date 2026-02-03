'use strict';
/**
 * Migration: Add TTS Configuration and Streaming LLM Options
 * 
 * This migration adds columns for advanced TTS configuration and LLM streaming:
 * 
 * TTS Configuration:
 * - tts_number_format: How to format numbers in TTS ('words-english', 'words-urdu', 'digits')
 * - tts_script: Script preference ('urdu', 'roman-urdu', 'auto')
 * - tts_currency_format: How to format currency ('words-english', 'words-urdu', 'short')
 * 
 * LLM Streaming:
 * - streaming_llm: Enable streaming LLM for faster response (sentence-by-sentence TTS)
 * 
 * Barge-in Configuration:
 * - interim_barge_in_threshold: Minimum interim words to trigger barge-in (default: 2)
 * - barge_in_threshold: Minimum final words to trigger barge-in (default: 4)
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting TTS configuration and streaming LLM migration...');
            
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
            // 2. Add streaming_llm column
            // =================================================================
            console.log('Checking streaming_llm column...');
            
            const [streamingLlmCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'streaming_llm'
            `);
            
            if (streamingLlmCol.length === 0) {
                console.log('Adding streaming_llm column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN streaming_llm TINYINT(1) DEFAULT 1
                    COMMENT 'Enable streaming LLM for faster sentence-by-sentence TTS response'
                `);
                console.log('✓ Added streaming_llm column');
            } else {
                console.log('✓ Column streaming_llm already exists, skipping');
            }
            
            // =================================================================
            // 3. Add tts_number_format column
            // =================================================================
            console.log('Checking tts_number_format column...');
            
            const [ttsNumberFormatCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'tts_number_format'
            `);
            
            if (ttsNumberFormatCol.length === 0) {
                console.log('Adding tts_number_format column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN tts_number_format ENUM('words-english', 'words-urdu', 'digits') DEFAULT 'words-english'
                    COMMENT 'How to format numbers in TTS output (e.g., 123 → "one two three" or "ایک دو تین" or "123")'
                `);
                console.log('✓ Added tts_number_format column');
            } else {
                console.log('✓ Column tts_number_format already exists, skipping');
            }
            
            // =================================================================
            // 4. Add tts_script column
            // =================================================================
            console.log('Checking tts_script column...');
            
            const [ttsScriptCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'tts_script'
            `);
            
            if (ttsScriptCol.length === 0) {
                console.log('Adding tts_script column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN tts_script ENUM('urdu', 'roman-urdu', 'auto') DEFAULT 'auto'
                    COMMENT 'Script preference for TTS output (Urdu script, Roman Urdu, or auto-detect)'
                `);
                console.log('✓ Added tts_script column');
            } else {
                console.log('✓ Column tts_script already exists, skipping');
            }
            
            // =================================================================
            // 5. Add tts_currency_format column
            // =================================================================
            console.log('Checking tts_currency_format column...');
            
            const [ttsCurrencyFormatCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'tts_currency_format'
            `);
            
            if (ttsCurrencyFormatCol.length === 0) {
                console.log('Adding tts_currency_format column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN tts_currency_format ENUM('words-english', 'words-urdu', 'short') DEFAULT 'words-english'
                    COMMENT 'How to format currency in TTS (e.g., Rs.500 → "five hundred rupees" or "پانچ سو روپے" or "500 rupees")'
                `);
                console.log('✓ Added tts_currency_format column');
            } else {
                console.log('✓ Column tts_currency_format already exists, skipping');
            }
            
            // =================================================================
            // 6. Add interim_barge_in_threshold column
            // =================================================================
            console.log('Checking interim_barge_in_threshold column...');
            
            const [interimBargeInCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'interim_barge_in_threshold'
            `);
            
            if (interimBargeInCol.length === 0) {
                console.log('Adding interim_barge_in_threshold column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN interim_barge_in_threshold TINYINT UNSIGNED DEFAULT 2
                    COMMENT 'Minimum interim (non-final) words to trigger immediate TTS stop (faster barge-in)'
                `);
                console.log('✓ Added interim_barge_in_threshold column');
            } else {
                console.log('✓ Column interim_barge_in_threshold already exists, skipping');
            }
            
            // =================================================================
            // 7. Add barge_in_threshold column
            // =================================================================
            console.log('Checking barge_in_threshold column...');
            
            const [bargeInCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'barge_in_threshold'
            `);
            
            if (bargeInCol.length === 0) {
                console.log('Adding barge_in_threshold column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN barge_in_threshold TINYINT UNSIGNED DEFAULT 4
                    COMMENT 'Minimum final words to trigger barge-in and process user speech'
                `);
                console.log('✓ Added barge_in_threshold column');
            } else {
                console.log('✓ Column barge_in_threshold already exists, skipping');
            }
            
            // =================================================================
            // 8. Verify the changes
            // =================================================================
            console.log('Verifying migration...');
            
            const [columns] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name IN (
                      'streaming_llm', 
                      'tts_number_format', 
                      'tts_script', 
                      'tts_currency_format',
                      'interim_barge_in_threshold',
                      'barge_in_threshold'
                  )
                ORDER BY ORDINAL_POSITION
            `);
            
            if (columns.length === 6) {
                console.log('✓ Verification - all 6 columns exist:');
                columns.forEach(col => {
                    console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE} (default: ${col.COLUMN_DEFAULT})`);
                });
            } else {
                console.log(`⚠ Expected 6 columns, found ${columns.length}`);
                columns.forEach(col => {
                    console.log(`  - ${col.COLUMN_NAME}: ${col.COLUMN_TYPE}`);
                });
            }
            
            console.log('✓ TTS configuration and streaming LLM migration completed successfully!');
            
        } catch (error) {
            if (error.message.includes('Duplicate')) {
                console.log('⚠ Some columns already exist, continuing...');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back TTS configuration and streaming LLM migration...');
            
            // Check if table exists
            const [tables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents'
            `);
            
            if (tables.length === 0) {
                console.log('⚠ Table does not exist, skipping rollback');
                return;
            }
            
            // Drop columns in reverse order
            const columnsToDrop = [
                'barge_in_threshold',
                'interim_barge_in_threshold',
                'tts_currency_format',
                'tts_script',
                'tts_number_format',
                'streaming_llm'
            ];
            
            for (const columnName of columnsToDrop) {
                const [existingCol] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_agents' 
                      AND column_name = '${columnName}'
                `);
                
                if (existingCol.length > 0) {
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_agents 
                        DROP COLUMN ${columnName}
                    `);
                    console.log(`✓ Removed ${columnName} column`);
                } else {
                    console.log(`⚠ Column ${columnName} does not exist, skipping`);
                }
            }
            
            console.log('✓ Rollback completed successfully!');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};