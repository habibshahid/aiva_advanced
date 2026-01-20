'use strict';
/**
 * Migration: Add Web Scrape Sync Tracking Tables
 * 
 * This migration adds tables and columns for handling automatic synchronization
 * of web scraped content with change detection via content hashing.
 * 
 * Tables:
 * - yovo_tbl_aiva_scrape_sources: Tracks URLs configured for scraping with auto-sync settings
 * 
 * Column additions to yovo_tbl_aiva_documents:
 * - content_hash: SHA-256 hash of content for change detection
 * - last_sync_at: Last sync check timestamp
 * - sync_status: Current sync status
 * - scrape_source_id: Link to parent scrape source
 * 
 * Idempotent - can be run multiple times safely
 */
module.exports = {
    up: async (queryInterface, Sequelize) => {
        const db = queryInterface.sequelize;
        
        try {
            console.log('Starting web scrape sync tracking migration...');
            
            // =================================================================
            // 1. Create scrape sources table
            // =================================================================
            console.log('Checking yovo_tbl_aiva_scrape_sources table...');
            
            const [tables1] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_scrape_sources'
            `);
            
            if (tables1.length === 0) {
                console.log('Creating yovo_tbl_aiva_scrape_sources table...');
                await db.query(`
                    CREATE TABLE yovo_tbl_aiva_scrape_sources (
                        id VARCHAR(36) PRIMARY KEY,
                        kb_id VARCHAR(36) NOT NULL,
                        tenant_id VARCHAR(36) NOT NULL,
                        url VARCHAR(2048) NOT NULL,
                        scrape_type ENUM('single_url', 'crawl', 'sitemap') DEFAULT 'single_url',
                        max_depth INT DEFAULT 2,
                        max_pages INT DEFAULT 20,
                        auto_sync_enabled TINYINT(1) DEFAULT 0,
                        sync_interval_hours INT DEFAULT 24 COMMENT 'Hours between sync checks',
                        last_sync_at DATETIME NULL,
                        next_sync_at DATETIME NULL,
                        sync_status ENUM('idle', 'syncing', 'error') DEFAULT 'idle',
                        last_error TEXT NULL,
                        documents_count INT DEFAULT 0,
                        metadata JSON NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        
                        INDEX idx_kb_id (kb_id),
                        INDEX idx_tenant_id (tenant_id),
                        INDEX idx_auto_sync (auto_sync_enabled, next_sync_at),
                        INDEX idx_url (url(255)),
                        INDEX idx_sync_status (sync_status),
                        
                        FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
                console.log('✓ Created yovo_tbl_aiva_scrape_sources table');
            } else {
                console.log('✓ Table yovo_tbl_aiva_scrape_sources already exists, skipping');
            }
            
            // =================================================================
            // 2. Add columns to yovo_tbl_aiva_documents table
            // =================================================================
            console.log('Checking yovo_tbl_aiva_documents columns...');
            
            // Check if documents table exists
            const [docTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_documents'
            `);
            
            if (docTable.length === 0) {
                console.log('⚠ Table yovo_tbl_aiva_documents does not exist, skipping column additions');
            } else {
                // Add content_hash column
                const [hashCol] = await db.query(`
                    SELECT COLUMN_NAME 
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND column_name = 'content_hash'
                `);
                
                if (hashCol.length === 0) {
                    console.log('Adding content_hash column...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD COLUMN content_hash VARCHAR(64) NULL 
                        COMMENT 'SHA-256 hash of content for change detection'
                    `);
                    console.log('✓ Added content_hash column');
                } else {
                    console.log('✓ Column content_hash already exists, skipping');
                }
                
                // Add last_sync_at column
                const [syncAtCol] = await db.query(`
                    SELECT COLUMN_NAME 
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND column_name = 'last_sync_at'
                `);
                
                if (syncAtCol.length === 0) {
                    console.log('Adding last_sync_at column...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD COLUMN last_sync_at DATETIME NULL 
                        COMMENT 'Last sync check timestamp'
                    `);
                    console.log('✓ Added last_sync_at column');
                } else {
                    console.log('✓ Column last_sync_at already exists, skipping');
                }
                
                // Add sync_status column
                const [syncStatusCol] = await db.query(`
                    SELECT COLUMN_NAME 
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND column_name = 'sync_status'
                `);
                
                if (syncStatusCol.length === 0) {
                    console.log('Adding sync_status column...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD COLUMN sync_status ENUM('synced', 'changed', 'error', 'pending') NULL 
                        COMMENT 'Sync status for scraped content'
                    `);
                    console.log('✓ Added sync_status column');
                } else {
                    console.log('✓ Column sync_status already exists, skipping');
                }
                
                // Add scrape_source_id column
                const [sourceIdCol] = await db.query(`
                    SELECT COLUMN_NAME 
                    FROM information_schema.COLUMNS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND column_name = 'scrape_source_id'
                `);
                
                if (sourceIdCol.length === 0) {
                    console.log('Adding scrape_source_id column...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD COLUMN scrape_source_id VARCHAR(36) NULL 
                        COMMENT 'Reference to scrape source for auto-sync'
                    `);
                    console.log('✓ Added scrape_source_id column');
                } else {
                    console.log('✓ Column scrape_source_id already exists, skipping');
                }
                
                // Add index on scrape_source_id
                const [sourceIdIdx] = await db.query(`
                    SELECT INDEX_NAME 
                    FROM information_schema.STATISTICS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND index_name = 'idx_scrape_source_id'
                `);
                
                if (sourceIdIdx.length === 0) {
                    console.log('Adding index on scrape_source_id...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD INDEX idx_scrape_source_id (scrape_source_id)
                    `);
                    console.log('✓ Added index idx_scrape_source_id');
                } else {
                    console.log('✓ Index idx_scrape_source_id already exists, skipping');
                }
                
                // Add index on content_hash
                const [hashIdx] = await db.query(`
                    SELECT INDEX_NAME 
                    FROM information_schema.STATISTICS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND index_name = 'idx_content_hash'
                `);
                
                if (hashIdx.length === 0) {
                    console.log('Adding index on content_hash...');
                    await db.query(`
                        ALTER TABLE yovo_tbl_aiva_documents 
                        ADD INDEX idx_content_hash (content_hash)
                    `);
                    console.log('✓ Added index idx_content_hash');
                } else {
                    console.log('✓ Index idx_content_hash already exists, skipping');
                }
            }
            
            // =================================================================
            // 3. Verify migration
            // =================================================================
            console.log('Verifying migration...');
            
            const [verifyTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_scrape_sources'
            `);
            
            console.log(`✓ yovo_tbl_aiva_scrape_sources table: ${verifyTable.length > 0 ? 'exists' : 'missing'}`);
            
            const [verifyCols] = await db.query(`
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_documents'
                  AND column_name IN ('content_hash', 'last_sync_at', 'sync_status', 'scrape_source_id')
            `);
            
            verifyCols.forEach(c => {
                console.log(`✓ Verified: ${c.COLUMN_NAME} column exists`);
            });
            
            console.log('✓ Migration completed successfully!');
            
        } catch (error) {
            if (error.message.includes('already exists')) {
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
            console.log('Rolling back web scrape sync tracking migration...');
            
            // =================================================================
            // 1. Remove indexes from yovo_tbl_aiva_documents
            // =================================================================
            console.log('Removing indexes from yovo_tbl_aiva_documents...');
            
            const [docTable] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_documents'
            `);
            
            if (docTable.length > 0) {
                // Drop idx_content_hash index
                const [hashIdx] = await db.query(`
                    SELECT INDEX_NAME 
                    FROM information_schema.STATISTICS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND index_name = 'idx_content_hash'
                `);
                
                if (hashIdx.length > 0) {
                    await db.query(`ALTER TABLE yovo_tbl_aiva_documents DROP INDEX idx_content_hash`);
                    console.log('✓ Dropped index idx_content_hash');
                }
                
                // Drop idx_scrape_source_id index
                const [sourceIdIdx] = await db.query(`
                    SELECT INDEX_NAME 
                    FROM information_schema.STATISTICS 
                    WHERE table_schema = DATABASE() 
                      AND table_name = 'yovo_tbl_aiva_documents'
                      AND index_name = 'idx_scrape_source_id'
                `);
                
                if (sourceIdIdx.length > 0) {
                    await db.query(`ALTER TABLE yovo_tbl_aiva_documents DROP INDEX idx_scrape_source_id`);
                    console.log('✓ Dropped index idx_scrape_source_id');
                }
                
                // =================================================================
                // 2. Remove columns from yovo_tbl_aiva_documents
                // =================================================================
                console.log('Removing columns from yovo_tbl_aiva_documents...');
                
                const columnsToRemove = ['content_hash', 'last_sync_at', 'sync_status', 'scrape_source_id'];
                
                for (const colName of columnsToRemove) {
                    const [col] = await db.query(`
                        SELECT COLUMN_NAME 
                        FROM information_schema.COLUMNS 
                        WHERE table_schema = DATABASE() 
                          AND table_name = 'yovo_tbl_aiva_documents'
                          AND column_name = '${colName}'
                    `);
                    
                    if (col.length > 0) {
                        await db.query(`ALTER TABLE yovo_tbl_aiva_documents DROP COLUMN ${colName}`);
                        console.log(`✓ Dropped column ${colName}`);
                    }
                }
            }
            
            // =================================================================
            // 3. Drop scrape_sources table
            // =================================================================
            const [tables1] = await db.query(`
                SELECT TABLE_NAME 
                FROM information_schema.TABLES 
                WHERE table_schema = DATABASE() 
                  AND table_name = 'yovo_tbl_aiva_scrape_sources'
            `);
            
            if (tables1.length > 0) {
                await db.query(`DROP TABLE yovo_tbl_aiva_scrape_sources`);
                console.log('✓ Dropped yovo_tbl_aiva_scrape_sources table');
            }
            
            console.log('✓ Rollback completed successfully!');
            
        } catch (error) {
            console.error('✗ Rollback failed:', error);
            throw error;
        }
    }
};