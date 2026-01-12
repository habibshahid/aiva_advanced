'use strict';
/**
 * Migration: Add last_function_executed_at to Chat Sessions
 * 
 * This migration adds:
 * - last_function_executed_at: Tracks when a function was last executed
 *   Used to limit conversation history after function completion
 *   to prevent LLM confusion with resolved contexts
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting last_function_executed_at migration...');
            
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
            // 2. Check if column already exists
            // =================================================================
            console.log('Checking last_function_executed_at column...');
            
            const [existingCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                  AND column_name = 'last_function_executed_at'
            `);
            
            if (existingCol.length > 0) {
                console.log('✓ Column last_function_executed_at already exists, skipping');
                return;
            }
            
            // =================================================================
            // 3. Add the column
            // =================================================================
            console.log('Adding last_function_executed_at column...');
            
            await db.query(`
                ALTER TABLE yovo_tbl_aiva_chat_sessions 
                ADD COLUMN last_function_executed_at TIMESTAMP NULL DEFAULT NULL
                COMMENT 'Timestamp when a function was last executed - used to limit history context'
                AFTER complaint_state
            `);
            
            console.log('✓ Successfully added last_function_executed_at column');
            
            // =================================================================
            // 4. Verify
            // =================================================================
            console.log('Verifying migration...');
            
            const [verifyCol] = await db.query(`
                SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                  AND column_name = 'last_function_executed_at'
            `);
            
            if (verifyCol.length > 0) {
                console.log(`✓ Verified: ${verifyCol[0].COLUMN_NAME} (${verifyCol[0].COLUMN_TYPE})`);
                console.log('✓ Migration completed successfully!');
            } else {
                throw new Error('Column was not created');
            }
            
        } catch (error) {
            if (error.message.includes('Duplicate')) {
                console.log('⚠ Column last_function_executed_at already exists, skipping');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back last_function_executed_at migration...');
            
            // Check if table exists
            const [tables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions'
            `);
            
            if (tables.length === 0) {
                console.log('⚠ Table does not exist, skipping rollback');
                return;
            }
            
            // Check if column exists
            const [existingCol] = await db.query(`
                SELECT COLUMN_NAME
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_chat_sessions' 
                  AND column_name = 'last_function_executed_at'
            `);
            
            if (existingCol.length === 0) {
                console.log('⚠ Column does not exist, skipping rollback');
                return;
            }
            
            // Drop column
            await db.query(`
                ALTER TABLE yovo_tbl_aiva_chat_sessions 
                DROP COLUMN last_function_executed_at
            `);
            
            console.log('✓ Removed last_function_executed_at column');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};