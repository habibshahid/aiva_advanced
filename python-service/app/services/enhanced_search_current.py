"""
AIVA RAG Enhancement: Enhanced Search Service (OPTIMIZED)
==========================================================
Wraps existing vector_store.search() with RAG improvements.

OPTIMIZED VERSION:
- Only 1 vector search (not N per variation) - HUGE performance improvement
- Query variations used for BM25 keyword matching only (free, fast)
- All enhancements are optional via feature flags
- Zero-impact if all features disabled
"""

import re
import time
import logging
from typing import Any, Dict, List, Optional, Set
from collections import Counter

import numpy as np

logger = logging.getLogger(__name__)


class EnhancedSearchService:
    """
    Enhanced search that wraps existing VectorStore.search().
    
    Features (all optional):
    - Query expansion (rule-based, for BM25 boost)
    - Query rewriting (LLM-based, context-aware)
    - BM25 hybrid scoring
    - MMR diversity
    - Relevance threshold
    - Reranking
    """
    
    def __init__(self):
        # Import settings
        from app.config import settings
        from app.services.vector_store import VectorStore
        
        self.settings = settings
        self.vector_store = VectorStore()  # Create new instance like search.py does
        
        # Feature flags (from settings)
        self.enable_query_expansion = getattr(settings, 'ENABLE_QUERY_EXPANSION', False)
        self.enable_query_rewriting = getattr(settings, 'ENABLE_QUERY_REWRITING', False)
        self.enable_bm25 = getattr(settings, 'ENABLE_BM25_SEARCH', False)
        self.enable_mmr = getattr(settings, 'ENABLE_MMR_DIVERSITY', False)
        self.enable_threshold = getattr(settings, 'ENABLE_RELEVANCE_THRESHOLD', False)
        self.enable_reranking = getattr(settings, 'ENABLE_RERANKING', False)
        
        # Configuration
        self.bm25_weight = getattr(settings, 'BM25_WEIGHT', 0.3)
        self.mmr_lambda = getattr(settings, 'MMR_LAMBDA', 0.7)
        self.min_relevance = getattr(settings, 'MIN_RELEVANCE_SCORE', 0.5)
        self.reranker_type = getattr(settings, 'RERANKER_TYPE', 'simple')
        self.max_variations = getattr(settings, 'QUERY_EXPANSION_MAX_VARIATIONS', 5)
        
        # Lazy-load services only if needed
        self.query_expansion_service = None
        self.query_rewriter = None
        self.reranker = None
        
        # Initialize enabled services
        if self.enable_query_expansion:
            try:
                from app.services.query_expansion import get_query_expansion_service
                self.query_expansion_service = get_query_expansion_service()
            except ImportError as e:
                logger.warning(f"Query expansion not available: {e}")
                self.enable_query_expansion = False
        
        if self.enable_query_rewriting:
            try:
                from app.services.query_rewriter import get_query_rewriter
                self.query_rewriter = get_query_rewriter()
            except ImportError as e:
                logger.warning(f"Query rewriter not available: {e}")
                self.enable_query_rewriting = False
        
        if self.enable_reranking:
            try:
                from app.services.reranker import get_reranker
                self.reranker = get_reranker(self.reranker_type)
            except ImportError as e:
                logger.warning(f"Reranker not available: {e}")
                self.enable_reranking = False
        
        logger.info(
            f"EnhancedSearchService initialized - "
            f"expansion={self.enable_query_expansion}, "
            f"rewriting={self.enable_query_rewriting}, "
            f"bm25={self.enable_bm25}, "
            f"mmr={self.enable_mmr}, "
            f"threshold={self.enable_threshold}, "
            f"reranking={self.enable_reranking}"
        )
    
    def _to_dict(self, obj: Any) -> Dict[str, Any]:
        """
        Convert Pydantic object or dict to dict.
        Handles TextResult, SearchResult, and other Pydantic models.
        """
        if isinstance(obj, dict):
            return obj
        elif hasattr(obj, 'model_dump'):
            # Pydantic v2
            return obj.model_dump()
        elif hasattr(obj, 'dict'):
            # Pydantic v1
            return obj.dict()
        else:
            # Try to convert to dict
            try:
                return dict(obj)
            except (TypeError, ValueError):
                return {"content": str(obj)}
    
    async def search(
        self,
        kb_id: str,
        query: str,
        image: Optional[str] = None,
        top_k: int = 5,
        search_type: str = "hybrid",
        filters: Optional[Dict[str, Any]] = None,
        include_products: bool = False,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        # Per-call feature overrides
        use_expansion: Optional[bool] = None,
        use_rewriting: Optional[bool] = None,
        use_bm25: Optional[bool] = None,
        use_mmr: Optional[bool] = None,
        use_threshold: Optional[bool] = None,
        use_reranking: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Enhanced search with optional RAG improvements.
        
        OPTIMIZED: Only 1 vector search, variations used for BM25 only.
        """
        search_start = time.time()
        original_query = query
        
        # Determine which features to use (per-call override or default)
        do_expansion = use_expansion if use_expansion is not None else self.enable_query_expansion
        do_rewriting = use_rewriting if use_rewriting is not None else self.enable_query_rewriting
        do_bm25 = use_bm25 if use_bm25 is not None else self.enable_bm25
        do_mmr = use_mmr if use_mmr is not None else self.enable_mmr
        do_threshold = use_threshold if use_threshold is not None else self.enable_threshold
        do_reranking = use_reranking if use_reranking is not None else self.enable_reranking
        
        logger.info(
            f"Enhanced search: query='{query[:50]}...', "
            f"expansion={do_expansion}, rewriting={do_rewriting}, "
            f"bm25={do_bm25}, mmr={do_mmr}, reranking={do_reranking}"
        )
        
        # ============================================================
        # Step 1: Query Rewriting (context-aware) - OPTIONAL
        # ============================================================
        rewritten_query = query
        if do_rewriting and conversation_history and self.query_rewriter:
            try:
                rewritten_query = await self.query_rewriter.rewrite(
                    query=query,
                    conversation_history=conversation_history
                )
                if rewritten_query != query:
                    logger.info(f"Query rewritten: '{query[:30]}' -> '{rewritten_query[:50]}'")
            except Exception as e:
                logger.error(f"Query rewriting error: {e}")
                rewritten_query = query
        
        # ============================================================
        # Step 2: Query Expansion (for BM25 terms only - NOT for vector search)
        # ============================================================
        search_terms: List[str] = []  # For BM25 keyword matching
        if do_expansion and self.query_expansion_service:
            try:
                # Get expanded search terms (individual keywords + synonyms)
                search_terms = self.query_expansion_service.get_search_terms(rewritten_query)
                logger.debug(f"Expanded search terms: {search_terms}")
            except Exception as e:
                logger.error(f"Query expansion error: {e}")
                search_terms = []
        
        # ============================================================
        # Step 3: SINGLE Vector Search (only 1 API call!)
        # ============================================================
        try:
            results = await self.vector_store.search(
                kb_id=kb_id,
                query=rewritten_query,  # Use rewritten query
                image=image,
                top_k=top_k * 3 if (do_mmr or do_reranking) else top_k,  # Get more if we'll filter
                search_type=search_type,
                filters=filters or {},
                include_products=include_products
            )
        except Exception as e:
            logger.error(f"Vector search error: {e}")
            raise
        
        # Convert results to dicts
        all_results: List[Dict[str, Any]] = []
        for result in results.get("text_results", []):
            result_dict = self._to_dict(result)
            all_results.append(result_dict)
        
        if not all_results:
            # Return original response structure with empty results
            return {
                "total_found": 0,
                "returned": 0,
                "text_results": [],
                "image_results": results.get("image_results", []),
                "product_results": results.get("product_results", []),
                "query_tokens": results.get("query_tokens", 0),
                "embedding_model": results.get("embedding_model", ""),
                "chunks_searched": results.get("chunks_searched", 0),
                "cached": results.get("cached", False),
                "enhanced_search": {
                    "original_query": original_query,
                    "features_applied": []
                }
            }
        
        features_applied = []
        
        # ============================================================
        # Step 4: BM25 Score Boosting (if enabled)
        # ============================================================
        if do_bm25 and search_terms:
            try:
                bm25_scores = self._calculate_bm25_scores_fast(
                    search_terms,
                    all_results
                )
                all_results = self._merge_bm25_scores(all_results, bm25_scores)
                features_applied.append("bm25")
                logger.debug(f"BM25 boosting applied with {len(search_terms)} terms")
            except Exception as e:
                logger.error(f"BM25 error: {e}")
        
        # ============================================================
        # Step 5: Relevance Threshold Filter (if enabled)
        # ============================================================
        if do_threshold:
            before_count = len(all_results)
            all_results = [
                r for r in all_results 
                if r.get("score", 0) >= self.min_relevance
            ]
            if len(all_results) < before_count:
                features_applied.append("threshold")
                logger.debug(f"Threshold filtered: {before_count} -> {len(all_results)}")
        
        # ============================================================
        # Step 6: MMR Diversity (if enabled)
        # ============================================================
        if do_mmr and len(all_results) > top_k:
            try:
                all_results = self._apply_mmr(
                    results=all_results,
                    query=rewritten_query,
                    top_k=top_k * 2,  # Get extra for reranking
                    lambda_param=self.mmr_lambda
                )
                features_applied.append("mmr")
                logger.debug(f"MMR applied, {len(all_results)} diverse results")
            except Exception as e:
                logger.error(f"MMR error: {e}")
        
        # ============================================================
        # Step 7: Reranking (if enabled)
        # ============================================================
        if do_reranking and self.reranker and len(all_results) > 1:
            try:
                all_results = await self.reranker.rerank(
                    query=rewritten_query,
                    results=all_results,
                    top_k=top_k
                )
                features_applied.append("reranking")
                logger.debug(f"Reranked to {len(all_results)} results")
            except Exception as e:
                logger.error(f"Reranking error: {e}")
        
        # Sort by score and limit to top_k
        all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
        final_results = all_results[:top_k]
        
        # Build response
        search_time = int((time.time() - search_start) * 1000)
        
        response = {
            "total_found": results.get("total_found", len(all_results)),
            "returned": len(final_results),
            "text_results": final_results,
            "image_results": results.get("image_results", []),
            "product_results": results.get("product_results", []),
            "query_tokens": results.get("query_tokens", 0),
            "embedding_model": results.get("embedding_model", ""),
            "chunks_searched": results.get("chunks_searched", 0),
            "search_time_ms": search_time,
            "cached": results.get("cached", False),
            "enhanced_search": {
                "original_query": original_query,
                "rewritten_query": rewritten_query if rewritten_query != original_query else None,
                "search_terms": search_terms if search_terms else None,
                "features_applied": features_applied,
                "bm25_used": do_bm25,
                "mmr_used": do_mmr,
                "threshold_used": do_threshold,
                "reranking_used": do_reranking
            }
        }
        
        logger.info(
            f"Enhanced search complete: {len(final_results)} results in {search_time}ms "
            f"(features: {', '.join(features_applied) if features_applied else 'none'})"
        )
        
        return response
    
    def _calculate_bm25_scores_fast(
        self,
        search_terms: List[str],
        results: List[Dict[str, Any]],
        k1: float = 1.5,
        b: float = 0.75
    ) -> Dict[str, float]:
        """
        Fast BM25 scoring using pre-extracted search terms.
        No tokenization needed - terms already expanded.
        """
        if not search_terms or not results:
            return {}
        
        scores: Dict[str, float] = {}
        
        # Prepare corpus
        corpus = []
        chunk_ids = []
        for result in results:
            content = result.get("content", "").lower()
            chunk_id = result.get("chunk_id") or result.get("result_id", "")
            corpus.append(content)
            chunk_ids.append(chunk_id)
        
        if not corpus:
            return {}
        
        # Calculate document frequencies
        doc_count = len(corpus)
        avg_doc_len = sum(len(doc.split()) for doc in corpus) / max(doc_count, 1)
        
        # Calculate term document frequencies
        term_doc_freq = {}
        for term in search_terms:
            count = sum(1 for doc in corpus if term.lower() in doc)
            term_doc_freq[term] = count
        
        # Calculate BM25 score for each document
        for idx, (doc, chunk_id) in enumerate(zip(corpus, chunk_ids)):
            doc_len = len(doc.split())
            score = 0.0
            
            for term in search_terms:
                if term.lower() not in doc:
                    continue
                
                # Term frequency in document
                tf = doc.lower().count(term.lower())
                
                # Document frequency
                df = term_doc_freq.get(term, 0)
                
                # IDF
                idf = np.log((doc_count - df + 0.5) / (df + 0.5) + 1)
                
                # BM25 formula
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1))
                score += idf * (numerator / denominator)
            
            if chunk_id:
                scores[chunk_id] = score
        
        # Normalize scores to 0-1
        if scores:
            max_score = max(scores.values())
            if max_score > 0:
                scores = {k: v / max_score for k, v in scores.items()}
        
        return scores
    
    def _merge_bm25_scores(
        self,
        results: List[Dict[str, Any]],
        bm25_scores: Dict[str, float]
    ) -> List[Dict[str, Any]]:
        """Merge vector similarity scores with BM25 scores."""
        if not bm25_scores:
            return results
        
        vector_weight = 1 - self.bm25_weight
        
        for result in results:
            chunk_id = result.get("chunk_id") or result.get("result_id", "")
            vector_score = result.get("score", 0)
            bm25_score = bm25_scores.get(chunk_id, 0)
            
            # Combined score
            combined = (vector_weight * vector_score) + (self.bm25_weight * bm25_score)
            
            # Update result
            result["score"] = combined
            
            # Store scoring details
            if "scoring_details" not in result:
                result["scoring_details"] = {}
            result["scoring_details"]["vector_score"] = vector_score
            result["scoring_details"]["bm25_score"] = bm25_score
            result["scoring_details"]["combined_score"] = combined
        
        return results
    
    def _apply_mmr(
        self,
        results: List[Dict[str, Any]],
        query: str,
        top_k: int,
        lambda_param: float = 0.7
    ) -> List[Dict[str, Any]]:
        """
        Apply Maximal Marginal Relevance for diversity.
        Uses content overlap as similarity measure (no embeddings needed).
        """
        if len(results) <= top_k:
            return results
        
        selected = []
        remaining = results.copy()
        
        # Select first result (highest score)
        remaining.sort(key=lambda x: x.get("score", 0), reverse=True)
        selected.append(remaining.pop(0))
        
        # Iteratively select diverse results
        while remaining and len(selected) < top_k:
            best_score = -1
            best_idx = 0
            
            for idx, candidate in enumerate(remaining):
                # Relevance to query (original score)
                relevance = candidate.get("score", 0)
                
                # Maximum similarity to already selected
                max_sim = 0
                candidate_content = candidate.get("content", "").lower()
                
                for sel in selected:
                    sel_content = sel.get("content", "").lower()
                    sim = self._content_similarity(candidate_content, sel_content)
                    max_sim = max(max_sim, sim)
                
                # MMR score: balance relevance and diversity
                mmr_score = lambda_param * relevance - (1 - lambda_param) * max_sim
                
                if mmr_score > best_score:
                    best_score = mmr_score
                    best_idx = idx
            
            selected.append(remaining.pop(best_idx))
        
        return selected
    
    def _content_similarity(self, text1: str, text2: str) -> float:
        """Calculate content similarity using word overlap."""
        words1 = set(text1.split())
        words2 = set(text2.split())
        
        if not words1 or not words2:
            return 0.0
        
        intersection = len(words1 & words2)
        union = len(words1 | words2)
        
        return intersection / union if union > 0 else 0.0


# Singleton instance
_enhanced_search_service: Optional[EnhancedSearchService] = None


def get_enhanced_search_service() -> EnhancedSearchService:
    """Get or create the enhanced search service singleton."""
    global _enhanced_search_service
    
    if _enhanced_search_service is None:
        _enhanced_search_service = EnhancedSearchService()
    
    return _enhanced_search_service