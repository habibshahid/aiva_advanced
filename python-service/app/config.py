"""
Configuration settings for Python service
"""

from pydantic_settings import BaseSettings
from typing import Optional
import os

class Settings(BaseSettings):
    # Service
    PYTHON_HOST: str = "0.0.0.0"
    PYTHON_PORT: int = 5000
    PYTHON_WORKERS: int = 4
    PYTHON_API_KEY: str = os.getenv('PYTHON_API_KEY', '')
    
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str
    DB_NAME: str = "yovo_db_cc"
    
    # Redis
    REDIS_HOST: str = "127.0.0.1"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: Optional[str] = None
    REDIS_DB: int = 5
    REDIS_VECTOR_PREFIX: str = "vector:"

    # ADD THESE LINES - Semantic Caching Configuration
    SEMANTIC_CACHE_TTL: int = 3600  # Cache TTL in seconds (1 hour)
    SEMANTIC_CACHE_SIMILARITY_THRESHOLD: float = 0.95  # 95% similarity required
    ENABLE_SEMANTIC_CACHE: bool = True  # Enable/disable caching
    
    # ============================================================
    # RAG Enhancement Feature Flags
    # All disabled by default - enable incrementally
    # ============================================================
    
    # Query Expansion - Rule-based synonym/variation expansion (FREE - no API cost)
    ENABLE_QUERY_EXPANSION: bool = bool(os.getenv('ENABLE_QUERY_EXPANSION', 'false').lower() == 'true')
    QUERY_EXPANSION_MAX_VARIATIONS: int = int(os.getenv('QUERY_EXPANSION_MAX_VARIATIONS', '5'))
    
    # Query Rewriting - LLM-based context-aware query improvement (COST: ~$0.001/query)
    ENABLE_QUERY_REWRITING: bool = bool(os.getenv('ENABLE_QUERY_REWRITING', 'false').lower() == 'true')
    QUERY_REWRITER_MODEL: str = os.getenv('QUERY_REWRITER_MODEL', 'gpt-4o-mini')
    
    # BM25 Keyword Search - Hybrid semantic + keyword retrieval (FREE)
    ENABLE_BM25_SEARCH: bool = bool(os.getenv('ENABLE_BM25_SEARCH', 'false').lower() == 'true')
    BM25_WEIGHT: float = float(os.getenv('BM25_WEIGHT', '0.3'))  # 0.3 = 30% BM25, 70% vector
    
    # MMR Diversity - Avoid duplicate/similar chunks (FREE)
    ENABLE_MMR_DIVERSITY: bool = bool(os.getenv('ENABLE_MMR_DIVERSITY', 'false').lower() == 'true')
    MMR_LAMBDA: float = float(os.getenv('MMR_LAMBDA', '0.7'))  # 0 = max diversity, 1 = max relevance
    
    # Relevance Threshold - Filter low-quality results (FREE)
    ENABLE_RELEVANCE_THRESHOLD: bool = bool(os.getenv('ENABLE_RELEVANCE_THRESHOLD', 'false').lower() == 'true')
    MIN_RELEVANCE_SCORE: float = float(os.getenv('MIN_RELEVANCE_SCORE', '0.5'))
    
    # Reranking - Cross-encoder or LLM reranking (COST: varies by type)
    ENABLE_RERANKING: bool = bool(os.getenv('ENABLE_RERANKING', 'false').lower() == 'true')
    RERANKER_TYPE: str = os.getenv('RERANKER_TYPE', 'simple')  # 'simple', 'llm', or 'hybrid'
    RERANKER_MODEL: str = os.getenv('RERANKER_MODEL', 'gpt-4o-mini')
    
    # Content-Aware Chunking - Intelligent chunking based on content type (FREE)
    ENABLE_CONTENT_AWARE_CHUNKING: bool = bool(os.getenv('ENABLE_CONTENT_AWARE_CHUNKING', 'false').lower() == 'true')
    
    # Lower semantic cache threshold for better hit rate
    # RECOMMENDATION: Change existing SEMANTIC_CACHE_SIMILARITY_THRESHOLD from 0.95 to 0.85
    
    # NEW V2 Features - Intent-Aware Filtering
    # Detects query intent (create, find, explain) and boosts/penalizes results based on context
    # Example: "how to create purchase order" will boost chunks about PO creation
    #          and penalize chunks that just mention PO in wrong context (like GRN)
    ENABLE_INTENT_FILTER: bool = bool(os.getenv('ENABLE_INTENT_FILTER', 'true').lower() == 'true')  # ON by default!
    ENABLE_CONTEXT_ENRICHMENT: bool = bool(os.getenv('ENABLE_CONTEXT_ENRICHMENT', 'true').lower() == 'true')  # ON by default!

    
    # OpenAI
    OPENAI_API_KEY: str
    
    FIRECRAWL_API_KEY: Optional[str] = os.getenv('FIRECRAWL_API_KEY', None)
    
    # Embedding
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536
    
    # CLIP
    CLIP_MODEL: str = "ViT-B/32"
    USE_GPU: bool = False
    
    # Processing
    MAX_CHUNK_SIZE: int = 2000
    DEFAULT_CHUNK_SIZE: int = 500
    DEFAULT_CHUNK_OVERLAP: int = 50
    MAX_WORKERS: int = 4
    PROCESSING_TIMEOUT: int = 300
    
    # File Limits
    MAX_FILE_SIZE_MB: int = 50
    MAX_PAGES_PER_DOCUMENT: int = 1000
    
    STORAGE_PATH: str = "/etc/aiva-oai/storage"
    
    IMAGE_PROCESSING_CONCURRENCY: int = int(os.getenv('IMAGE_PROCESSING_CONCURRENCY', '1'))
    
    # Logging
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')
    
    # ============================================
    # TABLE PROCESSING (GPT-based table-to-text)
    # ============================================
    ENABLE_TABLE_PROCESSING: bool = True
    TABLE_PROCESSING_MODEL: str = "gpt-4o-mini"
    MAX_TABLES_PER_DOC: int = 100
    DECOMPOSE_TABLES: bool = True

    TABLE_VISION_MODEL: str = "gpt-4o"  # Vision model for table extraction
    USE_VISION_FOR_TABLES: bool = True 

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()