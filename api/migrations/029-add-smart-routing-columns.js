'use strict';
/**
 * Migration: Add Smart Routing Columns to Agents
 * 
 * This migration adds:
 * - model_simple: Model for simple intents (greetings, acknowledgments)
 * - model_medium: Model for medium complexity (order status, KB queries)
 * - model_complex: Model for complex intents (complaints, multi-step flows)
 * - smart_routing_enabled: Toggle to enable/disable smart model routing
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting smart routing columns migration...');
            
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
            // 2. Add model_simple column
            // =================================================================
            console.log('Checking model_simple column...');
            
            const [modelSimpleCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'model_simple'
            `);
            
            if (modelSimpleCol.length === 0) {
                console.log('Adding model_simple column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN model_simple VARCHAR(100) DEFAULT NULL
                    COMMENT 'Model for simple intents (greetings, yes/no, acknowledgments)'
                `);
                console.log('✓ Added model_simple column');
            } else {
                console.log('✓ Column model_simple already exists, skipping');
            }
            
            // =================================================================
            // 3. Add model_medium column
            // =================================================================
            console.log('Checking model_medium column...');
            
            const [modelMediumCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'model_medium'
            `);
            
            if (modelMediumCol.length === 0) {
                console.log('Adding model_medium column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN model_medium VARCHAR(100) DEFAULT NULL
                    COMMENT 'Model for medium complexity (order status, product search, KB queries)'
                `);
                console.log('✓ Added model_medium column');
            } else {
                console.log('✓ Column model_medium already exists, skipping');
            }
            
            // =================================================================
            // 4. Add model_complex column
            // =================================================================
            console.log('Checking model_complex column...');
            
            const [modelComplexCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'model_complex'
            `);
            
            if (modelComplexCol.length === 0) {
                console.log('Adding model_complex column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN model_complex VARCHAR(100) DEFAULT NULL
                    COMMENT 'Model for complex intents (complaints, multi-step reasoning)'
                `);
                console.log('✓ Added model_complex column');
            } else {
                console.log('✓ Column model_complex already exists, skipping');
            }
            
            // =================================================================
            // 5. Add smart_routing_enabled column
            // =================================================================
            console.log('Checking smart_routing_enabled column...');
            
            const [smartRoutingCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'smart_routing_enabled'
            `);
            
            if (smartRoutingCol.length === 0) {
                console.log('Adding smart_routing_enabled column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN smart_routing_enabled TINYINT(1) DEFAULT 0
                    COMMENT 'Enable smart model routing based on message complexity'
                `);
                console.log('✓ Added smart_routing_enabled column');
            } else {
                console.log('✓ Column smart_routing_enabled already exists, skipping');
            }
            
            // =================================================================
            // 6. Set default values for all agents
            // =================================================================
            console.log('Setting default values for existing agents...');
            
            await db.query(`
                UPDATE yovo_tbl_aiva_agents 
                SET 
                    model_simple = 'gpt-4o-mini',
                    model_medium = 'gpt-4o-mini',
                    model_complex = 'gpt-4o',
                    smart_routing_enabled = 1
                WHERE model_simple IS NULL 
                   OR model_medium IS NULL 
                   OR model_complex IS NULL
            `);
            
            console.log('✓ Updated agents with default values');
            
            // =================================================================
            // 7. Verify
            // =================================================================
            console.log('Verifying migration...');
            
            const [columns] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name IN ('model_simple', 'model_medium', 'model_complex', 'smart_routing_enabled')
            `);
            
            if (columns.length === 4) {
                columns.forEach(col => {
                    console.log(`✓ Verified: ${col.COLUMN_NAME} (${col.COLUMN_TYPE})`);
                });
                console.log('✓ Migration completed successfully!');
            } else {
                throw new Error(`Expected 4 columns, found ${columns.length}`);
            }
            
        } catch (error) {
            if (error.message.includes('Duplicate')) {
                console.log('⚠ Columns already exist, skipping');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back smart routing columns migration...');
            
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
            
            // Drop columns
            const columnsToDrop = ['smart_routing_enabled', 'model_complex', 'model_medium', 'model_simple'];
            
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