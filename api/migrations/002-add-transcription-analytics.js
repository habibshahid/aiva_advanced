'use strict';

/**
 * Migration: Add Transcription and Analytics Tables
 * 
 * This migration adds comprehensive transcription analysis capabilities:
 * - Call transcriptions with sentiment/profanity/intent analysis
 * - Chat message analysis fields
 * - Session-level analytics
 * - Agent performance tracking
 * - Tenant performance metrics
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Note: queryInterface.sequelize is a raw MySQL connection, not a Sequelize instance
    // Transactions are handled automatically by the migration runner
    
    try {
      console.log('Starting transcription and analytics migration...');
      
      // =================================================================
      // 1. Create yovo_tbl_aiva_call_transcriptions
      // =================================================================
      console.log('Creating yovo_tbl_aiva_call_transcriptions...');
      
      await queryInterface.createTable('yovo_tbl_aiva_call_transcriptions', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false
        },
        session_id: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'References yovo_tbl_aiva_call_logs.session_id'
        },
        call_log_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_call_logs',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'References yovo_tbl_aiva_call_logs.id'
        },
        speaker: {
          type: Sequelize.ENUM('agent', 'customer'),
          allowNull: false
        },
        speaker_id: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: 'agent_aivaCall or customer_{phone}'
        },
        sequence_number: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: 'Order of message in conversation'
        },
        // Content fields
        original_message: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Original transcribed text'
        },
        translated_message: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'English translation if needed'
        },
        language_detected: {
          type: Sequelize.STRING(10),
          allowNull: true,
          comment: 'ISO language code (en, ur, es, etc)'
        },
        // Sentiment Analysis
        sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'positive, negative, neutral, mixed'
        },
        sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true,
          comment: 'Score from -1.0 to 1.0'
        },
        sentiment_confidence: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true,
          comment: 'Confidence 0.0 to 1.0'
        },
        // Profanity Analysis
        profanity_detected: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        profanity_score: {
          type: Sequelize.DECIMAL(5, 4),
          defaultValue: 0.0,
          comment: 'Severity score 0.0 to 1.0'
        },
        profane_words: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array of detected profane words'
        },
        // Intent Detection
        intents: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array of detected intents'
        },
        primary_intent: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Main intent category'
        },
        intent_confidence: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true,
          comment: 'Confidence 0.0 to 1.0'
        },
        // Context & Metadata
        topics: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array of detected topics/entities'
        },
        keywords: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Key extracted keywords'
        },
        emotion_tags: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Additional emotion indicators'
        },
        // Analysis Metadata
        analyzed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        analysis_model: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Model used for analysis'
        },
        analysis_cost: {
          type: Sequelize.DECIMAL(10, 6),
          defaultValue: 0.0
        },
        // Timestamps
        timestamp: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: 'Unix timestamp in milliseconds'
        },
        created_at: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
      
      // Add indexes for call_transcriptions
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['session_id'], {
        name: 'idx_session',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['call_log_id'], {
        name: 'idx_call_log',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['speaker'], {
        name: 'idx_speaker',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['call_log_id', 'sequence_number'], {
        name: 'idx_sequence',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['sentiment'], {
        name: 'idx_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_transcriptions', ['profanity_detected'], {
        name: 'idx_profanity',
      });
      
      console.log('✓ Created yovo_tbl_aiva_call_transcriptions');
      
      // =================================================================
      // 2. Extend yovo_tbl_aiva_chat_messages with analysis fields
      // =================================================================
      console.log('Extending yovo_tbl_aiva_chat_messages...');
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'language_detected', {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'ISO language code',
        after: 'content_markdown'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'translated_message', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'English translation if needed',
        after: 'language_detected'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'sentiment', {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'positive, negative, neutral, mixed',
        after: 'translated_message'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'sentiment_score', {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Score from -1.0 to 1.0',
        after: 'sentiment'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'sentiment_confidence', {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Confidence 0.0 to 1.0',
        after: 'sentiment_score'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'profanity_detected', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        after: 'sentiment_confidence'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'profanity_score', {
        type: Sequelize.DECIMAL(5, 4),
        defaultValue: 0.0,
        comment: 'Severity score 0.0 to 1.0',
        after: 'profanity_detected'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'profane_words', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of detected profane words',
        after: 'profanity_score'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'intents', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of detected intents',
        after: 'profane_words'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'primary_intent', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Main intent category',
        after: 'intents'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'intent_confidence', {
        type: Sequelize.DECIMAL(5, 4),
        allowNull: true,
        comment: 'Confidence 0.0 to 1.0',
        after: 'primary_intent'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'topics', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Array of detected topics/entities',
        after: 'intent_confidence'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'keywords', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Key extracted keywords',
        after: 'topics'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'emotion_tags', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional emotion indicators',
        after: 'keywords'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'analyzed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        after: 'emotion_tags'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'analysis_model', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Model used for analysis',
        after: 'analyzed_at'
      });
      
      await queryInterface.addColumn('yovo_tbl_aiva_chat_messages', 'analysis_cost', {
        type: Sequelize.DECIMAL(10, 6),
        defaultValue: 0.0,
        after: 'analysis_model'
      });
      
      // Add indexes for chat message analysis
      await queryInterface.addIndex('yovo_tbl_aiva_chat_messages', ['sentiment'], {
        name: 'idx_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_chat_messages', ['profanity_detected'], {
        name: 'idx_profanity',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_chat_messages', ['language_detected'], {
        name: 'idx_language',
      });
      
      console.log('✓ Extended yovo_tbl_aiva_chat_messages');
      
      // =================================================================
      // 3. Create yovo_tbl_aiva_call_analytics
      // =================================================================
      console.log('Creating yovo_tbl_aiva_call_analytics...');
      
      await queryInterface.createTable('yovo_tbl_aiva_call_analytics', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false
        },
        call_log_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          references: {
            model: 'yovo_tbl_aiva_call_logs',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        session_id: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        // Overall Sentiment
        overall_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'Dominant sentiment'
        },
        overall_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        sentiment_progression: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array showing sentiment over time'
        },
        // Sentiment breakdown
        positive_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        negative_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        neutral_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        // Customer vs Agent sentiment
        customer_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        customer_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        agent_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        agent_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        // Profanity
        profanity_incidents: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        profanity_severity: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'none, low, medium, high'
        },
        profanity_by_customer: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        profanity_by_agent: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Intent Analysis
        primary_intents: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array of main intents in conversation'
        },
        intent_categories: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Categorized intents with counts'
        },
        resolution_intent: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Final resolution intent'
        },
        // Conversation Quality Metrics
        total_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        customer_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        agent_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        avg_customer_message_length: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true
        },
        avg_agent_message_length: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true
        },
        // Topic Analysis
        main_topics: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Primary topics discussed'
        },
        keywords_frequency: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Most frequent keywords'
        },
        // Emotion Tracking
        emotion_timeline: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Emotion changes throughout call'
        },
        peak_emotions: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Strongest emotions detected'
        },
        // Quality Indicators
        escalation_detected: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        customer_satisfaction_indicator: {
          type: Sequelize.STRING(20),
          allowNull: true,
          comment: 'likely_satisfied, neutral, likely_unsatisfied'
        },
        issue_resolved: {
          type: Sequelize.BOOLEAN,
          allowNull: true
        },
        transfer_requested: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        // Language
        languages_detected: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Array of languages used'
        },
        primary_language: {
          type: Sequelize.STRING(10),
          allowNull: true
        },
        // Analysis metadata
        analysis_completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        total_analysis_cost: {
          type: Sequelize.DECIMAL(10, 6),
          defaultValue: 0.0
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
      
      // Add indexes for call_analytics
      await queryInterface.addIndex('yovo_tbl_aiva_call_analytics', ['session_id'], {
        name: 'idx_session',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_analytics', ['overall_sentiment'], {
        name: 'idx_overall_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_analytics', ['customer_sentiment'], {
        name: 'idx_customer_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_analytics', ['profanity_severity'], {
        name: 'idx_profanity_severity',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_call_analytics', ['customer_satisfaction_indicator'], {
        name: 'idx_satisfaction',
      });
      
      console.log('✓ Created yovo_tbl_aiva_call_analytics');
      
      // =================================================================
      // 4. Create yovo_tbl_aiva_chat_analytics
      // =================================================================
      console.log('Creating yovo_tbl_aiva_chat_analytics...');
      
      await queryInterface.createTable('yovo_tbl_aiva_chat_analytics', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false
        },
        session_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          unique: true,
          references: {
            model: 'yovo_tbl_aiva_chat_sessions',
            key: 'id'
          },
          onDelete: 'CASCADE'
        },
        // Overall Sentiment (same structure as call_analytics)
        overall_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        overall_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        sentiment_progression: {
          type: Sequelize.JSON,
          allowNull: true
        },
        positive_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        negative_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        neutral_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        // User vs Assistant sentiment
        user_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        user_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        assistant_sentiment: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        assistant_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        // Profanity
        profanity_incidents: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        profanity_severity: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        profanity_by_user: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Intent Analysis
        primary_intents: {
          type: Sequelize.JSON,
          allowNull: true
        },
        intent_categories: {
          type: Sequelize.JSON,
          allowNull: true
        },
        resolution_intent: {
          type: Sequelize.STRING(100),
          allowNull: true
        },
        // Conversation Metrics
        total_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        user_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        assistant_messages: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        avg_response_length: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true
        },
        // Topic Analysis
        main_topics: {
          type: Sequelize.JSON,
          allowNull: true
        },
        keywords_frequency: {
          type: Sequelize.JSON,
          allowNull: true
        },
        // Quality Indicators
        customer_satisfaction_indicator: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        issue_resolved: {
          type: Sequelize.BOOLEAN,
          allowNull: true
        },
        transfer_requested: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
        },
        // Language
        languages_detected: {
          type: Sequelize.JSON,
          allowNull: true
        },
        primary_language: {
          type: Sequelize.STRING(10),
          allowNull: true
        },
        // Analysis metadata
        analysis_completed_at: {
          type: Sequelize.DATE,
          allowNull: true
        },
        total_analysis_cost: {
          type: Sequelize.DECIMAL(10, 6),
          defaultValue: 0.0
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
      await queryInterface.addIndex('yovo_tbl_aiva_chat_analytics', ['overall_sentiment'], {
        name: 'idx_overall_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_chat_analytics', ['user_sentiment'], {
        name: 'idx_user_sentiment',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_chat_analytics', ['customer_satisfaction_indicator'], {
        name: 'idx_satisfaction',
      });
      
      console.log('✓ Created yovo_tbl_aiva_chat_analytics');
      
      // =================================================================
      // 5. Create yovo_tbl_aiva_agent_performance
      // =================================================================
      console.log('Creating yovo_tbl_aiva_agent_performance...');
      
      await queryInterface.createTable('yovo_tbl_aiva_agent_performance', {
        id: {
          type: Sequelize.STRING(36),
          primaryKey: true,
          allowNull: false
        },
        agent_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'yovo_tbl_aiva_agents',
            key: 'id'
          },
          onDelete: 'CASCADE'
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
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false,
          comment: 'Date for daily aggregation'
        },
        // Volume Metrics
        total_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: 'Calls + Chats'
        },
        total_calls: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        total_chats: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        completed_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        failed_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Duration Metrics (for calls)
        total_call_duration_seconds: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        avg_call_duration_seconds: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true
        },
        longest_call_seconds: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        shortest_call_seconds: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Sentiment Performance
        positive_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        negative_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        neutral_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        avg_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        // Customer Satisfaction
        likely_satisfied_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        likely_unsatisfied_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        satisfaction_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: true,
          comment: 'Percentage 0-100'
        },
        // Profanity Incidents
        profanity_incidents: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        calls_with_profanity: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Intent Resolution
        resolved_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        unresolved_count: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        resolution_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: true
        },
        transfer_requests: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        escalations: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Response Quality
        avg_messages_per_interaction: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: true
        },
        avg_response_length: {
          type: Sequelize.DECIMAL(8, 2),
          allowNull: true
        },
        // Cost Metrics
        total_cost: {
          type: Sequelize.DECIMAL(10, 4),
          defaultValue: 0.0
        },
        avg_cost_per_interaction: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true
        },
        // Top Intents
        top_intents: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Most common intents handled'
        },
        // Top Topics
        top_topics: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: 'Most discussed topics'
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
      
      // Add unique constraint and indexes
      await queryInterface.addIndex('yovo_tbl_aiva_agent_performance', ['agent_id', 'date'], {
        name: 'unique_agent_date',
        unique: true,
      });
      await queryInterface.addIndex('yovo_tbl_aiva_agent_performance', ['tenant_id', 'date'], {
        name: 'idx_tenant_date',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_agent_performance', ['satisfaction_rate'], {
        name: 'idx_satisfaction',
      });
      await queryInterface.addIndex('yovo_tbl_aiva_agent_performance', ['resolution_rate'], {
        name: 'idx_resolution',
      });
      
      console.log('✓ Created yovo_tbl_aiva_agent_performance');
      
      // =================================================================
      // 6. Create yovo_tbl_aiva_tenant_performance
      // =================================================================
      console.log('Creating yovo_tbl_aiva_tenant_performance...');
      
      await queryInterface.createTable('yovo_tbl_aiva_tenant_performance', {
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
        date: {
          type: Sequelize.DATEONLY,
          allowNull: false
        },
        // Volume
        total_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        total_calls: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        total_chats: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        active_agents: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Sentiment
        avg_sentiment_score: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: true
        },
        positive_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        negative_percentage: {
          type: Sequelize.DECIMAL(5, 2),
          defaultValue: 0.0
        },
        // Quality
        satisfaction_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: true
        },
        resolution_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: true
        },
        avg_call_duration: {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true
        },
        // Issues
        profanity_incidents: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        escalations: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        failed_interactions: {
          type: Sequelize.INTEGER,
          defaultValue: 0
        },
        // Cost
        total_cost: {
          type: Sequelize.DECIMAL(10, 4),
          defaultValue: 0.0
        },
        avg_cost_per_interaction: {
          type: Sequelize.DECIMAL(10, 4),
          allowNull: true
        },
        // Top performers
        top_agent_id: {
          type: Sequelize.STRING(36),
          allowNull: true,
          comment: 'Best performing agent'
        },
        top_intents: {
          type: Sequelize.JSON,
          allowNull: true
        },
        top_topics: {
          type: Sequelize.JSON,
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
      
      // Add unique constraint and indexes
      await queryInterface.addIndex('yovo_tbl_aiva_tenant_performance', ['tenant_id', 'date'], {
        name: 'unique_tenant_date',
        unique: true,
      });
      await queryInterface.addIndex('yovo_tbl_aiva_tenant_performance', ['date'], {
        name: 'idx_date',
      });
      
      console.log('✓ Created yovo_tbl_aiva_tenant_performance');
      
      // =================================================================
      // 7. Add indexes to existing tables for analytics queries
      // =================================================================
      console.log('Adding indexes to existing tables...');
      
      await queryInterface.addIndex('yovo_tbl_aiva_call_logs', ['tenant_id', 'agent_id', 'start_time'], {
        name: 'idx_tenant_agent_date',
      }).catch(() => console.log('  Index idx_tenant_agent_date already exists'));
      
      await queryInterface.addIndex('yovo_tbl_aiva_call_logs', ['status', 'start_time'], {
        name: 'idx_status_date',
      }).catch(() => console.log('  Index idx_status_date already exists'));
      
      await queryInterface.addIndex('yovo_tbl_aiva_chat_sessions', ['tenant_id', 'agent_id', 'start_time'], {
        name: 'idx_tenant_agent_date',
      }).catch(() => console.log('  Index idx_tenant_agent_date already exists'));
      
      await queryInterface.addIndex('yovo_tbl_aiva_chat_sessions', ['status', 'start_time'], {
        name: 'idx_status_date',
      }).catch(() => console.log('  Index idx_status_date already exists'));
      
      console.log('✓ Added performance indexes');
      
      console.log('\n' + '='.repeat(60));
      console.log('✓ Transcription and Analytics migration completed successfully!');
      console.log('='.repeat(60));
      console.log('\nTables created:');
      console.log('  1. yovo_tbl_aiva_call_transcriptions');
      console.log('  2. yovo_tbl_aiva_chat_messages (extended)');
      console.log('  3. yovo_tbl_aiva_call_analytics');
      console.log('  4. yovo_tbl_aiva_chat_analytics');
      console.log('  5. yovo_tbl_aiva_agent_performance');
      console.log('  6. yovo_tbl_aiva_tenant_performance');
      console.log('\nNext steps:');
      console.log('  1. Deploy the API service files');
      console.log('  2. Deploy the bridge integration file');
      console.log('  3. Update environment variables (OPENAI_API_KEY)');
      console.log('  4. Test with a sample call/chat');
      console.log('='.repeat(60) + '\n');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Migration failed:', err);
      throw err;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('Rolling back transcription and analytics migration...');
      
      // Drop tables in reverse order (respecting foreign keys)
      await queryInterface.dropTable('yovo_tbl_aiva_tenant_performance');
      console.log('✓ Dropped yovo_tbl_aiva_tenant_performance');
      
      await queryInterface.dropTable('yovo_tbl_aiva_agent_performance');
      console.log('✓ Dropped yovo_tbl_aiva_agent_performance');
      
      await queryInterface.dropTable('yovo_tbl_aiva_chat_analytics');
      console.log('✓ Dropped yovo_tbl_aiva_chat_analytics');
      
      await queryInterface.dropTable('yovo_tbl_aiva_call_analytics');
      console.log('✓ Dropped yovo_tbl_aiva_call_analytics');
      
      await queryInterface.dropTable('yovo_tbl_aiva_call_transcriptions');
      console.log('✓ Dropped yovo_tbl_aiva_call_transcriptions');
      
      // Remove columns from chat_messages
      console.log('Removing analysis columns from yovo_tbl_aiva_chat_messages...');
      
      const columnsToRemove = [
        'analysis_cost', 'analysis_model', 'analyzed_at', 'emotion_tags',
        'keywords', 'topics', 'intent_confidence', 'primary_intent',
        'intents', 'profane_words', 'profanity_score', 'profanity_detected',
        'sentiment_confidence', 'sentiment_score', 'sentiment',
        'translated_message', 'language_detected'
      ];
      
      for (const column of columnsToRemove) {
        await queryInterface.removeColumn('yovo_tbl_aiva_chat_messages', column)
          .catch(() => console.log(`  Column ${column} not found`));
      }
      
      console.log('✓ Removed analysis columns from yovo_tbl_aiva_chat_messages');
      
      console.log('\n✓ Rollback completed successfully!');
      
      return Promise.resolve(true);
      
    } catch (err) {
      console.error('Rollback failed:', err);
      throw err;
    }
  }
};