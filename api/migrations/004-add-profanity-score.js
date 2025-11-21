'use strict';
/**
 * Migration: Add profanity_score Column to Analytics Tables
 * 
 * This migration adds the profanity_score column to support:
 * - Numeric profanity severity scoring (0-1 scale)
 * - More granular profanity analytics
 * - Better profanity trend analysis
 */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting profanity_score column migration...');
      
      // =================================================================
      // 1. Add profanity_score to yovo_tbl_aiva_call_analytics
      // =================================================================
      console.log('Adding profanity_score to yovo_tbl_aiva_call_analytics...');
      
      try {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_call_analytics 
          ADD COLUMN profanity_score DECIMAL(5,4) NULL DEFAULT NULL
          AFTER profanity_severity
        `);
        console.log('✓ Added profanity_score to yovo_tbl_aiva_call_analytics');
      } catch (error) {
        if (error.original && error.original.errno === 1060) {
          // Column already exists (errno 1060 = ER_DUP_FIELDNAME)
          console.log('⚠ profanity_score already exists in yovo_tbl_aiva_call_analytics, skipping');
        } else {
          throw error;
        }
      }
      
      // =================================================================
      // 2. Add profanity_score to yovo_tbl_aiva_chat_analytics
      // =================================================================
      console.log('Adding profanity_score to yovo_tbl_aiva_chat_analytics...');
      
      try {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_analytics 
          ADD COLUMN profanity_score DECIMAL(5,4) NULL DEFAULT NULL
          AFTER profanity_severity
        `);
        console.log('✓ Added profanity_score to yovo_tbl_aiva_chat_analytics');
      } catch (error) {
        if (error.original && error.original.errno === 1060) {
          // Column already exists
          console.log('⚠ profanity_score already exists in yovo_tbl_aiva_chat_analytics, skipping');
        } else {
          throw error;
        }
      }
      
      // =================================================================
      // 3. Create indexes for profanity_score queries
      // =================================================================
      console.log('Creating indexes for profanity_score...');
      
      try {
        await db.query(`
          CREATE INDEX idx_call_analytics_profanity_score 
          ON yovo_tbl_aiva_call_analytics(profanity_score)
        `);
        console.log('✓ Created index on yovo_tbl_aiva_call_analytics.profanity_score');
      } catch (error) {
        if (error.original && error.original.errno === 1061) {
          // Index already exists (errno 1061 = ER_DUP_KEYNAME)
          console.log('⚠ Index idx_call_analytics_profanity_score already exists, skipping');
        } else {
          throw error;
        }
      }
      
      try {
        await db.query(`
          CREATE INDEX idx_chat_analytics_profanity_score 
          ON yovo_tbl_aiva_chat_analytics(profanity_score)
        `);
        console.log('✓ Created index on yovo_tbl_aiva_chat_analytics.profanity_score');
      } catch (error) {
        if (error.original && error.original.errno === 1061) {
          // Index already exists
          console.log('⚠ Index idx_chat_analytics_profanity_score already exists, skipping');
        } else {
          throw error;
        }
      }
      
      // =================================================================
      // 4. Backfill existing records with estimated scores
      // =================================================================
      console.log('Backfilling profanity_score based on severity...');
      
      // Update call analytics: low = 0.3, medium = 0.6, high = 0.9
      const [callResult] = await db.query(`
        UPDATE yovo_tbl_aiva_call_analytics
        SET profanity_score = CASE
          WHEN profanity_severity = 'low' THEN 0.3000
          WHEN profanity_severity = 'medium' THEN 0.6000
          WHEN profanity_severity = 'high' THEN 0.9000
          ELSE NULL
        END
        WHERE profanity_severity IS NOT NULL
        AND profanity_score IS NULL
      `);
      console.log(`✓ Backfilled ${callResult.affectedRows || 0} records in yovo_tbl_aiva_call_analytics`);
      
      // Update chat analytics: low = 0.3, medium = 0.6, high = 0.9
      const [chatResult] = await db.query(`
        UPDATE yovo_tbl_aiva_chat_analytics
        SET profanity_score = CASE
          WHEN profanity_severity = 'low' THEN 0.3000
          WHEN profanity_severity = 'medium' THEN 0.6000
          WHEN profanity_severity = 'high' THEN 0.9000
          ELSE NULL
        END
        WHERE profanity_severity IS NOT NULL
        AND profanity_score IS NULL
      `);
      console.log(`✓ Backfilled ${chatResult.affectedRows || 0} records in yovo_tbl_aiva_chat_analytics`);
      
      console.log('✓ Profanity score migration completed successfully!');
      
    } catch (error) {
      console.error('✗ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Rolling back profanity_score column migration...');
      
      // =================================================================
      // 1. Drop indexes
      // =================================================================
      console.log('Dropping profanity_score indexes...');
      
      try {
        await db.query(`
          DROP INDEX idx_call_analytics_profanity_score 
          ON yovo_tbl_aiva_call_analytics
        `);
        console.log('✓ Dropped index idx_call_analytics_profanity_score');
      } catch (error) {
        if (error.original && error.original.errno === 1091) {
          // Index doesn't exist (errno 1091 = ER_CANT_DROP_FIELD_OR_KEY)
          console.log('⚠ Index idx_call_analytics_profanity_score does not exist, skipping');
        } else {
          throw error;
        }
      }
      
      try {
        await db.query(`
          DROP INDEX idx_chat_analytics_profanity_score 
          ON yovo_tbl_aiva_chat_analytics
        `);
        console.log('✓ Dropped index idx_chat_analytics_profanity_score');
      } catch (error) {
        if (error.original && error.original.errno === 1091) {
          // Index doesn't exist
          console.log('⚠ Index idx_chat_analytics_profanity_score does not exist, skipping');
        } else {
          throw error;
        }
      }
      
      // =================================================================
      // 2. Remove profanity_score columns
      // =================================================================
      console.log('Removing profanity_score columns...');
      
      try {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_call_analytics 
          DROP COLUMN profanity_score
        `);
        console.log('✓ Removed profanity_score from yovo_tbl_aiva_call_analytics');
      } catch (error) {
        if (error.original && error.original.errno === 1091) {
          // Column doesn't exist
          console.log('⚠ profanity_score does not exist in yovo_tbl_aiva_call_analytics, skipping');
        } else {
          throw error;
        }
      }
      
      try {
        await db.query(`
          ALTER TABLE yovo_tbl_aiva_chat_analytics 
          DROP COLUMN profanity_score
        `);
        console.log('✓ Removed profanity_score from yovo_tbl_aiva_chat_analytics');
      } catch (error) {
        if (error.original && error.original.errno === 1091) {
          // Column doesn't exist
          console.log('⚠ profanity_score does not exist in yovo_tbl_aiva_chat_analytics, skipping');
        } else {
          throw error;
        }
      }
      
      console.log('✓ Profanity score rollback completed successfully!');
      
    } catch (error) {
      console.error('✗ Rollback failed:', error);
      throw error;
    }
  }
};