# AIVA Python Knowledge Service

Document processing, embeddings, and vector search service.

## Features

- ✅ Multi-format document processing (PDF, DOCX, PPTX, XLSX, HTML, TXT)
- ✅ Text extraction and cleaning
- ✅ Intelligent text chunking
- ✅ Roman Urdu detection and support
- ✅ OpenAI embeddings generation
- ✅ Vector storage in Redis
- ✅ Semantic search with cosine similarity
- ✅ Cost tracking for all operations
- ✅ MySQL integration for metadata
- ✅ API key authentication

## Installation
```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings
```

## Configuration

Edit `.env`:
```bash
# Service
PYTHON_HOST=0.0.0.0
PYTHON_PORT=5000
PYTHON_API_KEY=your-secure-api-key

# Database
DB_HOST=localhost
DB_PASSWORD=your_mysql_password

# OpenAI
OPENAI_API_KEY=sk-your-key

# Redis
REDIS_HOST=127.0.0.1
```

## Running
```bash
# Development
python -m app.main

# Production with uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 5000 --workers 4
```

## API Endpoints

### Health Check
```
GET /health
```

### Document Upload
```
POST /api/v1/documents/upload
Headers: X-API-Key: your-api-key
Body: multipart/form-data
  - file: document file
  - kb_id: knowledge base ID
  - tenant_id: tenant ID
  - metadata: JSON string (optional)
```

### Search
```
POST /api/v1/search
Headers: X-API-Key: your-api-key
Body: {
  "kb_id": "uuid",
  "query": "search text",
  "top_k": 5,
  "search_type": "hybrid"
}
```

### Generate Embeddings
```
POST /api/v1/embeddings
Headers: X-API-Key: your-api-key
Body: {
  "text": "text to embed",
  "model": "text-embedding-3-small"
}
```

## Testing
```bash
# Test health
curl http://localhost:5000/health

# Test with API key
curl -X POST http://localhost:5000/api/v1/embeddings \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "model": "text-embedding-3-small"}'
```

## Architecture
```
python-service/
├── app/
│   ├── main.py              # FastAPI app
│   ├── config.py            # Settings
│   ├── models/              # Request/response models
│   ├── services/            # Business logic
│   │   ├── document_processor.py
│   │   ├── text_processor.py
│   │   ├── embeddings.py
│   │   └── vector_store.py
│   ├── utils/               # Utilities
│   │   ├── roman_urdu.py
│   │   ├── chunking.py
│   │   └── cost_tracking.py
│   └── routes/              # API endpoints
```

## Cost Tracking

All operations track costs:
- Document processing: $0.0001/page + embedding costs
- Search: $0.0005 + embedding costs
- Embeddings: OpenAI pricing + 20% margin

## Roman Urdu Support

Automatically detects and handles Roman Urdu text (Urdu written in Latin script).

## License

Proprietary - AIVA Platform