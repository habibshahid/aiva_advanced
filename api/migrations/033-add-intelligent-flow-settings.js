'use strict';
/**
 * Migration: Add Intelligent Flow Settings to Agents
 * 
 * This migration adds:
 * - flow_mode: Controls how flows are executed (guided, intelligent, adaptive)
 * - image_flow_actions: JSON config for image → flow mappings
 * 
 * Flow modes:
 * - guided: Strictly follow flow steps, no deviation
 * - intelligent: AI can skip steps, extract data proactively, handle edge cases
 * - adaptive: Mix of guided and intelligent based on context
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting intelligent flow settings migration...');
            
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
            // 2. Add flow_mode column
            // =================================================================
            console.log('Checking flow_mode column...');
            
            const [flowModeCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'flow_mode'
            `);
            
            if (flowModeCol.length === 0) {
                console.log('Adding flow_mode column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN flow_mode ENUM('guided', 'intelligent', 'adaptive') DEFAULT 'intelligent'
                    COMMENT 'Flow execution mode: guided (strict), intelligent (AI-driven), adaptive (mixed)'
                `);
                console.log('✓ Added flow_mode column');
            } else {
                console.log('✓ Column flow_mode already exists, skipping');
            }
            
            // =================================================================
            // 3. Add image_flow_actions column
            // =================================================================
            console.log('Checking image_flow_actions column...');
            
            const [imageFlowCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name = 'image_flow_actions'
            `);
            
            if (imageFlowCol.length === 0) {
                console.log('Adding image_flow_actions column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_agents 
                    ADD COLUMN image_flow_actions JSON DEFAULT NULL
                    COMMENT 'JSON config for image intent → flow mappings'
                `);
                console.log('✓ Added image_flow_actions column');
            } else {
                console.log('✓ Column image_flow_actions already exists, skipping');
            }
            
            // =================================================================
            // 4. Set default values for existing agents
            // =================================================================
            console.log('Setting default values for existing agents...');
            
            await db.query(`
                UPDATE yovo_tbl_aiva_agents 
                SET flow_mode = 'intelligent'
                WHERE flow_mode IS NULL
            `);
            
            console.log('✓ Updated agents with default flow_mode');
            
            // =================================================================
            // 5. Verify
            // =================================================================
            console.log('Verifying migration...');
            
            const [columns] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_agents' 
                  AND column_name IN ('flow_mode', 'image_flow_actions')
            `);
            
            if (columns.length === 2) {
                columns.forEach(col => {
                    console.log(`✓ Verified: ${col.COLUMN_NAME} (${col.COLUMN_TYPE})`);
                });
                console.log('✓ Migration completed successfully!');
            } else {
                throw new Error(`Expected 2 columns, found ${columns.length}`);
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
            console.log('Rolling back intelligent flow settings migration...');
            
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
            const columnsToDrop = ['image_flow_actions', 'flow_mode'];
            
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