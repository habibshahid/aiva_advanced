"""
Response models
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime


class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: str
    services: Dict[str, bool]


class DocumentProcessingResult(BaseModel):
    total_pages: int
    total_chunks: int
    extracted_images: int
    detected_tables: int
    detected_faqs: int
    chunks_by_type: Dict[str, int]
    language_detected: List[str]
    has_roman_urdu: bool
    processing_time_ms: int


class EmbeddingResult(BaseModel):
    total_embeddings_generated: int
    embedding_model: str
    total_tokens_embedded: int
    vector_dimension: int


class DocumentUploadResponse(BaseModel):
    document_id: str
    filename: str
    file_type: str
    file_size_bytes: int
    status: str
    processing_results: Optional[DocumentProcessingResult] = None
    embeddings: Optional[EmbeddingResult] = None
    cost: float


class TextResult(BaseModel):
    result_id: str
    type: str
    content: str
    source: Dict[str, Any]
    score: float
    scoring_details: Dict[str, float]
    highlight: Optional[str] = None


class ImageResult(BaseModel):
    result_id: str
    type: str
    image_url: str
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    score: float
    scoring_details: Dict[str, float]
    source: Dict[str, Any]
    metadata: Dict[str, Any]


class ProductResult(BaseModel):
    result_id: str
    type: str
    product_id: str
    name: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    price: Optional[Dict[str, Any]] = None
    availability: Optional[Dict[str, Any]] = None
    score: float
    scoring_details: Any
    metadata: Dict[str, Any]
    url: Optional[str] = None


class SearchResults(BaseModel):
    total_found: int
    returned: int
    search_type: str
    text_results: List[TextResult] = []
    image_results: List[ImageResult] = []
    product_results: List[ProductResult] = []


class SearchMetrics(BaseModel):
    query_tokens: Optional[int] = None
    embedding_model: Optional[str] = None
    processing_time_ms: int
    chunks_searched: int


class SearchResponse(BaseModel):
    results: SearchResults
    metrics: SearchMetrics
    cost: float


class EmbeddingResponse(BaseModel):
    embedding: List[float]
    model: str
    tokens: int
    dimension: int


class ErrorResponse(BaseModel):
    error: str
    details: Optional[Any] = None
    timestamp: str
    
class ImageResult(BaseModel):
    result_id: str
    type: str
    image_id: Optional[str] = None
    filename: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    description: Optional[str] = None
    score: float
    similarity: Optional[float] = None
    scoring_details: Optional[Dict[str, float]] = None
    source: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any]
    search_type: Optional[str] = None

class ImageUploadResponse(BaseModel):
    image_id: str
    filename: str
    kb_id: str
    status: str
    processing_time_ms: int
    embedding_dimension: int
    cost: float


class ImageSearchResponse(BaseModel):
    total_found: int
    returned: int
    results: List[ImageResult]
    metrics: SearchMetrics
    cost: float