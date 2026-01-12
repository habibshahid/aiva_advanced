'use strict';
/**
 * Migration: Add missing columns to IVR Segments table
 * 
 * This migration adds:
 * - is_active: Soft delete flag (default 1)
 * - is_global: Whether segment is shared across agents in tenant
 * - description: Optional description for the segment
 * - usage_count: Track how many times segment has been used
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting IVR segments columns migration...');
            
            // =================================================================
            // 1. Check if table exists
            // =================================================================
            console.log('Checking if yovo_tbl_aiva_ivr_segments table exists...');
            
            const [tables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments'
            `);
            
            if (tables.length === 0) {
                console.log('⚠ Table yovo_tbl_aiva_ivr_segments does not exist, skipping migration');
                return;
            }
            
            console.log('✓ Table yovo_tbl_aiva_ivr_segments exists');
            
            // =================================================================
            // 2. Add is_active column if not exists
            // =================================================================
            console.log('Checking is_active column...');
            
            const [isActiveCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                  AND column_name = 'is_active'
            `);
            
            if (isActiveCol.length === 0) {
                console.log('Adding is_active column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_ivr_segments 
                    ADD COLUMN is_active TINYINT(1) DEFAULT 1
                    COMMENT 'Soft delete flag - 1 for active, 0 for deleted'
                `);
                console.log('✓ Added is_active column');
            } else {
                console.log('✓ Column is_active already exists, skipping');
            }
            
            // =================================================================
            // 3. Add is_global column if not exists
            // =================================================================
            console.log('Checking is_global column...');
            
            const [isGlobalCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                  AND column_name = 'is_global'
            `);
            
            if (isGlobalCol.length === 0) {
                console.log('Adding is_global column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_ivr_segments 
                    ADD COLUMN is_global TINYINT(1) DEFAULT 0
                    COMMENT 'Whether segment is shared across all agents in tenant'
                    AFTER is_active
                `);
                console.log('✓ Added is_global column');
            } else {
                console.log('✓ Column is_global already exists, skipping');
            }
            
            // =================================================================
            // 4. Add description column if not exists
            // =================================================================
            console.log('Checking description column...');
            
            const [descCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                  AND column_name = 'description'
            `);
            
            if (descCol.length === 0) {
                console.log('Adding description column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_ivr_segments 
                    ADD COLUMN description VARCHAR(500) NULL
                    COMMENT 'Optional description for the segment'
                    AFTER segment_type
                `);
                console.log('✓ Added description column');
            } else {
                console.log('✓ Column description already exists, skipping');
            }
            
            // =================================================================
            // 5. Add usage_count column if not exists
            // =================================================================
            console.log('Checking usage_count column...');
            
            const [usageCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                  AND column_name = 'usage_count'
            `);
            
            if (usageCol.length === 0) {
                console.log('Adding usage_count column...');
                await db.query(`
                    ALTER TABLE yovo_tbl_aiva_ivr_segments 
                    ADD COLUMN usage_count INT DEFAULT 0
                    COMMENT 'Number of times this segment has been used'
                    AFTER is_global
                `);
                console.log('✓ Added usage_count column');
            } else {
                console.log('✓ Column usage_count already exists, skipping');
            }
            
            // =================================================================
            // 6. Verify all columns
            // =================================================================
            console.log('Verifying migration...');
            
            const [verifyCols] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                  AND column_name IN ('is_active', 'is_global', 'description', 'usage_count')
                ORDER BY ORDINAL_POSITION
            `);
            
            console.log('Verified columns:');
            for (const col of verifyCols) {
                console.log(`  ✓ ${col.COLUMN_NAME} (${col.COLUMN_TYPE}, default: ${col.COLUMN_DEFAULT})`);
            }
            
            if (verifyCols.length === 4) {
                console.log('✓ Migration completed successfully! All 4 columns present.');
            } else {
                console.log(`⚠ Warning: Expected 4 columns, found ${verifyCols.length}`);
            }
            
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
            console.log('Rolling back IVR segments columns migration...');
            
            // Check if table exists
            const [tables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_ivr_segments'
            `);
            
            if (tables.length === 0) {
                console.log('⚠ Table does not exist, skipping rollback');
                return;
            }
            
            // Drop columns in reverse order
            const columnsToDrop = ['usage_count', 'is_global', 'is_active', 'description'];
            
            for (const colName of columnsToDrop) {
                const [existingCol] = await db.query(`
                    SELECT COLUMN_NAME
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_ivr_segments' 
                      AND column_name = ?
                `, { replacements: [colName] });
                
                if (existingCol.length > 0) {
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_ivr_segments 
                        DROP COLUMN ${colName}
                    `);
                    console.log(`✓ Removed ${colName} column`);
                } else {
                    console.log(`⚠ Column ${colName} does not exist, skipping`);
                }
            }
            
            console.log('✓ Rollback completed');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};