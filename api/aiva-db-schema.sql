/*
SQLyog Ultimate v13.1.1 (64 bit)
MySQL - 8.0.34 : Database - yovo_db_cc
*********************************************************************
*/

/*!40101 SET NAMES utf8 */;

/*!40101 SET SQL_MODE=''*/;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
CREATE DATABASE /*!32312 IF NOT EXISTS*/`yovo_db_cc` /*!40100 DEFAULT CHARACTER SET latin1 */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `yovo_db_cc`;

/*Table structure for table `yovo_tbl_aiva_agents` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_agents`;

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

/*Table structure for table `yovo_tbl_aiva_call_logs` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_call_logs`;

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

/*Table structure for table `yovo_tbl_aiva_chat_messages` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_chat_messages`;

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

/*Table structure for table `yovo_tbl_aiva_chat_sessions` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_chat_sessions`;

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

/*Table structure for table `yovo_tbl_aiva_credit_transactions` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_credit_transactions`;

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

/*Table structure for table `yovo_tbl_aiva_did_mappings` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_did_mappings`;

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

/*Table structure for table `yovo_tbl_aiva_document_chunks` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_document_chunks`;

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

/*Table structure for table `yovo_tbl_aiva_documents` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_documents`;

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

/*Table structure for table `yovo_tbl_aiva_function_call_logs` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_function_call_logs`;

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

/*Table structure for table `yovo_tbl_aiva_functions` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_functions`;

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

/*Table structure for table `yovo_tbl_aiva_image_searches` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_image_searches`;

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

/*Table structure for table `yovo_tbl_aiva_images` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_images`;

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

/*Table structure for table `yovo_tbl_aiva_knowledge_bases` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_knowledge_bases`;

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

/*Table structure for table `yovo_tbl_aiva_knowledge_searches` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_knowledge_searches`;

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
  KEY `idx_session_id` (`session_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_search_kb` FOREIGN KEY (`kb_id`) REFERENCES `yovo_tbl_aiva_knowledge_bases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_search_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `yovo_tbl_aiva_notification_log` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_notification_log`;

CREATE TABLE `yovo_tbl_aiva_notification_log` (
  `id` varchar(36) NOT NULL,
  `tenant_id` varchar(36) NOT NULL,
  `notification_type` enum('low_balance','daily_summary','monthly_summary','system_alert') NOT NULL,
  `recipient_email` varchar(255) NOT NULL,
  `subject` varchar(500) DEFAULT NULL,
  `status` enum('sent','failed','pending') DEFAULT 'pending',
  `error_message` text,
  `metadata` json DEFAULT NULL COMMENT 'Additional context data',
  `sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_notification_type` (`notification_type`),
  KEY `idx_status` (`status`),
  KEY `idx_sent_at` (`sent_at`),
  CONSTRAINT `fk_notification_log_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `yovo_tbl_aiva_product_images` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_product_images`;

CREATE TABLE `yovo_tbl_aiva_product_images` (
  `id` varchar(36) NOT NULL,
  `product_id` varchar(36) NOT NULL,
  `image_id` varchar(36) NOT NULL,
  `shopify_image_id` bigint DEFAULT NULL,
  `position` int DEFAULT '0',
  `alt_text` varchar(500) DEFAULT NULL,
  `variant_ids` json DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_image_id` (`image_id`),
  KEY `idx_shopify_image_id` (`shopify_image_id`),
  CONSTRAINT `yovo_tbl_aiva_product_images_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `yovo_tbl_aiva_products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `yovo_tbl_aiva_product_images_ibfk_2` FOREIGN KEY (`image_id`) REFERENCES `yovo_tbl_aiva_images` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `yovo_tbl_aiva_product_reviews` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_product_reviews`;

CREATE TABLE `yovo_tbl_aiva_product_reviews` (
  `id` varchar(36) NOT NULL,
  `product_id` varchar(36) NOT NULL,
  `source` enum('shopify','google','facebook','custom') DEFAULT 'shopify',
  `external_review_id` varchar(255) DEFAULT NULL,
  `reviewer_name` varchar(255) DEFAULT NULL,
  `rating` decimal(2,1) NOT NULL,
  `title` varchar(500) DEFAULT NULL,
  `content` text,
  `verified_purchase` tinyint(1) DEFAULT '0',
  `helpful_count` int DEFAULT '0',
  `review_date` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_product_id` (`product_id`),
  KEY `idx_rating` (`rating`),
  KEY `idx_review_date` (`review_date`),
  KEY `idx_source` (`source`),
  KEY `idx_reviews_product_rating` (`product_id`,`rating`),
  CONSTRAINT `yovo_tbl_aiva_product_reviews_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `yovo_tbl_aiva_products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

/*Table structure for table `yovo_tbl_aiva_product_sync_status` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_product_sync_status`;

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

/*Table structure for table `yovo_tbl_aiva_product_variants` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_product_variants`;

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

/*Table structure for table `yovo_tbl_aiva_products` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_products`;

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

/*Table structure for table `yovo_tbl_aiva_shopify_stores` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_shopify_stores`;

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

/*Table structure for table `yovo_tbl_aiva_sync_jobs` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_sync_jobs`;

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

/*Table structure for table `yovo_tbl_aiva_system_settings` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_system_settings`;

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

/*Table structure for table `yovo_tbl_aiva_tenant_notification_settings` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_tenant_notification_settings`;

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

/*Table structure for table `yovo_tbl_aiva_tenants` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_tenants`;

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

/*Table structure for table `yovo_tbl_aiva_user_audit_log` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_user_audit_log`;

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

/*Table structure for table `yovo_tbl_aiva_user_sessions` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_user_sessions`;

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

/*Table structure for table `yovo_tbl_aiva_users` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_users`;

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

/* Trigger structure for table `yovo_tbl_agent_journal` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_ring_no_answer` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_ring_no_answer` AFTER INSERT ON `yovo_tbl_agent_journal` FOR EACH ROW BEGIN
	IF new.event = 'RINGNOANSWER' THEN
		INSERT INTO yovo_tbl_agent_journal_archive (id, agent, queue, EVENT, DATA, start_dttime, duration, channeltype) VALUES (new.id, new.agent, new.queue, 'RINGNOANSWER', new.data, new.start_dttime, NEW.duration, new.channeltype);
	END IF;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_agent_journal` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_agent_journal_archive` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_agent_journal_archive` AFTER UPDATE ON `yovo_tbl_agent_journal` FOR EACH ROW BEGIN
	INSERT INTO yovo_tbl_agent_journal_archive (id, agent,queue,EVENT,break_id,DATA,data1,start_dttime,end_dttime,duration,created_at,channeltype) SELECT id,agent,queue,EVENT,break_id,DATA,data1,start_dttime,end_dttime,duration,created_at,channeltype FROM yovo_tbl_agent_journal WHERE id = new.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_callbacks` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_add_callback` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_add_callback` AFTER INSERT ON `yovo_tbl_callbacks` FOR EACH ROW BEGIN
	INSERT INTO yovo_tbl_user_list_association (user_id, list_id) VALUES (new.created_by, new.id);
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_callbacks` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_del_callback_numbers` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_del_callback_numbers` AFTER DELETE ON `yovo_tbl_callbacks` FOR EACH ROW BEGIN
	DELETE FROM yovo_tbl_callback_numbers WHERE list_id = old.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_customers` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_del_contact` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_del_contact` AFTER DELETE ON `yovo_tbl_customers` FOR EACH ROW BEGIN
	DELETE FROM yovo_tbl_customer_contacts WHERE customer_id = old.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_cx9_groups` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_add_cx9_group` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_add_cx9_group` AFTER INSERT ON `yovo_tbl_cx9_groups` FOR EACH ROW BEGIN
	INSERT INTO yovo_tbl_user_cx9_groups_association (group_id, user_id) VALUES (new.id, new.created_by);
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_dialers` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_add_dialer` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_add_dialer` AFTER INSERT ON `yovo_tbl_dialers` FOR EACH ROW BEGIN
	insert into yovo_tbl_user_dialer_association (dialer_id, user_id) values (new.id, new.created_by);
	INSERT INTO yovo_tbl_user_dialer_association (dialer_id, user_id) VALUES (new.id, '1');
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_dialers` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_del_dialer` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_del_dialer` AFTER DELETE ON `yovo_tbl_dialers` FOR EACH ROW BEGIN
	delete from yovo_tbl_dialer_spooler where dialer_id = old.id;
	DELETE FROM yovo_tbl_dialer_timetables WHERE dialer_id = old.id;
	DELETE FROM yovo_tbl_user_dialer_association WHERE dialer_id = old.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_groups` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_add_group` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_add_group` AFTER INSERT ON `yovo_tbl_groups` FOR EACH ROW BEGIN
	INSERT INTO yovo_tbl_user_groups_association (group_id, user_id) VALUES (new.id, new.created_by);
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_ivrs` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_tbl_ivr_add` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_tbl_ivr_add` AFTER INSERT ON `yovo_tbl_ivrs` FOR EACH ROW BEGIN
	INSERT INTO yovo_tbl_user_ivr_association (ivr_id, user_id) VALUES (new.id, new.created_by);
	INSERT INTO yovo_tbl_user_ivr_association (ivr_id, user_id) VALUES (new.id, '1');
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_queues` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_rt_queue_insert` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_rt_queue_insert` AFTER INSERT ON `yovo_tbl_queues` FOR EACH ROW BEGIN
	   INSERT INTO yovo_tbl_rt_queue_stats (queue_name,wrapuptime) VALUES (NEW.name,NEW.wrapuptime);
	   INSERT INTO yovo_tbl_user_queue_association (user_id, queue_id) VALUES ('1',new.id);
	   INSERT INTO yovo_tbl_user_queue_association (user_id, queue_id) VALUES (new.created_by,new.id);
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_queues` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_rt_queue_update` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_rt_queue_update` AFTER UPDATE ON `yovo_tbl_queues` FOR EACH ROW BEGIN
	UPDATE yovo_tbl_rt_queue_stats SET wrapuptime=NEW.rt_wrapuptime, form_id = NEW.form_id WHERE queue_name = NEW.name;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_queues` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_rt_queue_delete` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_rt_queue_delete` AFTER DELETE ON `yovo_tbl_queues` FOR EACH ROW BEGIN
	DELETE FROM yovo_tbl_rt_queue_stats WHERE queue_name=OLD.name;
	DELETE FROM yovo_tbl_user_queue_association WHERE queue_id = old.id;
	DELETE FROM yovo_tbl_queue_agent_memberships WHERE queue_id = old.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_route_inbound` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_in_route_del` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_in_route_del` AFTER DELETE ON `yovo_tbl_route_inbound` FOR EACH ROW BEGIN
	delete from yovo_tbl_extensions where in_id = OLD.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_route_outbound` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_out_route_del` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_out_route_del` AFTER DELETE ON `yovo_tbl_route_outbound` FOR EACH ROW BEGIN
	DELETE FROM yovo_tbl_extensions WHERE out_id = OLD.ID;
	DELETE FROM yovo_tbl_route_outbound_gateways WHERE route_id = old.id;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_sippeers` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_sip_update` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_sip_update` AFTER UPDATE ON `yovo_tbl_sippeers` FOR EACH ROW BEGIN
	IF NEW.category != 'trunk' THEN
	SET @agent = CONCAT ('SIP/', NEW.name,',60,tT');
	SET @exten = CONCAT ('SIP/', NEW.extension_no,',60,tT');
	SET @noop_agent = CONCAT ('Dial Internal: ',@agent);
	SET @noop_exten = CONCAT ('Dial Internal: ',@exten);
	DELETE FROM yovo_tbl_extensions WHERE ext_id LIKE new.id;
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,appdata,ext_id) VALUES ('rt-yovo-cc',NEW.name,'1','NoOp',@noop_agent,NEW.id);
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,appdata,ext_id) VALUES ('rt-yovo-cc',NEW.name,'2','Dial',@agent,NEW.id);
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,ext_id) VALUES ('rt-yovo-cc',NEW.name,'3','Hangup',NEW.id);
	
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,appdata,ext_id) VALUES ('rt-yovo-cc',NEW.extension_no,'1','NoOp',@noop_exten,NEW.id);
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,appdata,ext_id) VALUES ('rt-yovo-cc',NEW.extension_no,'2','Dial',@agent,NEW.id);
	INSERT INTO yovo_tbl_extensions (context, exten,priority,app,ext_id) VALUES ('rt-yovo-cc',NEW.extension_no,'3','Hangup',NEW.id);
    END IF;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_sippeers` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_agent_del` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_agent_del` AFTER DELETE ON `yovo_tbl_sippeers` FOR EACH ROW BEGIN
	IF old.category != 'trunk' THEN
		SET @username = old.name;
		SET @exten = old.extension_no;
		SET @agent = CONCAT('SIP/',old.name);
		DELETE FROM yovo_tbl_extensions WHERE exten = @exten;
		DELETE FROM yovo_tbl_extensions WHERE exten = @username;
		DELETE FROM yovo_tbl_queue_agent_status WHERE agentId = @agent;
		DELETE FROM yovo_tbl_outbound_status WHERE username = old.name;
	END IF;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_sms_spooler` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_update_sms` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_update_sms` AFTER UPDATE ON `yovo_tbl_sms_spooler` FOR EACH ROW BEGIN
	if (new.status = 1) then
		insert into yovo_tbl_sms_outbox (from_number, to_number, message, gateway_id, status, status_text, created_by, queue, template_id, uniqueid) values (new.from_number, new.dest, new.sms_message, new.gateway_id, new.status, new.status_data, new.created_by, new.queue, new.template_id, new.unique_id);
	end if;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_users` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_agent_stats_add` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_agent_stats_add` AFTER INSERT ON `yovo_tbl_users` FOR EACH ROW BEGIN
	if new.is_agent = '1' then
		INSERT INTO yovo_tbl_user_agent_association (user_id, agent_id) VALUES (new.created_by,NEW.id);
		INSERT INTO yovo_tbl_user_agent_association (user_id, agent_id) VALUES ('1',NEW.id);
	else
		INSERT INTO yovo_tbl_user_user_association (user_id, admin_id) VALUES (NEW.id, new.created_by);	
	end if;
    END */$$


DELIMITER ;

/* Trigger structure for table `yovo_tbl_users` */

DELIMITER $$

/*!50003 DROP TRIGGER*//*!50032 IF EXISTS */ /*!50003 `yovo_trig_agent_stats_del` */$$

/*!50003 CREATE */ /*!50017 DEFINER = 'root'@'localhost' */ /*!50003 TRIGGER `yovo_trig_agent_stats_del` AFTER DELETE ON `yovo_tbl_users` FOR EACH ROW BEGIN
	if old.is_agent = '1' then
		delete from yovo_tbl_user_agent_association where agent_id = old.id;
		DELETE FROM yovo_tbl_queue_agent_memberships WHERE agent_id = old.id;
		Delete from yovo_tbl_sippeers where id = old.sippeer_id;
	end if;
    END */$$


DELIMITER ;

/* Procedure structure for procedure `kill_other_processes` */

/*!50003 DROP PROCEDURE IF EXISTS  `kill_other_processes` */;

DELIMITER $$

/*!50003 CREATE DEFINER=`root`@`127.0.0.1` PROCEDURE `kill_other_processes`()
BEGIN
  DECLARE finished INT DEFAULT 0;
  DECLARE proc_id INT;
  DECLARE proc_id_cursor CURSOR FOR SELECT id FROM information_schema.processlist;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = 1;
  OPEN proc_id_cursor;
  proc_id_cursor_loop: LOOP
    FETCH proc_id_cursor INTO proc_id;
    IF finished = 1 THEN 
      LEAVE proc_id_cursor_loop;
    END IF;
    IF proc_id <> CONNECTION_ID() THEN
      KILL proc_id;
    END IF;
  END LOOP proc_id_cursor_loop;
  CLOSE proc_id_cursor;
END */$$
DELIMITER ;

/*Table structure for table `agent_summary` */

DROP TABLE IF EXISTS `agent_summary`;

/*!50001 DROP VIEW IF EXISTS `agent_summary` */;
/*!50001 DROP TABLE IF EXISTS `agent_summary` */;

/*!50001 CREATE TABLE  `agent_summary`(
 `created_at` timestamp ,
 `agent_name` varchar(101) ,
 `queue_name` varchar(128) ,
 `login_time` decimal(32,0) ,
 `break_time` decimal(32,0) ,
 `idle_time` decimal(32,0) ,
 `notready_time` decimal(32,0) ,
 `oncall_time` decimal(32,0) ,
 `wrapup_time` decimal(32,0) ,
 `total_inbound` decimal(23,0) ,
 `total_abandon` decimal(23,0) ,
 `total_outbound` decimal(23,0) 
)*/;

/*Table structure for table `yovo_tbl_cdrs_view` */

DROP TABLE IF EXISTS `yovo_tbl_cdrs_view`;

/*!50001 DROP VIEW IF EXISTS `yovo_tbl_cdrs_view` */;
/*!50001 DROP TABLE IF EXISTS `yovo_tbl_cdrs_view` */;

/*!50001 CREATE TABLE  `yovo_tbl_cdrs_view`(
 `cdr_id` int unsigned ,
 `calldate` datetime ,
 `clid` varchar(80) ,
 `src` varchar(80) ,
 `dst` varchar(80) ,
 `lastapp` varchar(80) ,
 `lastdata` varchar(80) ,
 `duration` int ,
 `call_status` varchar(45) ,
 `call_type` varchar(8) ,
 `callid` varchar(32) ,
 `gateway` varchar(128) ,
 `recording_file_name` varchar(100) 
)*/;

/*Table structure for table `yovo_tbl_queue_calls_cdrs` */

DROP TABLE IF EXISTS `yovo_tbl_queue_calls_cdrs`;

/*!50001 DROP VIEW IF EXISTS `yovo_tbl_queue_calls_cdrs` */;
/*!50001 DROP TABLE IF EXISTS `yovo_tbl_queue_calls_cdrs` */;

/*!50001 CREATE TABLE  `yovo_tbl_queue_calls_cdrs`(
 `cdr_id` int ,
 `call_started` timestamp ,
 `did` varchar(50) ,
 `caller_id` varchar(150) ,
 `cust_name` varchar(101) ,
 `campaign` varchar(150) ,
 `event` varchar(32) ,
 `queue` varchar(128) ,
 `agent_name` varchar(101) ,
 `sip_name` varchar(100) ,
 `queue_holdtime` int ,
 `ring_time` int ,
 `position` int ,
 `orig_position` int ,
 `call_holdtime` int ,
 `call_duration` int ,
 `in_wrapup` int ,
 `wrapup_start` varchar(50) ,
 `wrapup_end` varchar(50) ,
 `call_wrapuptime` int ,
 `queue_in` varchar(50) ,
 `queue_end` varchar(50) ,
 `connect_start` varchar(50) ,
 `connect_end` varchar(50) ,
 `abandon_reason` varchar(50) ,
 `abandon_dttime` varchar(50) ,
 `key_pressed` int ,
 `ivr_menus` text ,
 `ivr_keys` varchar(100) ,
 `work_codes` text ,
 `transferred_to` varchar(50) ,
 `transfertype` enum('blind','attended') ,
 `transfer_dttime` varchar(50) ,
 `supervisor_feedback` int ,
 `customer_feedback` int ,
 `form` int ,
 `unique_id` varchar(50) ,
 `recording_file_name` varchar(100) ,
 `created_year` varchar(4) ,
 `created_month` varchar(2) ,
 `created_day` varchar(2) ,
 `created_hour` varchar(2) ,
 `created_minutes` varchar(2) ,
 `dialer_call` int 
)*/;

/*Table structure for table `leads_general_report_leads_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_view`(
 `leadId` int ,
 `Lead Number` bigint ,
 `Subject` varchar(255) ,
 `Open` varchar(5) ,
 `Close` varchar(5) 
)*/;

/*Table structure for table `leads_general_report_lead_notes_view` */

DROP TABLE IF EXISTS `leads_general_report_lead_notes_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_lead_notes_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_lead_notes_view` */;

/*!50001 CREATE TABLE  `leads_general_report_lead_notes_view`(
 `leadId` int ,
 `Notes Taken` bigint 
)*/;

/*Table structure for table `leads_general_report_leads_activities_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_activities_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_activities_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_activities_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_activities_view`(
 `leadId` int ,
 `Lead Activities` bigint 
)*/;

/*Table structure for table `leads_general_report_leads_manual_activities_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_manual_activities_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_manual_activities_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_manual_activities_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_manual_activities_view`(
 `leadId` int ,
 `Lead Manual Activities` bigint ,
 `Follow-up on Lead` decimal(23,0) ,
 `Meetings on Lead` decimal(23,0) ,
 `SMS on Lead` decimal(23,0) 
)*/;

/*Table structure for table `leads_general_report_leads_emails_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_emails_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_emails_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_emails_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_emails_view`(
 `leadId` int ,
 `Emails Sent` decimal(23,0) ,
 `Emails Replies` decimal(23,0) 
)*/;

/*Table structure for table `leads_general_report_leads_call_logs_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_call_logs_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_call_logs_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_call_logs_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_call_logs_view`(
 `leadId` int ,
 `Calls made on Lead` decimal(23,0) ,
 `Answered Calls made on Lead` decimal(23,0) 
)*/;

/*Table structure for table `tickets_general_report_tickets_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_view`(
 `ticketId` int ,
 `Ticket Number` bigint ,
 `Subject` varchar(255) ,
 `Open` varchar(5) ,
 `Close` varchar(5) ,
 `First Response SLA` decimal(23,0) ,
 `Resolution SLA` decimal(23,0) ,
 `SLA Breach` decimal(23,0) 
)*/;

/*Table structure for table `tickets_general_report_tickets_notes_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_notes_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_notes_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_notes_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_notes_view`(
 `ticketId` int ,
 `Notes Taken` bigint 
)*/;

/*Table structure for table `tickets_general_report_tickets_activities_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_activities_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_activities_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_activities_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_activities_view`(
 `ticketId` int ,
 `Ticket Activities` bigint 
)*/;

/*Table structure for table `tickets_general_report_tickets_manual_activities_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_manual_activities_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_manual_activities_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_manual_activities_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_manual_activities_view`(
 `ticketId` int ,
 `Ticket Manual Activities` bigint ,
 `Follow-up on Ticket` decimal(23,0) ,
 `Meetings on Ticket` decimal(23,0) ,
 `SMS on Ticket` decimal(23,0) 
)*/;

/*Table structure for table `tickets_general_report_tickets_emails_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_emails_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_emails_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_emails_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_emails_view`(
 `ticketId` int ,
 `Emails Sent` decimal(23,0) ,
 `Emails Replies` decimal(23,0) 
)*/;

/*Table structure for table `tickets_general_report_tickets_call_logs_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_call_logs_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_call_logs_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_call_logs_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_call_logs_view`(
 `ticketId` int ,
 `Calls made on Ticket` decimal(23,0) ,
 `Answered Calls made on Ticket` decimal(23,0) 
)*/;

/*Table structure for table `leads_general_report_lead_deal_size_product_view` */

DROP TABLE IF EXISTS `leads_general_report_lead_deal_size_product_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_lead_deal_size_product_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_lead_deal_size_product_view` */;

/*!50001 CREATE TABLE  `leads_general_report_lead_deal_size_product_view`(
 `leadId` int ,
 `Deal Size` bigint ,
 `Product` varchar(255) 
)*/;

/*Table structure for table `tickets_general_report_tickets_updated_emails_view` */

DROP TABLE IF EXISTS `tickets_general_report_tickets_updated_emails_view`;

/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_updated_emails_view` */;
/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_updated_emails_view` */;

/*!50001 CREATE TABLE  `tickets_general_report_tickets_updated_emails_view`(
 `ticketId` int ,
 `Emails Sent` decimal(23,0) ,
 `Emails Replies` decimal(23,0) ,
 `Emails Forward` decimal(23,0) 
)*/;

/*Table structure for table `leads_general_report_leads_updated_emails_view` */

DROP TABLE IF EXISTS `leads_general_report_leads_updated_emails_view`;

/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_updated_emails_view` */;
/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_updated_emails_view` */;

/*!50001 CREATE TABLE  `leads_general_report_leads_updated_emails_view`(
 `leadId` int ,
 `Emails Sent` decimal(23,0) ,
 `Emails Replies` decimal(23,0) ,
 `Emails Forward` decimal(23,0) 
)*/;

/*View structure for view agent_summary */

/*!50001 DROP TABLE IF EXISTS `agent_summary` */;
/*!50001 DROP VIEW IF EXISTS `agent_summary` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `agent_summary` AS select `aj`.`created_at` AS `created_at`,concat_ws(' ',`u`.`first_name`,`u`.`last_name`) AS `agent_name`,`q`.`name` AS `queue_name`,sum((case when (`aj`.`event` = 'LOGIN') then `aj`.`duration` else 0 end)) AS `login_time`,sum((case when (`aj`.`event` = 'PAUSE') then `aj`.`duration` else 0 end)) AS `break_time`,sum((case when (`aj`.`event` = 'IDLE-TIME') then `aj`.`duration` else 0 end)) AS `idle_time`,sum((case when (`aj`.`event` = 'NOTREADY') then `aj`.`duration` else 0 end)) AS `notready_time`,sum((case when (`aj`.`event` = 'ONCALL') then `aj`.`duration` else 0 end)) AS `oncall_time`,sum((case when (`aj`.`event` = 'WRAPUP') then `aj`.`duration` else 0 end)) AS `wrapup_time`,sum((case when (`aj`.`event` = 'ONCALL') then 1 else 0 end)) AS `total_inbound`,sum((case when (`aj`.`event` = 'RINGNOANSWER') then 1 else 0 end)) AS `total_abandon`,sum((case when (`aj`.`event` = 'OUTBOUNDCALL') then 1 else 0 end)) AS `total_outbound` from ((`yovo_tbl_agent_journal` `aj` join `yovo_tbl_users` `u` on((`aj`.`agent_id` = `u`.`id`))) left join `yovo_tbl_queues` `q` on((`aj`.`queue_id` = `q`.`id`))) group by `aj`.`agent_id`,`aj`.`queue_id` order by `aj`.`id` desc */;

/*View structure for view yovo_tbl_cdrs_view */

/*!50001 DROP TABLE IF EXISTS `yovo_tbl_cdrs_view` */;
/*!50001 DROP VIEW IF EXISTS `yovo_tbl_cdrs_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `yovo_tbl_cdrs_view` AS select `c`.`id` AS `cdr_id`,`c`.`calldate` AS `calldate`,`c`.`clid` AS `clid`,`c`.`src` AS `src`,`c`.`dst` AS `dst`,`c`.`lastapp` AS `lastapp`,`c`.`lastdata` AS `lastdata`,`c`.`billsec` AS `duration`,`c`.`disposition` AS `call_status`,(case when (`c`.`dcontext` = 'rt-yovo-trunk') then 'Incoming' else 'Outgoing' end) AS `call_type`,`c`.`uniqueid` AS `callid`,`cd`.`name` AS `gateway`,`c`.`recording_file_name` AS `recording_file_name` from (`yovo_tbl_cdrs` `c` left join `yovo_tbl_sippeers` `cd` on((`c`.`gateway_id` = `cd`.`id`))) order by `c`.`calldate` desc */;

/*View structure for view yovo_tbl_queue_calls_cdrs */

/*!50001 DROP TABLE IF EXISTS `yovo_tbl_queue_calls_cdrs` */;
/*!50001 DROP VIEW IF EXISTS `yovo_tbl_queue_calls_cdrs` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `yovo_tbl_queue_calls_cdrs` AS select `qcs`.`id` AS `cdr_id`,`qcs`.`created_at` AS `call_started`,`qcs`.`extension` AS `did`,`qcs`.`caller_id` AS `caller_id`,concat_ws(' ',`cc`.`first_name`,`cc`.`last_name`) AS `cust_name`,`cp`.`name` AS `campaign`,(case when (`qcs`.`event` = 'ABANDON') then 'Abandoned' when (`qcs`.`event` = 'COMPLETECALLER') then 'Hung up by Caller' when (`qcs`.`event` = 'COMPLETEAGENT') then 'Hung up by Agent' when (`qcs`.`event` = 'TRANSFER') then 'Call Transfered' when (`qcs`.`event` in ('IVRSTART','IVRDTMF','IVRHANGUP')) then 'IVR Hangup' else `qcs`.`event` end) AS `event`,`qcs`.`queue` AS `queue`,concat_ws(' ',`u`.`first_name`,`u`.`last_name`) AS `agent_name`,`u`.`sip_interface` AS `sip_name`,`qcs`.`queue_holdtime` AS `queue_holdtime`,`qcs`.`ring_time` AS `ring_time`,`qcs`.`position` AS `position`,`qcs`.`orig_position` AS `orig_position`,`qcs`.`call_holdtime` AS `call_holdtime`,`qcs`.`call_duration` AS `call_duration`,`qcs`.`in_wrapup` AS `in_wrapup`,`qcs`.`wrapup_start` AS `wrapup_start`,`qcs`.`wrapup_end` AS `wrapup_end`,`qcs`.`call_wrapuptime` AS `call_wrapuptime`,`qcs`.`in_queue_dttime` AS `queue_in`,`qcs`.`connect_dttime` AS `queue_end`,`qcs`.`connect_dttime` AS `connect_start`,`qcs`.`completed_dttime` AS `connect_end`,`qcs`.`abandon_reason` AS `abandon_reason`,`qcs`.`abandon_dttime` AS `abandon_dttime`,`qcs`.`key_pressed` AS `key_pressed`,`qcs`.`ivr_menus` AS `ivr_menus`,`qcs`.`ivr_keys` AS `ivr_keys`,(select group_concat(`wc`.`name` order by `wc`.`name` ASC separator ', ') from (`yovo_tbl_work_codes` `wc` join `yovo_tbl_call_work_codes` `cwc` on((`cwc`.`work_code_id` = `wc`.`id`))) where (`cwc`.`uniqueid` = `qcs`.`unique_id`)) AS `work_codes`,`qcs`.`transferred_to` AS `transferred_to`,`qcs`.`transfertype` AS `transfertype`,`qcs`.`transfer_dttime` AS `transfer_dttime`,`qcs`.`supervisor_feedback` AS `supervisor_feedback`,`qcs`.`customer_feedback` AS `customer_feedback`,exists(select distinct `yovo_tbl_form_data`.`unique_id` from `yovo_tbl_form_data` where (`yovo_tbl_form_data`.`unique_id` = `qcs`.`unique_id`)) AS `form`,`qcs`.`unique_id` AS `unique_id`,`cdr`.`recording_file_name` AS `recording_file_name`,`qcs`.`created_year` AS `created_year`,`qcs`.`created_month` AS `created_month`,`qcs`.`created_day` AS `created_day`,`qcs`.`created_hour` AS `created_hour`,`qcs`.`created_minutes` AS `created_minutes`,`qcs`.`dialer_call` AS `dialer_call` from ((((`yovo_tbl_queue_call_logs` `qcs` left join `yovo_tbl_customers` `cc` on((`cc`.`id` = `qcs`.`contact_id`))) join `yovo_tbl_ivrs` `cp` on((`cp`.`id` = `qcs`.`campaign_id`))) left join `yovo_tbl_users` `u` on((`u`.`sip_interface` = convert(`qcs`.`agent` using utf8mb3)))) left join `yovo_tbl_cdrs` `cdr` on((`cdr`.`uniqueid` = `qcs`.`unique_id`))) where (`qcs`.`dialer_call` <> 1) */;

/*View structure for view leads_general_report_leads_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,`yovo_tbl_leads`.`leadNumber` AS `Lead Number`,`yovo_tbl_leads`.`subject` AS `Subject`,ifnull((case when (`yovo_tbl_leads`.`status` = 1) then 'Yes' end),'-----') AS `Open`,ifnull((case when (`yovo_tbl_leads`.`status` = 0) then 'Yes' end),'-----') AS `Close` from `yovo_tbl_leads` group by `yovo_tbl_leads`.`id` */;

/*View structure for view leads_general_report_lead_notes_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_lead_notes_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_lead_notes_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_lead_notes_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,count(`leadNotes`.`id`) AS `Notes Taken` from (`yovo_tbl_leads` left join `yovo_tbl_lead_notes` `leadNotes` on((`yovo_tbl_leads`.`id` = `leadNotes`.`leadId`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view leads_general_report_leads_activities_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_activities_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_activities_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_activities_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,count(`leadActivities`.`id`) AS `Lead Activities` from (`yovo_tbl_leads` left join `yovo_tbl_lead_activities` `leadActivities` on((`yovo_tbl_leads`.`id` = `leadActivities`.`leadId`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view leads_general_report_leads_manual_activities_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_manual_activities_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_manual_activities_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_manual_activities_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,count(`leadManualActivities`.`id`) AS `Lead Manual Activities`,sum((case when (lower(`leadManualActivities`.`activitytype`) like '%followup%') then 1 else 0 end)) AS `Follow-up on Lead`,sum((case when (lower(`leadManualActivities`.`activitytype`) like '%meetings%') then 1 else 0 end)) AS `Meetings on Lead`,sum((case when (lower(`leadManualActivities`.`activitytype`) like '%sms%') then 1 else 0 end)) AS `SMS on Lead` from (`yovo_tbl_leads` left join `yovo_tbl_lead_manual_activities` `leadManualActivities` on((`yovo_tbl_leads`.`id` = `leadManualActivities`.`leadId`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view leads_general_report_leads_emails_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_emails_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_emails_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_emails_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,sum((case when (`leadEmails`.`direction` = 'outgoing') then 1 else 0 end)) AS `Emails Sent`,sum((case when (`leadEmails`.`isReply` = 1) then 1 else 0 end)) AS `Emails Replies` from (`yovo_tbl_leads` left join `yovo_tbl_lead_emails` `leadEmails` on((`yovo_tbl_leads`.`id` = `leadEmails`.`leadId`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view leads_general_report_leads_call_logs_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_call_logs_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_call_logs_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_call_logs_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,sum((case when (`leadInteraction->leadInteractionLogs`.`connected` = 1) then 1 else 0 end)) AS `Calls made on Lead`,sum((case when (`leadInteraction->leadInteractionLogs`.`call_duration` = 0) then 1 else 0 end)) AS `Answered Calls made on Lead` from ((`yovo_tbl_leads` left join `intelli_tbl_interaction_leads` `leadInteraction` on((`yovo_tbl_leads`.`leadNumber` = `leadInteraction`.`lead_id`))) left join `yovo_tbl_queue_call_logs` `leadInteraction->leadInteractionLogs` on((`leadInteraction`.`interaction_id` = `leadInteraction->leadInteractionLogs`.`id`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view tickets_general_report_tickets_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,`yovo_tbl_tickets_info`.`ticketNumber` AS `Ticket Number`,`yovo_tbl_tickets_info`.`subject` AS `Subject`,ifnull((case when (`yovo_tbl_tickets_info`.`status` = 1) then 'Yes' end),'-----') AS `Open`,ifnull((case when (`yovo_tbl_tickets_info`.`status` = 0) then 'Yes' end),'-----') AS `Close`,sum((case when (`yovo_tbl_tickets_info`.`frSla` = 1) then 1 else 0 end)) AS `First Response SLA`,sum((case when (`yovo_tbl_tickets_info`.`rSla` = 1) then 1 else 0 end)) AS `Resolution SLA`,sum((case when (`yovo_tbl_tickets_info`.`slaBreach` = 1) then 1 else 0 end)) AS `SLA Breach` from `yovo_tbl_tickets_info` group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view tickets_general_report_tickets_notes_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_notes_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_notes_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_notes_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,count(`ticketNotes`.`id`) AS `Notes Taken` from (`yovo_tbl_tickets_info` left join `yovo_tbl_ticket_notes` `ticketNotes` on((`yovo_tbl_tickets_info`.`id` = `ticketNotes`.`ticketId`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view tickets_general_report_tickets_activities_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_activities_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_activities_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_activities_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,count(`ticketActivities`.`id`) AS `Ticket Activities` from (`yovo_tbl_tickets_info` left join `yovo_tbl_ticket_activities` `ticketActivities` on((`yovo_tbl_tickets_info`.`id` = `ticketActivities`.`ticketId`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view tickets_general_report_tickets_manual_activities_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_manual_activities_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_manual_activities_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_manual_activities_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,count(`ticketManualActivities`.`id`) AS `Ticket Manual Activities`,sum((case when (lower(`ticketManualActivities`.`activityType`) like '%followup%') then 1 else 0 end)) AS `Follow-up on Ticket`,sum((case when (lower(`ticketManualActivities`.`activityType`) like '%meetings%') then 1 else 0 end)) AS `Meetings on Ticket`,sum((case when (lower(`ticketManualActivities`.`activityType`) like '%sms%') then 1 else 0 end)) AS `SMS on Ticket` from (`yovo_tbl_tickets_info` left join `yovo_tbl_ticket_manual_activities` `ticketManualActivities` on((`yovo_tbl_tickets_info`.`id` = `ticketManualActivities`.`ticketId`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view tickets_general_report_tickets_emails_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_emails_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_emails_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_emails_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,sum((case when (`ticketEmails`.`direction` = 'outgoing') then 1 else 0 end)) AS `Emails Sent`,sum((case when (`ticketEmails`.`isReply` = 1) then 1 else 0 end)) AS `Emails Replies` from (`yovo_tbl_tickets_info` left join `yovo_tbl_ticket_emails` `ticketEmails` on((`yovo_tbl_tickets_info`.`id` = `ticketEmails`.`ticketId`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view tickets_general_report_tickets_call_logs_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_call_logs_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_call_logs_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_call_logs_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,sum((case when (`ticketInteraction->ticketInteractionLogs`.`connected` = 1) then 1 else 0 end)) AS `Calls made on Ticket`,sum((case when (`ticketInteraction->ticketInteractionLogs`.`call_duration` = 0) then 1 else 0 end)) AS `Answered Calls made on Ticket` from ((`yovo_tbl_tickets_info` left join `intelli_tbl_interaction_ticket` `ticketInteraction` on((`yovo_tbl_tickets_info`.`ticketNumber` = `ticketInteraction`.`ticket_id`))) left join `yovo_tbl_queue_call_logs` `ticketInteraction->ticketInteractionLogs` on((`ticketInteraction`.`interaction_id` = `ticketInteraction->ticketInteractionLogs`.`id`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view leads_general_report_lead_deal_size_product_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_lead_deal_size_product_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_lead_deal_size_product_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_lead_deal_size_product_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,`yovo_tbl_leads`.`amount` AS `Deal Size`,`products`.`name` AS `Product` from (`yovo_tbl_leads` left join `yovo_tbl_products_services` `products` on((`yovo_tbl_leads`.`product` = `products`.`id`))) group by `yovo_tbl_leads`.`id` */;

/*View structure for view tickets_general_report_tickets_updated_emails_view */

/*!50001 DROP TABLE IF EXISTS `tickets_general_report_tickets_updated_emails_view` */;
/*!50001 DROP VIEW IF EXISTS `tickets_general_report_tickets_updated_emails_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `tickets_general_report_tickets_updated_emails_view` AS select `yovo_tbl_tickets_info`.`id` AS `ticketId`,sum((case when ((`ticketEmails`.`direction` = 'outgoing') and (`ticketEmails`.`isReply` = 0) and (`ticketEmails`.`isForward` = 0) and (`ticketEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Sent`,sum((case when ((`ticketEmails`.`direction` = 'outgoing') and (`ticketEmails`.`isReply` = 1) and (`ticketEmails`.`isForward` = 0) and (`ticketEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Replies`,sum((case when ((`ticketEmails`.`direction` = 'outgoing') and (`ticketEmails`.`isReply` = 0) and (`ticketEmails`.`isForward` = 1) and (`ticketEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Forward` from (`yovo_tbl_tickets_info` left join `yovo_tbl_ticket_emails` `ticketEmails` on((`yovo_tbl_tickets_info`.`id` = `ticketEmails`.`ticketId`))) group by `yovo_tbl_tickets_info`.`id` */;

/*View structure for view leads_general_report_leads_updated_emails_view */

/*!50001 DROP TABLE IF EXISTS `leads_general_report_leads_updated_emails_view` */;
/*!50001 DROP VIEW IF EXISTS `leads_general_report_leads_updated_emails_view` */;

/*!50001 CREATE ALGORITHM=UNDEFINED DEFINER=`intellicon`@`localhost` SQL SECURITY DEFINER VIEW `leads_general_report_leads_updated_emails_view` AS select `yovo_tbl_leads`.`id` AS `leadId`,sum((case when ((`leadEmails`.`direction` = 'outgoing') and (`leadEmails`.`isReply` = 0) and (`leadEmails`.`isForward` = 0) and (`leadEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Sent`,sum((case when ((`leadEmails`.`direction` = 'outgoing') and (`leadEmails`.`isReply` = 1) and (`leadEmails`.`isForward` = 0) and (`leadEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Replies`,sum((case when ((`leadEmails`.`direction` = 'outgoing') and (`leadEmails`.`isReply` = 0) and (`leadEmails`.`isForward` = 1) and (`leadEmails`.`isDraft` = 0)) then 1 else 0 end)) AS `Emails Forward` from (`yovo_tbl_leads` left join `yovo_tbl_lead_emails` `leadEmails` on((`yovo_tbl_leads`.`id` = `leadEmails`.`leadId`))) group by `yovo_tbl_leads`.`id` */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
