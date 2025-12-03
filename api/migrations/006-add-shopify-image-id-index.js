'use strict';

/**
 * Migration: Add shopify_image_id_extracted Generated Column
 * 
 * This migration fixes the image deduplication issue during Shopify sync:
 * - Adds a generated column that extracts shopify_image_id from JSON metadata
 * - Creates an index for fast lookups during sync
 * - Prevents duplicate image downloads that increase disk size
 * 
 * Root cause: JSON_EXTRACT returns quoted values causing string/number mismatches
 * Solution: Use a STORED generated column with JSON_UNQUOTE for consistent comparison
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting shopify_image_id_extracted migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      console.log('Checking if yovo_tbl_aiva_images table exists...');
      
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_images'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_images does not exist, skipping migration');
        return;
      }
      
      console.log('✓ Table yovo_tbl_aiva_images exists');
      
      // =================================================================
      // 2. Check if column already exists
      // =================================================================
      console.log('Checking if shopify_image_id_extracted column already exists...');
      
      const [columns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_images' 
          AND column_name = 'shopify_image_id_extracted'
      `);
      
      if (columns.length > 0) {
        console.log('✓ Column shopify_image_id_extracted already exists, skipping');
        console.log(`  Current definition: ${columns[0].COLUMN_TYPE} (${columns[0].EXTRA})`);
        
        // Still check if index exists
        await ensureIndexExists(db);
        return;
      }
      
      // =================================================================
      // 3. Check if metadata column exists
      // =================================================================
      console.log('Checking if metadata column exists...');
      
      const [metadataCol] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_images' 
          AND column_name = 'metadata'
      `);
      
      if (metadataCol.length === 0) {
        console.log('⚠ Column metadata does not exist in yovo_tbl_aiva_images, skipping migration');
        return;
      }
      
      console.log(`✓ Metadata column exists: ${metadataCol[0].COLUMN_TYPE}`);
      
      // =================================================================
      // 4. Count existing Shopify images (for reporting)
      // =================================================================
      console.log('Counting existing Shopify images...');
      
      const [countResult] = await db.query(`
        SELECT COUNT(*) as total_images,
               COUNT(CASE WHEN JSON_EXTRACT(metadata, '$.shopify_image_id') IS NOT NULL THEN 1 END) as shopify_images
        FROM yovo_tbl_aiva_images
      `);
      
      console.log(`  Total images: ${countResult[0].total_images}`);
      console.log(`  Shopify images: ${countResult[0].shopify_images}`);
      
      // =================================================================
      // 5. Add generated column
      // =================================================================
      console.log('Adding shopify_image_id_extracted generated column...');
      
      await db.query(`
        ALTER TABLE yovo_tbl_aiva_images 
        ADD COLUMN shopify_image_id_extracted VARCHAR(50) 
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.shopify_image_id'))) STORED
        COMMENT 'Extracted Shopify image ID for fast deduplication lookups'
      `);
      
      console.log('✓ Successfully added shopify_image_id_extracted column');
      
      // =================================================================
      // 6. Create index for fast lookups
      // =================================================================
      await ensureIndexExists(db);
      
      // =================================================================
      // 7. Verify the migration
      // =================================================================
      console.log('Verifying migration...');
      
      const [verifyCol] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, EXTRA, GENERATION_EXPRESSION
        FROM information_schema.COLUMNS 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_images' 
          AND column_name = 'shopify_image_id_extracted'
      `);
      
      if (verifyCol.length > 0) {
        console.log('✓ Verification passed:');
        console.log(`  Column type: ${verifyCol[0].COLUMN_TYPE}`);
        console.log(`  Extra: ${verifyCol[0].EXTRA}`);
      }
      
      // =================================================================
      // 8. Test the new column with sample data
      // =================================================================
      console.log('Testing extraction on sample data...');
      
      const [sampleData] = await db.query(`
        SELECT 
          id,
          JSON_EXTRACT(metadata, '$.shopify_image_id') as raw_json_value,
          shopify_image_id_extracted as extracted_value
        FROM yovo_tbl_aiva_images
        WHERE JSON_EXTRACT(metadata, '$.shopify_image_id') IS NOT NULL
        LIMIT 3
      `);
      
      if (sampleData.length > 0) {
        console.log('  Sample extractions:');
        sampleData.forEach((row, i) => {
          console.log(`    ${i + 1}. Raw JSON: ${row.raw_json_value} → Extracted: ${row.extracted_value}`);
        });
      } else {
        console.log('  No Shopify images found to test');
      }
      
      console.log('✓ shopify_image_id_extracted migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back shopify_image_id_extracted migration...');
      
      // =================================================================
      // 1. Check if table exists
      // =================================================================
      const [tables] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_images'
      `);
      
      if (tables.length === 0) {
        console.log('⚠ Table yovo_tbl_aiva_images does not exist, skipping rollback');
        return;
      }
      
      // =================================================================
      // 2. Drop index first (if exists)
      // =================================================================
      console.log('Dropping index idx_shopify_image_id...');
      
      try {
        await db.query(`
          DROP INDEX idx_shopify_image_id ON yovo_tbl_aiva_images
        `);
        console.log('✓ Dropped index idx_shopify_image_id');
      } catch (error) {
        if (error.original && (error.original.errno === 1091 || error.original.code === 'ER_CANT_DROP_FIELD_OR_KEY')) {
          console.log('⚠ Index idx_shopify_image_id does not exist, skipping');
        } else {
          throw error;
        }
      }
      
      // =================================================================
      // 3. Drop generated column
      // =================================================================
      console.log('Dropping shopify_image_id_extracted column...');
      
      try {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_images 
          DROP COLUMN shopify_image_id_extracted
        `);
        console.log('✓ Dropped shopify_image_id_extracted column');
      } catch (error) {
        if (error.original && (error.original.errno === 1091 || error.original.code === 'ER_CANT_DROP_FIELD_OR_KEY')) {
          console.log('⚠ Column shopify_image_id_extracted does not exist, skipping');
        } else {
          throw error;
        }
      }
      
      console.log('✓ shopify_image_id_extracted rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};

/**
 * Helper function to ensure index exists
 */
async function ensureIndexExists(db) {
  console.log('Checking if index idx_shopify_image_id exists...');
  
  const [indexes] = await db.query(`
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name = 'yovo_tbl_aiva_images'
      AND index_name = 'idx_shopify_image_id'
  `);
  
  if (indexes.length > 0) {
    console.log('✓ Index idx_shopify_image_id already exists');
    return;
  }
  
  console.log('Creating index idx_shopify_image_id...');
  
  await db.query(`
    CREATE INDEX idx_shopify_image_id 
    ON yovo_tbl_aiva_images (kb_id, shopify_image_id_extracted)
  `);
  
  console.log('✓ Successfully created index idx_shopify_image_id');
}