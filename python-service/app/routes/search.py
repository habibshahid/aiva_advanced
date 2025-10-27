"""
Search and embedding routes
"""

from fastapi import APIRouter, HTTPException
from typing import List

from app.models.requests import SearchRequest, EmbeddingRequest, BatchSearchRequest
from app.models.responses import SearchResponse, EmbeddingResponse
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
from app.utils.cost_tracking import CostTracker

router = APIRouter()
embedding_service = EmbeddingService()
vector_store = VectorStore()
cost_tracker = CostTracker()


@router.post("/search", response_model=SearchResponse)
async def search_knowledge(request: SearchRequest):
    """
    Search knowledge base with text and/or image
    """
    try:
        import time
        start_time = time.time()
        
        # Perform search
        results = await vector_store.search(
            kb_id=request.kb_id,
            query=request.query,
            image=request.image,
            top_k=request.top_k,
            search_type=request.search_type,
            filters=request.filters
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Calculate cost
        cost = cost_tracker.calculate_search_cost(
            query_tokens=results.get("query_tokens", 0),
            search_type=request.search_type
        )
        
        from app.models.responses import SearchResults, SearchMetrics
        
        return SearchResponse(
            results=SearchResults(
                total_found=results["total_found"],
                returned=results["returned"],
                search_type=request.search_type,
                text_results=results.get("text_results", []),
                image_results=results.get("image_results", []),
                product_results=results.get("product_results", [])
            ),
            metrics=SearchMetrics(
                query_tokens=results.get("query_tokens"),
                embedding_model=results.get("embedding_model"),
                processing_time_ms=processing_time,
                chunks_searched=results.get("chunks_searched", 0)
            ),
            cost=cost
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search/batch")
async def batch_search(request: BatchSearchRequest):
    """
    Batch search multiple queries
    """
    try:
        results = []
        
        for query in request.queries:
            search_result = await vector_store.search(
                kb_id=request.kb_id,
                query=query,
                top_k=request.top_k,
                search_type="text"
            )
            results.append({
                "query": query,
                "results": search_result
            })
        
        return {"batch_results": results}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest):
    """
    Generate embeddings for text
    """
    try:
        result = await embedding_service.generate_embedding(
            text=request.text,
            model=request.model
        )
        
        return EmbeddingResponse(
            embedding=result["embedding"],
            model=result["model"],
            tokens=result["tokens"],
            dimension=len(result["embedding"])
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/kb/{kb_id}/stats")
async def get_kb_stats(kb_id: str):
    """
    Get knowledge base statistics
    """
    try:
        stats = await vector_store.get_kb_stats(kb_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))