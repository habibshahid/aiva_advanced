# AIVA Platform - API Performance & Load Capacity Guide

**Version:** 1.0  
**Last Updated:** November 2025

---

## Table of Contents

1. [Overview](#overview)
2. [API Endpoints Reference](#api-endpoints-reference)
3. [Performance Characteristics](#performance-characteristics)
4. [Hardware Configurations](#hardware-configurations)
5. [Load Capacity Estimates](#load-capacity-estimates)
6. [Bottlenecks & Optimization](#bottlenecks--optimization)
7. [Monitoring & Metrics](#monitoring--metrics)
8. [Scaling Strategies](#scaling-strategies)

---

## Overview

This document provides detailed information about AIVA platform API performance, expected response times, concurrent user capacity, and hardware requirements for different load scenarios.

### Key Metrics
- **Response Times:** Average time to complete API requests
- **Throughput:** Requests per second (RPS) the system can handle
- **Concurrent Users:** Number of simultaneous active users
- **Concurrent Requests:** Number of simultaneous API calls
- **Resource Utilization:** CPU, RAM, I/O, and network usage

### Service Architecture
```
┌─────────────────────────────────────────────────────┐
│  Load Balancer (Optional)                           │
└─────────────────┬───────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼────┐  ┌────▼────┐  ┌────▼────┐
│Node.js │  │Node.js  │  │Node.js  │  (API Layer)
│ API #1 │  │ API #2  │  │ API #N  │
└───┬────┘  └────┬────┘  └────┬────┘
    │            │            │
    └────────────┼────────────┘
                 │
         ┌───────┴────────┐
         │                │
    ┌────▼────┐     ┌────▼─────┐
    │ Python  │     │  MySQL   │   (Processing Layer)
    │ Service │     │  + Redis │
    └─────────┘     └──────────┘
```

---

## API Endpoints Reference

### 1. Authentication & User Management

#### POST /api/auth/login
**Purpose:** User authentication  
**Payload:** `{ email, password }`  
**Avg Response Time:** 150-300ms  
**Bottleneck:** bcrypt password hashing  
**DB Queries:** 1 SELECT, 1 UPDATE  
**Rate Limit:** 5 requests/minute per IP (brute force protection)

#### POST /api/auth/register
**Purpose:** User registration  
**Payload:** `{ email, password, name, tenant_id }`  
**Avg Response Time:** 200-400ms  
**Bottleneck:** bcrypt password hashing  
**DB Queries:** 2 SELECT, 2 INSERT  
**Rate Limit:** 3 requests/hour per IP

---

### 2. Knowledge Base Management

#### POST /api/knowledge/:tenantId/knowledge-bases
**Purpose:** Create knowledge base  
**Payload:** `{ name, description, settings }`  
**Avg Response Time:** 50-100ms  
**DB Queries:** 1 INSERT, 1 SELECT  
**CPU:** Low  
**RAM:** Minimal

#### GET /api/knowledge/:tenantId/knowledge-bases
**Purpose:** List knowledge bases  
**Avg Response Time:** 30-80ms  
**DB Queries:** 1 SELECT with JOIN  
**CPU:** Low  
**RAM:** Minimal

#### GET /api/knowledge/:tenantId/knowledge-bases/:kbId
**Purpose:** Get knowledge base details  
**Avg Response Time:** 30-70ms  
**DB Queries:** 1 SELECT  
**Cache:** Redis cached for 5 minutes

---

### 3. Document Upload & Processing

#### POST /api/knowledge/:tenantId/knowledge-bases/:kbId/documents/upload
**Purpose:** Upload document for processing  
**Payload:** Multipart file (max 100MB)  
**Avg Response Time:** 200-500ms (file save only, async processing)  
**Processing Time (Async):** 
- PDF (10 pages): 5-15 seconds
- PDF (100 pages): 30-90 seconds
- DOCX (10 pages): 3-10 seconds
- PPTX (20 slides): 8-20 seconds

**Process Flow:**
1. Save file to disk: 200-500ms
2. Create DB record: 50ms
3. Return response (status: processing)
4. Background: Python service processes file (5-90 seconds)

**Python Service Processing:**
- Text extraction: 50-200ms per page
- Chunking: 10-50ms per page
- Embedding generation: 100-300ms per chunk (OpenAI API)
- Vector storage: 5-20ms per chunk (Redis)

**Bottlenecks:**
- OpenAI API embedding generation (network I/O)
- Disk I/O for large files
- CLIP model for PDF image extraction (CPU/RAM intensive)

**Resource Usage (per document):**
- CPU: 10-40% (single core) during processing
- RAM: 200MB-1GB (depends on document size)
- Disk I/O: 5-50MB/s write
- Network: OpenAI API calls (~10KB per embedding request)

---

### 4. Image Upload & Processing

#### POST /api/v1/images/upload
**Purpose:** Upload image for similarity search  
**Payload:** Multipart image file (max 10MB)  
**Avg Response Time:** 1-4 seconds (includes embedding generation)

**Process Flow:**
1. Validate & save image: 100-300ms
2. Load CLIP model (if not loaded): 2-5 seconds (first time only)
3. Generate embedding: 500-2000ms
4. Store in FAISS index: 50-200ms
5. Save to database: 50-100ms

**Bottlenecks:**
- CLIP model inference (CPU intensive)
- Image processing queue (controlled concurrency)

**Resource Usage (per image):**
- CPU: 30-80% (single core) during embedding
- RAM: 500MB-2GB (CLIP model loaded)
- GPU (if available): 50-200ms instead of 500-2000ms

**Queue Settings:**
- `IMAGE_PROCESSING_CONCURRENCY`: 1-10 (default: 1)
- Higher concurrency = more RAM needed
- Each concurrent task = ~500MB RAM

---

### 5. Search Operations

#### POST /api/v1/search
**Purpose:** Semantic search in knowledge base  
**Payload:** `{ kb_id, query, top_k, search_type }`  
**Avg Response Time:** 200-800ms

**Search Type Breakdown:**

**Text Search Only:**
- Generate query embedding: 100-300ms (OpenAI API)
- Redis vector search: 50-200ms (depends on KB size)
- Fetch chunk content: 20-100ms (MySQL)
- Total: 200-600ms

**Hybrid Search (Text + Images):**
- Text embedding: 100-300ms
- Image embedding: 500-2000ms (CLIP)
- Text vector search: 50-200ms
- Image vector search (FAISS): 10-50ms
- Merge results: 10-30ms
- Total: 700-2600ms

**With Product Search:**
- Add product search: +100-400ms
- Total: 300-3000ms

**Bottlenecks:**
- OpenAI API calls (network latency)
- CLIP model inference for image search
- Redis scan operations for large KBs (>100k vectors)

**Optimization:**
- Semantic caching (95% similarity threshold)
- Cached searches: 20-50ms
- Cache hit rate: 15-30% typical

---

### 6. Chat Operations

#### POST /api/chat/:sessionId/messages
**Purpose:** Send chat message, get AI response  
**Payload:** `{ content, role }`  
**Avg Response Time:** 1-5 seconds

**Process Flow:**
1. Validate & save user message: 50ms
2. Search knowledge base (if configured): 200-800ms
3. Generate AI response (OpenAI): 1-4 seconds
4. Save assistant message: 50ms
5. Deduct credits: 30ms

**Response Time Factors:**
- OpenAI model: gpt-4o (2-4s), gpt-4o-mini (1-2s)
- Knowledge base search: adds 200-800ms
- Output token length: 100 tokens (~1s), 500 tokens (~2-3s)

**Resource Usage:**
- CPU: Low (mostly waiting for OpenAI)
- RAM: 50-100MB per session
- Network: OpenAI API (streaming)

---

### 7. Real-time Voice Calls

#### WebSocket: /realtime/:agentId
**Purpose:** Real-time voice conversation (Asterisk bridge)  
**Avg Latency:** 200-500ms (end-to-end)

**Latency Breakdown:**
- RTP audio capture: 20-50ms
- Asterisk → Bridge: 20-50ms
- Bridge → OpenAI Realtime: 50-150ms
- OpenAI processing: 100-300ms
- OpenAI → Bridge → Asterisk: 50-100ms

**Concurrent Call Capacity:**
- Per Bridge Instance: 10-30 calls
- Resource usage per call:
  - CPU: 3-8% per call
  - RAM: 50-150MB per call
  - Network: 20-40 kbps per call

**Bottlenecks:**
- OpenAI Realtime API latency
- Network bandwidth for multiple calls
- CPU for audio processing

---

### 8. Function Calls (Agent Functions)

#### Varies by configuration
**Avg Response Time:** 100ms - 30 seconds

**External API Calls:**
- Simple API: 100-500ms
- Complex API: 1-5 seconds
- Timeout: 30 seconds (configurable)
- Retries: 2 attempts with exponential backoff

---

### 9. Shopify Integration

#### POST /api/shopify/:tenantId/sync
**Purpose:** Sync Shopify product catalog  
**Avg Time:** 5-60 minutes (depends on product count)

**Process Flow:**
1. Fetch product count: 500ms
2. Fetch products (paginated): 500ms per 250 products
3. Download images: 500-2000ms per image
4. Generate embeddings: 100-300ms per product (text), 500-2000ms per image
5. Store in database: 50ms per product

**Throughput:**
- ~1-3 products per second (with images)
- ~5-10 products per second (text only)
- Shopify rate limit: 2 requests/second

**Example Times:**
- 100 products: 5-10 minutes
- 500 products: 20-40 minutes
- 1000 products: 40-80 minutes

---

## Performance Characteristics

### Database Query Performance

**MySQL Queries:**

| Operation | Rows | Avg Time | Indexes Required |
|-----------|------|----------|------------------|
| User lookup by email | 1 | 5-15ms | idx_email |
| Knowledge base list | 10-100 | 20-80ms | idx_tenant |
| Document chunks fetch | 5-20 | 30-100ms | idx_kb, idx_document |
| Product search (metadata) | 10-100 | 50-200ms | idx_kb, idx_shopify_id |
| Call logs insert | 1 | 10-30ms | - |
| Credit balance update | 1 | 15-40ms | idx_tenant |

**Connection Pool:**
- Min connections: 5
- Max connections: 20
- Acquire timeout: 10 seconds

**Optimization:**
- Add indexes for frequently queried columns
- Use connection pooling
- Enable query caching
- Regular `OPTIMIZE TABLE` maintenance

---

### Redis Performance

**Vector Operations:**

| Operation | Vectors | Avg Time | Memory |
|-----------|---------|----------|--------|
| Store vector | 1 | 1-5ms | 6KB per vector |
| Search vectors (scan) | 1000 | 50-150ms | - |
| Search vectors (scan) | 10000 | 200-500ms | - |
| Search vectors (scan) | 100000 | 1-3s | - |
| Cache hit lookup | 1 | 1-3ms | - |
| Session data read | 1 | 2-8ms | - |

**Memory Usage:**
- Text embedding (1536 dims): ~6KB per vector
- Image embedding (512 dims): ~2KB per vector
- Typical KB (1000 docs, 10 chunks each): ~60MB
- Typical KB (10000 docs): ~600MB

**Optimization:**
- Use Redis clustering for >10GB data
- Enable persistence (RDB snapshots)
- Monitor memory usage

---

### Python Service Performance

**Uvicorn Workers:**
- Default: 4 workers
- CPU-bound tasks: 1 worker per CPU core
- I/O-bound tasks: 2x CPU cores

**CLIP Model:**
- Model size: ~600MB RAM
- Loading time: 2-5 seconds
- Inference time (CPU): 500-2000ms
- Inference time (GPU): 50-200ms
- Singleton pattern: Loaded once, shared across workers

**Document Processing:**
- PyMuPDF (PDF): 50-200ms per page
- python-docx (Word): 30-100ms per page
- python-pptx (PowerPoint): 100-300ms per slide
- openpyxl (Excel): 50-150ms per sheet

---

## Hardware Configurations

### Small Configuration (Development / Light Production)

**Specs:**
- **CPU:** 4 cores (3.0 GHz)
- **RAM:** 8GB
- **Storage:** 100GB SSD
- **Network:** 100 Mbps

**Service Configuration:**
- Python workers: 2
- Node.js instances: 1
- MySQL connections: 10
- Redis memory: 2GB
- Image concurrency: 1

**Estimated Capacity:**
- **Concurrent Users:** 10-25
- **API RPS:** 20-50
- **Chat Sessions:** 5-10 active
- **Voice Calls:** 2-5 simultaneous
- **Document Processing:** 1-2 at a time
- **Knowledge Bases:** 5-10 (up to 1000 docs each)

**Bottlenecks:**
- CPU: Image processing, CLIP model
- RAM: CLIP model (600MB) + Redis vectors
- Network: OpenAI API calls

**Monthly Costs (Cloud):**
- AWS t3.medium: ~$30-40
- DigitalOcean 4GB: ~$24
- Linode 8GB: ~$36

---

### Medium Configuration (Small to Medium Business)

**Specs:**
- **CPU:** 8 cores (3.5 GHz)
- **RAM:** 16GB
- **Storage:** 500GB SSD
- **Network:** 500 Mbps

**Service Configuration:**
- Python workers: 4
- Node.js instances: 2 (with load balancer)
- MySQL connections: 20
- Redis memory: 8GB
- Image concurrency: 2-3

**Estimated Capacity:**
- **Concurrent Users:** 50-100
- **API RPS:** 100-200
- **Chat Sessions:** 20-40 active
- **Voice Calls:** 10-15 simultaneous
- **Document Processing:** 3-5 at a time
- **Image Processing:** 2-3 at a time
- **Knowledge Bases:** 20-50 (up to 5000 docs each)

**Resource Allocation:**
- Python service: 4GB RAM
- Node.js API: 2GB RAM
- MySQL: 4GB RAM
- Redis: 4GB RAM
- System/Other: 2GB RAM

**Bottlenecks:**
- CPU: Concurrent document processing
- Network: Multiple OpenAI API calls
- I/O: Database writes during bulk operations

**Monthly Costs (Cloud):**
- AWS t3.xlarge: ~$120-150
- DigitalOcean 16GB: ~$96
- Linode 16GB: ~$96

---

### Large Configuration (Enterprise / High Volume)

**Specs:**
- **CPU:** 16 cores (4.0 GHz)
- **RAM:** 32GB
- **Storage:** 1TB SSD (NVMe)
- **Network:** 1 Gbps

**Service Configuration:**
- Python workers: 8
- Node.js instances: 4 (load balanced)
- MySQL connections: 50
- Redis memory: 16GB
- Image concurrency: 5-8

**Estimated Capacity:**
- **Concurrent Users:** 200-500
- **API RPS:** 500-1000
- **Chat Sessions:** 100-200 active
- **Voice Calls:** 30-50 simultaneous
- **Document Processing:** 8-12 at a time
- **Image Processing:** 5-8 at a time
- **Knowledge Bases:** 100+ (up to 20000 docs each)

**Resource Allocation:**
- Python service: 12GB RAM
- Node.js API: 6GB RAM
- MySQL: 8GB RAM
- Redis: 8GB RAM
- System/Other: 4GB RAM

**Optional Enhancements:**
- GPU: NVIDIA T4 or better (10x faster image processing)
- MySQL replication: Read replicas for search queries
- Redis cluster: Multiple nodes for >16GB data
- CDN: Static file delivery

**Bottlenecks:**
- Network: Multiple simultaneous OpenAI API calls
- OpenAI rate limits: May need higher tier
- Database: Write-heavy operations

**Monthly Costs (Cloud):**
- AWS c5.4xlarge: ~$500-600
- DigitalOcean 32GB: ~$192
- Linode 32GB: ~$192
- +GPU (optional): +$300-500

---

### Very Large Configuration (High-Scale Enterprise)

**Specs:**
- **CPU:** 32+ cores (4.5 GHz)
- **RAM:** 64GB+
- **Storage:** 2TB+ SSD (NVMe RAID)
- **Network:** 10 Gbps
- **GPU:** NVIDIA A10/A100

**Service Configuration:**
- Python workers: 16+
- Node.js instances: 8+ (load balanced, multiple servers)
- MySQL: Primary + Read replicas
- Redis: Cluster mode (6+ nodes)
- Image concurrency: 10-15

**Estimated Capacity:**
- **Concurrent Users:** 1000-5000+
- **API RPS:** 2000-5000+
- **Chat Sessions:** 500-1000+ active
- **Voice Calls:** 100-200+ simultaneous
- **Document Processing:** 20+ at a time
- **Image Processing:** 10-15 at a time (GPU accelerated)
- **Knowledge Bases:** 500+ (millions of documents)

**Architecture Changes:**
- **Microservices:** Separate servers for API, Python, Bridge
- **Load Balancing:** Multiple Node.js API instances
- **Database:** MySQL cluster with replication
- **Caching:** Redis cluster + CDN
- **Monitoring:** Prometheus + Grafana
- **Auto-scaling:** Kubernetes or similar

**Monthly Costs (Cloud):**
- AWS c5.9xlarge: ~$1200-1500
- +GPU A10G: +$1000-1500
- +Database cluster: +$500-1000
- +Redis cluster: +$300-500
- **Total:** ~$3000-5000+

---

## Load Capacity Estimates

### Concurrent Users vs Concurrent Requests

**Important Distinction:**
- **Concurrent Users:** Users actively using the system
- **Concurrent Requests:** Simultaneous API calls in-flight

**Ratio:** Typically 1 concurrent user = 0.1-0.3 concurrent requests

**Example:**
- 100 concurrent users
- Average think time: 10 seconds
- Average request duration: 300ms
- Concurrent requests: 100 × (0.3 / 10) = 3 concurrent requests

---

### Capacity by Use Case

#### 1. Document-Heavy Workload
**Profile:** Frequent document uploads and searches

**Hardware:** Medium (16GB RAM, 8 cores)

| Metric | Capacity |
|--------|----------|
| Concurrent users | 50-80 |
| Document uploads/hour | 100-200 |
| Searches/minute | 200-400 |
| Storage growth | 10-50GB/month |

**Bottleneck:** Python service CPU for document processing

---

#### 2. Chat-Heavy Workload
**Profile:** Many active chat sessions

**Hardware:** Medium (16GB RAM, 8 cores)

| Metric | Capacity |
|--------|----------|
| Concurrent users | 100-150 |
| Active chat sessions | 30-50 |
| Messages/minute | 500-1000 |
| OpenAI API calls/min | 500-1000 |

**Bottleneck:** OpenAI API rate limits, network latency

---

#### 3. Voice-Heavy Workload
**Profile:** Real-time voice calls

**Hardware:** Large (32GB RAM, 16 cores)

| Metric | Capacity |
|--------|----------|
| Concurrent calls | 30-50 |
| Call hours/day | 200-400 |
| Bridge instances | 2-3 |
| Network bandwidth | 500 Mbps - 1 Gbps |

**Bottleneck:** OpenAI Realtime API concurrency, network

---

#### 4. Mixed Workload
**Profile:** Balanced usage

**Hardware:** Large (32GB RAM, 16 cores)

| Metric | Capacity |
|--------|----------|
| Concurrent users | 200-300 |
| Active chats | 50-100 |
| Voice calls | 15-25 |
| Documents/hour | 50-100 |
| Searches/minute | 300-600 |

**Bottleneck:** Overall system resources, OpenAI rate limits

---

## Bottlenecks & Optimization

### Common Bottlenecks

#### 1. OpenAI API Limits
**Issue:** Rate limits and latency

**Limits:**
- Free tier: 3 RPM (requests per minute)
- Tier 1: 500 RPM, 200k TPM (tokens per minute)
- Tier 2: 5000 RPM, 2M TPM
- Tier 3: 10k RPM, 5M TPM

**Solutions:**
- Upgrade OpenAI tier
- Implement request queuing
- Use semantic caching (15-30% hit rate)
- Batch embedding requests
- Use cheaper models (gpt-4o-mini vs gpt-4o)

---

#### 2. CLIP Model Inference (CPU)
**Issue:** Slow image processing on CPU

**Bottleneck:**
- CPU: 500-2000ms per image
- GPU: 50-200ms per image (10x faster)

**Solutions:**
- Add GPU (NVIDIA T4 or better)
- Reduce image concurrency to 1-2 (conserve RAM)
- Queue image processing
- Pre-process images during off-peak hours

---

#### 3. Database Write Contention
**Issue:** Slow writes during bulk operations

**Solutions:**
- Use batch inserts (INSERT multiple rows)
- Optimize indexes (not too many)
- Use connection pooling
- Consider read replicas for searches
- Partition large tables

---

#### 4. Redis Memory Limits
**Issue:** Running out of memory for vectors

**Current Usage:**
- 1000 documents × 10 chunks × 6KB = 60MB
- 10,000 documents = 600MB
- 100,000 documents = 6GB

**Solutions:**
- Use Redis clustering (shard across nodes)
- Implement vector database (Pinecone, Weaviate)
- Archive old vectors
- Increase Redis memory limit

---

#### 5. Network Bandwidth
**Issue:** Multiple services calling OpenAI

**Solutions:**
- Increase network bandwidth
- Use CDN for static assets
- Implement connection pooling
- Cache frequent requests

---

### Optimization Strategies

#### 1. Caching Strategy
```
┌─────────────────────────────────────────┐
│ Request → Check Cache                   │
│           ↓                             │
│           Cache Hit? (20-30%)           │
│           ├─ Yes → Return (20-50ms)    │
│           └─ No → Process → Cache      │
└─────────────────────────────────────────┘
```

**What to Cache:**
- Semantic search results (95% similarity)
- Knowledge base metadata
- Agent configurations
- Product data

**Cache Layers:**
- L1: Application memory (agent configs)
- L2: Redis (search results, sessions)
- L3: CDN (static assets, images)

---

#### 2. Database Optimization

**Indexes:**
```sql
-- Critical indexes
CREATE INDEX idx_tenant ON yovo_tbl_aiva_knowledge_bases(tenant_id);
CREATE INDEX idx_kb_status ON yovo_tbl_aiva_documents(kb_id, status);
CREATE INDEX idx_chunks_kb ON yovo_tbl_aiva_document_chunks(kb_id, document_id);
CREATE INDEX idx_products_kb ON yovo_tbl_aiva_products(kb_id, tenant_id);
CREATE INDEX idx_sessions_active ON yovo_tbl_aiva_chat_sessions(tenant_id, status);
```

**Query Optimization:**
- Use `EXPLAIN` to analyze slow queries
- Avoid `SELECT *`, specify columns
- Use `LIMIT` for pagination
- Use JOINs instead of sub-queries

---

#### 3. Worker Configuration

**Python Service (Uvicorn):**
```bash
# CPU-bound (document processing, CLIP)
workers = CPU_cores

# I/O-bound (API calls, database)
workers = CPU_cores * 2

# Balanced (default)
workers = 4
```

**Node.js API:**
```bash
# Single instance per server
# Use PM2 or cluster mode for multiple processes

pm2 start src/index.js -i 4  # 4 instances
```

**Image Processing Concurrency:**
```env
# Low RAM (8GB): 1-2
IMAGE_PROCESSING_CONCURRENCY=1

# Medium RAM (16GB): 2-4
IMAGE_PROCESSING_CONCURRENCY=3

# High RAM (32GB): 5-8
IMAGE_PROCESSING_CONCURRENCY=6
```

---

#### 4. Rate Limiting

**Current Configuration:**
```javascript
// API rate limiter
windowMs: 15 * 60 * 1000  // 15 minutes
max: 100  // 100 requests per window

// Auth endpoints
windowMs: 60 * 1000  // 1 minute
max: 5  // 5 login attempts
```

**Shopify Sync:**
```javascript
rateLimitDelay: 500ms  // 2 requests/second (Shopify limit)
```

---

## Monitoring & Metrics

### Key Metrics to Track

#### 1. Application Metrics

**API Response Times:**
- p50 (median): Should be <500ms
- p95: Should be <2s
- p99: Should be <5s

**Error Rates:**
- 2xx responses: >98%
- 4xx errors: <1%
- 5xx errors: <0.5%

**Throughput:**
- Requests per second (RPS)
- Documents processed per hour
- Messages sent per minute

---

#### 2. System Metrics

**CPU Usage:**
- Average: <60%
- Peak: <80%
- Alert if >85% for >5 minutes

**Memory Usage:**
- Average: <70%
- Peak: <85%
- Alert if >90%

**Disk I/O:**
- Read: Monitor slow queries
- Write: Monitor during bulk operations
- Alert if >80% utilization

**Network:**
- Bandwidth utilization: <70%
- Latency to OpenAI: <200ms
- Alert if >500ms

---

#### 3. Database Metrics

**MySQL:**
- Slow queries: <1% of total
- Connection pool: <80% used
- Replication lag: <1 second (if using replicas)

**Redis:**
- Memory usage: <80%
- Hit rate: >70%
- Eviction rate: Monitor

---

#### 4. External Service Metrics

**OpenAI API:**
- Response time: Monitor
- Rate limit hits: Alert
- Error rate: <1%

**Shopify API:**
- Sync success rate: >95%
- Rate limit compliance: Monitor

---

### Monitoring Tools

#### Recommended Stack

**Application Monitoring:**
- Prometheus (metrics collection)
- Grafana (visualization)
- AlertManager (alerts)

**Log Management:**
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Or Loki + Grafana

**APM (Application Performance Monitoring):**
- New Relic
- DataDog
- Elastic APM

**Uptime Monitoring:**
- UptimeRobot
- Pingdom
- StatusCake

---

### Sample Grafana Dashboard Metrics

```
┌─────────────────────────────────────────────────┐
│ AIVA Platform Dashboard                          │
├─────────────────────────────────────────────────┤
│ 📊 API Metrics                                   │
│   • Requests/sec: 45.2                          │
│   • Avg Response Time: 324ms                    │
│   • Error Rate: 0.3%                            │
│                                                  │
│ 💾 System Resources                              │
│   • CPU: 45% (8 cores)                          │
│   • RAM: 12.4GB / 16GB (77%)                    │
│   • Disk I/O: 15 MB/s                           │
│                                                  │
│ 🗄️  Database                                     │
│   • MySQL Connections: 12 / 20                  │
│   • Slow Queries: 3                             │
│   • Redis Memory: 3.2GB / 8GB (40%)            │
│                                                  │
│ 🤖 AI Services                                   │
│   • OpenAI Requests: 120/min                    │
│   • Avg Latency: 1.2s                           │
│   • CLIP Inferences: 8/min                      │
│                                                  │
│ 📞 Voice Calls                                   │
│   • Active Calls: 5                             │
│   • Avg Call Duration: 4m 32s                   │
│   • Call Quality: 98.5%                         │
└─────────────────────────────────────────────────┘
```

---

## Scaling Strategies

### Vertical Scaling (Scale Up)

**When to Use:**
- Current server at 70-80% capacity
- Simple and immediate solution
- Cost-effective for small to medium growth

**How:**
1. Increase CPU cores (2x or 4x)
2. Add more RAM (16GB → 32GB → 64GB)
3. Upgrade to faster disks (SATA SSD → NVMe)
4. Add GPU for image processing

**Limits:**
- Single server max capacity
- Downtime during upgrades
- Cost increases exponentially

---

### Horizontal Scaling (Scale Out)

**When to Use:**
- Need >1000 concurrent users
- Want high availability
- Vertical scaling limits reached

**Architecture:**
```
                    ┌─────────────┐
                    │Load Balancer│
                    └──────┬──────┘
                           │
        ┏━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━┓
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  API Server 1 │  │  API Server 2 │  │  API Server N │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┴──────────────────┘
                           │
        ┏━━━━━━━━━━━━━━━━━━┻━━━━━━━━━━━━━━━━━━┓
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│Python Service1│  │MySQL Primary  │  │Redis Cluster  │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  
        ▼                  ▼                  
┌───────────────┐  ┌───────────────┐        
│Python Service2│  │MySQL Replica  │        
└───────────────┘  └───────────────┘        
```

**Components:**

**1. Load Balancer:**
- Nginx / HAProxy
- AWS ALB / ELB
- Cloudflare
- Distribute traffic across API servers

**2. Multiple API Servers:**
- 2-10 Node.js instances
- Session state in Redis (stateless servers)
- No local file storage (use S3 or NFS)

**3. Separate Python Service Servers:**
- Dedicated servers for document processing
- Queue-based processing (Bull, RabbitMQ)
- Scale independently

**4. Database Replication:**
- Primary: All writes
- Replicas: Read queries (searches)
- Split read/write workload

**5. Redis Cluster:**
- Multiple nodes for >16GB data
- Sharding for horizontal scaling
- High availability

---

### Microservices Architecture

**When to Use:**
- Enterprise scale (5000+ users)
- Need independent scaling
- Different teams managing services

**Services:**

```
┌─────────────────┐
│  API Gateway    │ (Kong, Tyk)
└────────┬────────┘
         │
    ┌────┴─────────────────────────┐
    │                              │
┌───▼─────────┐          ┌─────────▼───┐
│ Auth Service│          │Chat Service │
└─────────────┘          └─────────────┘
    │                              │
┌───▼─────────┐          ┌─────────▼───────┐
│KB Service   │          │ Voice Service   │
└─────────────┘          └─────────────────┘
    │                              │
┌───▼──────────┐         ┌─────────▼────────┐
│Python Service│         │ Shopify Service  │
└──────────────┘         └──────────────────┘
         │                         │
         └─────────┬───────────────┘
                   │
        ┌──────────▼──────────┐
        │ Shared Data Layer   │
        │ (MySQL + Redis)     │
        └─────────────────────┘
```

**Benefits:**
- Independent scaling
- Technology diversity
- Fault isolation
- Team autonomy

**Challenges:**
- Increased complexity
- Network overhead
- Distributed debugging
- Data consistency

---

### Auto-Scaling Configuration

**Kubernetes (K8s) Example:**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aiva-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aiva-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

**Scaling Triggers:**
- CPU > 70% for 5 minutes → Scale up
- CPU < 30% for 10 minutes → Scale down
- Memory > 80% → Scale up
- Request queue depth > 50 → Scale up

---

## Cost Optimization

### Cloud Cost Breakdown (Example: 1000 Concurrent Users)

**Infrastructure (AWS):**
- EC2 (c5.4xlarge): $500/month
- EBS Storage (1TB): $100/month
- Load Balancer: $20/month
- Data Transfer: $50/month
- **Total Infrastructure:** $670/month

**External Services:**
- OpenAI API: $500-2000/month (usage-based)
- Deepgram (optional): $100-500/month
- Monitoring (DataDog): $100/month
- **Total External:** $700-2600/month

**Total Monthly:** $1370-3270

**Per User Cost:** $1.37-3.27/month

---

### Cost Reduction Strategies

1. **Use Reserved Instances:** Save 30-50% on cloud costs
2. **Auto-scaling:** Reduce resources during off-peak
3. **Semantic Caching:** Reduce OpenAI API calls by 15-30%
4. **Cheaper Models:** Use gpt-4o-mini instead of gpt-4o (83% cheaper)
5. **Compress Data:** Reduce storage and transfer costs
6. **Monitor Usage:** Identify and optimize expensive operations

---

## Summary & Recommendations

### Capacity Planning Guidelines

**For <50 Concurrent Users:**
- Start with Small config (8GB RAM, 4 cores)
- Single server deployment
- Cost: ~$30-50/month

**For 50-200 Concurrent Users:**
- Medium config (16GB RAM, 8 cores)
- Consider separating Python service
- Cost: ~$100-200/month

**For 200-1000 Concurrent Users:**
- Large config (32GB RAM, 16 cores)
- Add GPU for image processing
- Implement caching aggressively
- Consider load balancing
- Cost: ~$500-1000/month

**For 1000+ Concurrent Users:**
- Multiple servers (horizontal scaling)
- Database replication
- Redis cluster
- CDN for static assets
- Auto-scaling
- Cost: $2000+/month

---

### Performance Checklist

**Before Launch:**
- [ ] Add database indexes
- [ ] Configure connection pooling
- [ ] Enable Redis caching
- [ ] Set up monitoring (Grafana)
- [ ] Configure rate limiting
- [ ] Test with load testing tool (k6, JMeter)
- [ ] Set up alerts for critical metrics

**During Operation:**
- [ ] Monitor CPU/RAM usage daily
- [ ] Review slow query logs weekly
- [ ] Analyze OpenAI API usage monthly
- [ ] Test backup restore process monthly
- [ ] Review and optimize costs quarterly

---

### Load Testing Recommendations

**Tools:**
- Apache JMeter
- k6 (Grafana)
- Locust
- Artillery

**Test Scenarios:**
1. **Baseline:** 10 users, 30 minutes
2. **Normal Load:** 50 users, 1 hour
3. **Peak Load:** 200 users, 30 minutes
4. **Stress Test:** Increase until failure
5. **Spike Test:** Sudden 10x traffic increase
6. **Endurance Test:** Normal load, 24 hours

**Metrics to Measure:**
- Response times (p50, p95, p99)
- Error rates
- Throughput (RPS)
- Resource utilization
- Database connection pool

---

**Document Version:** 1.0  
**Last Updated:** November 12, 2025

---

## Appendix: Quick Reference

### Hardware Sizing Quick Reference

| Users | CPU | RAM | Storage | Est. Cost/mo |
|-------|-----|-----|---------|--------------|
| 10-25 | 4 cores | 8GB | 100GB | $30-50 |
| 50-100 | 8 cores | 16GB | 500GB | $100-150 |
| 200-500 | 16 cores | 32GB | 1TB | $500-600 |
| 1000+ | 32+ cores | 64GB+ | 2TB+ | $2000+ |

### Response Time Quick Reference

| Endpoint | Avg Time | Cache Hit |
|----------|----------|-----------|
| Auth | 150-300ms | - |
| KB List | 30-80ms | 20-50ms |
| Doc Upload | 200-500ms | - |
| Image Upload | 1-4s | - |
| Text Search | 200-600ms | 20-50ms |
| Hybrid Search | 700-2600ms | 30-100ms |
| Chat Message | 1-5s | - |
| Voice Call Latency | 200-500ms | - |

### Bottleneck Quick Reference

| Symptom | Likely Cause | Solution |
|---------|-------------|----------|
| Slow searches | Large KB, no indexes | Add indexes, Redis cluster |
| Slow uploads | CPU bottleneck | Add workers, reduce concurrency |
| High latency | OpenAI API | Increase tier, caching |
| Out of memory | CLIP model, vectors | Add RAM, reduce concurrency |
| Database slow | No indexes, pool exhausted | Add indexes, increase pool |
