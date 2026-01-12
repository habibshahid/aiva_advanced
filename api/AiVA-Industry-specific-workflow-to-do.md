# AIVA Industry-Wide Platform Implementation Specification

> **Document Version:** 1.0
> **Created:** January 12, 2026
> **Purpose:** Complete specification for implementing industry-agnostic AIVA platform
> **Usage:** Feed this document to Claude when ready to implement

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Target Architecture](#3-target-architecture)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Code Changes Required](#5-code-changes-required)
6. [Industry Configurations](#6-industry-configurations)
7. [Implementation Phases](#7-implementation-phases)
8. [Migration Strategy](#8-migration-strategy)
9. [Testing Checklist](#9-testing-checklist)
10. [Rollback Plan](#10-rollback-plan)

---

## 1. Executive Summary

### Current State
AIVA is a sophisticated AI chatbot platform currently optimized for **e-commerce (Shopify)** with:
- Smart 3-tier model routing (simple/medium/complex)
- Complaint state machine with image collection
- Order screenshot detection via GPT-4o vision
- Pre-LLM intent detection for complaints
- Hallucination prevention for order data
- 48-hour policy enforcement

### Goal
Transform AIVA into an **industry-agnostic platform** where:
- Industry-specific logic is configuration-driven, not hardcoded
- New industries can be added via database configuration
- Existing e-commerce functionality remains intact
- Non-Shopify agents get industry-appropriate workflows

### Key Principle
**Replace hardcoded e-commerce logic with configurable industry templates while maintaining backward compatibility.**

---

## 2. Current Architecture

### 2.1 File Structure
```
/src/services/ChatService.js  (Main file - ~8700 lines)
```

### 2.2 E-commerce Specific Code Locations

| Line Range | Feature | What It Does |
|------------|---------|--------------|
| 2723-2826 | Pre-LLM Complaint Detection | Detects complaint keywords before LLM call |
| 2856-2920 | Complaint State Injection | Injects complaint context into LLM prompt |
| 3030-3130 | Complaint Flow Overrides | Prevents repeated order checks, forces ticket creation |
| 3267-3320 | Ticket Creation Handling | Clears complaint state after ticket |
| 7490-7700 | Image Intent Classification | Detects order screenshots vs complaint images |
| 7969-8150 | Complaint Image Handler | Processes complaint evidence images |

### 2.3 E-commerce Detection Pattern
```javascript
const isEcommerceAgent = agent.shopify_store_url && agent.shopify_access_token;

if (isEcommerceAgent) {
    // E-commerce specific logic
}
```

### 2.4 Hardcoded Elements

#### Complaint Triggers (Lines 2769-2780)
```javascript
const complaintTriggers = [
    'complaint', 'problem', 'issue', 'wrong', 'damaged', 'broken', 'defective',
    'not working', 'bad quality', 'poor quality', 'torn', 'missing',
    'wrong color', 'wrong size', 'different', 'not what i ordered',
    'galat', 'kharab', 'toot', 'masla', 'shikayat', 'problem hai',
    'received a different', 'got a different', 'sent wrong',
    'ordered blue', 'ordered red', 'ordered black', 'ordered white',
    // ... more hardcoded
];
```

#### Complaint Types (Lines 2789-2810)
```javascript
let complaintType = 'UNKNOWN';
if (msgLower.includes('wrong color') || ...) complaintType = 'COLOR_ISSUE';
else if (msgLower.includes('wrong size') || ...) complaintType = 'WRONG_SIZE';
else if (msgLower.includes('damaged') || ...) complaintType = 'DAMAGED';
// ... hardcoded type detection
```

#### Policies (Various)
```javascript
// 48-hour window - hardcoded
const daysSinceDelivery = /* calculation */;
if (daysSinceDelivery > 2) { /* outside policy */ }

// Images required for certain types - hardcoded
awaiting_images: complaintType !== 'MISSING_ITEM'
```

---

## 3. Target Architecture

### 3.1 Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────────────┐
│                              AIVA PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    INDUSTRY CONFIG LAYER                         │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │                                                                   │    │
│  │   ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │    │
│  │   │ E-commerce│ │ Healthcare│ │  Banking  │ │  General  │       │    │
│  │   │           │ │           │ │           │ │           │       │    │
│  │   │ - Orders  │ │ - Appts   │ │ - Txns    │ │ - Tickets │       │    │
│  │   │ - Returns │ │ - Rx      │ │ - Cards   │ │ - Inquiries│      │    │
│  │   │ - Complnts│ │ - Labs    │ │ - Loans   │ │ - Feedback│       │    │
│  │   └───────────┘ └───────────┘ └───────────┘ └───────────┘       │    │
│  │                                                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    CORE ENGINE (Unchanged)                        │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │  Smart Routing │ Session Mgmt │ Function Exec │ KB Search       │    │
│  │  Cost Tracking │ Multi-channel│ LLM Providers │ Lock Manager    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    WORKFLOW ENGINE (New)                          │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │  State Machine │ Intent Detection │ Policy Engine │ Templates   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    INTEGRATIONS (Pluggable)                       │    │
│  ├─────────────────────────────────────────────────────────────────┤    │
│  │  Shopify │ WooCommerce │ Salesforce │ Custom APIs │ Webhooks    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Key Design Decisions

1. **Configuration over Code**: All industry-specific triggers, states, and policies stored in database
2. **Backward Compatible**: Existing e-commerce agents continue working without changes
3. **Graceful Fallback**: Unknown industries fall back to 'general' config
4. **Override Support**: Agents can override industry defaults with custom config

---

## 4. Database Schema Changes

### 4.1 New Table: Industry Configurations

```sql
-- ============================================
-- INDUSTRY CONFIGURATIONS TABLE
-- ============================================
CREATE TABLE yovo_tbl_aiva_industry_configs (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    
    -- Identity
    industry_code VARCHAR(50) NOT NULL UNIQUE,  -- 'ecommerce', 'healthcare', 'banking', 'realestate', 'telecom', 'general'
    name VARCHAR(100) NOT NULL,                  -- 'E-commerce / Retail'
    description TEXT,
    icon VARCHAR(50),                            -- 'shopping-cart', 'hospital', 'bank'
    
    -- Intent Detection Configuration
    intent_triggers JSON NOT NULL,
    /*
    {
        "COMPLAINT_NEW": ["damaged", "broken", "wrong color", ...],
        "ORDER_STATUS": ["order status", "where is my order", ...],
        "APPOINTMENT_BOOKING": ["book appointment", "schedule", ...]
    }
    */
    
    intent_types JSON NOT NULL,
    /*
    ["GREETING", "ORDER_STATUS", "COMPLAINT_NEW", "COMPLAINT_CONTINUE", ...]
    */
    
    -- Workflow State Machine
    workflow_definitions JSON NOT NULL,
    /*
    {
        "complaint": {
            "states": ["NEW", "AWAITING_ORDER", "AWAITING_IMAGES", "TICKET_CREATED", "RESOLVED"],
            "initial_state": "NEW",
            "final_states": ["RESOLVED", "CANCELLED"],
            "transitions": {
                "NEW": ["AWAITING_ORDER", "AWAITING_IMAGES"],
                "AWAITING_ORDER": ["AWAITING_IMAGES", "TICKET_CREATED"],
                "AWAITING_IMAGES": ["TICKET_CREATED"],
                "TICKET_CREATED": ["RESOLVED"]
            },
            "required_fields": {
                "TICKET_CREATED": ["order_number", "complaint_type", "customer_phone"]
            },
            "optional_fields": {
                "AWAITING_IMAGES": ["images"]
            }
        },
        "inquiry": {
            "states": ["NEW", "IN_PROGRESS", "RESOLVED"],
            ...
        }
    }
    */
    
    -- Business Policies
    policies JSON NOT NULL,
    /*
    {
        "complaint_window_hours": 48,
        "return_window_days": 7,
        "require_images_for": ["DAMAGED", "COLOR_ISSUE", "QUALITY_ISSUE"],
        "skip_images_for": ["MISSING_ITEM", "NOT_RECEIVED"],
        "auto_escalate_after_turns": 10,
        "working_hours": {"start": "09:00", "end": "18:00", "timezone": "Asia/Karachi"}
    }
    */
    
    -- Response Templates (Multi-language)
    response_templates JSON NOT NULL,
    /*
    {
        "ask_order_number": {
            "en": "Please provide your Order ID, email, or phone number.",
            "ur": "Please apna Order ID, email, ya phone number share karein."
        },
        "ask_images": {
            "en": "Please share pictures of the {complaint_type} so we can process your complaint.",
            "ur": "Please {complaint_type} ki tasveerain share karein."
        },
        "ticket_created": {
            "en": "Your ticket #{ticket_number} has been created. Our team will contact you shortly.",
            "ur": "Aapka ticket #{ticket_number} ban gaya hai. Hamari team jald contact karegi."
        }
    }
    */
    
    -- Image Classification Rules
    image_classification JSON,
    /*
    {
        "complaint_evidence": {
            "triggers": ["damaged", "broken", "share picture", "tasveer"],
            "requires_active_workflow": true
        },
        "document_scan": {
            "triggers": ["order screenshot", "invoice", "receipt"],
            "action": "extract_order_info"
        },
        "product_search": {
            "triggers": ["find similar", "like this", "dikhao"],
            "action": "search_products"
        }
    }
    */
    
    -- Hallucination Prevention Rules
    hallucination_rules JSON,
    /*
    {
        "data_fields": ["order_number", "tracking_id", "delivery_date", "balance", "transaction_id"],
        "require_function_call": true,
        "function_mapping": {
            "order_number": "check_order_status",
            "balance": "check_balance",
            "transaction_id": "check_transaction"
        }
    }
    */
    
    -- Metadata
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,  -- Only one can be default (general)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by VARCHAR(36),
    
    INDEX idx_industry_code (industry_code),
    INDEX idx_is_active (is_active)
);

-- ============================================
-- INSERT DEFAULT CONFIGURATIONS
-- ============================================

-- General (Default fallback)
INSERT INTO yovo_tbl_aiva_industry_configs (
    id, industry_code, name, description, is_default,
    intent_triggers, intent_types, workflow_definitions, policies, response_templates
) VALUES (
    UUID(), 'general', 'General / Custom', 'Default configuration for custom implementations', TRUE,
    '{"INQUIRY": ["question", "help", "information", "madad", "puchna"], "COMPLAINT": ["problem", "issue", "not working", "masla", "shikayat"], "FEEDBACK": ["feedback", "suggestion", "review"]}',
    '["GREETING", "INQUIRY", "COMPLAINT", "FEEDBACK", "KNOWLEDGE_QUERY", "AGENT_TRANSFER", "SIMPLE_REPLY", "COMPLEX"]',
    '{"support": {"states": ["NEW", "IN_PROGRESS", "AWAITING_INFO", "RESOLVED"], "initial_state": "NEW", "final_states": ["RESOLVED"], "transitions": {"NEW": ["IN_PROGRESS", "RESOLVED"], "IN_PROGRESS": ["AWAITING_INFO", "RESOLVED"], "AWAITING_INFO": ["IN_PROGRESS", "RESOLVED"]}}}',
    '{"escalate_after_turns": 5, "auto_close_hours": 24}',
    '{"greeting": {"en": "Hello! How can I help you today?", "ur": "Assalam-o-Alaikum! Kaise madad kar sakta hoon?"}, "transfer": {"en": "I am transferring you to our team.", "ur": "Main aapko hamari team se connect kar raha hoon."}}'
);

-- E-commerce
INSERT INTO yovo_tbl_aiva_industry_configs (
    id, industry_code, name, description,
    intent_triggers, intent_types, workflow_definitions, policies, response_templates, image_classification, hallucination_rules
) VALUES (
    UUID(), 'ecommerce', 'E-commerce / Retail', 'Configuration for online retail stores',
    '{
        "ORDER_STATUS": ["order status", "where is my order", "track order", "tracking", "mera order kahan", "order ki detail", "delivery status"],
        "COMPLAINT_NEW": ["damaged", "broken", "wrong color", "wrong size", "missing", "not received", "defective", "torn", "kharab", "toot", "galat", "nahi mila", "masla", "shikayat", "problem", "issue"],
        "COMPLAINT_CONTINUE": [],
        "RETURN_REQUEST": ["return", "exchange", "refund", "wapas", "badalna", "replace"],
        "PRODUCT_INQUIRY": ["price", "available", "stock", "show me", "dikhao", "kitne ka", "size available"],
        "PAYMENT_ISSUE": ["payment failed", "double charged", "refund status", "paisa wapas"]
    }',
    '["GREETING", "ORDER_STATUS", "COMPLAINT_NEW", "COMPLAINT_CONTINUE", "RETURN_REQUEST", "PRODUCT_INQUIRY", "PAYMENT_ISSUE", "KNOWLEDGE_QUERY", "SIMPLE_REPLY", "COMPLEX"]',
    '{
        "complaint": {
            "states": ["NEW", "AWAITING_ORDER", "AWAITING_IMAGES", "AWAITING_DETAILS", "TICKET_CREATED", "RESOLVED"],
            "initial_state": "NEW",
            "final_states": ["RESOLVED"],
            "transitions": {
                "NEW": ["AWAITING_ORDER", "AWAITING_IMAGES", "AWAITING_DETAILS"],
                "AWAITING_ORDER": ["AWAITING_IMAGES", "AWAITING_DETAILS", "TICKET_CREATED"],
                "AWAITING_IMAGES": ["AWAITING_DETAILS", "TICKET_CREATED"],
                "AWAITING_DETAILS": ["TICKET_CREATED"],
                "TICKET_CREATED": ["RESOLVED"]
            },
            "required_fields": {
                "TICKET_CREATED": ["order_number", "complaint_type"]
            }
        },
        "return": {
            "states": ["NEW", "AWAITING_ORDER", "AWAITING_REASON", "RETURN_INITIATED", "RESOLVED"],
            "initial_state": "NEW",
            "final_states": ["RESOLVED"],
            "transitions": {
                "NEW": ["AWAITING_ORDER"],
                "AWAITING_ORDER": ["AWAITING_REASON"],
                "AWAITING_REASON": ["RETURN_INITIATED"],
                "RETURN_INITIATED": ["RESOLVED"]
            }
        }
    }',
    '{
        "complaint_window_hours": 48,
        "return_window_days": 7,
        "require_images_for": ["DAMAGED", "COLOR_ISSUE", "QUALITY_ISSUE", "WRONG_ITEM"],
        "skip_images_for": ["MISSING_ITEM", "NOT_RECEIVED", "DELIVERY_ISSUE"],
        "auto_escalate_keywords": ["legal", "lawyer", "consumer court", "adalat"]
    }',
    '{
        "ask_order_number": {"en": "Please provide your Order ID, email, or phone number.", "ur": "Please apna Order ID, email, ya phone number share karein."},
        "ask_images": {"en": "Please share pictures of the {complaint_type} so we can process your complaint.", "ur": "Please {complaint_type} ki tasveerain share karein taake hum aapki complaint process kar sakein."},
        "ticket_created": {"en": "We apologize for the inconvenience. Your ticket #{ticket_number} has been created. Our team will contact you shortly.", "ur": "Takleef ke liye maafi. Aapka ticket #{ticket_number} ban gaya hai. Hamari team jald contact karegi."},
        "outside_policy": {"en": "I can see your order was delivered on {delivery_date}. Please share pictures so we can still try to help.", "ur": "Aapka order {delivery_date} ko deliver hua tha. Please tasveerain share karein, hum help karne ki koshish karenge."}
    }',
    '{
        "complaint_evidence": {"triggers": ["damaged", "broken", "share picture", "tasveer bhejo", "photo"], "requires_active_workflow": true},
        "order_screenshot": {"triggers": ["order screenshot", "order number", "tracking", "invoice"], "action": "extract_order_info"},
        "product_search": {"triggers": ["find similar", "like this", "dikhao", "aisa", "is jaisa"], "action": "search_products"}
    }',
    '{
        "data_fields": ["order_number", "tracking_id", "delivery_date", "order_status", "customer_name"],
        "require_function_call": true,
        "function_mapping": {"order_number": "check_order_status"}
    }'
);

-- Healthcare
INSERT INTO yovo_tbl_aiva_industry_configs (
    id, industry_code, name, description,
    intent_triggers, intent_types, workflow_definitions, policies, response_templates
) VALUES (
    UUID(), 'healthcare', 'Healthcare / Medical', 'Configuration for hospitals and clinics',
    '{
        "APPOINTMENT_BOOKING": ["book appointment", "schedule", "available slots", "doctor available", "appointment lena", "milna hai doctor se", "checkup"],
        "APPOINTMENT_CANCEL": ["cancel appointment", "reschedule", "postpone", "appointment cancel"],
        "PRESCRIPTION_REFILL": ["refill", "prescription", "medicine", "dawai chahiye", "medicine khatam"],
        "LAB_RESULTS": ["test results", "lab report", "blood test", "report kab", "results ready"],
        "SYMPTOM_INQUIRY": ["symptoms", "feeling sick", "pain", "dard", "tabiyat kharab"],
        "EMERGENCY": ["emergency", "urgent", "chest pain", "breathing problem", "saans", "behosh"]
    }',
    '["GREETING", "APPOINTMENT_BOOKING", "APPOINTMENT_CANCEL", "PRESCRIPTION_REFILL", "LAB_RESULTS", "SYMPTOM_INQUIRY", "EMERGENCY", "INSURANCE_QUERY", "KNOWLEDGE_QUERY", "SIMPLE_REPLY"]',
    '{
        "appointment": {
            "states": ["NEW", "AWAITING_SPECIALTY", "AWAITING_DATE", "AWAITING_TIME", "AWAITING_CONFIRMATION", "BOOKED"],
            "initial_state": "NEW",
            "final_states": ["BOOKED", "CANCELLED"],
            "transitions": {
                "NEW": ["AWAITING_SPECIALTY"],
                "AWAITING_SPECIALTY": ["AWAITING_DATE"],
                "AWAITING_DATE": ["AWAITING_TIME"],
                "AWAITING_TIME": ["AWAITING_CONFIRMATION"],
                "AWAITING_CONFIRMATION": ["BOOKED"]
            },
            "required_fields": {"BOOKED": ["patient_id", "doctor_id", "date", "time"]}
        }
    }',
    '{
        "advance_booking_days": 30,
        "cancellation_hours": 24,
        "require_patient_id": true,
        "emergency_keywords": ["emergency", "chest pain", "breathing", "unconscious", "bleeding", "behosh"],
        "emergency_action": "immediate_escalate"
    }',
    '{
        "ask_patient_id": {"en": "Please provide your Patient ID or registered phone number.", "ur": "Please apna Patient ID ya registered phone number share karein."},
        "emergency_warning": {"en": "If this is a medical emergency, please call 1122 or go to the nearest hospital immediately.", "ur": "Agar yeh emergency hai, please 1122 call karein ya qareeb ke hospital jayein."},
        "appointment_confirmed": {"en": "Your appointment with Dr. {doctor_name} is confirmed for {date} at {time}.", "ur": "Dr. {doctor_name} ke saath aapki appointment {date} ko {time} par confirm hai."}
    }'
);

-- Banking
INSERT INTO yovo_tbl_aiva_industry_configs (
    id, industry_code, name, description,
    intent_triggers, intent_types, workflow_definitions, policies, response_templates, hallucination_rules
) VALUES (
    UUID(), 'banking', 'Banking / Finance', 'Configuration for banks and financial services',
    '{
        "BALANCE_INQUIRY": ["balance", "how much", "kitna hai", "account balance", "remaining balance"],
        "TRANSACTION_HISTORY": ["transactions", "statement", "history", "recent payments", "last transactions"],
        "CARD_ISSUE": ["card blocked", "card not working", "lost card", "stolen card", "card kho gaya", "ATM issue"],
        "LOAN_INQUIRY": ["loan", "finance", "installment", "qarz", "EMI", "interest rate"],
        "FRAUD_REPORT": ["fraud", "unauthorized", "didnt make this transaction", "scam", "stolen money"],
        "TRANSFER": ["transfer money", "send money", "bhejni hai", "payment karna"]
    }',
    '["GREETING", "BALANCE_INQUIRY", "TRANSACTION_HISTORY", "CARD_ISSUE", "LOAN_INQUIRY", "FRAUD_REPORT", "TRANSFER", "ACCOUNT_OPENING", "KNOWLEDGE_QUERY", "SIMPLE_REPLY"]',
    '{
        "card_issue": {
            "states": ["NEW", "AWAITING_VERIFICATION", "CARD_BLOCKED", "REPLACEMENT_REQUESTED", "RESOLVED"],
            "initial_state": "NEW",
            "final_states": ["RESOLVED"],
            "transitions": {
                "NEW": ["AWAITING_VERIFICATION"],
                "AWAITING_VERIFICATION": ["CARD_BLOCKED"],
                "CARD_BLOCKED": ["REPLACEMENT_REQUESTED", "RESOLVED"],
                "REPLACEMENT_REQUESTED": ["RESOLVED"]
            }
        },
        "fraud": {
            "states": ["NEW", "VERIFIED", "ESCALATED", "INVESTIGATING", "RESOLVED"],
            "initial_state": "NEW",
            "final_states": ["RESOLVED"],
            "auto_escalate": true
        }
    }',
    '{
        "require_otp_for": ["BALANCE_INQUIRY", "TRANSACTION_HISTORY", "TRANSFER"],
        "fraud_escalation_immediate": true,
        "card_block_immediate": true,
        "never_share": ["PIN", "OTP", "password", "CVV"]
    }',
    '{
        "ask_account": {"en": "Please provide your account number or CNIC for verification.", "ur": "Please apna account number ya CNIC batayein."},
        "fraud_warning": {"en": "Never share your PIN, OTP, or password with anyone including bank staff.", "ur": "Kabhi bhi apna PIN, OTP, ya password kisi ko na batayein, bank staff ko bhi nahi."},
        "card_blocked": {"en": "Your card has been blocked for security. Visit your nearest branch for replacement.", "ur": "Aapka card security ke liye block kar diya gaya hai. Replacement ke liye branch visit karein."}
    }',
    '{
        "data_fields": ["balance", "transaction_id", "account_number", "card_status"],
        "require_function_call": true,
        "function_mapping": {
            "balance": "check_balance",
            "transaction_id": "check_transaction",
            "card_status": "check_card_status"
        }
    }'
);
```

### 4.2 Agent Table Modification

```sql
-- Add industry_code to agents table
ALTER TABLE yovo_tbl_aiva_agents 
ADD COLUMN industry_code VARCHAR(50) DEFAULT 'general' AFTER kb_metadata,
ADD COLUMN industry_config_overrides JSON DEFAULT NULL AFTER industry_code,
ADD INDEX idx_industry_code (industry_code);

-- Add foreign key (optional, for referential integrity)
-- ALTER TABLE yovo_tbl_aiva_agents 
-- ADD CONSTRAINT fk_agent_industry 
-- FOREIGN KEY (industry_code) REFERENCES yovo_tbl_aiva_industry_configs(industry_code);

-- Update existing Shopify agents to ecommerce
UPDATE yovo_tbl_aiva_agents 
SET industry_code = 'ecommerce' 
WHERE shopify_store_url IS NOT NULL AND shopify_access_token IS NOT NULL;
```

### 4.3 Session State Enhancement

```sql
-- Modify session table to support generic workflow state
ALTER TABLE yovo_tbl_aiva_chat_sessions
ADD COLUMN workflow_type VARCHAR(50) DEFAULT NULL AFTER complaint_state,
ADD COLUMN workflow_state VARCHAR(50) DEFAULT NULL AFTER workflow_type,
ADD COLUMN workflow_data JSON DEFAULT NULL AFTER workflow_state;

-- The complaint_state column can remain for backward compatibility
-- New workflow_* columns provide generic state machine support
```

---

## 5. Code Changes Required

### 5.1 New File: IndustryConfigService.js

```javascript
// /src/services/IndustryConfigService.js

const db = require('../config/database');

class IndustryConfigService {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get industry configuration by code
     * @param {string} industryCode - Industry code (e.g., 'ecommerce', 'healthcare')
     * @returns {Promise<Object>} Industry configuration
     */
    async getConfig(industryCode) {
        // Check cache
        const cached = this.cache.get(industryCode);
        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.config;
        }

        // Load from database
        const [rows] = await db.query(
            'SELECT * FROM yovo_tbl_aiva_industry_configs WHERE industry_code = ? AND is_active = TRUE',
            [industryCode]
        );

        let config;
        if (rows.length === 0) {
            // Fallback to general
            console.log(`⚠️ Industry config not found for '${industryCode}', using 'general'`);
            config = await this.getConfig('general');
        } else {
            config = this._parseConfig(rows[0]);
        }

        // Cache
        this.cache.set(industryCode, { config, timestamp: Date.now() });
        
        return config;
    }

    /**
     * Get merged config for agent (industry defaults + agent overrides)
     * @param {Object} agent - Agent object
     * @returns {Promise<Object>} Merged configuration
     */
    async getAgentConfig(agent) {
        const baseConfig = await this.getConfig(agent.industry_code || 'general');
        
        // Merge with agent-specific overrides
        if (agent.industry_config_overrides) {
            return this._deepMerge(baseConfig, agent.industry_config_overrides);
        }
        
        return baseConfig;
    }

    /**
     * Check if message matches any intent trigger
     * @param {string} message - User message
     * @param {Object} config - Industry config
     * @returns {Object|null} Matched intent or null
     */
    detectIntent(message, config) {
        const msgLower = message.toLowerCase();
        
        for (const [intent, triggers] of Object.entries(config.intent_triggers || {})) {
            for (const trigger of triggers) {
                if (msgLower.includes(trigger.toLowerCase())) {
                    return { intent, trigger, confidence: 'high' };
                }
            }
        }
        
        return null;
    }

    /**
     * Get response template with variable substitution
     * @param {string} templateKey - Template key (e.g., 'ask_order_number')
     * @param {string} language - Language code ('en' or 'ur')
     * @param {Object} config - Industry config
     * @param {Object} variables - Variables to substitute
     * @returns {string} Formatted response
     */
    getTemplate(templateKey, language, config, variables = {}) {
        const templates = config.response_templates || {};
        const template = templates[templateKey];
        
        if (!template) return null;
        
        let text = template[language] || template['en'] || '';
        
        // Substitute variables
        for (const [key, value] of Object.entries(variables)) {
            text = text.replace(new RegExp(`{${key}}`, 'g'), value);
        }
        
        return text;
    }

    /**
     * Check if images are required for complaint type
     * @param {string} complaintType - Type of complaint
     * @param {Object} config - Industry config
     * @returns {boolean}
     */
    requiresImages(complaintType, config) {
        const policies = config.policies || {};
        const requireFor = policies.require_images_for || [];
        const skipFor = policies.skip_images_for || [];
        
        if (skipFor.includes(complaintType)) return false;
        if (requireFor.includes(complaintType)) return true;
        
        return true; // Default: require images
    }

    /**
     * Check if within policy window
     * @param {Date} referenceDate - Date to check against (e.g., delivery date)
     * @param {string} policyKey - Policy key (e.g., 'complaint_window_hours')
     * @param {Object} config - Industry config
     * @returns {Object} { withinPolicy: boolean, elapsed: number, threshold: number }
     */
    checkPolicyWindow(referenceDate, policyKey, config) {
        const policies = config.policies || {};
        const threshold = policies[policyKey];
        
        if (!threshold) return { withinPolicy: true, elapsed: 0, threshold: null };
        
        const now = new Date();
        const ref = new Date(referenceDate);
        
        let elapsed;
        if (policyKey.includes('hours')) {
            elapsed = (now - ref) / (1000 * 60 * 60); // Hours
        } else if (policyKey.includes('days')) {
            elapsed = (now - ref) / (1000 * 60 * 60 * 24); // Days
        } else {
            elapsed = (now - ref) / 1000; // Seconds
        }
        
        return {
            withinPolicy: elapsed <= threshold,
            elapsed: Math.round(elapsed),
            threshold
        };
    }

    // Private helper methods
    _parseConfig(row) {
        return {
            industry_code: row.industry_code,
            name: row.name,
            intent_triggers: JSON.parse(row.intent_triggers || '{}'),
            intent_types: JSON.parse(row.intent_types || '[]'),
            workflow_definitions: JSON.parse(row.workflow_definitions || '{}'),
            policies: JSON.parse(row.policies || '{}'),
            response_templates: JSON.parse(row.response_templates || '{}'),
            image_classification: JSON.parse(row.image_classification || '{}'),
            hallucination_rules: JSON.parse(row.hallucination_rules || '{}')
        };
    }

    _deepMerge(target, source) {
        const result = { ...target };
        for (const key of Object.keys(source)) {
            if (source[key] instanceof Object && key in target) {
                result[key] = this._deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = new IndustryConfigService();
```

### 5.2 New File: WorkflowEngine.js

```javascript
// /src/services/WorkflowEngine.js

class WorkflowEngine {
    constructor(workflowDefinition) {
        this.states = workflowDefinition.states || [];
        this.initialState = workflowDefinition.initial_state || this.states[0];
        this.finalStates = workflowDefinition.final_states || [];
        this.transitions = workflowDefinition.transitions || {};
        this.requiredFields = workflowDefinition.required_fields || {};
        this.optionalFields = workflowDefinition.optional_fields || {};
    }

    /**
     * Get initial state for new workflow
     */
    getInitialState() {
        return this.initialState;
    }

    /**
     * Check if state is a final state
     */
    isFinalState(state) {
        return this.finalStates.includes(state);
    }

    /**
     * Get valid transitions from current state
     */
    getValidTransitions(currentState) {
        return this.transitions[currentState] || [];
    }

    /**
     * Check if transition is valid
     */
    canTransition(fromState, toState) {
        const valid = this.getValidTransitions(fromState);
        return valid.includes(toState);
    }

    /**
     * Get required fields for a state
     */
    getRequiredFields(state) {
        return this.requiredFields[state] || [];
    }

    /**
     * Validate if all required fields are present for transition
     */
    validateForTransition(targetState, data) {
        const required = this.getRequiredFields(targetState);
        const missing = required.filter(field => !data[field]);
        
        return {
            valid: missing.length === 0,
            missing,
            required
        };
    }

    /**
     * Determine next state based on collected data
     */
    suggestNextState(currentState, collectedData) {
        const validTransitions = this.getValidTransitions(currentState);
        
        for (const nextState of validTransitions) {
            const validation = this.validateForTransition(nextState, collectedData);
            if (validation.valid) {
                return { state: nextState, ready: true };
            }
        }
        
        // Return first valid transition with missing fields
        if (validTransitions.length > 0) {
            const nextState = validTransitions[0];
            const validation = this.validateForTransition(nextState, collectedData);
            return { 
                state: currentState, 
                ready: false, 
                missing: validation.missing,
                suggestedNext: nextState
            };
        }
        
        return { state: currentState, ready: false };
    }
}

module.exports = WorkflowEngine;
```

### 5.3 ChatService.js Modifications

#### 5.3.1 Add Imports (Top of file)

```javascript
// Add after existing imports
const IndustryConfigService = require('./IndustryConfigService');
const WorkflowEngine = require('./WorkflowEngine');
```

#### 5.3.2 Modify processMessage Method

```javascript
// At the start of processMessage, after getting agent:

// Get industry configuration
const industryConfig = await IndustryConfigService.getAgentConfig(agent);
console.log(`🏭 Industry: ${industryConfig.industry_code} (${industryConfig.name})`);

// Determine if this is an "enhanced" industry (has specific workflow support)
const hasEnhancedSupport = ['ecommerce', 'healthcare', 'banking'].includes(industryConfig.industry_code);

// For backward compatibility, still check Shopify for e-commerce specific features
const isEcommerceAgent = agent.shopify_store_url && agent.shopify_access_token;
const useEcommerceLegacy = isEcommerceAgent && industryConfig.industry_code === 'ecommerce';
```

#### 5.3.3 Replace Hardcoded Complaint Triggers

```javascript
// BEFORE:
const complaintTriggers = [
    'damaged', 'broken', 'wrong color', ...
];
const hasComplaintKeyword = complaintTriggers.some(trigger => msgLower.includes(trigger));

// AFTER:
const detectedIntent = IndustryConfigService.detectIntent(message, industryConfig);
const hasComplaintKeyword = detectedIntent && 
    ['COMPLAINT_NEW', 'COMPLAINT'].includes(detectedIntent.intent);

if (hasComplaintKeyword) {
    console.log(`🎯 Pre-LLM intent detected: ${detectedIntent.intent} (trigger: "${detectedIntent.trigger}")`);
}
```

#### 5.3.4 Replace Hardcoded Complaint Types

```javascript
// BEFORE:
let complaintType = 'UNKNOWN';
if (msgLower.includes('wrong color') || ...) complaintType = 'COLOR_ISSUE';
// ... hardcoded

// AFTER:
let complaintType = 'UNKNOWN';
const typeMapping = {
    'damaged': 'DAMAGED', 'broken': 'DAMAGED', 'toot': 'DAMAGED',
    'wrong color': 'COLOR_ISSUE', 'galat color': 'COLOR_ISSUE', 'color': 'COLOR_ISSUE',
    'wrong size': 'WRONG_SIZE', 'size': 'WRONG_SIZE',
    'missing': 'MISSING_ITEM', 'not in package': 'MISSING_ITEM',
    'defective': 'QUALITY_ISSUE', 'quality': 'QUALITY_ISSUE', 'kharab': 'QUALITY_ISSUE'
};

for (const [keyword, type] of Object.entries(typeMapping)) {
    if (msgLower.includes(keyword)) {
        complaintType = type;
        break;
    }
}

// Check if images required based on industry config
const requiresImages = IndustryConfigService.requiresImages(complaintType, industryConfig);
```

#### 5.3.5 Replace Hardcoded Policy Checks

```javascript
// BEFORE:
if (daysSinceDelivery > 2) { /* outside 48 hours */ }

// AFTER:
const policyCheck = IndustryConfigService.checkPolicyWindow(
    deliveryDate,
    'complaint_window_hours',
    industryConfig
);

if (!policyCheck.withinPolicy) {
    console.log(`📅 Outside policy: ${policyCheck.elapsed} hours elapsed (threshold: ${policyCheck.threshold})`);
}
```

#### 5.3.6 Use Response Templates

```javascript
// BEFORE:
const askOrderMsg = isUrdu 
    ? "Please apna Order ID share karein."
    : "Please provide your Order ID.";

// AFTER:
const language = this._detectCustomerLanguage(history, message);
const askOrderMsg = IndustryConfigService.getTemplate(
    'ask_order_number',
    language === 'urdu' ? 'ur' : 'en',
    industryConfig
) || "Please provide your Order ID.";
```

---

## 6. Industry Configurations

### 6.1 E-commerce (Current - Preserve Exactly)

| Feature | Configuration |
|---------|---------------|
| Complaint Types | DAMAGED, COLOR_ISSUE, WRONG_SIZE, MISSING_ITEM, QUALITY_ISSUE, WRONG_ITEM |
| Requires Images | DAMAGED, COLOR_ISSUE, QUALITY_ISSUE, WRONG_ITEM |
| Skip Images | MISSING_ITEM, NOT_RECEIVED |
| Policy Window | 48 hours from delivery |
| Workflows | complaint, return |
| Special Features | Order screenshot detection, Shopify integration |

### 6.2 Healthcare

| Feature | Configuration |
|---------|---------------|
| Workflow Types | appointment, prescription, lab_results |
| Special Intents | EMERGENCY (immediate escalation) |
| Policies | 24-hour cancellation, 30-day advance booking |
| Required Fields | patient_id for all workflows |
| Special Features | Emergency keyword detection |

### 6.3 Banking

| Feature | Configuration |
|---------|---------------|
| Workflow Types | card_issue, fraud, loan_inquiry |
| Special Intents | FRAUD_REPORT (immediate escalation) |
| Policies | OTP required for sensitive operations |
| Hallucination Prevention | Balance, transaction data must come from functions |
| Special Features | Card block capability, fraud escalation |

### 6.4 General (Fallback)

| Feature | Configuration |
|---------|---------------|
| Workflow Types | support (simple NEW → IN_PROGRESS → RESOLVED) |
| Policies | Escalate after 5 turns, auto-close after 24 hours |
| Features | Basic intent detection, function calling, KB search |

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create database tables
- [ ] Insert default configurations
- [ ] Create IndustryConfigService.js
- [ ] Create WorkflowEngine.js
- [ ] Add industry_code to agents table
- [ ] Update existing Shopify agents to industry_code='ecommerce'

### Phase 2: Integration (Week 2)
- [ ] Add IndustryConfigService import to ChatService
- [ ] Add industry config loading at start of processMessage
- [ ] Replace hardcoded complaint triggers with config-driven
- [ ] Replace hardcoded complaint types with config-driven
- [ ] Replace hardcoded policies with config-driven
- [ ] Add response template support

### Phase 3: Workflow Engine (Week 3)
- [ ] Integrate WorkflowEngine for state management
- [ ] Replace complaint_state with generic workflow_state
- [ ] Add workflow state persistence to session
- [ ] Update image classification to use industry config
- [ ] Add industry-specific hallucination rules

### Phase 4: Testing & Polish (Week 4)
- [ ] Test e-commerce flows (must be identical to current)
- [ ] Test healthcare flows
- [ ] Test banking flows
- [ ] Test general/fallback flows
- [ ] Performance testing
- [ ] Documentation

---

## 8. Migration Strategy

### 8.1 Backward Compatibility Rules

1. **Existing Shopify agents continue to work unchanged**
   - `isEcommerceAgent` check remains for legacy features
   - All current e-commerce logic preserved

2. **New agents get industry support automatically**
   - Set `industry_code` when creating agent
   - Inherit industry defaults

3. **Gradual migration**
   - Existing agents can be migrated one by one
   - No big-bang cutover required

### 8.2 Migration SQL

```sql
-- Step 1: Add column with default
ALTER TABLE yovo_tbl_aiva_agents 
ADD COLUMN industry_code VARCHAR(50) DEFAULT 'general';

-- Step 2: Update Shopify agents
UPDATE yovo_tbl_aiva_agents 
SET industry_code = 'ecommerce' 
WHERE shopify_store_url IS NOT NULL 
  AND shopify_access_token IS NOT NULL;

-- Step 3: Verify
SELECT industry_code, COUNT(*) 
FROM yovo_tbl_aiva_agents 
GROUP BY industry_code;
```

### 8.3 Rollback SQL

```sql
-- If something goes wrong
ALTER TABLE yovo_tbl_aiva_agents DROP COLUMN industry_code;
ALTER TABLE yovo_tbl_aiva_agents DROP COLUMN industry_config_overrides;
DROP TABLE IF EXISTS yovo_tbl_aiva_industry_configs;
```

---

## 9. Testing Checklist

### 9.1 E-commerce Regression Tests
- [ ] Color complaint flow with images → ticket created
- [ ] Missing item complaint without images → ticket created
- [ ] Order status check → order details shown
- [ ] 48-hour policy enforced correctly
- [ ] Batch image upload works
- [ ] Post-ticket image handled gracefully
- [ ] "ok thanks" after ticket doesn't restart complaint

### 9.2 Healthcare Tests
- [ ] Appointment booking flow
- [ ] Emergency keyword triggers immediate escalation
- [ ] Patient ID required for operations
- [ ] Cancellation policy enforced

### 9.3 Banking Tests
- [ ] Balance inquiry requires verification
- [ ] Fraud report triggers immediate escalation
- [ ] Card block works
- [ ] Sensitive data not hallucinated

### 9.4 General Tests
- [ ] Function calling works
- [ ] KB search works
- [ ] Agent transfer works
- [ ] Fallback to general config works

---

## 10. Rollback Plan

### 10.1 Code Rollback
```bash
# Keep backup before deployment
cp ChatService.js ChatService.js.backup

# If issues, restore
cp ChatService.js.backup ChatService.js
pm2 restart AiVA-Bridge-API
```

### 10.2 Database Rollback
```sql
-- Remove industry columns (keeps data intact)
ALTER TABLE yovo_tbl_aiva_agents DROP COLUMN industry_code;
ALTER TABLE yovo_tbl_aiva_agents DROP COLUMN industry_config_overrides;

-- Optionally drop config table
DROP TABLE IF EXISTS yovo_tbl_aiva_industry_configs;
```

### 10.3 Feature Flag Option
```javascript
// Add feature flag for gradual rollout
const USE_INDUSTRY_CONFIG = process.env.USE_INDUSTRY_CONFIG === 'true';

if (USE_INDUSTRY_CONFIG) {
    // New industry-driven logic
} else {
    // Legacy hardcoded logic
}
```

---

## Appendix A: Quick Reference

### Intent Detection Example
```javascript
const config = await IndustryConfigService.getAgentConfig(agent);
const detected = IndustryConfigService.detectIntent(message, config);
// { intent: 'COMPLAINT_NEW', trigger: 'damaged', confidence: 'high' }
```

### Workflow Engine Example
```javascript
const workflow = new WorkflowEngine(config.workflow_definitions.complaint);
const nextState = workflow.suggestNextState('AWAITING_ORDER', { order_number: '247020' });
// { state: 'AWAITING_IMAGES', ready: true }
```

### Response Template Example
```javascript
const response = IndustryConfigService.getTemplate(
    'ticket_created', 
    'ur', 
    config, 
    { ticket_number: '1234567' }
);
// "Aapka ticket #1234567 ban gaya hai. Hamari team jald contact karegi."
```

---

## Appendix B: File Checklist

### New Files to Create
- [ ] `/src/services/IndustryConfigService.js`
- [ ] `/src/services/WorkflowEngine.js`

### Files to Modify
- [ ] `/src/services/ChatService.js`
- [ ] `/src/services/AgentService.js` (add industry_code to agent creation)

### Database Scripts
- [ ] `migrations/add_industry_configs.sql`
- [ ] `migrations/update_agents_industry.sql`

---

**END OF SPECIFICATION**

*Feed this document to Claude when ready to implement. Claude will have full context to make the changes.*