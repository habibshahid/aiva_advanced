'use strict';

/**
 * Migration: Add Missing Tables
 * 
 * This migration adds the following tables that were missing from migrations:
 * 1. yovo_tbl_aiva_notification_log - Logs for email notifications sent to tenants
 * 2. yovo_tbl_aiva_product_images - Links products to images (Shopify product images)
 * 3. yovo_tbl_aiva_product_reviews - Product reviews from various sources
 * 
 * These tables are already referenced in:
 * - SettingsService.js (notification_log)
 * - ProductService.js (product_images, product_reviews)
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const db = queryInterface.sequelize;
    
    try {
      console.log('Starting missing tables migration...');
      console.log('='.repeat(60));
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_notification_log
      // =================================================================
      console.log('\n1. Creating yovo_tbl_aiva_notification_log...');
      
      const [notificationLogExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_notification_log'
      `);
      
      if (notificationLogExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_notification_log', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          tenant_id: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: 'yovo_tbl_aiva_tenants',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          notification_type: {
            type: Sequelize.ENUM('low_balance', 'daily_summary', 'monthly_summary', 'system_alert'),
            allowNull: false
          },
          recipient_email: {
            type: Sequelize.STRING(255),
            allowNull: false
          },
          subject: {
            type: Sequelize.STRING(500),
            allowNull: true
          },
          status: {
            type: Sequelize.ENUM('sent', 'failed', 'pending'),
            defaultValue: 'pending'
          },
          error_message: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          metadata: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: 'Additional context data'
          },
          sent_at: {
            type: Sequelize.DATE,
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        // Add indexes
        await queryInterface.addIndex('yovo_tbl_aiva_notification_log', ['tenant_id'], {
          name: 'idx_tenant_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_notification_log', ['notification_type'], {
          name: 'idx_notification_type'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_notification_log', ['status'], {
          name: 'idx_status'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_notification_log', ['sent_at'], {
          name: 'idx_sent_at'
        });
        
        console.log('✓ Created yovo_tbl_aiva_notification_log');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_notification_log already exists, skipping');
      }
      
      // =================================================================
      // 2. Create yovo_tbl_aiva_product_images
      // =================================================================
      console.log('\n2. Creating yovo_tbl_aiva_product_images...');
      
      const [productImagesExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_product_images'
      `);
      
      if (productImagesExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_product_images', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          product_id: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: 'yovo_tbl_aiva_products',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          image_id: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: 'yovo_tbl_aiva_images',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          shopify_image_id: {
            type: Sequelize.BIGINT,
            allowNull: true
          },
          position: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          },
          alt_text: {
            type: Sequelize.STRING(500),
            allowNull: true
          },
          variant_ids: {
            type: Sequelize.JSON,
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        });
        
        // Add indexes
        await queryInterface.addIndex('yovo_tbl_aiva_product_images', ['product_id'], {
          name: 'idx_product_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_images', ['image_id'], {
          name: 'idx_image_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_images', ['shopify_image_id'], {
          name: 'idx_shopify_image_id'
        });
        
        console.log('✓ Created yovo_tbl_aiva_product_images');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_product_images already exists, skipping');
      }
      
      // =================================================================
      // 3. Create yovo_tbl_aiva_product_reviews
      // =================================================================
      console.log('\n3. Creating yovo_tbl_aiva_product_reviews...');
      
      const [productReviewsExists] = await db.query(`
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE table_schema = DATABASE() 
          AND table_name = 'yovo_tbl_aiva_product_reviews'
      `);
      
      if (productReviewsExists.length === 0) {
        await queryInterface.createTable('yovo_tbl_aiva_product_reviews', {
          id: {
            type: Sequelize.STRING(36),
            primaryKey: true,
            allowNull: false
          },
          product_id: {
            type: Sequelize.STRING(36),
            allowNull: false,
            references: {
              model: 'yovo_tbl_aiva_products',
              key: 'id'
            },
            onDelete: 'CASCADE'
          },
          source: {
            type: Sequelize.ENUM('shopify', 'google', 'facebook', 'custom'),
            defaultValue: 'shopify'
          },
          external_review_id: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          reviewer_name: {
            type: Sequelize.STRING(255),
            allowNull: true
          },
          rating: {
            type: Sequelize.DECIMAL(2, 1),
            allowNull: false
          },
          title: {
            type: Sequelize.STRING(500),
            allowNull: true
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: true
          },
          verified_purchase: {
            type: Sequelize.BOOLEAN,
            defaultValue: false
          },
          helpful_count: {
            type: Sequelize.INTEGER,
            defaultValue: 0
          },
          review_date: {
            type: Sequelize.DATE,
            allowNull: true
          },
          created_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        });
        
        // Add indexes
        await queryInterface.addIndex('yovo_tbl_aiva_product_reviews', ['product_id'], {
          name: 'idx_product_id'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_reviews', ['rating'], {
          name: 'idx_rating'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_reviews', ['review_date'], {
          name: 'idx_review_date'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_reviews', ['source'], {
          name: 'idx_source'
        });
        await queryInterface.addIndex('yovo_tbl_aiva_product_reviews', ['product_id', 'rating'], {
          name: 'idx_reviews_product_rating'
        });
        
        console.log('✓ Created yovo_tbl_aiva_product_reviews');
      } else {
        console.log('⚠ Table yovo_tbl_aiva_product_reviews already exists, skipping');
      }
      
      // =================================================================
      // Summary
      // =================================================================
      console.log('\n' + '='.repeat(60));
      console.log('✓ Missing tables migration completed successfully!');
      console.log('='.repeat(60));
      console.log('\nTables created:');
      console.log('  1. yovo_tbl_aiva_notification_log - Email notification logs');
      console.log('  2. yovo_tbl_aiva_product_images - Product to image mappings');
      console.log('  3. yovo_tbl_aiva_product_reviews - Product reviews');
      console.log('\nThese tables support:');
      console.log('  - SettingsService.js: logNotification(), getNotificationLogs()');
      console.log('  - ProductService.js: linkImage(), getProductImages(), updateReviewStats()');
      console.log('='.repeat(60) + '\n');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Migration failed:', err);
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('Rolling back missing tables migration...');
      
      // Drop tables in reverse order (respecting foreign keys)
      await queryInterface.dropTable('yovo_tbl_aiva_product_reviews')
        .catch(() => console.log('  Table yovo_tbl_aiva_product_reviews not found'));
      console.log('✓ Dropped yovo_tbl_aiva_product_reviews');
      
      await queryInterface.dropTable('yovo_tbl_aiva_product_images')
        .catch(() => console.log('  Table yovo_tbl_aiva_product_images not found'));
      console.log('✓ Dropped yovo_tbl_aiva_product_images');
      
      await queryInterface.dropTable('yovo_tbl_aiva_notification_log')
        .catch(() => console.log('  Table yovo_tbl_aiva_notification_log not found'));
      console.log('✓ Dropped yovo_tbl_aiva_notification_log');
      
      console.log('\n✓ Rollback completed successfully!');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Rollback failed:', err);
      throw err;
    }
  }
};