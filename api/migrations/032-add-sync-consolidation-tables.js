'use strict';
/**
 * Migration: Add Sync Consolidation Tables
 * 
 * This migration adds tables for handling synchronous message consolidation
 * when users send multiple rapid-fire messages via WhatsApp webhooks.
 * 
 * Tables:
 * - yovo_tbl_aiva_sync_consolidation: Tracks consolidation windows
 * - yovo_tbl_aiva_sync_consolidation_messages: Messages within each window
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting sync consolidation tables migration...');
            
            // =================================================================
            // 1. Create sync consolidation window table
            // =================================================================
            console.log('Checking yovo_tbl_aiva_sync_consolidation table...');
            
            const [tables1] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_sync_consolidation'
            `);
            
            if (tables1.length === 0) {
                console.log('Creating yovo_tbl_aiva_sync_consolidation table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_sync_consolidation (
                        id VARCHAR(36) PRIMARY KEY,
                        session_id VARCHAR(36) NOT NULL,
                        status ENUM('collecting', 'processing', 'completed') DEFAULT 'collecting',
                        message_count INT DEFAULT 0,
                        window_expires_at DATETIME NOT NULL,
                        lock_expires_at DATETIME NULL,
                        processing_started_at DATETIME NULL,
                        completed_at DATETIME NULL,
                        last_message_at DATETIME NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        
                        INDEX idx_session_status (session_id, status),
                        INDEX idx_expires (window_expires_at),
                        INDEX idx_created (created_at)
                    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log('✓ Created yovo_tbl_aiva_sync_consolidation table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_sync_consolidation already exists, skipping');
            }
            
            // =================================================================
            // 2. Create sync consolidation messages table
            // =================================================================
            console.log('Checking yovo_tbl_aiva_sync_consolidation_messages table...');
            
            const [tables2] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_sync_consolidation_messages'
            `);
            
            if (tables2.length === 0) {
                console.log('Creating yovo_tbl_aiva_sync_consolidation_messages table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_sync_consolidation_messages (
                        id VARCHAR(36) PRIMARY KEY,
                        window_id VARCHAR(36) NOT NULL,
                        message_text TEXT,
                        image_url TEXT,
                        audio_transcript TEXT,
                        metadata JSON,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        
                        INDEX idx_window (window_id),
                        INDEX idx_created (created_at),
                        
                        FOREIGN KEY (window_id) REFERENCES yovo_tbl_aiva_sync_consolidation(id) ON DELETE CASCADE
                    ) ENGINE=INNODB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log('✓ Created yovo_tbl_aiva_sync_consolidation_messages table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_sync_consolidation_messages already exists, skipping');
            }
            
            // =================================================================
            // 3. Verify
            // =================================================================
            console.log('Verifying migration...');
            
            const [verifyTables] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name IN ('yovo_tbl_aiva_sync_consolidation', 'yovo_tbl_aiva_sync_consolidation_messages')
            `);
            
            if (verifyTables.length === 2) {
                verifyTables.forEach(t => {
                    console.log(`✓ Verified: ${t.TABLE_NAME}`);
                });
                console.log('✓ Migration completed successfully!');
            } else {
                throw new Error(`Expected 2 tables, found ${verifyTables.length}`);
            }
            
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('⚠ Tables already exist, skipping');
            } else {
                console.error('✗ Migration failed:', error);
                throw error;
            }
        }
    },
    
    down: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Rolling back sync consolidation tables migration...');
            
            // Drop messages table first (has foreign key)
            const [tables2] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_sync_consolidation_messages'
            `);
            
            if (tables2.length > 0) {
                await db.query(`DROP TABLE yovo_tbl_aiva_sync_consolidation_messages`);
                console.log('✓ Dropped yovo_tbl_aiva_sync_consolidation_messages table');
            }
            
            // Drop main table
            const [tables1] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_sync_consolidation'
            `);
            
            if (tables1.length > 0) {
                await db.query(`DROP TABLE yovo_tbl_aiva_sync_consolidation`);
                console.log('✓ Dropped yovo_tbl_aiva_sync_consolidation table');
            }
            
            console.log('✓ Rollback completed successfully!');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};