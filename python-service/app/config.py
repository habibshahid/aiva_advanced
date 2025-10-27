"""
Configuration settings for Python service
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Service
    PYTHON_HOST: str = "0.0.0.0"
    PYTHON_PORT: int = 5000
    PYTHON_WORKERS: int = 4
    PYTHON_API_KEY: str
    
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
    REDIS_DB: int = 1
    REDIS_VECTOR_PREFIX: str = "vector:"
    
    # OpenAI
    OPENAI_API_KEY: str
    
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
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()