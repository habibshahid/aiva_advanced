# AIVA - AI Voice & Chat Agent Platform
## Comprehensive Sales & Technical Documentation

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Architecture](#2-platform-architecture)
3. [Voice AI Agents (Complete Guide)](#3-voice-ai-agents-complete-guide)
   - [OpenAI Realtime Provider](#31-openai-realtime-provider)
   - [Deepgram Provider](#32-deepgram-provider)
   - [Custom Provider (Intellicon AIVA)](#33-custom-provider-intellicon-aiva)
   - [Intent-Based IVR Provider](#34-intent-based-ivr-provider)
   - [Voice Provider Comparison](#35-voice-provider-comparison)
4. [Chat AI Models](#4-chat-ai-models)
   - [Supported Chat Models](#41-supported-chat-models)
   - [Model Selection Guide](#42-model-selection-guide)
5. [Knowledge Base Management](#5-knowledge-base-management)
6. [E-commerce Integration](#6-e-commerce-integration)
7. [Analytics & Reporting](#7-analytics--reporting)
   - [Dashboard Overview](#71-dashboard-overview)
   - [Call Analytics](#72-call-analytics)
   - [Chat Analytics](#73-chat-analytics)
   - [Sentiment Analysis](#74-sentiment-analysis)
   - [Agent Performance](#75-agent-performance)
   - [Cost Analytics](#76-cost-analytics)
8. [Pricing & Cost Structure](#8-pricing--cost-structure)
   - [Voice Call Pricing](#81-voice-call-pricing)
   - [Chat Pricing](#82-chat-pricing)
   - [Knowledge Base Operations](#83-knowledge-base-operations)
   - [Profit Margin Configuration](#84-profit-margin-configuration)
9. [Multi-Tenant Architecture](#9-multi-tenant-architecture)
10. [API & Integration](#10-api--integration)
11. [Industry Use Cases](#11-industry-use-cases)
12. [Competitive Advantages](#12-competitive-advantages)

---

# 1. Executive Summary

AIVA (AI Voice & Chat Agent) is a comprehensive, enterprise-grade platform that enables businesses to deploy intelligent conversational AI agents across voice and chat channels. Built on a multi-tenant SaaS architecture, AIVA combines cutting-edge AI technologies with practical business features.

## Key Value Propositions

| Metric | Impact |
|--------|--------|
| **Cost Reduction** | Up to 70% reduction in customer service costs |
| **Availability** | 24/7/365 automated support coverage |
| **Response Time** | Sub-3 second response time |
| **Resolution Rate** | 80%+ first-contact resolution |
| **Scalability** | Handle unlimited concurrent conversations |

## Core Capabilities

- **Multi-Provider Voice AI** - 4 different voice providers for different use cases
- **Intelligent Chat** - OMNI Channel Integration
- **Knowledge Management** - Document upload, web scraping, Images processing, semantic search
- **E-commerce Ready** - Native Shopify integration with product recommendations
- **Real-time Analytics** - Sentiment analysis, intent detection, cost tracking
- **Enterprise Security** - Multi-tenant isolation, Role Based Access Control, API management for third-party integrations

---

# 2. Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           AIVA PLATFORM                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    │
│  │   React Admin   │    │   Chat Widget   │    │   Public API    │    │
│  │    Dashboard    │    │    (Embed)      │    │   (REST/WS)     │    │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    │
│           │                      │                      │              │
│  ─────────┴──────────────────────┴──────────────────────┴─────────     │
│                          Node.js API Layer                             │
│                    (Express + Swagger Documentation)                   │
│  ─────────────────────────────────────────────────────────────────     │
│           │                      │                      │              │
│  ┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐    │
│  │   Voice Bridge  │    │  Chat Service   │    │ Knowledge Base  │    │
│  │  (Asterisk PBX) │    │   (WebSocket)   │    │  (Vector DB)    │    │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘    │
│           │                      │                      │              │
│  ─────────┴──────────────────────┴──────────────────────┴─────────     │
│                        AI Provider Layer                               │
│       OpenAI │ Deepgram │ Groq │ Anthropic │ DeepSeek │ Moonshot      │
│  ─────────────────────────────────────────────────────────────────     │
│           │                      │                      │              │
│  ┌────────┴────────┐    ┌────────┴────────┐    ┌────────┴────────┐    │
│  │     MySQL       │    │     Redis       │    │    MongoDB      │    │
│  │  (Primary DB)   │    │    (Cache)      │    │   (Call Logs)   │    │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 3. Voice AI Agents (Complete Guide)

AIVA supports **4 distinct voice providers**, each optimized for different use cases, costs, and quality requirements.

## 3.1 OpenAI Realtime Provider

The **premium option** using OpenAI's native Realtime API for the most natural voice conversations.

### Technical Specifications

| Component | Details |
|-----------|---------|
| **API** | OpenAI Realtime WebSocket API |
| **Models** | `gpt-4o-realtime-preview-2024-12-17`, `gpt-4o-mini-realtime-preview-2024-12-17` |
| **Latency** | ~300-500ms end-to-end |
| **Quality** | Highest - native speech understanding |

### Available Voices

| Voice | Description |
|-------|-------------|
| `alloy` | Neutral, balanced |
| `ash` | Warm, conversational |
| `ballad` | Soft, melodic |
| `coral` | Clear, professional |
| `echo` | Dynamic, engaging |
| `sage` | Calm, wise |
| `shimmer` | Bright, friendly (default) |
| `verse` | Expressive, dramatic |
| `marin` | Natural, smooth |
| `cedar` | Deep, authoritative |

### Configuration Options

```javascript
{
  provider: 'openai',
  model: 'gpt-4o-mini-realtime-preview-2024-12-17',
  voice: 'shimmer',
  language: 'en',
  temperature: 0.6,
  vad_threshold: 0.5,
  silence_duration_ms: 700
}
```

### Best For
- High-value customer interactions
- Complex problem-solving conversations
- Premium customer segments
- Use cases requiring highest quality
- Multi-Linguagal
- Support for Urdu language is very good

### Downside
- Per minute cost is high
---

## 3.2 Deepgram Provider

**Balanced option** combining Deepgram's superior STT with flexible TTS choices.

### Technical Specifications

| Component | Details |
|-----------|---------|
| **STT** | Deepgram Nova-2/Nova-3 |
| **TTS** | Deepgram Aura or OpenAI TTS |
| **LLM** | GPT-4o-mini (via API) |
| **Latency** | ~400-600ms end-to-end |

### STT Models

| Model | Speed | Accuracy | Cost |
|-------|-------|----------|------|
| `nova-2` | Fast | High | $0.0043/min |
| `nova-3` | Moderate | Highest | $0.0059/min |
| `whisper` | Slow | Very High | $0.0048/min |

### TTS Voices

**Deepgram Aura Voices:**
- `aura-asteria-en` - American English female
- `aura-luna-en` - British English female
- `aura-stella-en` - American English female (warm)
- `aura-orion-en` - American English male
- `aura-arcas-en` - American English male (deep)

**OpenAI Voices (also available):**
- All OpenAI voices (alloy, shimmer, nova, etc.)

### Configuration

```javascript
{
  provider: 'deepgram',
  deepgram_model: 'nova-2',
  deepgram_voice: 'aura-asteria-en',  // or OpenAI voice
  deepgram_language: 'en',
  temperature: 0.6
}
```

### Best For
- High-volume call centers
- Cost-sensitive deployments
- Multi-language requirements
- When STT accuracy is critical

### Downside
- Support for Urdu language is not available

---

## 3.3 Custom Provider (Intellicon AIVA)

**Most flexible and cost-effective option** using best-of-breed components.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Custom Voice Provider                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Audio In ──► Soniox STT ──► Groq/OpenAI LLM ──► TTS ──► Out  │
│                                                                 │
│   STT Options:        LLM Options:       TTS Options:          │
│   • Soniox            • Groq (Llama)     • Uplift AI           │
│                       • OpenAI (GPT)      • Azure               │
│                                           • OpenAI              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Options

#### Speech-to-Text (STT)
| Provider | Model | Languages | Features |
|----------|-------|-----------|----------|
| **Soniox** | `stt-rt-preview` | 50+ including Urdu | Real-time, VAD, endpoint detection |

#### Large Language Model (LLM)
| Provider | Model | Speed | Cost |
|----------|-------|-------|------|
| **Groq** | `llama-3.3-70b-versatile` | Ultra-fast | ~$0.59/1M tokens |
| **Groq** | `llama-3.1-8b-instant` | Fastest | ~$0.05/1M tokens |
| **OpenAI** | `gpt-4o-mini` | Fast | ~$0.15/1M tokens |
| **OpenAI** | `gpt-4o` | Moderate | ~$2.50/1M tokens |

#### Text-to-Speech (TTS)
| Provider | Voices | Output Format | Best For |
|----------|--------|---------------|----------|
| **Uplift AI** | Pakistani voices (Urdu, Punjabi) | ULAW 8kHz, MP3 | Regional languages |
| **Azure** | 400+ voices, 140 languages | PCM 24kHz | Global deployments |
| **OpenAI** | 10 voices | MP3/PCM | Quality-first |

### Configuration

```javascript
{
  provider: 'custom',
  // STT
  language_hints: ['ur', 'en'],
  
  // LLM
  llm_model: 'llama-3.3-70b-versatile',
  temperature: 0.6,
  
  // TTS
  tts_provider: 'uplift',  // or 'azure', 'openai'
  custom_voice: 'v_meklc281'  // Uplift voice ID
}
```

### Uplift AI Voice Options

| Voice ID | Language | Gender | Description |
|----------|----------|--------|-------------|
| `v_meklc281` | Urdu | Female | Natural Pakistani voice |
| `ayesha` | Urdu | Female | Professional |
| `ur-PK-female` | Urdu | Female | Standard |
| `ur-PK-male` | Urdu | Male | Standard |

### Best For
- **Regional language support** (Urdu, Punjabi, etc.)
- **Cost optimization** (cheapest option)
- **Maximum flexibility**
- **High-volume operations**

---

## 3.4 Intent-Based IVR Provider

**Lowest cost option** using pre-recorded audio with intent classification.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Intent IVR Provider                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Audio In ──► Soniox STT ──► Intent Classifier ──► Audio Out  │
│                                      │                          │
│                               ┌──────┴──────┐                   │
│                               │   Intents   │                   │
│                               │   Database  │                   │
│                               └─────────────┘                   │
│                                                                 │
│   Classification:            Audio Source:                      │
│   • LLM-based (Groq)         • Pre-recorded files              │
│   • Keyword matching         • TTS-generated cache             │
│   • Embedding similarity     • Dynamic TTS fallback            │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

1. **Speech Recognition** - Soniox STT transcribes caller speech
2. **Intent Classification** - LLM matches transcript to configured intents
3. **Response Selection** - Plays pre-recorded audio for matched intent
4. **Dynamic Fallback** - TTS generation for unmatched queries

### Intent Configuration

```javascript
// Example Intent
{
  name: 'check_order_status',
  description: 'Customer wants to check their order status',
  trigger_phrases: [
    'order status', 'where is my order', 
    'track my order', 'delivery status'
  ],
  trigger_keywords: ['order', 'tracking', 'delivery'],
  response_text: 'Please provide your order number to check the status.',
  audio_file: 'intents/order_status_prompt.mp3',
  is_active: true
}
```

### Classification Methods

| Method | Accuracy | Speed | Cost |
|--------|----------|-------|------|
| **LLM** (Groq) | Highest | Fast | ~$0.001/query |
| **Embedding** | High | Fastest | ~$0.0002/query |
| **Keyword** | Moderate | Instant | Free |

### Configuration

```javascript
{
  provider: 'intent-ivr',
  
  // STT
  stt_provider: 'soniox',
  language_hints: ['ur', 'en'],
  
  // Classification
  classifier_type: 'llm',  // or 'embedding', 'keyword'
  classifier_model: 'llama-3.3-70b-versatile',
  confidence_threshold: 0.70,
  
  // TTS (for fallback)
  tts_provider: 'uplift',
  custom_voice: 'ayesha'
}
```

### Best For
- **High-volume simple queries** (FAQs, menu navigation)
- **Maximum cost efficiency**
- **Predictable conversations**
- **IVR replacement/modernization**

---

## 3.5 Voice Provider Comparison

| Feature | OpenAI Realtime | Deepgram | Custom | Intent IVR |
|---------|-----------------|----------|--------|------------|
| **Latency** | 300-500ms | 400-600ms | 500-800ms | 200-400ms |
| **Quality** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Cost/min** | ~$0.12 | ~$0.06 | ~$0.03 | ~$0.01 |
| **Urdu Support** | Good | Limited | Excellent | Excellent |
| **Flexibility** | Low | Medium | High | Medium |
| **Setup Complexity** | Easy | Easy | Medium | Medium |
| **Best For** | Premium | Balanced | Regional | High-Volume |

### Cost Breakdown (Per Minute)

| Provider | STT | LLM | TTS | Total |
|----------|-----|-----|-----|-------|
| **OpenAI Realtime** | Included | Included | Included | ~$0.12 |
| **Deepgram** | $0.0043 | ~$0.02 | ~$0.015 | ~$0.04 |
| **Custom (Groq+Uplift)** | ~$0.01 | ~$0.01 | ~$0.01 | ~$0.03 |
| **Intent IVR** | ~$0.01 | ~$0.001 | ~$0.00* | ~$0.01 |

*Pre-recorded audio has no per-use cost

---

# 4. Chat AI Models

## 4.1 Supported Chat Models

AIVA supports multiple LLM providers for chat, allowing cost/quality optimization.

### Groq Models (Fastest & Cheapest)

| Model | Input Cost | Output Cost | Speed | Best For |
|-------|------------|-------------|-------|----------|
| `llama-3.3-70b-versatile` | $0.59/1M | $0.79/1M | ⚡⚡⚡⚡ | **Default - Best value** |
| `llama-3.1-8b-instant` | $0.05/1M | $0.08/1M | ⚡⚡⚡⚡⚡ | Simple queries, highest speed |
| `llama-4-scout-17b-16e` | $0.11/1M | $0.34/1M | ⚡⚡⚡⚡ | Preview - Latest Llama |
| `llama-4-maverick-17b-128e` | $0.20/1M | $0.60/1M | ⚡⚡⚡ | Extended context |
| `qwen3-32b` | $0.29/1M | $0.59/1M | ⚡⚡⚡⚡ | Reasoning tasks |
| `gpt-oss-120b` | $0.15/1M | $0.60/1M | ⚡⚡⚡ | OpenAI OSS on Groq |
| `gpt-oss-20b` | $0.075/1M | $0.30/1M | ⚡⚡⚡⚡ | Fast OSS option |

### OpenAI Models

| Model | Input Cost | Output Cost | Speed | Best For |
|-------|------------|-------------|-------|----------|
| `gpt-4o-mini` | $0.15/1M | $0.60/1M | ⚡⚡⚡⚡ | **Best for multilingual (Urdu)** |
| `gpt-4o` | $2.50/1M | $10.00/1M | ⚡⚡⚡ | **Highest quality** |
| `gpt-4-turbo` | $10.00/1M | $30.00/1M | ⚡⚡ | Legacy, large context |
| `o1-mini` | $3.00/1M | $12.00/1M | ⚡⚡ | Reasoning tasks |
| `o1` | $15.00/1M | $60.00/1M | ⚡ | Advanced reasoning |
| `gpt-3.5-turbo` | $0.50/1M | $1.50/1M | ⚡⚡⚡⚡ | Budget option |

### Anthropic Models (Claude)

| Model | Input Cost | Output Cost | Speed | Best For |
|-------|------------|-------------|-------|----------|
| `claude-3-5-haiku-20241022` | $0.80/1M | $4.00/1M | ⚡⚡⚡⚡ | Fast, efficient |
| `claude-3-5-sonnet-latest` | $3.00/1M | $15.00/1M | ⚡⚡⚡ | **Best quality Claude** |
| `claude-3-opus-20240229` | $15.00/1M | $75.00/1M | ⚡⚡ | Maximum capability |

### DeepSeek Models

| Model | Input Cost | Output Cost | Speed | Best For |
|-------|------------|-------------|-------|----------|
| `deepseek-chat` | $0.14/1M | $0.28/1M | ⚡⚡⚡⚡ | Budget with good quality |
| `deepseek-reasoner` | $0.55/1M | $2.19/1M | ⚡⚡⚡ | Complex reasoning |

### Moonshot/Kimi Models

| Model | Input Cost | Output Cost | Speed | Best For |
|-------|------------|-------------|-------|----------|
| `moonshot-v1-128k` | $0.74/1M | $0.74/1M | ⚡⚡⚡ | Long documents |
| `kimi-latest` | $0.55/1M | $2.00/1M | ⚡⚡⚡ | Chinese language |

## 4.2 Model Selection Guide

### By Use Case

| Use Case | Recommended Model | Why |
|----------|-------------------|-----|
| **E-commerce Support** | `llama-3.3-70b-versatile` | Fast, cheap, good quality |
| **Banking/Financial** | `gpt-4o-mini` | Accurate, reliable |
| **Urdu/Regional** | `gpt-4o-mini` | Best multilingual |
| **Simple FAQs** | `llama-3.1-8b-instant` | Cheapest, fastest |
| **Complex Analysis** | `gpt-4o` or `claude-3-5-sonnet` | Highest capability |
| **Budget Operations** | `deepseek-chat` | Very cheap, decent quality |

### Cost Comparison (Per 1000 Conversations)

Assuming average 1500 input + 500 output tokens per conversation:

| Model | Cost per 1K Conversations |
|-------|---------------------------|
| `llama-3.1-8b-instant` | $0.12 |
| `deepseek-chat` | $0.35 |
| `llama-3.3-70b-versatile` | $1.28 |
| `gpt-4o-mini` | $0.53 |
| `gpt-4o` | $8.75 |
| `claude-3-5-sonnet` | $12.00 |

---

# 5. Knowledge Base Management

## Features

### Content Sources

| Source | Supported Formats |
|--------|-------------------|
| **Documents** | PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), Text |
| **Web** | Single URL, Full site crawl, Sitemap import |
| **E-commerce** | Shopify products, descriptions, reviews |
| **Images** | PNG, JPG, GIF (with CLIP embeddings) |

### Search Capabilities

| Feature | Description |
|---------|-------------|
| **Semantic Search** | Vector embeddings for meaning-based retrieval |
| **Visual Search** | CLIP embeddings for image similarity |
| **Semantic Cache** | Cache similar queries, reduce costs 50-70% |
| **Source Citations** | Responses include source document links |
| **Auto-Tagging** | AI-powered categorization |

### Anti-Hallucination

- Responses restricted to knowledge base content
- Confidence scoring for retrieved information
- Automatic "I don't know" for low-confidence queries
- Source verification in responses

---

# 6. E-commerce Integration

## Shopify Features

| Feature | Description |
|---------|-------------|
| **Product Sync** | Automatic sync of products, variants, images, pricing |
| **Order Lookup** | Check status by order number, email, or phone |
| **AI Recommendations** | Semantic search for product matching |
| **Review Integration** | Include product reviews in responses |
| **Inventory Check** | Real-time stock availability |

## Order Status Functions

```javascript
// Available via function calling
check_order_status({
  order_number: 'CZ-123456',  // or
  email: 'customer@email.com',  // or
  phone: '+923001234567'
})
```

## Product Search

```javascript
search_products({
  query: 'comfortable running shoes under 5000',
  limit: 5,
  include_reviews: true
})
```

---

# 7. Analytics & Reporting

## 7.1 Dashboard Overview

### Key Metrics

| Metric | Description |
|--------|-------------|
| **Total Interactions** | Combined calls + chats |
| **Completion Rate** | Successfully completed conversations |
| **Average Duration** | Mean conversation length |
| **Total Cost** | Platform usage cost |
| **Cost Saved** | Estimated savings vs human agents |

### Available Filters

- Date range (from/to)
- Agent selection
- Channel (voice/chat)
- Sentiment
- Status

## 7.2 Call Analytics

### Call Report Fields

| Field | Description |
|-------|-------------|
| `call_id` | Unique identifier |
| `caller_id` | Phone number |
| `agent_name` | AI agent name |
| `duration_seconds` | Call length |
| `status` | completed, failed, transferred |
| `sentiment` | positive, negative, neutral, mixed |
| `sentiment_score` | 0-1 score |
| `primary_intents` | Detected customer intents |
| `final_cost` | Total cost for call |
| `issue_resolved` | Boolean resolution status |

### Call Details Available

- Full transcription with timestamps
- Speaker identification (agent/customer)
- Per-message sentiment analysis
- Language detection
- Profanity detection
- Intent classification per turn

## 7.3 Chat Analytics

### Chat Session Fields

| Field | Description |
|-------|-------------|
| `session_id` | Unique identifier |
| `session_name` | Auto-generated or custom name |
| `agent_name` | AI agent name |
| `total_messages` | Message count |
| `status` | active, completed, abandoned |
| `sentiment` | Overall conversation sentiment |
| `total_cost` | Session cost |
| `feedback` | Customer rating (good/bad) |

### Message-Level Analysis

- Content and timestamps
- Token usage per message
- Cost per message
- Sentiment per message
- Knowledge base citations used

## 7.4 Sentiment Analysis

### Sentiment Categories

| Category | Score Range | Description |
|----------|-------------|-------------|
| **Positive** | 0.6 - 1.0 | Happy, satisfied customer |
| **Neutral** | 0.4 - 0.6 | Informational, no strong emotion |
| **Negative** | 0.0 - 0.4 | Frustrated, unhappy customer |
| **Mixed** | Varies | Multiple emotions detected |

### Sentiment Metrics

- Overall sentiment score (0-1)
- Sentiment progression over conversation
- Peak emotion detection
- Customer satisfaction indicator
- Emotion timeline

### Satisfaction Indicators

| Indicator | Description |
|-----------|-------------|
| `likely_satisfied` | Positive outcome predicted |
| `likely_unsatisfied` | Negative outcome predicted |
| `neutral` | No strong indication |

## 7.5 Agent Performance

### Performance Metrics

| Metric | Description |
|--------|-------------|
| `call_count` | Total calls handled |
| `chat_count` | Total chats handled |
| `avg_duration` | Average conversation length |
| `avg_sentiment` | Mean sentiment score |
| `resolution_rate` | Issues resolved percentage |
| `transfer_rate` | Transferred to human percentage |
| `total_cost` | Agent operation cost |

### Comparative Analysis

- Agent vs agent comparison
- Performance over time trends
- Peak performance hours
- Top intents by agent
- Topic distribution

## 7.6 Cost Analytics

### Cost Breakdown Categories

| Category | Description |
|----------|-------------|
| **LLM Completions** | Token costs for AI responses |
| **Call Transcription** | STT costs for voice calls |
| **Chat Analysis** | Message analysis costs |
| **Sentiment Analysis** | Emotion detection costs |
| **Intent Detection** | Purpose classification costs |
| **Language Processing** | Translation/detection costs |
| **Embeddings** | Vector generation costs |

### Cost Tracking Features

- Per-interaction cost tracking
- Daily/weekly/monthly trends
- Cost by agent breakdown
- Estimated days remaining (based on credit balance)
- Profit margin tracking

### Export Options

| Format | Description |
|--------|-------------|
| **CSV** | Spreadsheet-compatible export |
| **PDF** | Formatted report document |
| **API** | Programmatic data access |

---

# 8. Pricing & Cost Structure

## 8.1 Voice Call Pricing

### OpenAI Realtime

| Component | Cost |
|-----------|------|
| Audio Input | $0.06/minute ($100/1M tokens) |
| Audio Output | $0.24/minute ($200/1M tokens) |
| Text Input | $5.00/1M tokens |
| Text Output | $20.00/1M tokens |
| **Typical Call (3 min)** | ~$0.35 |

### Deepgram

| Component | Cost |
|-----------|------|
| Nova-2 STT | $0.0043/minute |
| Nova-3 STT | $0.0059/minute |
| Aura TTS | $0.015/1K characters |
| LLM (GPT-4o-mini) | ~$0.02/call |
| **Typical Call (3 min)** | ~$0.12 |

### Custom Provider

| Component | Cost |
|-----------|------|
| Soniox STT | ~$0.01/minute |
| Groq LLM | ~$0.01/call |
| Uplift TTS | ~$0.01/call |
| **Typical Call (3 min)** | ~$0.09 |

### Intent IVR

| Component | Cost |
|-----------|------|
| Soniox STT | ~$0.01/minute |
| Classification | ~$0.001/query |
| Pre-recorded Audio | $0.00 |
| **Typical Call (3 min)** | ~$0.03 |

## 8.2 Chat Pricing

### Per Conversation Cost (Typical 2000 tokens)

| Model | Cost |
|-------|------|
| Llama 3.3 70B (Groq) | $0.0014 |
| GPT-4o-mini | $0.0006 |
| GPT-4o | $0.0125 |
| Claude 3.5 Sonnet | $0.0165 |
| DeepSeek Chat | $0.0004 |

### Knowledge Base Retrieval

| Operation | Cost |
|-----------|------|
| Query embedding | ~$0.00002 |
| Vector search | ~$0.0005 |
| **Total per query** | ~$0.0007 |

## 8.3 Knowledge Base Operations

### Document Processing

| Operation | Cost |
|-----------|------|
| PDF/Word processing | $0.01/page |
| Image processing (CLIP) | $0.002/image |
| Embedding generation | $0.02/1M tokens |
| Storage | $0.023/GB/month |

### Web Scraping

| Operation | Cost |
|-----------|------|
| Page crawl | $0.005/page |
| Content extraction | $0.01/page |
| Embedding | $0.02/1M tokens |

## 8.4 Profit Margin Configuration

AIVA applies a configurable profit margin on top of base costs:

```javascript
// Environment configuration
PROFIT_MARGIN_PERCENT=20  // Default 20%

// Cost calculation
base_cost = sum(all_provider_costs)
profit_amount = base_cost * (PROFIT_MARGIN_PERCENT / 100)
final_cost = base_cost + profit_amount
```

### Credit System

- Tenants purchase credits upfront
- Credits deducted per interaction
- Real-time balance tracking
- Low balance alerts
- Usage forecasting

---

# 9. Multi-Tenant Architecture

## Tenant Isolation

| Component | Isolation Level |
|-----------|-----------------|
| **Database** | Tenant ID filtering on all tables |
| **API Keys** | Per-tenant API key management |
| **Agents** | Tenant-scoped agent access |
| **Knowledge Base** | Separate vector namespaces |
| **Analytics** | Tenant-filtered reporting |
| **Billing** | Independent credit accounts |

## User Roles

| Role | Permissions |
|------|-------------|
| **Super Admin** | Full platform access, manage all tenants |
| **Admin** | Full organization access, user management |
| **Agent Manager** | Create/edit agents, view analytics |
| **Client** | View-only access to reports |

## Role Capabilities

| Capability | Super Admin | Admin | Agent Manager | Client |
|------------|-------------|-------|---------------|--------|
| Manage Tenants | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ✅ | ❌ | ❌ |
| Create Agents | ✅ | ✅ | ✅ | ❌ |
| Edit Agents | ✅ | ✅ | ✅ | ❌ |
| View Analytics | ✅ | ✅ | ✅ | ✅ |
| Manage KB | ✅ | ✅ | ✅ | ❌ |
| API Keys | ✅ | ✅ | ❌ | ❌ |
| Billing | ✅ | ✅ | ❌ | ❌ |

---

# 10. API & Integration

## Authentication Methods

| Method | Use Case |
|--------|----------|
| **JWT Bearer Token** | Dashboard, user sessions |
| **API Key** | Server-to-server integration |

## Key Endpoints

### Agents
```
GET    /api/agents              # List agents
POST   /api/agents              # Create agent
GET    /api/agents/:id          # Get agent
PUT    /api/agents/:id          # Update agent
DELETE /api/agents/:id          # Delete agent
```

### Chat
```
POST   /api/chat/session        # Create session
POST   /api/chat/message        # Send message
GET    /api/chat/history/:id    # Get history
```

### Knowledge Base
```
GET    /api/knowledge-bases     # List KBs
POST   /api/knowledge-bases     # Create KB
POST   /api/kb/:id/upload       # Upload document
POST   /api/kb/:id/scrape       # Scrape URL
POST   /api/kb/:id/search       # Search KB
```

### Analytics
```
GET    /api/analytics/overview       # Dashboard metrics
GET    /api/analytics/calls          # Call reports
GET    /api/analytics/chats          # Chat reports
GET    /api/analytics/costs          # Cost breakdown
GET    /api/analytics/agents/performance  # Agent stats
```

### Shopify
```
POST   /api/shopify/connect     # Connect store
GET    /api/shopify/products    # List products
POST   /api/shopify/sync        # Force sync
POST   /api/shopify/order-status # Lookup order
```

## Swagger Documentation

Full API documentation available at:
```
https://your-domain.com/api/api-docs
```

---

# 11. Industry Use Cases

## E-commerce & Retail

| Use Case | Features Used |
|----------|---------------|
| Product recommendations | KB + Shopify + Semantic search |
| Order tracking | Shopify order lookup |
| Size/fit guidance | Knowledge base |
| Returns processing | Function calling + KB |
| 24/7 shopping assistance | Chat widget |

**Results:** +35% conversion increase, 80% query automation

## Financial Services

| Use Case | Features Used |
|----------|---------------|
| Account balance inquiry | Secure function calling |
| Transaction verification | Voice authentication |
| Loan status checks | API integration |
| Payment reminders | Outbound voice |
| Fraud alerts | Real-time monitoring |

**Results:** 60% call deflection, 24/7 availability

## Healthcare

| Use Case | Features Used |
|----------|---------------|
| Appointment scheduling | Function calling |
| Prescription refills | Secure KB + API |
| Insurance verification | Integration |
| Post-visit follow-up | Outbound campaigns |
| Symptom triage | Knowledge base |

**Results:** 60% no-show reduction, improved patient access

## Customer Support

| Use Case | Features Used |
|----------|---------------|
| Tier-1 ticket deflection | KB + Intent detection |
| Technical troubleshooting | Step-by-step guides |
| Billing inquiries | Function calling |
| Smart escalation | Transfer functions |
| Knowledge search | Semantic retrieval |

**Results:** 80% first-contact resolution, 70% cost reduction

---

# 12. Competitive Advantages

## Why AIVA?

### 1. Full-Stack Solution
- Voice + Chat + KB + E-commerce in **one platform**
- Unified analytics across channels
- Shared knowledge base
- Single dashboard

### 2. Provider Flexibility
- **4 voice providers** for different needs
- **10+ LLM options** for chat
- Mix and match per agent
- Easy provider switching

### 3. Regional Language Support
- **Urdu, Punjabi, Sindhi** via Uplift AI
- Local voice options
- Multi-language detection
- Roman Urdu support

### 4. Cost Transparency
- Per-interaction cost tracking
- Real-time cost analytics
- Configurable margins
- No hidden fees

### 5. Enterprise Ready
- Multi-tenant architecture
- Role-based access control
- API-first design
- White-label capable

### 6. Rapid Deployment
- Same-day setup possible
- No-code agent builder
- Pre-built integrations
- Comprehensive documentation

## Comparison vs Competitors

| Feature | AIVA | Competitor A | Competitor B |
|---------|------|--------------|--------------|
| Voice + Chat Unified | ✅ | ❌ | ❌ |
| Multiple Voice Providers | ✅ (4) | ❌ (1) | ❌ (1) |
| Urdu/Regional Support | ✅ | ❌ | Limited |
| Shopify Native | ✅ | Add-on | ❌ |
| Intent IVR | ✅ | ❌ | ❌ |
| Setup Time | Hours | Weeks | Days |
| Cost Tracking | Real-time | Monthly | Weekly |
| Multi-tenant | ✅ | ❌ | ✅ |
| Open LLM Support | ✅ | ❌ | ❌ |

---

# Contact Information

| Channel | Details |
|---------|---------|
| **Sales** | sales@contegris.com |
| **Support** | support@contegris.com |
| **Phone** | +92 42 3250 0900 |
| **Website** | www.intellicon.io |
| **Documentation** | docs.intellicon.io |

---

*Document Version: 1.0*  
*Last Updated: January 2025*  
*AIVA - AI Voice & Chat Agent Platform*