"""
Vector Store Service
Store and search vectors in Redis
"""

import json
import logging
import re
from typing import List, Dict, Any, Optional
import numpy as np
import redis
import mysql.connector

from app.config import settings
from app.services.embeddings import EmbeddingService
from app.services.semantic_cache import SemanticCache 

logger = logging.getLogger(__name__)


class VectorStore:
    """Store and search vectors"""
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=False  # We need binary for vectors
        )
        
        self.embedding_service = EmbeddingService()
        self.prefix = settings.REDIS_VECTOR_PREFIX
        
        self.semantic_cache = SemanticCache()
        self.enable_cache = getattr(settings, 'ENABLE_SEMANTIC_CACHE', True)
    
    def _get_mysql_connection(self):
        """Get MySQL connection"""
        return mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
    
    async def store_document(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[Dict[str, Any]]
    ):
        """
        Store document chunks and embeddings
        """
        conn = self._get_mysql_connection()
        cursor = conn.cursor()
        
        try:
            # First, check if document record exists
            cursor.execute(
                "SELECT id FROM yovo_tbl_aiva_documents WHERE id = %s",
                (document_id,)
            )
            doc_exists = cursor.fetchone()
            
            # If document doesn't exist, we need to create it first
            # This should have been done in the document_processor, but let's handle it here too
            if not doc_exists:
                logger.warning(f"Document {document_id} not found, creating record...")
                cursor.execute("""
                    INSERT INTO yovo_tbl_aiva_documents 
                    (id, kb_id, tenant_id, filename, original_filename, file_type,
                     file_size_bytes, storage_url, status, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """, (
                    document_id,
                    kb_id,
                    tenant_id,
                    f"doc_{document_id}",
                    "unknown",
                    "text/plain",
                    0,
                    f"/storage/documents/{document_id}",
                    "processing"
                ))
                logger.info(f"Created document record for {document_id}")
            
            # Create embedding lookup
            embedding_map = {emb["chunk_id"]: emb for emb in embeddings}
            
            # Store chunks in MySQL
            for chunk in chunks:
                chunk_id = chunk["chunk_id"]
                embedding_data = embedding_map.get(chunk_id)
                
                if not embedding_data:
                    logger.warning(f"No embedding for chunk {chunk_id}")
                    continue
                
                # Insert chunk into MySQL
                cursor.execute("""
                    INSERT INTO yovo_tbl_aiva_document_chunks 
                    (id, document_id, kb_id, chunk_index, content, chunk_type, metadata, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """, (
                    chunk_id,
                    document_id,
                    kb_id,
                    chunk["chunk_index"],
                    chunk["content"],
                    chunk.get("chunk_type", "text"),
                    json.dumps(chunk.get("metadata", {}))
                ))
                
                # Store vector in Redis
                vector_key = f"{self.prefix}{kb_id}:{chunk_id}"
                vector_data = {
                    "chunk_id": chunk_id,
                    "document_id": document_id,
                    "kb_id": kb_id,
                    "embedding": embedding_data["embedding"],
                    "content": chunk["content"][:500],  # Store preview
                    "chunk_type": chunk.get("chunk_type", "text"),
                    "metadata": chunk.get("metadata", {})
                }
                
                self.redis_client.set(
                    vector_key,
                    json.dumps(vector_data)
                )
            
            # Update document status to completed
            cursor.execute("""
                UPDATE yovo_tbl_aiva_documents 
                SET status = 'completed', updated_at = NOW()
                WHERE id = %s
            """, (document_id,))
            
            conn.commit()
            logger.info(f"Stored {len(chunks)} chunks for document {document_id}")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"Error storing document: {e}")
            raise
        finally:
            cursor.close()
            conn.close()
    
    async def search(
        self,
        kb_id: str,
        query: str,
        image: Optional[str] = None,
        top_k: int = 5,
        search_type: str = "hybrid",
        filters: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Search vectors using cosine similarity with semantic caching
        
        Args:
            kb_id: Knowledge base ID
            query: Search query
            image: Optional image for hybrid/image search
            top_k: Number of results to return
            search_type: Type of search (text/image/hybrid)
            filters: Optional metadata filters
            
        Returns:
            Search results dictionary
        """
        import time
        search_start = time.time()
        
        # Generate query embedding
        query_embedding_result = await self.embedding_service.generate_embedding(query)
        query_embedding = np.array(query_embedding_result["embedding"])
        query_tokens = query_embedding_result["tokens"]
        
        # CHECK SEMANTIC CACHE FIRST (if enabled)
        if self.enable_cache and search_type == "text":
            cached_result = await self.semantic_cache.get_cached_result(
                kb_id=kb_id,
                query=query,
                query_embedding=query_embedding.tolist(),
                search_type=search_type
            )
            
            if cached_result:
                search_time = int((time.time() - search_start) * 1000)
                
                # ✅ Return cached results with proper SearchResult structure
                text_results = cached_result['results'].get('text_results', [])
                
                # Format cached results to match SearchResult/TextResult model
                formatted_text_results = []
                for r in text_results:
                    formatted_text_results.append({
                        "result_id": r.get("chunk_id") or r.get("result_id", "unknown"),
                        "type": r.get("type", "text"),
                        "content": r.get("content", ""),
                        "source": r.get("source", {
                            "document_id": r.get("document_id"),
                            "document_name": r.get("title", "Document"),
                            "chunk_id": r.get("chunk_id")
                        }),
                        "score": r.get("score") or r.get("relevance_score", 0.0),
                        "scoring_details": r.get("scoring_details", {
                            "cosine_similarity": r.get("score") or r.get("relevance_score", 0.0),
                            "bm25_score": 0.0,
                            "combined_score": r.get("score") or r.get("relevance_score", 0.0)
                        }),
                        "metadata": r.get("metadata", {})
                    })
                
                return {
                    "total_found": cached_result['results'].get('total_found', 0),
                    "returned": cached_result['results'].get('returned', 0),
                    "text_results": formatted_text_results,
                    "image_results": cached_result['results'].get('image_results', []),
                    "product_results": cached_result['results'].get('product_results', []),
                    "query_tokens": cached_result['results'].get('query_tokens', query_tokens),
                    "embedding_model": cached_result['results'].get('embedding_model', ''),
                    "chunks_searched": cached_result['results'].get('chunks_searched', 0),
                    'cached': True,
                    'cache_similarity': cached_result.get('cache_similarity', 1.0),
                    'original_query': cached_result.get('original_query', query),
                    'cache_age_seconds': cached_result.get('cache_age_seconds', 0),
                    'search_time_ms': search_time
                }
        
        # CACHE MISS - Perform actual search
        # Get all vectors for this KB from Redis
        pattern = f"{self.prefix}{kb_id}:*"
        keys = self.redis_client.keys(pattern)
        
        # Filter out product keys - only get document chunks
        document_keys = [k for k in keys if b':product:' not in k]
    
        if not document_keys:
            text_results = []
            chunks_searched = 0
        else:
            # Calculate similarities for documents (existing code)
            similarities = []
            
            for key in document_keys:
                try:
                    vector_data = json.loads(self.redis_client.get(key))
                    stored_embedding = np.array(vector_data["embedding"])
                    
                    similarity = self._cosine_similarity(query_embedding, stored_embedding)
                    
                    similarities.append({
                        "chunk_id": vector_data["chunk_id"],
                        "document_id": vector_data["document_id"],
                        "content": vector_data.get("content", ""),
                        "chunk_type": vector_data.get("chunk_type", "text"),
                        "metadata": vector_data.get("metadata", {}),
                        "score": float(similarity)
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing vector {key}: {e}")
                    continue
            
            similarities.sort(key=lambda x: x["score"], reverse=True)
            top_results = similarities[:top_k]
            text_results = await self._enrich_results(top_results)
            chunks_searched = len(document_keys)
        
        # ✅ 2. Search products (NEW!)
        try:
            from app.services.product_search import product_search_service
            product_results = await product_search_service.search_products(
                kb_id=kb_id,
                query_embedding=query_embedding,
                top_k=top_k,
                filters=filters
            )
            logger.info(f"Found {len(product_results)} matching products")
        except Exception as e:
            logger.error(f"Product search failed: {e}")
            product_results = []
        
        search_time = int((time.time() - search_start) * 1000)
        
        # Build results
        search_results = {
            "total_found": len(text_results) + len(product_results),
            "returned": len(text_results),
            "text_results": text_results,
            "image_results": [],
            "product_results": product_results,  # ✅ NOW WITH SEMANTIC RESULTS!
            "query_tokens": query_tokens,
            "embedding_model": query_embedding_result["model"],
            "chunks_searched": chunks_searched,
            "search_time_ms": search_time,
            "cached": False
        }
        
        # CACHE THE RESULTS (if enabled and text search)
        if self.enable_cache and search_type == "text" and len(text_results) > 0:
            # Convert TextResult Pydantic objects to dict format for caching
            def serialize_result(r):
                """Convert TextResult to dict, handling both Pydantic objects and dicts"""
                if hasattr(r, 'dict'):
                    # It's a Pydantic object - use .dict() method
                    result_dict = r.dict()
                elif hasattr(r, 'model_dump'):
                    # Pydantic v2 - use .model_dump() method
                    result_dict = r.model_dump()
                else:
                    # It's already a dict
                    result_dict = r
                
                # Add extra fields for cache retrieval
                if "source" in result_dict and isinstance(result_dict["source"], dict):
                    result_dict["chunk_id"] = result_dict["source"].get("chunk_id")
                    result_dict["document_id"] = result_dict["source"].get("document_id")
                    result_dict["title"] = result_dict["source"].get("document_name", "Document")
                
                return result_dict
            
            cacheable_results = {
                "total_found": search_results["total_found"],
                "returned": search_results["returned"],
                "text_results": [serialize_result(r) for r in text_results],
                "image_results": search_results.get("image_results", []),
                "product_results": search_results.get("product_results", []),
                "query_tokens": search_results["query_tokens"],
                "embedding_model": search_results["embedding_model"],
                "chunks_searched": search_results["chunks_searched"],
                "search_time_ms": search_results["search_time_ms"]
            }
            
            await self.semantic_cache.cache_result(
                kb_id=kb_id,
                query=query,
                query_embedding=query_embedding.tolist(),
                results=cacheable_results,
                search_type=search_type,
                metadata={
                    'top_k': top_k,
                    'filters': filters
                }
            )
        
        return search_results
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """Calculate cosine similarity between two vectors"""
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    async def _enrich_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich results with full chunk data from MySQL"""
        if not results:
            return []
        
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            chunk_ids = [r["chunk_id"] for r in results]
            placeholders = ",".join(["%s"] * len(chunk_ids))
            
            query = f"""
                SELECT 
                    c.id as chunk_id,
                    c.document_id,
                    c.content,
                    c.chunk_type,
                    c.chunk_index,
                    c.metadata as chunk_metadata,
                    d.filename,
                    d.original_filename,
                    d.file_type
                FROM yovo_tbl_aiva_document_chunks c
                JOIN yovo_tbl_aiva_documents d ON c.document_id = d.id
                WHERE c.id IN ({placeholders})
            """
            
            cursor.execute(query, chunk_ids)
            chunks = cursor.fetchall()
            
            # Create lookup
            chunk_map = {c["chunk_id"]: c for c in chunks}
            
            # Build enriched results
            enriched = []
            for result in results:
                chunk = chunk_map.get(result["chunk_id"])
                if not chunk:
                    continue
                
                from app.models.responses import TextResult
                
                enriched.append(TextResult(
                    result_id=result["chunk_id"],
                    type="text",
                    content=chunk["content"],
                    source={
                        "document_id": chunk["document_id"],
                        "document_name": chunk["original_filename"],
                        "chunk_id": chunk["chunk_id"],
                        "chunk_index": chunk["chunk_index"],
                        "file_type": chunk["file_type"],
                        "metadata": json.loads(chunk["chunk_metadata"]) if chunk["chunk_metadata"] else {}
                    },
                    score=result["score"],
                    scoring_details={
                        "cosine_similarity": result["score"]
                    },
                    highlight=None
                ))
            
            return enriched
            
        finally:
            cursor.close()
            conn.close()
    
    async def delete_document(self, document_id: str):
        """Delete all vectors for a document"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor()
        
        try:
            # Get all chunk IDs for this document
            cursor.execute(
                "SELECT id, kb_id FROM yovo_tbl_aiva_document_chunks WHERE document_id = %s",
                (document_id,)
            )
            chunks = cursor.fetchall()
            
            # Delete from Redis
            for chunk_id, kb_id in chunks:
                vector_key = f"{self.prefix}{kb_id}:{chunk_id}"
                self.redis_client.delete(vector_key)
            
            # Delete from MySQL
            cursor.execute(
                "DELETE FROM yovo_tbl_aiva_document_chunks WHERE document_id = %s",
                (document_id,)
            )
            
            conn.commit()
            logger.info(f"Deleted {len(chunks)} chunks for document {document_id}")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"Error deleting document: {e}")
            raise
        finally:
            cursor.close()
            conn.close()
    
    async def get_kb_stats(self, kb_id: str) -> Dict[str, Any]:
        """Get statistics for knowledge base"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Count chunks
            cursor.execute(
                "SELECT COUNT(*) as total_chunks FROM yovo_tbl_aiva_document_chunks WHERE kb_id = %s",
                (kb_id,)
            )
            result = cursor.fetchone()
            total_chunks = result["total_chunks"] if result else 0
            
            # Count vectors in Redis
            pattern = f"{self.prefix}{kb_id}:*"
            vector_count = len(self.redis_client.keys(pattern))
            
            return {
                "kb_id": kb_id,
                "total_chunks": total_chunks,
                "total_vectors": vector_count,
                "embedding_model": settings.EMBEDDING_MODEL,
                "vector_dimension": settings.EMBEDDING_DIMENSION
            }
            
        finally:
            cursor.close()
            conn.close()