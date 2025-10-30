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
  PRIMARY KEY (`id`),
  KEY `idx_tenant_active` (`tenant_id`,`is_active`),
  KEY `idx_type` (`type`),
  KEY `idx_provider` (`provider`),
  KEY `idx_kb_id` (`kb_id`),
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
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_role` (`role`),
  KEY `idx_created_at` (`created_at`),
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
  CONSTRAINT `yovo_tbl_aiva_credit_transactions_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `yovo_tbl_aiva_tenants` (`id`) ON DELETE SET NULL
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
  `chunk_type` enum('text','table','image','faq','code') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'text',
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

/*Table structure for table `yovo_tbl_aiva_tenants` */

DROP TABLE IF EXISTS `yovo_tbl_aiva_tenants`;

CREATE TABLE `yovo_tbl_aiva_tenants` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `api_key` varchar(255) DEFAULT NULL,
  `role` enum('super_admin','admin','agent_manager','client') NOT NULL DEFAULT 'client',
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

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
