"""
Search and embedding routes
"""

from fastapi import APIRouter, HTTPException, Query
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
    Search knowledge base with semantic caching
    """
    try:
        import time
        import logging
        
        logger = logging.getLogger(__name__)
        start_time = time.time()
        
        kb_id = request.kb_id
        query = request.query
        top_k = request.top_k or 5
        search_type = request.search_type or "hybrid"
        
        logger.info(f"Search request: kb_id={kb_id}, query={query[:50]}, top_k={top_k}")
        
        # Perform search (vector_store handles caching internally)
        results = await vector_store.search(
            kb_id=kb_id,
            query=query,
            image=request.image,
            top_k=top_k,
            search_type=search_type,
            filters=request.filters or {}
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Check if results came from cache
        is_cached = results.get('cached', False)
        
        # Import models
        from app.models.responses import SearchResults, SearchMetrics, CostInfo, SearchResult, ScoringDetails
        
        # Convert text_results to SearchResult format
        text_results = results.get("text_results", [])
        formatted_text_results = []
        
        for r in text_results:
            # Handle both TextResult objects and dicts
            if hasattr(r, 'dict'):
                r_dict = r.dict()
            elif hasattr(r, 'model_dump'):
                r_dict = r.model_dump()
            else:
                r_dict = r
            
            # Convert to SearchResult format
            scoring_details = r_dict.get("scoring_details", {})
            if not isinstance(scoring_details, dict):
                scoring_details = scoring_details.dict() if hasattr(scoring_details, 'dict') else {}
            
            search_result = SearchResult(
                result_id=r_dict.get("result_id"),
                type=r_dict.get("type", "document"),
                source=r_dict.get("source", {}),
                source_type=r_dict.get("source_type", "document"),
                content=r_dict.get("content", ""),
                score=r_dict.get("score", 0.0),
                scoring_details=ScoringDetails(
                    cosine_similarity=scoring_details.get("cosine_similarity", r_dict.get("score", 0.0)),
                    bm25_score=scoring_details.get("bm25_score", 0.0),
                    combined_score=scoring_details.get("combined_score", r_dict.get("score", 0.0))
                ),
                metadata=r_dict.get("metadata", {})
            )
            formatted_text_results.append(search_result)
        
        # Calculate cost based on cache status
        if is_cached:
            # Cached results have zero cost
            cost_info = CostInfo(
                operation="knowledge_search_cached",
                base_cost=0.0,
                embedding_cost=0.0,
                total_cost=0.0,
                profit_margin=0.0,
                final_cost=0.0
            )
            logger.info(f"✅ Cache HIT - Zero cost")
        else:
            # Non-cached results calculate normal cost
            base_cost = 0.0005
            query_tokens = results.get("query_tokens", 0)
            
            # Calculate embedding cost
            embedding_cost = cost_tracker.calculate_embedding_cost(
                tokens=query_tokens,
                model=results.get("embedding_model", "text-embedding-3-small")
            )
            
            # Calculate totals
            total_cost = base_cost + embedding_cost
            profit_margin = total_cost * 0.20
            final_cost = total_cost + profit_margin
            
            cost_info = CostInfo(
                operation="knowledge_search",
                base_cost=base_cost,
                embedding_cost=embedding_cost,
                total_cost=total_cost,
                profit_margin=profit_margin,
                final_cost=final_cost
            )
            logger.info(f"💰 Cache MISS - Cost: ${final_cost}")
        
        return SearchResponse(
            results=SearchResults(
                total_found=results["total_found"],
                returned=results["returned"],
                search_type=search_type,
                text_results=formatted_text_results,  # ✅ Use converted results
                image_results=results.get("image_results", []),
                product_results=results.get("product_results", [])
            ),
            metrics=SearchMetrics(
                query_tokens=results.get("query_tokens"),
                embedding_model=results.get("embedding_model"),
                processing_time_ms=processing_time,
                chunks_searched=results.get("chunks_searched", 0)
            ),
            cost=cost_info
        )
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}", exc_info=True)
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
        
@router.get("/cache/stats")
async def get_cache_stats(
    kb_id: str = Query(None, description="Knowledge base ID (optional)")
):
    """
    Get semantic cache statistics
    """
    try:
        from app.services.semantic_cache import SemanticCache
        
        cache = SemanticCache()
        stats = await cache.get_cache_stats(kb_id)
        
        return {
            "status": "success",
            "data": stats
        }
        
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cache/clear")
async def clear_cache(
    kb_id: str = Query(None, description="Knowledge base ID (if None, clears all)")
):
    """
    Clear semantic cache
    """
    try:
        from app.services.semantic_cache import SemanticCache
        
        cache = SemanticCache()
        await cache.clear_cache(kb_id)
        
        return {
            "status": "success",
            "message": f"Cache cleared for {'KB: ' + kb_id if kb_id else 'all KBs'}"
        }
        
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))