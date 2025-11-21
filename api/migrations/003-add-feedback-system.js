'use strict';

/**
 * Migration: Add Feedback System Tables
 * 
 * This migration adds comprehensive feedback collection capabilities:
 * - Session-level feedback (after conversation ends)
 * - Message-level feedback (useful/not useful per AI response)
 * - Analytics and reporting support
 * - Integration with existing chat sessions and messages
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      console.log('Starting feedback system migration...');
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_session_feedback
      // =================================================================
      console.log('Creating yovo_tbl_aiva_session_feedback...');
      
      await queryInterface.createTable('yovo_tbl_aiva_session_feedback', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false,
          comment: 'UUID for feedback record'
        },
        session_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_chat_sessions',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'References chat session'
        },
        tenant_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_tenants',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'Tenant who owns this session'
        },
        agent_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_agents',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'Agent used in this session'
        },
        rating: {
          type: Sequelize.ENUM('good', 'bad'),
          allowNull: false,
          comment: 'Overall session rating from user'
        },
        comment: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Optional user feedback text'
        },
        feedback_metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Additional context: session_duration, message_count, timestamp, etc.'
        },
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          allowNull: false
        }
      });
      
      // Add indexes for session feedback
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['session_id'], {
        name: 'idx_sf_session_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['tenant_id'], {
        name: 'idx_sf_tenant_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['agent_id'], {
        name: 'idx_sf_agent_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['rating'], {
        name: 'idx_sf_rating'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['created_at'], {
        name: 'idx_sf_created_at'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['tenant_id', 'agent_id', 'created_at'], {
        name: 'idx_sf_tenant_agent_date'
      });
      
      console.log('✓ Created yovo_tbl_aiva_session_feedback');
      
      // =================================================================
      // 2. Create yovo_tbl_aiva_message_feedback
      // =================================================================
      console.log('Creating yovo_tbl_aiva_message_feedback...');
      
      await queryInterface.createTable('yovo_tbl_aiva_message_feedback', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false,
          comment: 'UUID for feedback record'
        },
        message_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          references: {
            model: 'yovo_tbl_aiva_chat_messages',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'References chat message (assistant role only)'
        },
        session_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_chat_sessions',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'References chat session'
        },
        tenant_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_tenants',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'Tenant who owns this message'
        },
        agent_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_agents',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'Agent that generated this message'
        },
        rating: {
          type: Sequelize.ENUM('useful', 'not_useful'),
          allowNull: false,
          comment: 'Message usefulness rating from user'
        },
        comment: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Optional feedback comment explaining the rating'
        },
        feedback_metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Message context: tokens, cost, sources_used, timestamp, etc.'
        },
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          allowNull: false
        },
        updated_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          allowNull: false,
          comment: 'Updated when user changes their rating'
        }
      });
      
      // Add indexes for message feedback
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['message_id'], {
        name: 'idx_mf_message_id_unique',
        unique: true
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['session_id'], {
        name: 'idx_mf_session_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['tenant_id'], {
        name: 'idx_mf_tenant_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['agent_id'], {
        name: 'idx_mf_agent_id'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['rating'], {
        name: 'idx_mf_rating'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['created_at'], {
        name: 'idx_mf_created_at'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['tenant_id', 'agent_id', 'created_at'], {
        name: 'idx_mf_tenant_agent_date'
      });
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['tenant_id', 'rating'], {
        name: 'idx_mf_tenant_rating'
      });
      
      console.log('✓ Created yovo_tbl_aiva_message_feedback');
      
      // =================================================================
      // 3. Add feedback-related columns to existing tables
      // =================================================================
      console.log('Adding feedback columns to yovo_tbl_aiva_chat_sessions...');
      
      // Check if columns exist using raw SQL
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'yovo_tbl_aiva_chat_sessions' 
         AND COLUMN_NAME IN ('feedback_requested', 'feedback_submitted')`
      );
      
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      
      if (!existingColumns.includes('feedback_requested')) {
        console.log('Adding feedback_requested column...');
        await queryInterface.addColumn('yovo_tbl_aiva_chat_sessions', 'feedback_requested', {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'Whether feedback prompt has been shown for this session'
        });
        console.log('✓ Added feedback_requested column');
      } else {
        console.log('  Column feedback_requested already exists');
      }
      
      if (!existingColumns.includes('feedback_submitted')) {
        console.log('Adding feedback_submitted column...');
        await queryInterface.addColumn('yovo_tbl_aiva_chat_sessions', 'feedback_submitted', {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'Whether user has submitted session feedback'
        });
        console.log('✓ Added feedback_submitted column');
      } else {
        console.log('  Column feedback_submitted already exists');
      }
      
      // =================================================================
      // 4. Add composite indexes for analytics queries
      // =================================================================
      console.log('Adding performance indexes for feedback queries...');
      
      await queryInterface.addIndex('yovo_tbl_aiva_session_feedback', ['agent_id', 'rating', 'created_at'], {
        name: 'idx_sf_agent_rating_date'
      }).catch(() => console.log('  Index idx_sf_agent_rating_date already exists'));
      
      await queryInterface.addIndex('yovo_tbl_aiva_message_feedback', ['agent_id', 'rating', 'created_at'], {
        name: 'idx_mf_agent_rating_date'
      }).catch(() => console.log('  Index idx_mf_agent_rating_date already exists'));
      
      console.log('✓ Added performance indexes');
      
      console.log('\n' + '='.repeat(70));
      console.log('✓ Feedback System migration completed successfully!');
      console.log('='.repeat(70));
      console.log('\nTables created:');
      console.log('  1. yovo_tbl_aiva_session_feedback');
      console.log('     - Stores user feedback after conversation ends');
      console.log('     - Rating: good/bad + optional comment');
      console.log('     - Metadata: session duration, message count, etc.');
      console.log('');
      console.log('  2. yovo_tbl_aiva_message_feedback');
      console.log('     - Stores per-message usefulness ratings');
      console.log('     - Rating: useful/not_useful + optional comment');
      console.log('     - Metadata: message cost, tokens, sources used');
      console.log('');
      console.log('Columns added to existing tables:');
      console.log('  - yovo_tbl_aiva_chat_sessions.feedback_requested');
      console.log('  - yovo_tbl_aiva_chat_sessions.feedback_submitted');
      console.log('');
      console.log('Next steps:');
      console.log('  1. Deploy FeedbackService (api/src/services/FeedbackService.js)');
      console.log('  2. Deploy feedback routes (api/src/routes/feedback.js)');
      console.log('  3. Register routes in api/src/index.js');
      console.log('  4. Update ChatService for conversation end detection');
      console.log('  5. Update frontend widget with feedback UI');
      console.log('  6. Update public chat page with feedback UI');
      console.log('='.repeat(70));
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('Rolling back feedback system migration...');
      
      // Drop tables in reverse order (respect foreign keys)
      console.log('Dropping yovo_tbl_aiva_message_feedback...');
      await queryInterface.dropTable('yovo_tbl_aiva_message_feedback');
      console.log('✓ Dropped yovo_tbl_aiva_message_feedback');
      
      console.log('Dropping yovo_tbl_aiva_session_feedback...');
      await queryInterface.dropTable('yovo_tbl_aiva_session_feedback');
      console.log('✓ Dropped yovo_tbl_aiva_session_feedback');
      
      // Remove added columns
      console.log('Removing feedback columns from yovo_tbl_aiva_chat_sessions...');
      
      // Check if columns exist before removing
      const [columns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'yovo_tbl_aiva_chat_sessions' 
         AND COLUMN_NAME IN ('feedback_requested', 'feedback_submitted')`
      );
      
      const existingColumns = columns.map(c => c.COLUMN_NAME);
      
      if (existingColumns.includes('feedback_requested')) {
        await queryInterface.removeColumn('yovo_tbl_aiva_chat_sessions', 'feedback_requested');
        console.log('✓ Removed feedback_requested column');
      }
      
      if (existingColumns.includes('feedback_submitted')) {
        await queryInterface.removeColumn('yovo_tbl_aiva_chat_sessions', 'feedback_submitted');
        console.log('✓ Removed feedback_submitted column');
      }
      
      console.log('\n' + '='.repeat(70));
      console.log('✓ Feedback System rollback completed successfully!');
      console.log('='.repeat(70));
      
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
};