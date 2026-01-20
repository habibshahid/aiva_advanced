'use strict';
/**
 * Migration: Flow Engine v2
 * 
 * This migration adds:
 * 
 * NEW TABLES:
 * - yovo_tbl_aiva_flows: Configurable conversation flows
 * - yovo_tbl_aiva_message_buffer: Rapid-fire message collection
 * 
 * MODIFIED TABLES:
 * - yovo_tbl_aiva_agents: New structured instruction fields, conversation settings
 * - yovo_tbl_aiva_chat_sessions: Flow state tracking, soft close support
 * - yovo_tbl_aiva_tenants: Default model settings
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting Flow Engine v2 migration...');
            
            // =================================================================
            // 1. CREATE yovo_tbl_aiva_flows TABLE
            // =================================================================
            console.log('Checking yovo_tbl_aiva_flows table...');
            
            const [flowsTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_flows'
            `);
            
            if (flowsTable.length === 0) {
                console.log('Creating yovo_tbl_aiva_flows table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_flows (
                        id VARCHAR(36) PRIMARY KEY,
                        agent_id VARCHAR(36) NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        description TEXT NOT NULL COMMENT 'LLM uses this to match intent',
                        type ENUM('system', 'integration', 'custom') DEFAULT 'custom',
                        integration_type VARCHAR(50) DEFAULT NULL COMMENT 'shopify, woocommerce, etc',
                        config JSON NOT NULL COMMENT 'Full flow definition: steps, triggers, functions',
                        is_active TINYINT(1) DEFAULT 1,
                        is_deletable TINYINT(1) DEFAULT 1,
                        priority INT DEFAULT 0 COMMENT 'For ordering in UI',
                        version INT DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (agent_id) REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
                        INDEX idx_flows_agent (agent_id),
                        INDEX idx_flows_type (type),
                        INDEX idx_flows_active (is_active)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
                    COMMENT='Configurable conversation flows for agents'
                `);
                console.log('✓ Created yovo_tbl_aiva_flows table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_flows already exists, skipping');
            }
            
            // =================================================================
            // 2. CREATE yovo_tbl_aiva_message_buffer TABLE
            // =================================================================
            console.log('Checking yovo_tbl_aiva_message_buffer table...');
            
            const [bufferTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_message_buffer'
            `);
            
            if (bufferTable.length === 0) {
                console.log('Creating yovo_tbl_aiva_message_buffer table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_message_buffer (
                        id VARCHAR(36) PRIMARY KEY,
                        session_id VARCHAR(36) NOT NULL,
                        messages JSON NOT NULL COMMENT 'Array of {text, timestamp, type}',
                        images JSON NOT NULL COMMENT 'Array of {url, timestamp}',
                        audio_transcripts JSON NOT NULL COMMENT 'Array of {text, timestamp, duration}',
                        first_message_at TIMESTAMP NOT NULL,
                        last_message_at TIMESTAMP NOT NULL,
                        status ENUM('collecting', 'processing', 'done') DEFAULT 'collecting',
                        lock_expires_at TIMESTAMP NULL DEFAULT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (session_id) REFERENCES yovo_tbl_aiva_chat_sessions(id) ON DELETE CASCADE,
                        INDEX idx_buffer_session (session_id),
                        INDEX idx_buffer_status (status),
                        INDEX idx_buffer_lock (lock_expires_at)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
                    COMMENT='Collects rapid-fire messages before processing'
                `);
                console.log('✓ Created yovo_tbl_aiva_message_buffer table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_message_buffer already exists, skipping');
            }
            
            // =================================================================
            // 3. ADD COLUMNS TO yovo_tbl_aiva_agents
            // =================================================================
            console.log('Adding new columns to yovo_tbl_aiva_agents...');
            
            const agentColumns = [
                // Persona & Role
                {
                    name: 'persona_name',
                    definition: "VARCHAR(100) DEFAULT NULL COMMENT 'Display name shown to customers (e.g., Sara)'"
                },
                {
                    name: 'persona_description',
                    definition: "TEXT DEFAULT NULL COMMENT 'Role description - who the agent is'"
                },
                {
                    name: 'personality_preset',
                    definition: "VARCHAR(50) DEFAULT 'professional' COMMENT 'friendly, professional, formal, custom'"
                },
                
                // Language & Tone
                {
                    name: 'tone_instructions',
                    definition: "TEXT DEFAULT NULL COMMENT 'How to communicate - tone guidelines'"
                },
                {
                    name: 'language_mode',
                    definition: "ENUM('auto', 'fixed') DEFAULT 'auto' COMMENT 'Auto-match or fixed language'"
                },
                {
                    name: 'fixed_language',
                    definition: "VARCHAR(10) DEFAULT NULL COMMENT 'Language code if fixed mode'"
                },
                {
                    name: 'supported_languages',
                    definition: "JSON DEFAULT NULL COMMENT 'Array of supported language codes'"
                },
                {
                    name: 'emoji_usage',
                    definition: "ENUM('none', 'occasional', 'frequent') DEFAULT 'occasional'"
                },
                
                // Greetings & Endings
                {
                    name: 'greetings',
                    definition: "JSON DEFAULT NULL COMMENT 'Array of greeting message variations'"
                },
                {
                    name: 'endings',
                    definition: "JSON DEFAULT NULL COMMENT 'Array of ending message variations'"
                },
                
                // Boundaries
                {
                    name: 'boundary_instructions',
                    definition: "TEXT DEFAULT NULL COMMENT 'What the agent should NOT do'"
                },
                {
                    name: 'quick_policies',
                    definition: "TEXT DEFAULT NULL COMMENT 'Short policy facts without KB lookup'"
                },
                
                // Fallback
                {
                    name: 'fallback_behavior',
                    definition: "ENUM('kb_first', 'handoff', 'apologize') DEFAULT 'kb_first'"
                },
                {
                    name: 'fallback_message',
                    definition: "TEXT DEFAULT NULL COMMENT 'Message when agent cannot help'"
                },
                {
                    name: 'handoff_message',
                    definition: "TEXT DEFAULT NULL COMMENT 'Message when transferring to human'"
                },
                {
                    name: 'auto_handoff_frustrated',
                    definition: "TINYINT(1) DEFAULT 1 COMMENT 'Auto-transfer when customer frustrated'"
                },
                {
                    name: 'auto_handoff_explicit',
                    definition: "TINYINT(1) DEFAULT 1 COMMENT 'Auto-transfer when customer asks for human'"
                },
                {
                    name: 'handoff_refund_threshold',
                    definition: "INT DEFAULT NULL COMMENT 'Auto-handoff for refunds above this amount'"
                },
                
                // Conversation Settings
                {
                    name: 'message_buffer_seconds',
                    definition: "INT DEFAULT 3 COMMENT 'Wait time for rapid consecutive messages'"
                },
                {
                    name: 'session_timeout_minutes',
                    definition: "INT DEFAULT 30 COMMENT 'Close inactive sessions after this time'"
                },
                {
                    name: 'kb_search_behavior',
                    definition: "ENUM('auto', 'always', 'never') DEFAULT 'auto' COMMENT 'When to search knowledge base'"
                },
                
                // Model Override (temporary)
                {
                    name: 'model_override_enabled',
                    definition: "TINYINT(1) DEFAULT 0 COMMENT 'Override tenant model selection'"
                },
                
                // Flow Engine Flag
                {
                    name: 'use_flow_engine',
                    definition: "TINYINT(1) DEFAULT 0 COMMENT 'Use FlowEngine v2 instead of ChatService'"
                }
            ];
            
            for (const col of agentColumns) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_agents' 
                      AND column_name = '${col.name}'
                `);
                
                if (existing.length === 0) {
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_agents 
                        ADD COLUMN ${col.name} ${col.definition}
                    `);
                    console.log(`✓ Added ${col.name} column to agents`);
                } else {
                    console.log(`✓ Column ${col.name} already exists, skipping`);
                }
            }
            
            // =================================================================
            // 4. ADD COLUMNS TO yovo_tbl_aiva_chat_sessions
            // =================================================================
            console.log('Adding new columns to yovo_tbl_aiva_chat_sessions...');
            
            const sessionColumns = [
                {
                    name: 'session_status',
                    definition: "ENUM('active', 'soft_closed', 'closed') DEFAULT 'active' COMMENT 'Session lifecycle state'"
                },
                {
                    name: 'soft_closed_at',
                    definition: "TIMESTAMP NULL DEFAULT NULL COMMENT 'When session was soft-closed'"
                },
                {
                    name: 'active_flow',
                    definition: "JSON DEFAULT NULL COMMENT 'Current flow state: flow_id, step, params'"
                },
                {
                    name: 'paused_flows',
                    definition: "JSON DEFAULT NULL COMMENT 'Stack of paused flows'"
                },
                {
                    name: 'context_memory',
                    definition: "JSON DEFAULT NULL COMMENT 'Extracted facts: orders, phone, sentiment'"
                },
                {
                    name: 'last_activity_at',
                    definition: "TIMESTAMP NULL DEFAULT NULL COMMENT 'Last message timestamp for timeout'"
                }
            ];
            
            for (const col of sessionColumns) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                      AND column_name = '${col.name}'
                `);
                
                if (existing.length === 0) {
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_chat_sessions 
                        ADD COLUMN ${col.name} ${col.definition}
                    `);
                    console.log(`✓ Added ${col.name} column to sessions`);
                } else {
                    console.log(`✓ Column ${col.name} already exists, skipping`);
                }
            }
            
            // Add index for session timeout queries
            const [timeoutIndex] = await db.query(`
                SELECT INDEX_NAME
                FROM information_schema.STATISTICS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                  AND index_name = 'idx_session_timeout'
            `);
            
            if (timeoutIndex.length === 0) {
                await db.query(`
                    CREATE INDEX idx_session_timeout 
                    ON yovo_tbl_aiva_chat_sessions (session_status, last_activity_at)
                `);
                console.log('✓ Added session timeout index');
            }
            
            // =================================================================
            // 5. ADD COLUMNS TO yovo_tbl_aiva_tenants
            // =================================================================
            console.log('Adding new columns to yovo_tbl_aiva_tenants...');
            
            const tenantColumns = [
                {
                    name: 'default_chat_model',
                    definition: "VARCHAR(100) DEFAULT 'gpt-4o-mini' COMMENT 'Default model for all agents'"
                },
                {
                    name: 'allow_agent_model_override',
                    definition: "TINYINT(1) DEFAULT 1 COMMENT 'Allow agents to override tenant model'"
                },
                {
                    name: 'monthly_budget_limit',
                    definition: "DECIMAL(10,2) DEFAULT NULL COMMENT 'Optional monthly cost limit'"
                },
                {
                    name: 'budget_alert_threshold',
                    definition: "INT DEFAULT 80 COMMENT 'Alert when usage reaches this percentage'"
                },
                {
                    name: 'use_flow_engine',
                    definition: "TINYINT(1) DEFAULT 0 COMMENT 'Enable FlowEngine v2 for all agents'"
                }
            ];
            
            for (const col of tenantColumns) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_tenants' 
                      AND column_name = '${col.name}'
                `);
                
                if (existing.length === 0) {
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_tenants 
                        ADD COLUMN ${col.name} ${col.definition}
                    `);
                    console.log(`✓ Added ${col.name} column to tenants`);
                } else {
                    console.log(`✓ Column ${col.name} already exists, skipping`);
                }
            }
            
            // =================================================================
            // 6. SET DEFAULT VALUES FOR EXISTING AGENTS
            // =================================================================
            console.log('Setting default values for existing agents...');
            
            await db.query(`
                UPDATE yovo_tbl_aiva_agents 
                SET 
                    message_buffer_seconds = COALESCE(message_buffer_seconds, 3),
                    session_timeout_minutes = COALESCE(session_timeout_minutes, 30),
                    kb_search_behavior = COALESCE(kb_search_behavior, 'auto'),
                    fallback_behavior = COALESCE(fallback_behavior, 'kb_first'),
                    language_mode = COALESCE(language_mode, 'auto'),
                    emoji_usage = COALESCE(emoji_usage, 'occasional'),
                    personality_preset = COALESCE(personality_preset, 'professional'),
                    auto_handoff_frustrated = COALESCE(auto_handoff_frustrated, 1),
                    auto_handoff_explicit = COALESCE(auto_handoff_explicit, 1)
                WHERE message_buffer_seconds IS NULL
                   OR session_timeout_minutes IS NULL
            `);
            
            console.log('✓ Updated existing agents with default values');
            
            // =================================================================
            // 7. UPDATE EXISTING SESSIONS WITH NEW STATUS
            // =================================================================
            /*console.log('Updating existing sessions...');
            
            await db.query(`
                UPDATE yovo_tbl_aiva_chat_sessions 
                SET 
                    session_status = CASE 
                        WHEN status = 'closed' THEN 'closed'
                        WHEN status = 'active' THEN 'active'
                        ELSE 'active'
                    END,
                    last_activity_at = COALESCE(last_activity_at, updated_at, created_at)
                WHERE session_status IS NULL
            `);
            
            console.log('✓ Updated existing sessions');*/
            
            // =================================================================
            // 8. VERIFY MIGRATION
            // =================================================================
            console.log('Verifying migration...');
            
            // Verify flows table
            const [flowsCols] = await db.query(`
                SELECT COUNT(*) as count
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_flows'
            `);
            console.log(`✓ yovo_tbl_aiva_flows has ${flowsCols[0].count} columns`);
            
            // Verify buffer table
            const [bufferCols] = await db.query(`
                SELECT COUNT(*) as count
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_message_buffer'
            `);
            console.log(`✓ yovo_tbl_aiva_message_buffer has ${bufferCols[0].count} columns`);
            
            // Verify new agent columns
            const [agentNewCols] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name IN ('persona_name', 'message_buffer_seconds', 'session_timeout_minutes', 'greetings', 'endings')
            `);
            console.log(`✓ yovo_tbl_aiva_agents has ${agentNewCols.length} new columns verified`);
            
            console.log('✓ Flow Engine v2 migration completed successfully!');
            
        } catch (error) {
            if (error.message.includes('Duplicate')) {
                console.log('⚠ Some items already exist, continuing...');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back Flow Engine v2 migration...');
            
            // =================================================================
            // 1. DROP yovo_tbl_aiva_message_buffer TABLE
            // =================================================================
            console.log('Dropping yovo_tbl_aiva_message_buffer table...');
            await db.query(`DROP TABLE IF EXISTS yovo_tbl_aiva_message_buffer`);
            console.log('✓ Dropped yovo_tbl_aiva_message_buffer table');
            
            // =================================================================
            // 2. DROP yovo_tbl_aiva_flows TABLE
            // =================================================================
            console.log('Dropping yovo_tbl_aiva_flows table...');
            await db.query(`DROP TABLE IF EXISTS yovo_tbl_aiva_flows`);
            console.log('✓ Dropped yovo_tbl_aiva_flows table');
            
            // =================================================================
            // 3. DROP COLUMNS FROM yovo_tbl_aiva_agents
            // =================================================================
            console.log('Dropping columns from yovo_tbl_aiva_agents...');
            
            const agentColumnsToDrop = [
                'persona_name', 'persona_description', 'personality_preset',
                'tone_instructions', 'language_mode', 'fixed_language',
                'supported_languages', 'emoji_usage', 'greetings', 'endings',
                'boundary_instructions', 'quick_policies', 'fallback_behavior',
                'fallback_message', 'handoff_message', 'auto_handoff_frustrated',
                'auto_handoff_explicit', 'handoff_refund_threshold',
                'message_buffer_seconds', 'session_timeout_minutes',
                'kb_search_behavior', 'model_override_enabled', 'use_flow_engine'
            ];
            
            for (const colName of agentColumnsToDrop) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_agents' 
                      AND column_name = '${colName}'
                `);
                
                if (existing.length > 0) {
                    await db.query(`ALTER TABLE yovo_tbl_aiva_agents DROP COLUMN ${colName}`);
                    console.log(`✓ Dropped ${colName} from agents`);
                }
            }
            
            // =================================================================
            // 4. DROP COLUMNS FROM yovo_tbl_aiva_chat_sessions
            // =================================================================
            console.log('Dropping columns from yovo_tbl_aiva_chat_sessions...');
            
            const sessionColumnsToDrop = [
                'session_status', 'soft_closed_at', 'active_flow',
                'paused_flows', 'context_memory', 'last_activity_at'
            ];
            
            // Drop index first
            const [timeoutIndex] = await db.query(`
                SELECT INDEX_NAME
                FROM information_schema.STATISTICS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                  AND index_name = 'idx_session_timeout'
            `);
            
            if (timeoutIndex.length > 0) {
                await db.query(`DROP INDEX idx_session_timeout ON yovo_tbl_aiva_chat_sessions`);
                console.log('✓ Dropped session timeout index');
            }
            
            for (const colName of sessionColumnsToDrop) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                      AND column_name = '${colName}'
                `);
                
                if (existing.length > 0) {
                    await db.query(`ALTER TABLE yovo_tbl_aiva_chat_sessions DROP COLUMN ${colName}`);
                    console.log(`✓ Dropped ${colName} from sessions`);
                }
            }
            
            // =================================================================
            // 5. DROP COLUMNS FROM yovo_tbl_aiva_tenants
            // =================================================================
            console.log('Dropping columns from yovo_tbl_aiva_tenants...');
            
            const tenantColumnsToDrop = [
                'default_chat_model', 'allow_agent_model_override',
                'monthly_budget_limit', 'budget_alert_threshold', 'use_flow_engine'
            ];
            
            for (const colName of tenantColumnsToDrop) {
                const [existing] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_tenants' 
                      AND column_name = '${colName}'
                `);
                
                if (existing.length > 0) {
                    await db.query(`ALTER TABLE yovo_tbl_aiva_tenants DROP COLUMN ${colName}`);
                    console.log(`✓ Dropped ${colName} from tenants`);
                }
            }
            
            console.log('✓ Rollback completed successfully!');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};
