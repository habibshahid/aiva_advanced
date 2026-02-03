'use strict';
/**
 * Migration: Add Pipecat Provider Support
 * 
 * This migration adds columns and tables for Pipecat voice pipeline integration.
 * Pipecat allows mixing different STT, LLM, and TTS providers in a single pipeline.
 * 
 * Column additions to yovo_tbl_aiva_agents:
 * - pipecat_stt: STT provider (deepgram, soniox, whisper, azure, assembly)
 * - pipecat_stt_model: STT model identifier
 * - pipecat_llm: LLM provider (openai, anthropic, groq, together)
 * - pipecat_llm_model: LLM model identifier
 * - pipecat_tts: TTS provider (cartesia, elevenlabs, deepgram, openai, playht)
 * - pipecat_voice: Voice identifier for selected TTS
 * - pipecat_tts_speed: TTS playback speed (0.5 - 2.0)
 * 
 * Tables:
 * - yovo_tbl_aiva_pipecat_cost_rates: Cost rates for different providers
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting Pipecat provider support migration...');
            
            // =================================================================
            // 1. Check if agents table exists
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
            // 2. Add pipecat_stt column
            // =================================================================
            console.log('Checking pipecat_stt column...');
            
            const [sttCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_stt'
            `);
            
            if (sttCol.length === 0) {
                console.log('Adding pipecat_stt column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_stt VARCHAR(50) NULL
                    COMMENT 'Pipecat STT provider (deepgram, soniox, whisper, azure, assembly)'
                `);
                console.log('✓ Added pipecat_stt column');
            } else {
                console.log('✓ Column pipecat_stt already exists, skipping');
            }
            
            // =================================================================
            // 3. Add pipecat_stt_model column
            // =================================================================
            console.log('Checking pipecat_stt_model column...');
            
            const [sttModelCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_stt_model'
            `);
            
            if (sttModelCol.length === 0) {
                console.log('Adding pipecat_stt_model column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_stt_model VARCHAR(100) NULL
                    COMMENT 'Pipecat STT model identifier'
                `);
                console.log('✓ Added pipecat_stt_model column');
            } else {
                console.log('✓ Column pipecat_stt_model already exists, skipping');
            }
            
            // =================================================================
            // 4. Add pipecat_llm column
            // =================================================================
            console.log('Checking pipecat_llm column...');
            
            const [llmCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_llm'
            `);
            
            if (llmCol.length === 0) {
                console.log('Adding pipecat_llm column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_llm VARCHAR(50) NULL
                    COMMENT 'Pipecat LLM provider (openai, anthropic, groq, together)'
                `);
                console.log('✓ Added pipecat_llm column');
            } else {
                console.log('✓ Column pipecat_llm already exists, skipping');
            }
            
            // =================================================================
            // 5. Add pipecat_llm_model column
            // =================================================================
            console.log('Checking pipecat_llm_model column...');
            
            const [llmModelCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_llm_model'
            `);
            
            if (llmModelCol.length === 0) {
                console.log('Adding pipecat_llm_model column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_llm_model VARCHAR(100) NULL
                    COMMENT 'Pipecat LLM model identifier'
                `);
                console.log('✓ Added pipecat_llm_model column');
            } else {
                console.log('✓ Column pipecat_llm_model already exists, skipping');
            }
            
            // =================================================================
            // 6. Add pipecat_tts column
            // =================================================================
            console.log('Checking pipecat_tts column...');
            
            const [ttsCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_tts'
            `);
            
            if (ttsCol.length === 0) {
                console.log('Adding pipecat_tts column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_tts VARCHAR(50) NULL
                    COMMENT 'Pipecat TTS provider (cartesia, elevenlabs, deepgram, openai, playht)'
                `);
                console.log('✓ Added pipecat_tts column');
            } else {
                console.log('✓ Column pipecat_tts already exists, skipping');
            }
            
            // =================================================================
            // 7. Add pipecat_voice column
            // =================================================================
            console.log('Checking pipecat_voice column...');
            
            const [voiceCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_voice'
            `);
            
            if (voiceCol.length === 0) {
                console.log('Adding pipecat_voice column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_voice VARCHAR(255) NULL
                    COMMENT 'Pipecat TTS voice identifier'
                `);
                console.log('✓ Added pipecat_voice column');
            } else {
                console.log('✓ Column pipecat_voice already exists, skipping');
            }
            
            // =================================================================
            // 8. Add pipecat_tts_speed column
            // =================================================================
            console.log('Checking pipecat_tts_speed column...');
            
            const [speedCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'pipecat_tts_speed'
            `);
            
            if (speedCol.length === 0) {
                console.log('Adding pipecat_tts_speed column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN pipecat_tts_speed DECIMAL(3,2) DEFAULT 1.00
                    COMMENT 'Pipecat TTS playback speed (0.5 - 2.0)'
                `);
                console.log('✓ Added pipecat_tts_speed column');
            } else {
                console.log('✓ Column pipecat_tts_speed already exists, skipping');
            }
			
			// =================================================================
			// 8.5. Update provider ENUM to include 'pipecat'
			// =================================================================
			console.log('Checking provider column ENUM...');

			const [providerCol] = await db.query(`
				SELECT COLUMN_TYPE
				FROM information_schema.COLUMNS 
				WHERE table_schema = DATABASE() 
				  AND table_name = 'yovo_tbl_aiva_agents' 
				  AND column_name = 'provider'
			`);

			if (providerCol.length > 0) {
				const columnType = providerCol[0].COLUMN_TYPE;
				
				if (!columnType.includes('pipecat')) {
					console.log('Adding pipecat to provider ENUM...');
					
					// Extract current enum values and add pipecat
					// Current: enum('openai','deepgram','custom','intent-ivr')
					// New: enum('openai','deepgram','custom','intent-ivr','pipecat')
					await db.query(`
						ALTER TABLE yovo_tbl_aiva_agents 
						MODIFY COLUMN provider ENUM('openai', 'deepgram', 'custom', 'intent-ivr', 'pipecat') DEFAULT 'openai'
					`);
					console.log('✓ Updated provider ENUM to include pipecat');
				} else {
					console.log('✓ Provider ENUM already includes pipecat, skipping');
				}
			}
            
            // =================================================================
            // 9. Create pipecat cost rates table
            // =================================================================
            console.log('Checking yovo_tbl_aiva_pipecat_cost_rates table...');
            
            const [costTables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_pipecat_cost_rates'
            `);
            
            if (costTables.length === 0) {
                console.log('Creating yovo_tbl_aiva_pipecat_cost_rates table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_pipecat_cost_rates (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        service_type ENUM('stt', 'llm', 'tts') NOT NULL,
                        provider VARCHAR(50) NOT NULL,
                        model VARCHAR(100) NULL,
                        cost_per_minute DECIMAL(10,6) NULL COMMENT 'Cost per minute for STT/TTS',
                        cost_per_1k_chars DECIMAL(10,6) NULL COMMENT 'Cost per 1000 characters for TTS',
                        cost_per_1m_input_tokens DECIMAL(10,4) NULL COMMENT 'Cost per 1M input tokens for LLM',
                        cost_per_1m_output_tokens DECIMAL(10,4) NULL COMMENT 'Cost per 1M output tokens for LLM',
                        is_active TINYINT(1) DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY uk_service_provider_model (service_type, provider, model),
                        INDEX idx_service_type (service_type),
                        INDEX idx_provider (provider),
                        INDEX idx_active (is_active)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log('✓ Created yovo_tbl_aiva_pipecat_cost_rates table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_pipecat_cost_rates already exists, skipping');
            }
            
            // =================================================================
            // 10. Insert default cost rates
            // =================================================================
            console.log('Checking cost rates data...');
            
            const [existingRates] = await db.query(`
                SELECT COUNT(*) as count FROM yovo_tbl_aiva_pipecat_cost_rates
            `);
            
            if (existingRates[0].count === 0) {
                console.log('Inserting default cost rates...');
                await db.query(`
                    INSERT INTO yovo_tbl_aiva_pipecat_cost_rates 
                    (service_type, provider, model, cost_per_minute, cost_per_1k_chars, cost_per_1m_input_tokens, cost_per_1m_output_tokens) 
                    VALUES 
                    ('stt', 'deepgram', 'nova-2', 0.0043, NULL, NULL, NULL),
                    ('stt', 'deepgram', 'nova-3', 0.0059, NULL, NULL, NULL),
                    ('stt', 'soniox', 'precision_ivr', 0.0035, NULL, NULL, NULL),
                    ('stt', 'soniox', 'low_latency', 0.0040, NULL, NULL, NULL),
                    ('stt', 'whisper', 'whisper-1', 0.0060, NULL, NULL, NULL),
                    ('stt', 'azure', 'default', 0.0060, NULL, NULL, NULL),
                    ('stt', 'assembly', 'default', 0.0060, NULL, NULL, NULL),
                    ('llm', 'openai', 'gpt-4o-mini', NULL, NULL, 0.15, 0.60),
                    ('llm', 'openai', 'gpt-4o', NULL, NULL, 2.50, 10.00),
                    ('llm', 'anthropic', 'claude-3-5-sonnet-20241022', NULL, NULL, 3.00, 15.00),
                    ('llm', 'anthropic', 'claude-3-haiku-20240307', NULL, NULL, 0.25, 1.25),
                    ('llm', 'groq', 'llama-3.3-70b-versatile', NULL, NULL, 0.59, 0.79),
                    ('llm', 'groq', 'llama-3.1-8b-instant', NULL, NULL, 0.05, 0.08),
                    ('llm', 'together', 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', NULL, NULL, 0.88, 0.88),
                    ('tts', 'cartesia', 'sonic-english', 0.0420, NULL, NULL, NULL),
                    ('tts', 'elevenlabs', 'eleven_turbo_v2', NULL, 0.30, NULL, NULL),
                    ('tts', 'deepgram', 'aura', 0.0150, NULL, NULL, NULL),
                    ('tts', 'openai', 'tts-1', NULL, 0.015, NULL, NULL),
                    ('tts', 'openai', 'tts-1-hd', NULL, 0.030, NULL, NULL),
                    ('tts', 'playht', 'PlayHT2.0', 0.0500, NULL, NULL, NULL)
                `);
                console.log('✓ Inserted default cost rates');
            } else {
                console.log(`✓ Cost rates already exist (${existingRates[0].count} records), skipping`);
            }
            
            // =================================================================
            // 11. Verify migration
            // =================================================================
            console.log('Verifying migration...');
            
            const [columns] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name IN ('pipecat_stt', 'pipecat_stt_model', 'pipecat_llm', 'pipecat_llm_model', 'pipecat_tts', 'pipecat_voice', 'pipecat_tts_speed')
            `);
            
            columns.forEach(col => {
                console.log(`✓ Verified: ${col.COLUMN_NAME} (${col.COLUMN_TYPE})`);
            });
            
            const [verifyTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_pipecat_cost_rates'
            `);
            
            console.log(`✓ yovo_tbl_aiva_pipecat_cost_rates table: ${verifyTable.length > 0 ? 'exists' : 'missing'}`);
            
            console.log('✓ Migration completed successfully!');
            
        } catch (error) {
            if (error.message.includes('Duplicate')) {
                console.log('⚠ Objects already exist, skipping');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back Pipecat provider support migration...');
            
            // Check if agents table exists
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
            
            // Drop columns
            const columnsToDrop = [
                'pipecat_stt', 'pipecat_stt_model', 'pipecat_llm', 
                'pipecat_llm_model', 'pipecat_tts', 'pipecat_voice', 'pipecat_tts_speed'
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
            
            // Drop cost rates table
            const [costTables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_pipecat_cost_rates'
            `);
            
            if (costTables.length > 0) {
                await db.query(`DROP TABLE yovo_tbl_aiva_pipecat_cost_rates`);
                console.log('✓ Dropped yovo_tbl_aiva_pipecat_cost_rates table');
            } else {
                console.log('⚠ Table yovo_tbl_aiva_pipecat_cost_rates does not exist, skipping');
            }
            
            console.log('✓ Rollback completed successfully!');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};