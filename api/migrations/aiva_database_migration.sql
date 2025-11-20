-- ============================================================================
-- AIVA Database Migration Script
-- ============================================================================
-- This migration script will:
-- 1. Check if tables exist
-- 2. If table exists: verify and alter columns as needed
-- 3. If table doesn't exist: create the table
-- 4. Execute in proper order based on foreign key constraints
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

-- ============================================================================
-- LEVEL 1: Base Tables (No Foreign Keys)
-- ============================================================================

-- Table: yovo_tbl_aiva_tenants
-- This is the root table, must be created first
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_migrations$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_migrations()
BEGIN
    -- Check if table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_migrations'
    ) THEN
        -- Create new table
        CREATE TABLE yovo_tbl_migrations (
		  id INT AUTO_INCREMENT PRIMARY KEY,
		  name VARCHAR(255) NOT NULL UNIQUE,
		  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		);
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_migrations()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_migrations$$

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_tenants$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_tenants()
BEGIN
    -- Check if table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_tenants'
    ) THEN
        -- Create new table
        CREATE TABLE `yovo_tbl_aiva_tenants` (
          `id` varchar(36) NOT NULL,
          `name` varchar(255) NOT NULL,
          `company_name` varchar(255) DEFAULT NULL,
          `email` varchar(255) DEFAULT NULL COMMENT 'DEPRECATED: Use yovo_tbl_aiva_users',
          `password_hash` varchar(255) DEFAULT NULL COMMENT 'DEPRECATED: Use yovo_tbl_aiva_users',
          `api_key` varchar(255) DEFAULT NULL,
          `role` enum('super_admin','admin','agent_manager','client') DEFAULT NULL COMMENT 'DEPRECATED: Use yovo_tbl_aiva_users',
          `credit_balance` decimal(10,4) DEFAULT '0.0000',
          `is_active` tinyint(1) DEFAULT '1',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `email` (`email`),
          UNIQUE KEY `api_key` (`api_key`),
          KEY `idx_email` (`email`),
          KEY `idx_api_key` (`api_key`),
          KEY `idx_role` (`role`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        -- Add missing columns
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_tenants' AND column_name = 'company_name') THEN
            ALTER TABLE `yovo_tbl_aiva_tenants` ADD COLUMN `company_name` varchar(255) DEFAULT NULL AFTER `name`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_tenants' AND column_name = 'credit_balance') THEN
            ALTER TABLE `yovo_tbl_aiva_tenants` ADD COLUMN `credit_balance` decimal(10,4) DEFAULT '0.0000' AFTER `role`;
        END IF;
        
        -- Add missing indexes
        IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_tenants' AND index_name = 'idx_email') THEN
            ALTER TABLE `yovo_tbl_aiva_tenants` ADD KEY `idx_email` (`email`);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_tenants' AND index_name = 'idx_api_key') THEN
            ALTER TABLE `yovo_tbl_aiva_tenants` ADD KEY `idx_api_key` (`api_key`);
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_tenants' AND index_name = 'idx_role') THEN
            ALTER TABLE `yovo_tbl_aiva_tenants` ADD KEY `idx_role` (`role`);
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_tenants()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_tenants$$

-- ============================================================================
-- Table: yovo_tbl_aiva_system_settings
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_system_settings$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_system_settings()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_system_settings'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_system_settings` (
          `id` varchar(36) NOT NULL,
          `setting_key` varchar(100) NOT NULL,
          `setting_value` text,
          `setting_type` enum('smtp','general','api','security') DEFAULT 'general',
          `is_encrypted` tinyint(1) DEFAULT '0',
          `description` text,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `unique_setting_key` (`setting_key`),
          KEY `idx_setting_type` (`setting_type`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_system_settings' AND column_name = 'is_encrypted') THEN
            ALTER TABLE `yovo_tbl_aiva_system_settings` ADD COLUMN `is_encrypted` tinyint(1) DEFAULT '0' AFTER `setting_type`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_system_settings()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_system_settings$$

-- ============================================================================
-- LEVEL 2: Tables with FK to tenants only
-- ============================================================================

-- Table: yovo_tbl_aiva_users
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_users$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_users()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_users'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_users` (
          `id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `email` varchar(255) NOT NULL,
          `password_hash` varchar(255) NOT NULL,
          `name` varchar(255) NOT NULL,
          `role` enum('super_admin','admin','agent_manager','client') NOT NULL DEFAULT 'client',
          `is_active` tinyint(1) NOT NULL DEFAULT '1',
          `last_login_at` datetime DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `email` (`email`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_email` (`email`),
          KEY `idx_role` (`role`),
          CONSTRAINT `fk_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_users' AND column_name = 'last_login_at') THEN
            ALTER TABLE `yovo_tbl_aiva_users` ADD COLUMN `last_login_at` datetime DEFAULT NULL AFTER `is_active`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_users()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_users$$

-- Table: yovo_tbl_aiva_knowledge_bases
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_knowledge_bases$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_knowledge_bases()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_knowledge_bases'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_knowledge_bases` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
          `type` enum('general','product_catalog','faq','documentation') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'general',
          `status` enum('active','processing','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'active',
          `settings` json DEFAULT NULL COMMENT 'KB settings: chunking strategy, embedding model, etc.',
          `stats` json DEFAULT NULL COMMENT 'Document count, chunk count, storage size, etc.',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          `has_documents` tinyint(1) DEFAULT '0',
          `has_products` tinyint(1) DEFAULT '0',
          `document_count` int DEFAULT '0',
          `product_count` int DEFAULT '0',
          `content_updated_at` timestamp NULL DEFAULT NULL,
          PRIMARY KEY (`id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_status` (`status`),
          CONSTRAINT `fk_kb_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_knowledge_bases' AND column_name = 'has_documents') THEN
            ALTER TABLE `yovo_tbl_aiva_knowledge_bases` ADD COLUMN `has_documents` tinyint(1) DEFAULT '0' AFTER `updated_at`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_knowledge_bases' AND column_name = 'has_products') THEN
            ALTER TABLE `yovo_tbl_aiva_knowledge_bases` ADD COLUMN `has_products` tinyint(1) DEFAULT '0' AFTER `has_documents`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_knowledge_bases' AND column_name = 'document_count') THEN
            ALTER TABLE `yovo_tbl_aiva_knowledge_bases` ADD COLUMN `document_count` int DEFAULT '0' AFTER `has_products`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_knowledge_bases' AND column_name = 'product_count') THEN
            ALTER TABLE `yovo_tbl_aiva_knowledge_bases` ADD COLUMN `product_count` int DEFAULT '0' AFTER `document_count`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_knowledge_bases' AND column_name = 'content_updated_at') THEN
            ALTER TABLE `yovo_tbl_aiva_knowledge_bases` ADD COLUMN `content_updated_at` timestamp NULL DEFAULT NULL AFTER `product_count`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_knowledge_bases()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_knowledge_bases$$

-- Table: yovo_tbl_aiva_user_sessions
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_user_sessions$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_user_sessions()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_user_sessions'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_user_sessions` (
          `id` varchar(36) NOT NULL,
          `user_id` varchar(36) NOT NULL,
          `token_hash` varchar(255) NOT NULL,
          `ip_address` varchar(45) DEFAULT NULL,
          `user_agent` text,
          `expires_at` datetime NOT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_user_id` (`user_id`),
          KEY `idx_token_hash` (`token_hash`),
          KEY `idx_expires_at` (`expires_at`),
          CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `yovo_tbl_aiva_users` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_user_sessions()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_user_sessions$$

-- Table: yovo_tbl_aiva_user_audit_log
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_user_audit_log$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_user_audit_log()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_user_audit_log'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_user_audit_log` (
          `id` varchar(36) NOT NULL,
          `user_id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `action` varchar(100) NOT NULL,
          `resource_type` varchar(50) DEFAULT NULL,
          `resource_id` varchar(36) DEFAULT NULL,
          `details` json DEFAULT NULL,
          `ip_address` varchar(45) DEFAULT NULL,
          `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_user_id` (`user_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_action` (`action`),
          KEY `idx_created_at` (`created_at`),
          CONSTRAINT `fk_audit_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `yovo_tbl_aiva_users` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_user_audit_log()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_user_audit_log$$

-- Table: yovo_tbl_aiva_tenant_notification_settings
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_tenant_notification_settings$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_tenant_notification_settings()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_tenant_notification_settings'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_tenant_notification_settings` (
          `id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `notification_type` enum('low_balance','daily_summary','monthly_summary','system_alert') NOT NULL,
          `is_enabled` tinyint(1) DEFAULT '1',
          `threshold_value` decimal(10,2) DEFAULT NULL COMMENT 'For low_balance: credit threshold amount',
          `threshold_percentage` int DEFAULT NULL COMMENT 'For low_balance: percentage of initial balance',
          `recipient_emails` json DEFAULT NULL COMMENT 'Array of email addresses to notify',
          `notification_frequency` enum('immediate','daily','weekly','monthly') DEFAULT 'immediate',
          `last_notification_sent` timestamp NULL DEFAULT NULL,
          `settings` json DEFAULT NULL COMMENT 'Additional settings per notification type',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `unique_tenant_notification` (`tenant_id`,`notification_type`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_notification_type` (`notification_type`),
          KEY `idx_is_enabled` (`is_enabled`),
          CONSTRAINT `fk_notification_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_tenant_notification_settings()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_tenant_notification_settings$$

-- Table: yovo_tbl_aiva_credit_transactions
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_credit_transactions$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_credit_transactions()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_credit_transactions'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_credit_transactions` (
          `id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `type` enum('add','deduct','refund') NOT NULL,
          `amount` decimal(10,4) NOT NULL,
          `balance_before` decimal(10,4) NOT NULL,
          `balance_after` decimal(10,4) NOT NULL,
          `reference_type` varchar(50) DEFAULT NULL,
          `reference_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `operation_type` varchar(50) DEFAULT NULL COMMENT 'Type: voice_call, chat_message, doc_upload, knowledge_search, etc.',
          `operation_details` json DEFAULT NULL COMMENT 'Detailed breakdown of the operation',
          `admin_id` varchar(36) DEFAULT NULL,
          `note` text,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `admin_id` (`admin_id`),
          KEY `idx_tenant_date` (`tenant_id`,`created_at`),
          KEY `idx_reference` (`reference_type`,`reference_id`),
          KEY `idx_operation_type` (`operation_type`),
          KEY `idx_created_at_desc` (`created_at` DESC),
          CONSTRAINT `yovo_tbl_aiva_credit_transactions_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE,
          CONSTRAINT `yovo_tbl_aiva_credit_transactions_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `yovo_tbl_aiva_users` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_credit_transactions' AND column_name = 'operation_type') THEN
            ALTER TABLE `yovo_tbl_aiva_credit_transactions` ADD COLUMN `operation_type` varchar(50) DEFAULT NULL COMMENT 'Type: voice_call, chat_message, doc_upload, knowledge_search, etc.' AFTER `reference_id`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_credit_transactions' AND column_name = 'operation_details') THEN
            ALTER TABLE `yovo_tbl_aiva_credit_transactions` ADD COLUMN `operation_details` json DEFAULT NULL COMMENT 'Detailed breakdown of the operation' AFTER `operation_type`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_credit_transactions()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_credit_transactions$$

-- ============================================================================
-- LEVEL 3: Tables with FK to knowledge_bases
-- ============================================================================

-- Table: yovo_tbl_aiva_agents
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_agents$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_agents()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_agents'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_agents` (
          `id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `name` varchar(255) NOT NULL,
          `type` varchar(100) NOT NULL,
          `instructions` text NOT NULL,
          `voice` varchar(50) DEFAULT 'shimmer',
          `language` varchar(10) DEFAULT 'ur',
          `model` varchar(100) DEFAULT 'gpt-4o-mini-realtime-preview-2024-12-17',
          `chat_model` varchar(100) DEFAULT 'gpt-4o-mini',
          `provider` enum('openai','deepgram') DEFAULT 'openai',
          `deepgram_model` varchar(100) DEFAULT NULL,
          `deepgram_voice` varchar(100) DEFAULT NULL,
          `deepgram_language` varchar(10) DEFAULT 'en',
          `temperature` decimal(3,2) DEFAULT '0.60',
          `max_tokens` int DEFAULT '4096',
          `vad_threshold` decimal(3,2) DEFAULT '0.50',
          `silence_duration_ms` int DEFAULT '500',
          `greeting` text,
          `kb_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `chat_enabled` tinyint(1) DEFAULT '0',
          `is_active` tinyint(1) DEFAULT '1',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          `conversation_strategy` json DEFAULT NULL,
          `enable_chat_integration` tinyint(1) DEFAULT '0',
          `widget_config` json DEFAULT NULL COMMENT 'Widget appearance configuration',
          `chat_page_enabled` tinyint(1) DEFAULT '0',
          `chat_page_slug` varchar(100) DEFAULT NULL COMMENT 'URL slug for standalone chat page',
          PRIMARY KEY (`id`),
          KEY `idx_tenant_active` (`tenant_id`,`is_active`),
          KEY `idx_type` (`type`),
          KEY `idx_provider` (`provider`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_agents_chat_slug` (`chat_page_slug`),
          CONSTRAINT `fk_agents_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE SET NULL,
          CONSTRAINT `yovo_tbl_aiva_agents_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_agents' AND column_name = 'conversation_strategy') THEN
            ALTER TABLE `yovo_tbl_aiva_agents` ADD COLUMN `conversation_strategy` json DEFAULT NULL AFTER `updated_at`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_agents' AND column_name = 'enable_chat_integration') THEN
            ALTER TABLE `yovo_tbl_aiva_agents` ADD COLUMN `enable_chat_integration` tinyint(1) DEFAULT '0' AFTER `conversation_strategy`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_agents' AND column_name = 'widget_config') THEN
            ALTER TABLE `yovo_tbl_aiva_agents` ADD COLUMN `widget_config` json DEFAULT NULL COMMENT 'Widget appearance configuration' AFTER `enable_chat_integration`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_agents' AND column_name = 'chat_page_enabled') THEN
            ALTER TABLE `yovo_tbl_aiva_agents` ADD COLUMN `chat_page_enabled` tinyint(1) DEFAULT '0' AFTER `widget_config`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_agents' AND column_name = 'chat_page_slug') THEN
            ALTER TABLE `yovo_tbl_aiva_agents` ADD COLUMN `chat_page_slug` varchar(100) DEFAULT NULL COMMENT 'URL slug for standalone chat page' AFTER `chat_page_enabled`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_agents()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_agents$$

-- Table: yovo_tbl_aiva_documents
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_documents$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_documents()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_documents'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_documents` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `kb_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `original_filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `file_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `file_size_bytes` bigint NOT NULL,
          `storage_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `status` enum('uploaded','processing','completed','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'processing',
          `processing_stats` json DEFAULT NULL COMMENT 'Pages, chunks, images extracted, processing time, etc.',
          `metadata` json DEFAULT NULL COMMENT 'Custom metadata: tags, category, author, etc.',
          `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
          `uploaded_by` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_status` (`status`),
          KEY `idx_created_at` (`created_at`),
          CONSTRAINT `fk_docs_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_docs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_documents' AND column_name = 'processing_stats') THEN
            ALTER TABLE `yovo_tbl_aiva_documents` ADD COLUMN `processing_stats` json DEFAULT NULL COMMENT 'Pages, chunks, images extracted, processing time, etc.' AFTER `status`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_documents()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_documents$$

-- Table: yovo_tbl_aiva_shopify_stores
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_shopify_stores$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_shopify_stores()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_shopify_stores'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_shopify_stores` (
          `id` varchar(36) NOT NULL,
          `kb_id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `shop_domain` varchar(255) NOT NULL,
          `access_token` text NOT NULL,
          `auto_sync_enabled` tinyint(1) DEFAULT '1',
          `sync_frequency_minutes` int DEFAULT '1440',
          `last_sync_at` datetime DEFAULT NULL,
          `next_sync_at` datetime DEFAULT NULL,
          `sync_collections` json DEFAULT NULL,
          `sync_status_filter` varchar(50) DEFAULT 'active',
          `sync_reviews` tinyint(1) DEFAULT '1',
          `total_products_synced` int DEFAULT '0',
          `total_reviews_synced` int DEFAULT '0',
          `last_sync_status` enum('success','partial','failed') DEFAULT 'success',
          `last_sync_error` text,
          `status` enum('active','paused','error') DEFAULT 'active',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `kb_id` (`kb_id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_next_sync` (`next_sync_at`,`auto_sync_enabled`,`status`),
          CONSTRAINT `yovo_tbl_aiva_shopify_stores_ibfk_1` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_shopify_stores()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_shopify_stores$$

-- Table: yovo_tbl_aiva_images
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_images$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_images()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_images'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_images` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `kb_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `document_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `filename` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `storage_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `thumbnail_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `image_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `width` int DEFAULT NULL,
          `height` int DEFAULT NULL,
          `file_size_bytes` int DEFAULT NULL,
          `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
          `page_number` int DEFAULT NULL,
          `metadata` json DEFAULT NULL COMMENT 'Product info, tags, extracted text, etc.',
          `vector_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Redis CLIP vector ID',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_document_id` (`document_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_vector_id` (`vector_id`),
          CONSTRAINT `fk_images_doc` FOREIGN KEY (`document_id`) REFERENCES `yovo_tbl_aiva_documents` (`id`) ON DELETE SET NULL,
          CONSTRAINT `fk_images_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_images_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_images()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_images$$

-- Table: yovo_tbl_aiva_document_chunks
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_document_chunks$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_document_chunks()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_document_chunks'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_document_chunks` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `document_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `kb_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `chunk_index` int NOT NULL,
          `chunk_type` enum('text','faq','table','heading','code','image') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'text',
          `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `page_number` int DEFAULT NULL,
          `section_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `token_count` int DEFAULT NULL,
          `metadata` json DEFAULT NULL COMMENT 'Additional chunk metadata',
          `vector_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT 'Redis vector ID reference',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_document_id` (`document_id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_chunk_type` (`chunk_type`),
          KEY `idx_vector_id` (`vector_id`),
          CONSTRAINT `fk_chunks_doc` FOREIGN KEY (`document_id`) REFERENCES `yovo_tbl_aiva_documents` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_chunks_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_document_chunks()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_document_chunks$$

-- Table: yovo_tbl_aiva_knowledge_searches
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_knowledge_searches$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_knowledge_searches()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_knowledge_searches'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_knowledge_searches` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `kb_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `agent_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `session_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `query` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `query_expanded` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
          `search_type` enum('text','image','hybrid') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `results_count` int DEFAULT NULL,
          `top_result_score` decimal(5,4) DEFAULT NULL,
          `processing_time_ms` int DEFAULT NULL,
          `cost` decimal(10,6) DEFAULT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_agent_id` (`agent_id`),
          KEY `idx_search_type` (`search_type`),
          KEY `idx_created_at` (`created_at`),
          CONSTRAINT `fk_searches_agent` FOREIGN KEY (`agent_id`) REFERENCES `yovo_tbl_aiva_agents` (`id`) ON DELETE SET NULL,
          CONSTRAINT `fk_searches_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_searches_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_knowledge_searches()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_knowledge_searches$$

-- Table: yovo_tbl_aiva_image_searches
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_image_searches$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_image_searches()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_image_searches'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_image_searches` (
          `id` varchar(36) NOT NULL,
          `kb_id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `query` text,
          `search_type` enum('text','image','hybrid') DEFAULT 'text',
          `results_count` int DEFAULT '0',
          `top_result_score` float DEFAULT NULL,
          `processing_time_ms` int DEFAULT NULL,
          `cost` decimal(10,6) DEFAULT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_search_type` (`search_type`),
          KEY `idx_created_at` (`created_at`),
          CONSTRAINT `yovo_tbl_aiva_image_searches_ibfk_1` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE,
          CONSTRAINT `yovo_tbl_aiva_image_searches_ibfk_2` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_image_searches()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_image_searches$$

-- Table: yovo_tbl_aiva_products
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_products$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_products()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_products'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_products` (
          `id` varchar(36) NOT NULL,
          `kb_id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `shopify_product_id` bigint NOT NULL,
          `shopify_store_id` varchar(36) DEFAULT NULL,
          `title` varchar(500) NOT NULL,
          `description` text,
          `vendor` varchar(255) DEFAULT NULL,
          `product_type` varchar(255) DEFAULT NULL,
          `tags` json DEFAULT NULL,
          `price` decimal(10,2) DEFAULT NULL,
          `compare_at_price` decimal(10,2) DEFAULT NULL,
          `currency` varchar(3) DEFAULT 'PKR',
          `status` enum('active','draft','archived','deleted') DEFAULT 'active',
          `published_at` datetime DEFAULT NULL,
          `total_inventory` int DEFAULT '0',
          `average_rating` decimal(2,1) DEFAULT NULL,
          `review_count` int DEFAULT '0',
          `vector_chunk_id` varchar(36) DEFAULT NULL,
          `shopify_metadata` json DEFAULT NULL,
          `custom_metadata` json DEFAULT NULL,
          `last_synced_at` datetime DEFAULT NULL,
          `shopify_updated_at` datetime DEFAULT NULL,
          `sync_status` enum('pending','synced','error') DEFAULT 'pending',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          `embedding_status` enum('pending','completed','failed') DEFAULT 'pending',
          `embedding_generated_at` datetime DEFAULT NULL,
          PRIMARY KEY (`id`),
          UNIQUE KEY `shopify_product_id` (`shopify_product_id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_shopify_product_id` (`shopify_product_id`),
          KEY `idx_shopify_store_id` (`shopify_store_id`),
          KEY `idx_status` (`status`),
          KEY `idx_last_synced` (`last_synced_at`),
          KEY `idx_average_rating` (`average_rating`),
          KEY `idx_products_kb_status` (`kb_id`,`status`),
          KEY `idx_products_tenant_status` (`tenant_id`,`status`),
          KEY `idx_embedding_status` (`embedding_status`),
          CONSTRAINT `fk_products_store` FOREIGN KEY (`shopify_store_id`) REFERENCES `yovo_tbl_aiva_shopify_stores` (`id`) ON DELETE CASCADE,
          CONSTRAINT `yovo_tbl_aiva_products_ibfk_1` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_products' AND column_name = 'embedding_status') THEN
            ALTER TABLE `yovo_tbl_aiva_products` ADD COLUMN `embedding_status` enum('pending','completed','failed') DEFAULT 'pending' AFTER `updated_at`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_products' AND column_name = 'embedding_generated_at') THEN
            ALTER TABLE `yovo_tbl_aiva_products` ADD COLUMN `embedding_generated_at` datetime DEFAULT NULL AFTER `embedding_status`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_products()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_products$$

-- ============================================================================
-- LEVEL 4: Tables with FK to agents and other Level 3 tables
-- ============================================================================

-- Table: yovo_tbl_aiva_call_logs
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_call_logs$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_call_logs()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_call_logs'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_call_logs` (
          `id` varchar(36) NOT NULL,
          `session_id` varchar(255) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `agent_id` varchar(36) DEFAULT NULL,
          `provider` varchar(50) DEFAULT 'openai',
          `caller_id` varchar(50) DEFAULT NULL,
          `asterisk_port` int DEFAULT NULL,
          `start_time` timestamp NOT NULL,
          `end_time` timestamp NULL DEFAULT NULL,
          `duration_seconds` int DEFAULT NULL,
          `audio_input_seconds` decimal(10,3) DEFAULT NULL,
          `audio_output_seconds` decimal(10,3) DEFAULT NULL,
          `provider_audio_minutes` decimal(10,2) DEFAULT '0.00',
          `provider_metadata` json DEFAULT NULL,
          `text_input_tokens` int DEFAULT NULL,
          `text_output_tokens` int DEFAULT NULL,
          `cached_tokens` int DEFAULT NULL,
          `base_cost` decimal(10,4) DEFAULT NULL,
          `profit_amount` decimal(10,4) DEFAULT NULL,
          `final_cost` decimal(10,4) DEFAULT NULL,
          `status` enum('in_progress','completed','failed','insufficient_credits') DEFAULT 'in_progress',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `session_id` (`session_id`),
          KEY `agent_id` (`agent_id`),
          KEY `idx_session` (`session_id`),
          KEY `idx_tenant_date` (`tenant_id`,`start_time`),
          KEY `idx_status` (`status`),
          KEY `idx_provider_calls` (`provider`),
          CONSTRAINT `yovo_tbl_aiva_call_logs_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE,
          CONSTRAINT `yovo_tbl_aiva_call_logs_ibfk_2` FOREIGN KEY (`agent_id`) REFERENCES `yovo_tbl_aiva_agents` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_call_logs' AND column_name = 'provider_audio_minutes') THEN
            ALTER TABLE `yovo_tbl_aiva_call_logs` ADD COLUMN `provider_audio_minutes` decimal(10,2) DEFAULT '0.00' AFTER `audio_output_seconds`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_call_logs' AND column_name = 'provider_metadata') THEN
            ALTER TABLE `yovo_tbl_aiva_call_logs` ADD COLUMN `provider_metadata` json DEFAULT NULL AFTER `provider_audio_minutes`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_call_logs()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_call_logs$$

-- Table: yovo_tbl_aiva_chat_sessions
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_chat_sessions$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_chat_sessions()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_sessions'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_chat_sessions` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `tenant_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `agent_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `user_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `session_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
          `status` enum('active','ended','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'active',
          `start_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `end_time` timestamp NULL DEFAULT NULL,
          `total_messages` int DEFAULT '0',
          `total_cost` decimal(10,6) DEFAULT '0.000000',
          `metadata` json DEFAULT NULL COMMENT 'Session context, preferences, etc.',
          PRIMARY KEY (`id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_agent_id` (`agent_id`),
          KEY `idx_user_id` (`user_id`),
          KEY `idx_status` (`status`),
          KEY `idx_start_time` (`start_time`),
          CONSTRAINT `fk_chat_sessions_agent` FOREIGN KEY (`agent_id`) REFERENCES `yovo_tbl_aiva_agents` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_chat_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_chat_sessions()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_chat_sessions$$

-- Table: yovo_tbl_aiva_did_mappings
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_did_mappings$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_did_mappings()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_did_mappings'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_did_mappings` (
          `id` varchar(36) NOT NULL,
          `did` varchar(50) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `agent_id` varchar(36) DEFAULT NULL,
          `is_active` tinyint(1) DEFAULT '1',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `did` (`did`),
          KEY `agent_id` (`agent_id`),
          KEY `idx_did` (`did`),
          KEY `idx_tenant` (`tenant_id`),
          CONSTRAINT `yovo_tbl_aiva_did_mappings_ibfk_1` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE,
          CONSTRAINT `yovo_tbl_aiva_did_mappings_ibfk_2` FOREIGN KEY (`agent_id`) REFERENCES `yovo_tbl_aiva_agents` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_did_mappings()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_did_mappings$$

-- Table: yovo_tbl_aiva_functions
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_functions$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_functions()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_functions'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_functions` (
          `id` varchar(36) NOT NULL,
          `agent_id` varchar(36) NOT NULL,
          `name` varchar(255) NOT NULL,
          `description` text NOT NULL,
          `execution_mode` enum('sync','async') DEFAULT 'sync',
          `parameters` json NOT NULL,
          `handler_type` enum('inline','api') DEFAULT 'inline',
          `api_endpoint` varchar(500) DEFAULT NULL,
          `api_method` varchar(10) DEFAULT 'POST',
          `api_headers` json DEFAULT NULL,
          `timeout_ms` int DEFAULT '30000',
          `retries` int DEFAULT '2',
          `is_active` tinyint(1) DEFAULT '1',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `unique_function_per_agent` (`agent_id`,`name`),
          KEY `idx_agent_active` (`agent_id`,`is_active`),
          CONSTRAINT `yovo_tbl_aiva_functions_ibfk_1` FOREIGN KEY (`agent_id`) REFERENCES `yovo_tbl_aiva_agents` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_functions()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_functions$$

-- Table: yovo_tbl_aiva_product_variants
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_product_variants$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_product_variants()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_product_variants'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_product_variants` (
          `id` varchar(36) NOT NULL,
          `product_id` varchar(36) NOT NULL,
          `shopify_variant_id` bigint NOT NULL,
          `title` varchar(255) DEFAULT NULL,
          `sku` varchar(255) DEFAULT NULL,
          `barcode` varchar(255) DEFAULT NULL,
          `price` decimal(10,2) DEFAULT NULL,
          `compare_at_price` decimal(10,2) DEFAULT NULL,
          `inventory_quantity` int DEFAULT '0',
          `inventory_policy` varchar(50) DEFAULT NULL,
          `weight` decimal(10,2) DEFAULT NULL,
          `weight_unit` varchar(10) DEFAULT NULL,
          `option1` varchar(255) DEFAULT NULL,
          `option2` varchar(255) DEFAULT NULL,
          `option3` varchar(255) DEFAULT NULL,
          `available` tinyint(1) DEFAULT '1',
          `shopify_metadata` json DEFAULT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          UNIQUE KEY `shopify_variant_id` (`shopify_variant_id`),
          KEY `idx_product_id` (`product_id`),
          KEY `idx_shopify_variant_id` (`shopify_variant_id`),
          KEY `idx_sku` (`sku`),
          KEY `idx_available` (`available`),
          KEY `idx_variants_product_available` (`product_id`,`available`),
          CONSTRAINT `yovo_tbl_aiva_product_variants_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `yovo_tbl_aiva_products` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_product_variants()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_product_variants$$

-- Table: yovo_tbl_aiva_sync_jobs
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_sync_jobs$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_sync_jobs()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_sync_jobs'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_sync_jobs` (
          `id` varchar(36) NOT NULL,
          `store_id` varchar(36) NOT NULL,
          `kb_id` varchar(36) NOT NULL,
          `tenant_id` varchar(36) NOT NULL,
          `job_type` enum('full_sync','incremental_sync','manual_sync') DEFAULT 'full_sync',
          `status` enum('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
          `total_products` int DEFAULT '0',
          `processed_products` int DEFAULT '0',
          `failed_products` int DEFAULT '0',
          `total_images` int DEFAULT '0',
          `processed_images` int DEFAULT '0',
          `failed_images` int DEFAULT '0',
          `started_at` datetime DEFAULT NULL,
          `completed_at` datetime DEFAULT NULL,
          `estimated_completion_at` datetime DEFAULT NULL,
          `products_added` int DEFAULT '0',
          `products_updated` int DEFAULT '0',
          `products_deleted` int DEFAULT '0',
          `error_message` text,
          `error_details` json DEFAULT NULL,
          `metadata` json DEFAULT NULL,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_store_id` (`store_id`),
          KEY `idx_kb_id` (`kb_id`),
          KEY `idx_tenant_id` (`tenant_id`),
          KEY `idx_status` (`status`),
          KEY `idx_created_at` (`created_at`),
          KEY `idx_sync_jobs_tenant_status` (`tenant_id`,`status`),
          CONSTRAINT `yovo_tbl_aiva_sync_jobs_ibfk_1` FOREIGN KEY (`store_id`) REFERENCES `yovo_tbl_aiva_shopify_stores` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_sync_jobs()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_sync_jobs$$

-- ============================================================================
-- LEVEL 5: Tables with FK to Level 4 tables
-- ============================================================================

-- Table: yovo_tbl_aiva_chat_messages
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_chat_messages$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_chat_messages()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_chat_messages'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_chat_messages` (
          `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `session_id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `role` enum('user','assistant','system','function') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `content` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
          `content_html` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'HTML formatted content',
          `content_markdown` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'Markdown formatted content',
          `sources` json DEFAULT NULL COMMENT 'Array of source documents/chunks used',
          `images` json DEFAULT NULL COMMENT 'Array of images included in response',
          `products` json DEFAULT NULL COMMENT 'Array of products recommended',
          `function_calls` json DEFAULT NULL COMMENT 'Functions executed for this message',
          `cost` decimal(10,6) DEFAULT '0.000000',
          `cost_breakdown` json DEFAULT NULL COMMENT 'Detailed cost breakdown',
          `tokens_input` int DEFAULT NULL,
          `tokens_output` int DEFAULT NULL,
          `processing_time_ms` int DEFAULT NULL,
          `agent_transfer_requested` tinyint(1) DEFAULT '0',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_session_id` (`session_id`),
          KEY `idx_role` (`role`),
          KEY `idx_created_at` (`created_at`),
          KEY `idx_agent_transfer` (`agent_transfer_requested`,`created_at`),
          CONSTRAINT `fk_messages_session` FOREIGN KEY (`session_id`) REFERENCES `yovo_tbl_aiva_chat_sessions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'content_html') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `content_html` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'HTML formatted content' AFTER `content`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'content_markdown') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `content_markdown` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci COMMENT 'Markdown formatted content' AFTER `content_html`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'sources') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `sources` json DEFAULT NULL COMMENT 'Array of source documents/chunks used' AFTER `content_markdown`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'images') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `images` json DEFAULT NULL COMMENT 'Array of images included in response' AFTER `sources`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'products') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `products` json DEFAULT NULL COMMENT 'Array of products recommended' AFTER `images`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'function_calls') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `function_calls` json DEFAULT NULL COMMENT 'Functions executed for this message' AFTER `products`;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'yovo_tbl_aiva_chat_messages' AND column_name = 'cost_breakdown') THEN
            ALTER TABLE `yovo_tbl_aiva_chat_messages` ADD COLUMN `cost_breakdown` json DEFAULT NULL COMMENT 'Detailed cost breakdown' AFTER `cost`;
        END IF;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_chat_messages()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_chat_messages$$

-- Table: yovo_tbl_aiva_function_call_logs
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_function_call_logs$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_function_call_logs()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_function_call_logs'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_function_call_logs` (
          `id` varchar(36) NOT NULL,
          `call_log_id` varchar(36) NOT NULL,
          `function_name` varchar(255) NOT NULL,
          `arguments` json DEFAULT NULL,
          `result` json DEFAULT NULL,
          `execution_time_ms` int DEFAULT NULL,
          `status` enum('success','failed') NOT NULL,
          `error_message` text,
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_call_log` (`call_log_id`),
          KEY `idx_function` (`function_name`),
          CONSTRAINT `yovo_tbl_aiva_function_call_logs_ibfk_1` FOREIGN KEY (`call_log_id`) REFERENCES `yovo_tbl_aiva_call_logs` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_function_call_logs()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_function_call_logs$$

-- Table: yovo_tbl_aiva_product_sync_status
-- ============================================================================

DROP PROCEDURE IF EXISTS migrate_yovo_tbl_aiva_product_sync_status$$
CREATE PROCEDURE migrate_yovo_tbl_aiva_product_sync_status()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'yovo_tbl_aiva_product_sync_status'
    ) THEN
        CREATE TABLE `yovo_tbl_aiva_product_sync_status` (
          `id` varchar(36) NOT NULL,
          `job_id` varchar(36) NOT NULL,
          `product_id` varchar(36) DEFAULT NULL,
          `shopify_product_id` bigint NOT NULL,
          `status` enum('pending','processing','completed','failed','skipped') DEFAULT 'pending',
          `images_total` int DEFAULT '0',
          `images_processed` int DEFAULT '0',
          `started_at` datetime DEFAULT NULL,
          `completed_at` datetime DEFAULT NULL,
          `processing_time_ms` int DEFAULT NULL,
          `error_message` text,
          `retry_count` int DEFAULT '0',
          `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (`id`),
          KEY `idx_job_id` (`job_id`),
          KEY `idx_product_id` (`product_id`),
          KEY `idx_status` (`status`),
          KEY `idx_shopify_product_id` (`shopify_product_id`),
          CONSTRAINT `yovo_tbl_aiva_product_sync_status_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `yovo_tbl_aiva_sync_jobs` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    END IF;
END$$

CALL migrate_yovo_tbl_aiva_product_sync_status()$$
DROP PROCEDURE migrate_yovo_tbl_aiva_product_sync_status$$

DELIMITER ;

-- ============================================================================
-- Re-enable foreign key checks
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Migration Complete
-- ============================================================================