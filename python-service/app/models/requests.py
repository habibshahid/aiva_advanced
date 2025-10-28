"""
Request models
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class DocumentUploadRequest(BaseModel):
    kb_id: str = Field(..., description="Knowledge base ID")
    tenant_id: str = Field(..., description="Tenant ID")
    metadata: Optional[Dict[str, Any]] = Field(default={}, description="Additional metadata")


class SearchRequest(BaseModel):
    kb_id: str = Field(..., description="Knowledge base ID")
    query: str = Field(..., min_length=1, max_length=1000, description="Search query")
    image: Optional[str] = Field(None, description="Base64 encoded image or URL")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")
    search_type: str = Field("hybrid", pattern="^(text|image|hybrid)$")
    filters: Optional[Dict[str, Any]] = Field(default={}, description="Additional filters")


class EmbeddingRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to embed")
    model: str = Field("text-embedding-3-small", description="Embedding model")


class ImageProcessRequest(BaseModel):
    image: str = Field(..., description="Base64 encoded image or URL")
    kb_id: str = Field(..., description="Knowledge base ID")


class BatchSearchRequest(BaseModel):
    kb_id: str = Field(..., description="Knowledge base ID")
    queries: List[str] = Field(..., min_items=1, max_items=10)
    top_k: int = Field(5, ge=1, le=20)
    
class ImageUploadRequest(BaseModel):
    kb_id: str = Field(..., description="Knowledge base ID")
    tenant_id: str = Field(..., description="Tenant ID")
    metadata: Optional[Dict[str, Any]] = Field(default={}, description="Additional metadata")


class ImageSearchRequest(BaseModel):
    kb_id: str = Field(..., description="Knowledge base ID")
    query: Optional[str] = Field(None, description="Text query for search")
    image_base64: Optional[str] = Field(None, description="Base64 encoded image for search")
    top_k: int = Field(5, ge=1, le=20, description="Number of results")
    search_type: str = Field("text", pattern="^(text|image|hybrid)$", description="Search type")
    text_weight: Optional[float] = Field(0.5, ge=0, le=1, description="Weight for text in hybrid search")
    filters: Optional[Dict[str, Any]] = Field(default={}, description="Metadata filters")