# AIVA Platform - Complete Installation Guide

**Version:** 1.0  
**Last Updated:** November 2025

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Prerequisites](#prerequisites)
4. [Service Components](#service-components)
5. [Installation Steps](#installation-steps)
6. [Configuration](#configuration)
7. [Database Setup](#database-setup)
8. [Service Management](#service-management)
9. [Verification & Testing](#verification--testing)
10. [Troubleshooting](#troubleshooting)

---

## Overview

**AIVA** (AI Voice Agent) is an AI-powered knowledge base and conversational platform that integrates:
- Document processing and semantic search
- Image similarity search
- Shopify product integration
- Real-time voice agents (Asterisk + OpenAI Realtime API)
- Multi-tenant chat system
- Credit-based billing system

### Key Features
- Multi-format document processing (PDF, DOCX, PPTX, XLSX, HTML, TXT)
- PDF image extraction for visual search
- Vector-based semantic search using FAISS
- CLIP model for image embeddings
- OpenAI embeddings for text
- Real-time voice conversations
- Function calling capabilities
- Shopify product catalog integration

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         AIVA PLATFORM                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  • Web Dashboard (React)                                          │
│  • Chat Widget (Embeddable)                                       │
│  • Asterisk VoIP Clients                                          │
│  • REST API Clients                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │   Node.js API      │  │  Asterisk Bridge   │                 │
│  │   (Port 62001)     │  │   (WebSocket)      │                 │
│  ├────────────────────┤  ├────────────────────┤                 │
│  │ • REST APIs        │  │ • RTP Audio        │                 │
│  │ • Authentication   │  │ • OpenAI Realtime  │                 │
│  │ • Agent Mgmt       │  │ • Deepgram TTS/STT │                 │
│  │ • Knowledge APIs   │  │ • Call Management  │                 │
│  │ • Chat APIs        │  │ • Function Calls   │                 │
│  │ • Credit System    │  └────────────────────┘                 │
│  │ • Shopify Worker   │                                          │
│  └────────────────────┘                                          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PROCESSING LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │            Python Service (Port 62002)                     │ │
│  ├────────────────────────────────────────────────────────────┤ │
│  │ • Document Processing (PyMuPDF, python-docx, etc.)        │ │
│  │ • Text Extraction & Chunking                               │ │
│  │ • OpenAI Embeddings (text-embedding-3-small)              │ │
│  │ • CLIP Image Embeddings (ViT-B/32)                        │ │
│  │ • PDF Image Extraction                                     │ │
│  │ • Vector Search (FAISS)                                    │ │
│  │ • Product Search (Shopify)                                 │ │
│  │ • Roman Urdu Detection                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    MySQL     │  │    Redis     │  │  File System │          │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤          │
│  │ • Tenants    │  │ • Vectors    │  │ • Documents  │          │
│  │ • Agents     │  │ • Sessions   │  │ • Images     │          │
│  │ • Documents  │  │ • Cache      │  │ • Uploads    │          │
│  │ • Images     │  │ • Pub/Sub    │  └──────────────┘          │
│  │ • Products   │  └──────────────┘                             │
│  │ • Functions  │                                                │
│  │ • Call Logs  │                                                │
│  │ • Messages   │                                                │
│  │ • Credits    │                                                │
│  └──────────────┘                                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                            │
├─────────────────────────────────────────────────────────────────┤
│  • OpenAI API (Embeddings, Chat, Realtime)                       │
│  • Deepgram API (TTS/STT)                                         │
│  • Shopify API (Product Catalog)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Document Processing Flow

```
┌─────────────┐
│   User      │
│  Uploads    │
│  Document   │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Node.js API Service                      │
├─────────────────────────────────────────────────────────────┤
│ 1. Receive file upload                                      │
│ 2. Save to /etc/aiva-oai/storage/documents/                │
│ 3. Create document record in MySQL                          │
│ 4. Trigger async processing                                 │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                   Python Service                            │
├─────────────────────────────────────────────────────────────┤
│ 1. Extract text (PyMuPDF, python-docx, etc.)              │
│ 2. Extract images from PDFs                                 │
│ 3. Clean & chunk text (500 chars, 50 overlap)             │
│ 4. Generate embeddings (OpenAI text-embedding-3-small)     │
│ 5. Generate image embeddings (CLIP ViT-B/32)              │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Storage Layer                            │
├─────────────────────────────────────────────────────────────┤
│ MySQL:                                                       │
│  • yovo_tbl_aiva_documents                                  │
│  • yovo_tbl_aiva_document_chunks                           │
│  • yovo_tbl_aiva_images                                     │
│                                                              │
│ Redis:                                                       │
│  • vector:{kb_id}:{chunk_id} → text embeddings            │
│                                                              │
│ FAISS:                                                       │
│  • Image vectors stored in-memory per KB                    │
│                                                              │
│ File System:                                                 │
│  • /etc/aiva-oai/storage/documents/{doc_id}.pdf            │
│  • /etc/aiva-oai/storage/images/{kb_id}/{image_id}.jpg    │
└─────────────────────────────────────────────────────────────┘
```

### 2. Search Flow

```
┌─────────────┐
│   User      │
│  Search     │
│  Query      │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│              Node.js API / Python Service                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Check semantic cache (Redis)                             │
│ 2. Generate query embedding (OpenAI)                        │
│ 3. Search vectors in Redis (text search)                    │
│ 4. Search FAISS index (image search)                        │
│ 5. Search products (if enabled)                             │
│ 6. Rank & merge results                                     │
│ 7. Cache results                                            │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Response                                  │
├─────────────────────────────────────────────────────────────┤
│ • Top K text chunks with sources                            │
│ • Similar images                                             │
│ • Related products                                           │
│ • Cost breakdown                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3. Real-time Voice Call Flow

```
┌─────────────┐
│  Caller     │
│  (SIP)      │
└──────┬──────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    Asterisk PBX                             │
├─────────────────────────────────────────────────────────────┤
│ • Receives SIP call                                          │
│ • Routes to Stasis app (AIVA)                               │
│ • Sends RTP audio stream                                     │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                  Asterisk Bridge Service                    │
├─────────────────────────────────────────────────────────────┤
│ 1. Fetch agent config from API                              │
│ 2. Connect to OpenAI Realtime API (WebSocket)              │
│ 3. Stream RTP → base64 PCM → OpenAI                        │
│ 4. Receive OpenAI audio → PCM → RTP → Asterisk            │
│ 5. Handle function calls                                     │
│ 6. Log conversation & costs                                  │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│              OpenAI Realtime API                            │
├─────────────────────────────────────────────────────────────┤
│ • Speech-to-text (audio_input)                              │
│ • LLM processing (gpt-4o-mini-realtime)                    │
│ • Text-to-speech (audio_output)                             │
│ • Function calling                                           │
└──────┬──────────────────────────────────────────────────────┘
       │
       ↓
┌─────────────────────────────────────────────────────────────┐
│                  Function Execution                         │
├─────────────────────────────────────────────────────────────┤
│ • Knowledge base search                                      │
│ • Product search                                             │
│ • API calls (external integrations)                         │
│ • Database queries                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### System Requirements

- **Operating System:** Debian 12 / Ubuntu 22.04+ (recommended)
- **CPU:** 4+ cores
- **RAM:** 8GB minimum, 16GB recommended
- **Storage:** 50GB+ (more for documents/images)
- **Network:** Stable internet connection

### Required Software

#### 1. **Python 3.11+**
```bash
sudo apt update
sudo apt install -y python3.11 python3.11-venv python3.11-dev python3-pip
```

#### 2. **Node.js 18+**
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 3. **MySQL 8.0+**
```bash
sudo apt install -y mysql-server mysql-client
sudo systemctl enable mysql
sudo systemctl start mysql
```

#### 4. **Redis 7.0+**
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

#### 5. **System Libraries** (for Python packages)
```bash
sudo apt install -y \
  build-essential \
  gcc g++ make \
  libjpeg-dev \
  zlib1g-dev \
  libpng-dev \
  libxml2-dev \
  libxslt1-dev \
  libssl-dev \
  libffi-dev \
  libmysqlclient-dev \
  default-libmysqlclient-dev
```

#### 6. **Asterisk 18+** (for voice features)
```bash
sudo apt install -y asterisk
sudo systemctl enable asterisk
sudo systemctl start asterisk
```

### External Services

You'll need API keys for:

1. **OpenAI API** - https://platform.openai.com/api-keys
   - For embeddings, chat, and realtime voice
   - Minimum $10 credit recommended

2. **Deepgram API** (optional) - https://deepgram.com
   - Alternative TTS/STT provider
   - Free tier available

3. **Shopify API** (optional) - https://shopify.dev
   - For product catalog integration
   - Requires Shopify store

---

## Service Components

### 1. **Python Service** (Port 62002)

**Purpose:** AI/ML processing, document handling, embeddings

**Key Features:**
- Multi-format document processing
- PDF image extraction
- Text chunking & cleaning
- OpenAI embeddings generation
- CLIP image embeddings
- FAISS vector search
- Product similarity search
- Roman Urdu support

**Technology Stack:**
- FastAPI (web framework)
- PyMuPDF (PDF processing)
- python-docx, python-pptx, openpyxl (Office docs)
- transformers, torch (CLIP model)
- FAISS (vector search)
- OpenAI SDK
- Redis, MySQL

### 2. **Node.js API Service** (Port 62001)

**Purpose:** Main application API, business logic, orchestration

**Key Features:**
- REST API endpoints
- Authentication & authorization
- Agent management
- Knowledge base management
- Chat system
- Credit management
- Function management
- Shopify integration worker

**Technology Stack:**
- Express.js
- MySQL (mysql2)
- Redis
- Axios (HTTP client)
- JWT authentication

### 3. **Asterisk Bridge Service** (WebSocket)

**Purpose:** Real-time voice agent bridge between Asterisk and OpenAI

**Key Features:**
- RTP audio streaming
- WebSocket connection to OpenAI Realtime API
- Audio format conversion (PCM)
- Function calling support
- Call logging & cost tracking
- Provider abstraction (OpenAI/Deepgram)

**Technology Stack:**
- Node.js
- WebSocket (ws)
- OpenAI Realtime SDK
- Redis (session storage)
- Axios (API calls)

### 4. **Shopify Worker** (Background)

**Purpose:** Sync Shopify product catalog

**Key Features:**
- Periodic product sync
- Image download & embedding
- Product metadata storage
- Webhook handling (future)

**Technology Stack:**
- Node.js
- Shopify API
- MySQL, Redis
- Python Service (for embeddings)

### 5. **React Dashboard** (Port 3000 / Static)

**Purpose:** Admin interface

**Key Features:**
- Agent management
- Knowledge base management
- Function configuration
- Analytics & reports
- User management

**Technology Stack:**
- React 18
- TailwindCSS
- Recharts (graphs)
- React Router
- Axios

---

## Installation Steps

### Step 1: Create Directory Structure

```bash
# Create main directory
sudo mkdir -p /etc/aiva-oai

# Create subdirectories
sudo mkdir -p /etc/aiva-oai/python-service
sudo mkdir -p /etc/aiva-oai/api
sudo mkdir -p /etc/aiva-oai/bridge
sudo mkdir -p /etc/aiva-oai/storage/documents
sudo mkdir -p /etc/aiva-oai/storage/images
sudo mkdir -p /etc/aiva-oai/logs

# Set permissions
sudo chown -R $USER:$USER /etc/aiva-oai
```

### Step 2: Clone/Copy Project Files

```bash
# Copy project files to installation directory
# (Adjust paths based on your source)

# Python Service
cp -r /path/to/python-service/* /etc/aiva-oai/python-service/

# Node.js API
cp -r /path/to/api/* /etc/aiva-oai/api/

# Asterisk Bridge
cp -r /path/to/bridge/* /etc/aiva-oai/bridge/

# Dashboard (optional)
cp -r /path/to/dashboard/build/* /var/www/aiva/
```

### Step 3: Install Python Dependencies

```bash
cd /etc/aiva-oai/python-service

# Create virtual environment
python3.11 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt --break-system-packages

# Download NLTK data (for text processing)
python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"

# Verify installation
python -c "import fastapi; import torch; import transformers; print('✓ Python dependencies installed')"
```

**Python Requirements:**
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
python-multipart==0.0.6
pypdf==4.0.1
PyMuPDF==1.23.8
python-docx==1.1.0
python-pptx==0.6.23
openpyxl==3.1.2
beautifulsoup4==4.12.3
lxml==5.1.0
markdown==3.5.1
nltk==3.8.1
unidecode==1.3.8
langdetect==1.0.9
openai>=1.12.0
tiktoken==0.5.2
pillow==10.2.0
torch==2.1.2
torchvision==0.16.2
transformers==4.37.2
faiss-cpu==1.7.4
redis==5.0.1
numpy==1.26.3
mysql-connector-python==8.3.0
python-dotenv==1.0.0
pydantic==2.5.3
pydantic-settings==2.1.0
aiohttp==3.9.1
python-json-logger==2.0.7
```

### Step 4: Install Node.js Dependencies

```bash
# API Service
cd /etc/aiva-oai/api
npm install

# Bridge Service
cd /etc/aiva-oai/bridge
npm install

# Dashboard (if building from source)
cd /etc/aiva-oai/api/dashboard
npm install
npm run build
```

**Node.js API Dependencies (package.json):**
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.5",
    "redis": "^4.6.12",
    "axios": "^1.6.5",
    "dotenv": "^16.3.1",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.1",
    "multer": "^1.4.5-lts.1",
    "swagger-ui-express": "^5.0.0",
    "swagger-jsdoc": "^6.2.8",
    "winston": "^3.11.0",
    "express-rate-limit": "^7.1.5",
    "helmet": "^7.1.0",
    "cors": "^2.8.5"
  }
}
```

**Bridge Dependencies (package.json):**
```json
{
  "dependencies": {
    "axios": "^1.6.7",
    "dotenv": "^16.4.1",
    "express": "^4.18.2",
    "mongodb": "^6.20.0",
    "redis": "^4.6.12",
    "winston": "^3.11.0",
    "ws": "^8.16.0"
  }
}
```

### Step 5: Database Setup

```bash
# Login to MySQL
sudo mysql -u root

# Create database
CREATE DATABASE aiva_platform CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Create user
CREATE USER 'aiva_user'@'localhost' IDENTIFIED BY 'your_secure_password';

# Grant privileges
GRANT ALL PRIVILEGES ON aiva_platform.* TO 'aiva_user'@'localhost';
FLUSH PRIVILEGES;

# Exit MySQL
exit;
```

**Import Database Schema:**

Create a file `/etc/aiva-oai/schema.sql` with all required tables:

```sql
-- Tenants
CREATE TABLE yovo_tbl_aiva_tenants (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    settings JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users
CREATE TABLE yovo_tbl_aiva_users (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'agent_manager', 'client') DEFAULT 'client',
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_tenant (tenant_id),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Knowledge Bases
CREATE TABLE yovo_tbl_aiva_knowledge_bases (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'general',
    status ENUM('active', 'inactive') DEFAULT 'active',
    settings JSON,
    stats JSON,
    has_documents BOOLEAN DEFAULT FALSE,
    has_products BOOLEAN DEFAULT FALSE,
    document_count INT DEFAULT 0,
    product_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documents
CREATE TABLE yovo_tbl_aiva_documents (
    id VARCHAR(36) PRIMARY KEY,
    kb_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_url TEXT,
    status ENUM('processing', 'completed', 'failed') DEFAULT 'processing',
    error_message TEXT,
    processing_stats JSON,
    metadata JSON,
    uploaded_by VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_kb (kb_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Document Chunks
CREATE TABLE yovo_tbl_aiva_document_chunks (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    kb_id VARCHAR(36) NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    chunk_type VARCHAR(50) DEFAULT 'text',
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES yovo_tbl_aiva_documents(id) ON DELETE CASCADE,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE,
    INDEX idx_document (document_id),
    INDEX idx_kb (kb_id),
    INDEX idx_chunk (chunk_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Images
CREATE TABLE yovo_tbl_aiva_images (
    id VARCHAR(36) PRIMARY KEY,
    kb_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    storage_url TEXT,
    image_type VARCHAR(100),
    width INT,
    height INT,
    file_size_bytes BIGINT,
    description TEXT,
    metadata JSON,
    vector_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_kb (kb_id),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products (Shopify)
CREATE TABLE yovo_tbl_aiva_products (
    id VARCHAR(36) PRIMARY KEY,
    kb_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    shopify_product_id VARCHAR(50),
    title VARCHAR(500),
    description TEXT,
    vendor VARCHAR(255),
    product_type VARCHAR(255),
    tags TEXT,
    price DECIMAL(10, 2),
    compare_at_price DECIMAL(10, 2),
    images JSON,
    variants JSON,
    metadata JSON,
    shopify_url TEXT,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_kb (kb_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_shopify_id (shopify_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agents
CREATE TABLE yovo_tbl_aiva_agents (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type ENUM('voice', 'chat', 'both') DEFAULT 'both',
    instructions TEXT,
    voice VARCHAR(50),
    language VARCHAR(10) DEFAULT 'en',
    model VARCHAR(100) DEFAULT 'gpt-4o-mini-realtime-preview-2024-12-17',
    chat_model VARCHAR(100) DEFAULT 'gpt-4o-mini',
    provider ENUM('openai', 'deepgram') DEFAULT 'openai',
    deepgram_model VARCHAR(100),
    deepgram_voice VARCHAR(100),
    deepgram_language VARCHAR(10),
    temperature DECIMAL(3, 2) DEFAULT 0.6,
    max_tokens INT DEFAULT 4096,
    vad_threshold DECIMAL(3, 2) DEFAULT 0.5,
    silence_duration_ms INT DEFAULT 500,
    greeting TEXT,
    kb_id VARCHAR(36),
    conversation_strategy JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE SET NULL,
    INDEX idx_tenant (tenant_id),
    INDEX idx_kb (kb_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Functions
CREATE TABLE yovo_tbl_aiva_functions (
    id VARCHAR(36) PRIMARY KEY,
    agent_id VARCHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    execution_mode ENUM('sync', 'async') DEFAULT 'sync',
    parameters JSON,
    handler_type ENUM('inline', 'api') DEFAULT 'inline',
    api_endpoint TEXT,
    api_method VARCHAR(10) DEFAULT 'POST',
    api_headers JSON,
    api_body JSON,
    timeout_ms INT DEFAULT 30000,
    retries INT DEFAULT 2,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
    INDEX idx_agent (agent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Call Logs
CREATE TABLE yovo_tbl_aiva_call_logs (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    agent_id VARCHAR(36) NOT NULL,
    caller_id VARCHAR(50),
    asterisk_port INT,
    provider VARCHAR(50) DEFAULT 'openai',
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    duration_seconds INT,
    audio_input_seconds DECIMAL(10, 2),
    audio_output_seconds DECIMAL(10, 2),
    text_input_tokens INT,
    text_output_tokens INT,
    cached_tokens INT,
    base_cost DECIMAL(10, 6),
    profit_amount DECIMAL(10, 6),
    final_cost DECIMAL(10, 6),
    provider_audio_minutes DECIMAL(10, 2),
    provider_metadata JSON,
    status ENUM('in_progress', 'completed', 'failed') DEFAULT 'in_progress',
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
    INDEX idx_session (session_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_agent (agent_id),
    INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Function Call Logs
CREATE TABLE yovo_tbl_aiva_function_call_logs (
    id VARCHAR(36) PRIMARY KEY,
    call_log_id VARCHAR(36) NOT NULL,
    function_name VARCHAR(255) NOT NULL,
    arguments JSON,
    result JSON,
    execution_time_ms INT,
    status ENUM('success', 'error') DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (call_log_id) REFERENCES yovo_tbl_aiva_call_logs(id) ON DELETE CASCADE,
    INDEX idx_call_log (call_log_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Sessions
CREATE TABLE yovo_tbl_aiva_chat_sessions (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    agent_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(255),
    session_name VARCHAR(255),
    status ENUM('active', 'ended') DEFAULT 'active',
    metadata JSON,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES yovo_tbl_aiva_agents(id) ON DELETE CASCADE,
    INDEX idx_tenant (tenant_id),
    INDEX idx_agent (agent_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chat Messages
CREATE TABLE yovo_tbl_aiva_chat_messages (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    content_markdown TEXT,
    sources JSON,
    images JSON,
    products JSON,
    function_calls JSON,
    cost DECIMAL(10, 6),
    cost_breakdown JSON,
    tokens_input INT,
    tokens_output INT,
    processing_time_ms INT,
    agent_transfer_requested BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES yovo_tbl_aiva_chat_sessions(id) ON DELETE CASCADE,
    INDEX idx_session (session_id),
    INDEX idx_role (role),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Credits
CREATE TABLE yovo_tbl_aiva_credits (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    total_credited DECIMAL(10, 2) DEFAULT 0.00,
    total_debited DECIMAL(10, 2) DEFAULT 0.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Credit Transactions
CREATE TABLE yovo_tbl_aiva_credit_transactions (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(36) NOT NULL,
    amount DECIMAL(10, 6) NOT NULL,
    type ENUM('credit', 'debit') NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id VARCHAR(36),
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_tenant (tenant_id),
    INDEX idx_reference (reference_type, reference_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shopify Sync Jobs
CREATE TABLE yovo_tbl_aiva_sync_jobs (
    id VARCHAR(36) PRIMARY KEY,
    kb_id VARCHAR(36) NOT NULL,
    tenant_id VARCHAR(36) NOT NULL,
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    products_synced INT DEFAULT 0,
    products_failed INT DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (kb_id) REFERENCES yovo_tbl_aiva_knowledge_bases(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES yovo_tbl_aiva_tenants(id) ON DELETE CASCADE,
    INDEX idx_kb (kb_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Import Schema:**
```bash
mysql -u aiva_user -p aiva_platform < /etc/aiva-oai/schema.sql
```

**Create Test Tenant:**
```sql
INSERT INTO yovo_tbl_aiva_tenants (id, name, is_active) 
VALUES ('test-tenant-001', 'Test Tenant', TRUE);

INSERT INTO yovo_tbl_aiva_users (id, tenant_id, email, password_hash, name, role) 
VALUES (
    'user-001', 
    'test-tenant-001', 
    'admin@test.com', 
    '$2b$10$xyz...', -- Use bcrypt to hash 'admin123'
    'Admin User', 
    'admin'
);

INSERT INTO yovo_tbl_aiva_credits (id, tenant_id, balance) 
VALUES ('credit-001', 'test-tenant-001', 100.00);
```

---

## Configuration

### 1. Python Service Configuration

Create `/etc/aiva-oai/python-service/.env`:

```bash
# Service Configuration
PYTHON_HOST=0.0.0.0
PYTHON_PORT=62002
PYTHON_API_KEY=your-secure-python-api-key-here

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=aiva_user
DB_PASSWORD=your_secure_password
DB_NAME=aiva_platform

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_VECTOR_PREFIX=vector:

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536

# Processing
DEFAULT_CHUNK_SIZE=500
DEFAULT_CHUNK_OVERLAP=50
MAX_CHUNK_SIZE=1000

# Image Processing
ENABLE_IMAGE_SEARCH=true
IMAGE_STORAGE_PATH=/etc/aiva-oai/storage/images
MAX_IMAGE_SIZE_MB=10

# CLIP Model
CLIP_MODEL=openai/clip-vit-base-patch32
CLIP_DIMENSION=512

# Semantic Cache
ENABLE_SEMANTIC_CACHE=true
CACHE_TTL_SECONDS=3600
CACHE_SIMILARITY_THRESHOLD=0.95

# Logging
LOG_LEVEL=INFO
```

### 2. Node.js API Configuration

Create `/etc/aiva-oai/api/.env`:

```bash
# Server
NODE_ENV=production
PORT=62001
API_BASE_URL=http://localhost:62001

# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=aiva_user
DB_PASSWORD=your_secure_password
DB_NAME=aiva_platform
DB_CONNECTION_LIMIT=10

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Python Service
PYTHON_SERVICE_URL=http://localhost:62002
PYTHON_SERVICE_API_KEY=your-secure-python-api-key-here

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here
EMBEDDING_MODEL=text-embedding-3-small

# Storage
STORAGE_PATH=/etc/aiva-oai/storage
MAX_FILE_SIZE_MB=100

# Image Search
ENABLE_IMAGE_SEARCH=true
MAX_IMAGE_RESULTS=5

# Cost Calculation
PROFIT_MARGIN_PERCENT=20

# OpenAI Pricing (per 1M tokens)
OPENAI_GPT4O_MINI_INPUT_COST=0.150
OPENAI_GPT4O_MINI_OUTPUT_COST=0.600
OPENAI_GPT4O_MINI_CACHED_INPUT_COST=0.075

# Realtime Pricing (per 1M tokens)
OPENAI_REALTIME_AUDIO_INPUT_COST=100.00
OPENAI_REALTIME_AUDIO_OUTPUT_COST=200.00
OPENAI_REALTIME_TEXT_INPUT_COST=5.00
OPENAI_REALTIME_TEXT_OUTPUT_COST=20.00

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Shopify (optional)
SHOPIFY_SHOP_DOMAIN=your-shop.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_your_access_token
SHOPIFY_API_VERSION=2024-01
ENABLE_SHOPIFY_SYNC=false
SHOPIFY_SYNC_INTERVAL_HOURS=24

# Logging
LOG_LEVEL=info
LOG_FILE=/etc/aiva-oai/logs/api.log
```

### 3. Bridge Service Configuration

Create `/etc/aiva-oai/bridge/.env`:

```bash
# API Configuration
API_BASE_URL=http://localhost:62001
API_TIMEOUT=30000

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here

# Deepgram (optional)
DEEPGRAM_API_KEY=your-deepgram-api-key

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Monitoring Dashboard
MONITOR_PORT=3001
MONITOR_ENABLED=true

# Audio Configuration
AUDIO_SAMPLE_RATE=16000
AUDIO_CHANNELS=1
AUDIO_ENCODING=pcm16

# Function Calling
DEBUG_FUNCTION_CALLS=false
FUNCTION_TIMEOUT_MS=30000

# Cost Tracking
PROFIT_MARGIN_PERCENT=20

# Logging
LOG_LEVEL=info
LOG_DIR=/etc/aiva-oai/logs
```

---

## Service Management

### 1. Create Systemd Service Files

#### Python Service

Create `/etc/systemd/system/aiva-python.service`:

```ini
[Unit]
Description=AIVA Python Knowledge Service
After=network.target mysql.service redis.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/aiva-oai/python-service
Environment="PATH=/etc/aiva-oai/python-service/venv/bin"
ExecStart=/etc/aiva-oai/python-service/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 62002 --workers 4
Restart=always
RestartSec=10

# Logging
StandardOutput=append:/var/log/aiva-python.log
StandardError=append:/var/log/aiva-python-error.log

[Install]
WantedBy=multi-user.target
```

#### Node.js API Service

Create `/etc/systemd/system/aiva-api.service`:

```ini
[Unit]
Description=AIVA Node.js API Service
After=network.target mysql.service redis.service aiva-python.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/aiva-oai/api
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

# Logging
StandardOutput=append:/var/log/aiva-api.log
StandardError=append:/var/log/aiva-api-error.log

[Install]
WantedBy=multi-user.target
```

#### Bridge Service

Create `/etc/systemd/system/aiva-bridge.service`:

```ini
[Unit]
Description=AIVA Asterisk Bridge Service
After=network.target asterisk.service aiva-api.service

[Service]
Type=simple
User=root
WorkingDirectory=/etc/aiva-oai/bridge
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

# Logging
StandardOutput=append:/var/log/aiva-bridge.log
StandardError=append:/var/log/aiva-bridge-error.log

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable aiva-python
sudo systemctl enable aiva-api
sudo systemctl enable aiva-bridge

# Start services
sudo systemctl start aiva-python
sudo systemctl start aiva-api
sudo systemctl start aiva-bridge

# Check status
sudo systemctl status aiva-python
sudo systemctl status aiva-api
sudo systemctl status aiva-bridge
```

### 3. Service Management Commands

```bash
# Stop services
sudo systemctl stop aiva-python
sudo systemctl stop aiva-api
sudo systemctl stop aiva-bridge

# Restart services
sudo systemctl restart aiva-python
sudo systemctl restart aiva-api
sudo systemctl restart aiva-bridge

# View logs
sudo journalctl -u aiva-python -f
sudo journalctl -u aiva-api -f
sudo journalctl -u aiva-bridge -f

# Or view log files directly
tail -f /var/log/aiva-python.log
tail -f /var/log/aiva-api.log
tail -f /var/log/aiva-bridge.log
```

---

## Verification & Testing

### 1. Health Checks

```bash
# Python Service
curl http://localhost:62002/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.2",
#   "whoami": "aiva-python",
#   "timestamp": "2025-11-12T...",
#   "services": {
#     "redis": true,
#     "mysql": true,
#     "openai": true
#   }
# }

# Node.js API
curl http://localhost:62001/api/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2025-11-12T..."
# }
```

### 2. Database Connection Test

```bash
cd /etc/aiva-oai/api
node src/tests/test-db-setup.js
```

### 3. Python Service API Test

```bash
# Test embeddings endpoint
curl -X POST http://localhost:62002/api/v1/embeddings \
  -H "X-API-Key: your-secure-python-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello world",
    "model": "text-embedding-3-small"
  }'

# Expected response with embedding vector
```

### 4. Document Upload Test

```bash
# Create test PDF
echo "Test document content" > test.txt

# Upload document
curl -X POST http://localhost:62001/api/knowledge/test-tenant-001/kb-001/documents/upload \
  -H "Authorization: Bearer your-jwt-token" \
  -F "file=@test.txt" \
  -F "filename=test.txt"
```

### 5. Image Upload Test

```bash
# Upload image
curl -X POST http://localhost:62002/api/v1/images/upload \
  -H "X-API-Key: your-secure-python-api-key-here" \
  -F "file=@test-image.jpg" \
  -F "kb_id=kb-001" \
  -F "tenant_id=test-tenant-001"
```

### 6. Search Test

```bash
# Search knowledge base
curl -X POST http://localhost:62002/api/v1/search \
  -H "X-API-Key: your-secure-python-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "kb_id": "kb-001",
    "query": "test query",
    "top_k": 5,
    "search_type": "hybrid"
  }'
```

---

## Troubleshooting

### Common Issues

#### 1. **Python Service Won't Start**

**Symptoms:** Service fails to start or crashes

**Solutions:**

```bash
# Check logs
sudo journalctl -u aiva-python -n 50

# Common issues:
# - Missing dependencies
pip list | grep -E "fastapi|torch|transformers"

# - Port already in use
sudo lsof -i :62002
sudo kill -9 <PID>

# - Missing NLTK data
python -c "import nltk; nltk.download('punkt')"

# - Wrong Python version
python3.11 --version
```

#### 2. **MySQL Connection Failed**

**Symptoms:** "Can't connect to MySQL server"

**Solutions:**

```bash
# Check MySQL status
sudo systemctl status mysql

# Test connection
mysql -u aiva_user -p aiva_platform

# Check user permissions
mysql -u root -p
SHOW GRANTS FOR 'aiva_user'@'localhost';

# Verify database exists
SHOW DATABASES LIKE 'aiva_platform';
```

#### 3. **Redis Connection Failed**

**Symptoms:** "Connection refused to Redis"

**Solutions:**

```bash
# Check Redis status
sudo systemctl status redis-server

# Test connection
redis-cli ping
# Should return: PONG

# Check Redis config
sudo nano /etc/redis/redis.conf
# Ensure: bind 127.0.0.1
# Ensure: port 6379
```

#### 4. **OpenAI API Errors**

**Symptoms:** "Invalid API key" or rate limit errors

**Solutions:**

```bash
# Verify API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check account credits
# Visit: https://platform.openai.com/usage

# Test embeddings
curl https://api.openai.com/v1/embeddings \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": "test",
    "model": "text-embedding-3-small"
  }'
```

#### 5. **Image Search Not Working**

**Symptoms:** Images not being found or embedded

**Solutions:**

```bash
# Check CLIP model loaded
cd /etc/aiva-oai/python-service
source venv/bin/activate
python -c "from transformers import CLIPProcessor, CLIPModel; print('✓ CLIP available')"

# Check image storage directory
ls -la /etc/aiva-oai/storage/images/

# Check permissions
sudo chmod -R 755 /etc/aiva-oai/storage/images/
sudo chown -R $USER:$USER /etc/aiva-oai/storage/images/

# Verify FAISS index
# Check logs for FAISS index creation/loading
tail -f /var/log/aiva-python.log | grep -i faiss
```

#### 6. **File Upload Fails**

**Symptoms:** "File too large" or upload errors

**Solutions:**

```bash
# Check storage path permissions
ls -la /etc/aiva-oai/storage/documents/
sudo chmod -R 755 /etc/aiva-oai/storage/
sudo chown -R $USER:$USER /etc/aiva-oai/storage/

# Check disk space
df -h /etc/aiva-oai/storage/

# Check file size limits in .env
grep MAX_FILE_SIZE /etc/aiva-oai/api/.env
grep MAX_IMAGE_SIZE /etc/aiva-oai/python-service/.env
```

#### 7. **Bridge Service Issues**

**Symptoms:** Asterisk calls not connecting

**Solutions:**

```bash
# Check Asterisk status
sudo asterisk -rx "core show channels"

# Check bridge logs
tail -f /var/log/aiva-bridge.log

# Test WebSocket connection
# Check if OpenAI Realtime API is accessible
curl -i -N \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "OpenAI-Beta: realtime=v1" \
  https://api.openai.com/v1/realtime
```

### Performance Issues

#### Slow Search Performance

```bash
# Check Redis memory usage
redis-cli INFO memory

# Check MySQL query performance
mysql -u aiva_user -p aiva_platform
SHOW PROCESSLIST;

# Optimize MySQL tables
OPTIMIZE TABLE yovo_tbl_aiva_document_chunks;
OPTIMIZE TABLE yovo_tbl_aiva_images;

# Add indexes if missing
ALTER TABLE yovo_tbl_aiva_document_chunks ADD INDEX idx_kb_content (kb_id, content(100));
```

#### High Memory Usage

```bash
# Check Python service memory
ps aux | grep uvicorn

# Reduce workers if needed
# Edit: /etc/systemd/system/aiva-python.service
# Change: --workers 4 to --workers 2

# Check FAISS index size
du -sh /etc/aiva-oai/storage/images/*/faiss_*

# Clear Redis cache if needed
redis-cli FLUSHDB
```

---

## Additional Configuration

### Nginx Reverse Proxy (Optional)

```nginx
# /etc/nginx/sites-available/aiva
upstream aiva_api {
    server localhost:62001;
}

upstream aiva_python {
    server localhost:62002;
}

server {
    listen 80;
    server_name aiva.yourdomain.com;

    # API
    location /api {
        proxy_pass http://aiva_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Python Service (internal only)
    location /python {
        deny all;
    }

    # Dashboard
    location / {
        root /var/www/aiva;
        try_files $uri $uri/ /index.html;
    }

    # File upload size
    client_max_body_size 100M;
}
```

### Firewall Configuration

```bash
# Allow necessary ports
sudo ufw allow 62001/tcp  # API
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 5060/udp   # SIP (if using Asterisk)
sudo ufw allow 10000:20000/udp  # RTP (if using Asterisk)

# Block Python service from external access
sudo ufw deny 62002/tcp

sudo ufw enable
```

---

## Maintenance

### Backup Strategy

```bash
#!/bin/bash
# /etc/aiva-oai/backup.sh

BACKUP_DIR="/backup/aiva"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup MySQL
mysqldump -u aiva_user -p aiva_platform > $BACKUP_DIR/aiva_db_$DATE.sql

# Backup Redis (optional, as vectors can be regenerated)
redis-cli --rdb $BACKUP_DIR/redis_$DATE.rdb

# Backup documents and images
tar -czf $BACKUP_DIR/storage_$DATE.tar.gz /etc/aiva-oai/storage/

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /etc/aiva-oai/*/.env

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
```

### Log Rotation

```bash
# /etc/logrotate.d/aiva
/var/log/aiva-*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

---

## Summary

This installation guide provides complete setup instructions for the AIVA platform including:

- ✅ System architecture overview
- ✅ Prerequisites and dependencies
- ✅ Service component descriptions
- ✅ Step-by-step installation
- ✅ Database schema and configuration
- ✅ Environment variable setup
- ✅ Systemd service management
- ✅ Testing and verification
- ✅ Troubleshooting guide

For additional support:
- Check service logs: `/var/log/aiva-*.log`
- Review documentation in each service's README
- Verify all API keys are valid
- Ensure sufficient credits in OpenAI account

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025
