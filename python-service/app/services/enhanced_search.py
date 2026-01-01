"""
AIVA RAG Enhancement: Enhanced Search Service v2
=================================================
Wraps existing vector_store.search() with RAG improvements.

VERSION 2 CHANGES:
- Added Intent-Aware Filtering to fix "wrong context" problem
- Query "how to create purchase order" now correctly finds PO creation content
  instead of GRN content that merely mentions "purchase order"

FEATURES:
- Query expansion (rule-based, for BM25 boost)
- Query rewriting (LLM-based, context-aware)  
- BM25 hybrid scoring
- **NEW: Intent-aware context filtering**
- MMR diversity
- Relevance threshold
- Reranking
"""

import re
import time
import logging
from typing import Any, Dict, List, Optional, Set
from collections import Counter
from enum import Enum
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


# =============================================================================
# INTENT DETECTION (Inline to avoid extra file dependency)
# =============================================================================

class QueryIntent(Enum):
    """Types of user intents we can detect."""
    CREATE = "create"
    FIND = "find"
    EXPLAIN = "explain"
    CONFIGURE = "configure"
    TROUBLESHOOT = "troubleshoot"
    LIST = "list"
    UNKNOWN = "unknown"


@dataclass
class IntentMatch:
    """Result of intent detection."""
    intent: QueryIntent
    subject: str
    confidence: float


class IntentDetector:
    """Lightweight intent detection for search queries."""
    
    # Intent patterns
    CREATE_PATTERNS = [
        r'\b(how|steps?)\s+(to|for)?\s*(create|make|generate|add|new|build)\b',
        r'\b(creating|making|generating|adding)\s+',
        r'\bcreate\s+(?:a|an|the)?\s*\w+',
    ]
    
    FIND_PATTERNS = [
        r'\b(where|how)\s+(is|to\s+find|can\s+i\s+find)\b',
        r'\b(find|locate|search\s+for)\b',
    ]
    
    EXPLAIN_PATTERNS = [
        r'\b(what|explain|describe)\s+(is|are|does)\b',
        r'\bwhat\s+(?:is|are)\b',
    ]
    
    # Context patterns for CREATE intent
    WRONG_CONTEXT_KEYWORDS = [
        'against the', 'against a', 'against an',
        'from the', 'from a', 'from an',  
        'on the', 'on a', 'on an',
        'mentioned in', 'mentioned on',
        'received', 'receiving',
        'grn', 'goods receipt',
        'existing', 'previous',
        'check it against', 'checked against',
    ]
    
    RIGHT_CONTEXT_KEYWORDS = [
        'create', 'creating', 'created through',
        'make', 'making', 'made through',
        'generate', 'generating',
        'how to create', 'how to make',
        'steps to create', 'steps to make',
        'new', 'add', 'adding',
        'matrix',  # "purchase order matrix" is creation
    ]
    
    def detect(self, query: str) -> IntentMatch:
        """Detect query intent."""
        query_lower = query.lower()
        
        # Check CREATE intent
        for pattern in self.CREATE_PATTERNS:
            if re.search(pattern, query_lower):
                subject = self._extract_subject(query_lower)
                return IntentMatch(QueryIntent.CREATE, subject, 0.8)
        
        # Check FIND intent
        for pattern in self.FIND_PATTERNS:
            if re.search(pattern, query_lower):
                subject = self._extract_subject(query_lower)
                return IntentMatch(QueryIntent.FIND, subject, 0.7)
        
        # Check EXPLAIN intent
        for pattern in self.EXPLAIN_PATTERNS:
            if re.search(pattern, query_lower):
                subject = self._extract_subject(query_lower)
                return IntentMatch(QueryIntent.EXPLAIN, subject, 0.7)
        
        return IntentMatch(QueryIntent.UNKNOWN, "", 0.3)
    
    def _extract_subject(self, query: str) -> str:
        """Extract the main subject from query."""
        # Remove common question words
        cleaned = re.sub(
            r'\b(how|to|do|i|can|what|is|the|a|an|create|make|find|where|generate|steps?|for)\b',
            '', query
        )
        words = [w.strip() for w in cleaned.split() if len(w.strip()) > 2]
        return ' '.join(words[:4])
    
    def calculate_context_score(self, content: str, intent: IntentMatch) -> float:
        """
        Calculate how well content matches the intent context.
        
        Returns:
            Score modifier: -0.15 (wrong context) to +0.15 (right context)
        """
        if intent.intent != QueryIntent.CREATE:
            return 0.0
        
        content_lower = content.lower()
        subject_lower = intent.subject.lower()
        
        # Skip if subject not in content
        if subject_lower and subject_lower not in content_lower:
            return 0.0
        
        wrong_score = 0
        right_score = 0
        
        # Check for wrong context indicators
        for keyword in self.WRONG_CONTEXT_KEYWORDS:
            if keyword in content_lower:
                wrong_score += 1
        
        # Check for right context indicators
        for keyword in self.RIGHT_CONTEXT_KEYWORDS:
            if keyword in content_lower:
                right_score += 1
        
        # Calculate final modifier
        if wrong_score > right_score and wrong_score >= 2:
            return -0.15  # Penalize wrong context
        elif right_score > wrong_score and right_score >= 2:
            return 0.15   # Boost right context
        elif right_score > 0 and wrong_score == 0:
            return 0.10   # Slight boost
        elif wrong_score > 0 and right_score == 0:
            return -0.10  # Slight penalty
        
        return 0.0


# =============================================================================
# ENHANCED SEARCH SERVICE
# =============================================================================

class EnhancedSearchService:
    """
    Enhanced search that wraps existing VectorStore.search().
    
    Features (all optional):
    - Query expansion (rule-based, for BM25 boost)
    - Query rewriting (LLM-based, context-aware)
    - BM25 hybrid scoring
    - Intent-aware context filtering (NEW!)
    - MMR diversity
    - Relevance threshold
    - Reranking
    """
    
    def __init__(self):
        # Import settings
        from app.config import settings
        from app.services.vector_store import VectorStore
        
        self.settings = settings
        self.vector_store = VectorStore()
        
        # Feature flags (from settings)
        self.enable_query_expansion = getattr(settings, 'ENABLE_QUERY_EXPANSION', False)
        self.enable_query_rewriting = getattr(settings, 'ENABLE_QUERY_REWRITING', False)
        self.enable_bm25 = getattr(settings, 'ENABLE_BM25_SEARCH', False)
        self.enable_mmr = getattr(settings, 'ENABLE_MMR_DIVERSITY', False)
        self.enable_threshold = getattr(settings, 'ENABLE_RELEVANCE_THRESHOLD', False)
        self.enable_reranking = getattr(settings, 'ENABLE_RERANKING', False)
        self.enable_intent_filter = getattr(settings, 'ENABLE_INTENT_FILTER', True)  # NEW - enabled by default
        
        # Configuration
        self.bm25_weight = getattr(settings, 'BM25_WEIGHT', 0.3)
        self.mmr_lambda = getattr(settings, 'MMR_LAMBDA', 0.7)
        self.min_relevance = getattr(settings, 'MIN_RELEVANCE_SCORE', 0.5)
        self.reranker_type = getattr(settings, 'RERANKER_TYPE', 'simple')
        self.max_variations = getattr(settings, 'QUERY_EXPANSION_MAX_VARIATIONS', 5)
        
        # Intent detector (always available, lightweight)
        self.intent_detector = IntentDetector()
        
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
            f"intent_filter={self.enable_intent_filter}, "
            f"mmr={self.enable_mmr}, "
            f"threshold={self.enable_threshold}, "
            f"reranking={self.enable_reranking}"
        )
    
    def _to_dict(self, obj: Any) -> Dict[str, Any]:
        """Convert result object to dict."""
        if isinstance(obj, dict):
            return obj
        elif hasattr(obj, '__dict__'):
            return {k: v for k, v in obj.__dict__.items() if not k.startswith('_')}
        elif hasattr(obj, 'model_dump'):
            return obj.model_dump()
        else:
            return {"value": str(obj)}
    
    async def search(
        self,
        kb_id: str,
        query: str,
        top_k: int = 5,
        image: Optional[str] = None,
        search_type: str = "hybrid",
        filters: Optional[Dict[str, Any]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        include_products: bool = False,
        # Override flags for this search
        use_expansion: Optional[bool] = None,
        use_rewriting: Optional[bool] = None,
        use_bm25: Optional[bool] = None,
        use_intent_filter: Optional[bool] = None,
        use_mmr: Optional[bool] = None,
        use_threshold: Optional[bool] = None,
        use_reranking: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Enhanced search with all RAG improvements.
        
        Flow:
        1. Query rewriting (if conversation context)
        2. Query expansion (for BM25 keywords)
        3. Single vector search (main retrieval)
        4. BM25 score boosting
        5. Intent-aware context filtering (NEW!)
        6. Relevance threshold
        7. MMR diversity
        8. Reranking
        """
        start_time = time.time()
        original_query = query
        
        # Determine which features to use
        do_expansion = use_expansion if use_expansion is not None else self.enable_query_expansion
        do_rewriting = use_rewriting if use_rewriting is not None else self.enable_query_rewriting
        do_bm25 = use_bm25 if use_bm25 is not None else self.enable_bm25
        do_intent_filter = use_intent_filter if use_intent_filter is not None else self.enable_intent_filter
        do_mmr = use_mmr if use_mmr is not None else self.enable_mmr
        do_threshold = use_threshold if use_threshold is not None else self.enable_threshold
        do_reranking = use_reranking if use_reranking is not None else self.enable_reranking
        
        logger.info(
            f"Enhanced search: query='{query[:50]}...', "
            f"expansion={do_expansion}, rewriting={do_rewriting}, "
            f"bm25={do_bm25}, intent={do_intent_filter}, mmr={do_mmr}, reranking={do_reranking}"
        )
        
        # ============================================================
        # Step 0: Intent Detection (for later filtering)
        # ============================================================
        intent_match = None
        if do_intent_filter:
            intent_match = self.intent_detector.detect(query)
            if intent_match.intent != QueryIntent.UNKNOWN:
                logger.info(f"Detected intent: {intent_match.intent.value}, subject: '{intent_match.subject}'")
        
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
        # Step 2: Query Expansion (for BM25 terms only)
        # ============================================================
        search_terms: List[str] = []
        if do_expansion and self.query_expansion_service:
            try:
                search_terms = self.query_expansion_service.get_search_terms(rewritten_query)
                logger.debug(f"Expanded search terms: {search_terms}")
            except Exception as e:
                logger.error(f"Query expansion error: {e}")
                search_terms = []
        
        # ============================================================
        # Step 3: SINGLE Vector Search
        # ============================================================
        try:
            # Get more results if we'll be filtering/reranking
            fetch_multiplier = 3 if (do_mmr or do_reranking or do_intent_filter) else 1
            results = await self.vector_store.search(
                kb_id=kb_id,
                query=rewritten_query,
                image=image,
                top_k=top_k * fetch_multiplier,
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
                bm25_scores = self._calculate_bm25_scores_fast(search_terms, all_results)
                all_results = self._merge_bm25_scores(all_results, bm25_scores)
                features_applied.append("bm25")
                logger.debug(f"BM25 boosting applied with {len(search_terms)} terms")
            except Exception as e:
                logger.error(f"BM25 error: {e}")
        
        # ============================================================
        # Step 5: Intent-Aware Context Filtering (NEW!)
        # ============================================================
        if do_intent_filter and intent_match and intent_match.intent != QueryIntent.UNKNOWN:
            try:
                boosted_count = 0
                penalized_count = 0
                
                for result in all_results:
                    content = result.get("content", "")
                    original_score = result.get("score", 0.5)
                    
                    # Calculate context modifier
                    modifier = self.intent_detector.calculate_context_score(content, intent_match)
                    
                    if modifier != 0:
                        new_score = max(0.0, min(1.0, original_score + modifier))
                        result["score"] = new_score
                        result["_intent_modifier"] = modifier
                        
                        if modifier > 0:
                            boosted_count += 1
                        else:
                            penalized_count += 1
                
                # Re-sort by score
                all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
                
                features_applied.append("intent_filter")
                logger.info(
                    f"Intent filter applied: intent={intent_match.intent.value}, "
                    f"boosted={boosted_count}, penalized={penalized_count}"
                )
            except Exception as e:
                logger.error(f"Intent filter error: {e}")
        
        # ============================================================
        # Step 6: Relevance Threshold Filter (if enabled)
        # ============================================================
        if do_threshold:
            original_count = len(all_results)
            filtered_results = [
                r for r in all_results 
                if r.get("score", 0) >= self.min_relevance
            ]
            
            # ✅ FIX: Always keep at least min(top_k, 3) results
            min_required = min(top_k, 3)
            
            if len(filtered_results) >= min_required:
                # Enough results pass threshold
                all_results = filtered_results
                features_applied.append("threshold")
                logger.debug(f"Threshold filtered: {original_count} -> {len(all_results)}")
            else:
                # Not enough results pass threshold - keep top results anyway
                all_results.sort(key=lambda x: x.get("score", 0), reverse=True)
                kept_count = max(min_required, len(filtered_results))
                all_results = all_results[:kept_count]
                logger.warning(
                    f"Threshold too strict ({self.min_relevance}): only {len(filtered_results)} passed, "
                    f"keeping top {len(all_results)} results"
                )
        
        # ============================================================
        # Step 7: MMR Diversity (if enabled)
        # ============================================================
        if do_mmr and len(all_results) > top_k:
            try:
                all_results = self._apply_mmr(all_results, top_k)
                features_applied.append("mmr")
                logger.debug(f"MMR applied, {len(all_results)} diverse results")
            except Exception as e:
                logger.error(f"MMR error: {e}")
        
        # ============================================================
        # Step 8: Reranking (if enabled)
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
        
        # Final trim to top_k
        final_results = all_results[:top_k]
        
        # ✅ Also trim product results to top_k
        product_results = results.get("product_results", [])
        original_product_count = len(product_results)
        if len(product_results) > top_k:
            # Sort by score and take top_k
            product_results = sorted(
                product_results, 
                key=lambda x: x.get("score", x.get("similarity_score", 0)), 
                reverse=True
            )[:top_k]
            logger.info(f"📦 Trimmed product results: {original_product_count} → {len(product_results)}")  # ← CHANGE TO INFO

        # Build response
        search_time = int((time.time() - start_time) * 1000)
        
        response = {
            "total_found": len(results.get("text_results", [])),
            "returned": len(final_results),
            "text_results": final_results,
            "image_results": results.get("image_results", []),
            "product_results": product_results,
            "query_tokens": results.get("query_tokens", 0),
            "embedding_model": results.get("embedding_model", ""),
            "chunks_searched": results.get("chunks_searched", 0),
            "search_time_ms": search_time,
            "cached": results.get("cached", False),
            "enhanced_search": {
                "original_query": original_query,
                "rewritten_query": rewritten_query if rewritten_query != original_query else None,
                "search_terms": search_terms if search_terms else None,
                "detected_intent": intent_match.intent.value if intent_match else None,
                "intent_subject": intent_match.subject if intent_match else None,
                "features_applied": features_applied,
                "bm25_used": do_bm25,
                "intent_filter_used": do_intent_filter,
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
        """Fast BM25 scoring using pre-extracted search terms."""
        if not search_terms or not results:
            return {}
        
        scores: Dict[str, float] = {}
        
        corpus = []
        chunk_ids = []
        for result in results:
            content = result.get("content", "").lower()
            chunk_id = result.get("chunk_id") or result.get("result_id", "")
            corpus.append(content)
            chunk_ids.append(chunk_id)
        
        if not corpus:
            return {}
        
        doc_count = len(corpus)
        avg_doc_len = sum(len(doc.split()) for doc in corpus) / max(doc_count, 1)
        
        term_doc_freq = {}
        for term in search_terms:
            count = sum(1 for doc in corpus if term.lower() in doc)
            term_doc_freq[term] = count
        
        for idx, (doc, chunk_id) in enumerate(zip(corpus, chunk_ids)):
            doc_len = len(doc.split())
            score = 0.0
            
            for term in search_terms:
                if term.lower() not in doc:
                    continue
                
                tf = doc.lower().count(term.lower())
                df = term_doc_freq.get(term, 0)
                idf = np.log((doc_count - df + 0.5) / (df + 0.5) + 1)
                
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1))
                score += idf * (numerator / denominator)
            
            if chunk_id:
                scores[chunk_id] = score
        
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
        """Merge BM25 scores with vector scores."""
        for result in results:
            chunk_id = result.get("chunk_id") or result.get("result_id", "")
            vector_score = result.get("score", 0.5)
            bm25_score = bm25_scores.get(chunk_id, 0)
            
            # Weighted combination
            combined = (1 - self.bm25_weight) * vector_score + self.bm25_weight * bm25_score
            result["score"] = combined
            result["_bm25_score"] = bm25_score
            result["_vector_score"] = vector_score
        
        # Re-sort by combined score
        results.sort(key=lambda x: x.get("score", 0), reverse=True)
        return results
    
    def _apply_mmr(
        self,
        results: List[Dict[str, Any]],
        top_k: int
    ) -> List[Dict[str, Any]]:
        """Apply Maximal Marginal Relevance for diversity."""
        if len(results) <= top_k:
            return results
        
        # Simple content-based MMR
        selected = [results[0]]
        candidates = results[1:]
        
        while len(selected) < top_k and candidates:
            best_candidate = None
            best_mmr_score = -float('inf')
            
            for candidate in candidates:
                relevance = candidate.get("score", 0)
                
                # Calculate max similarity to selected
                max_sim = 0
                candidate_content = candidate.get("content", "").lower()
                for s in selected:
                    selected_content = s.get("content", "").lower()
                    # Simple Jaccard similarity
                    c_words = set(candidate_content.split())
                    s_words = set(selected_content.split())
                    if c_words or s_words:
                        sim = len(c_words & s_words) / len(c_words | s_words)
                        max_sim = max(max_sim, sim)
                
                mmr_score = self.mmr_lambda * relevance - (1 - self.mmr_lambda) * max_sim
                
                if mmr_score > best_mmr_score:
                    best_mmr_score = mmr_score
                    best_candidate = candidate
            
            if best_candidate:
                selected.append(best_candidate)
                candidates.remove(best_candidate)
            else:
                break
        
        return selected


# Singleton
_enhanced_search_service: Optional[EnhancedSearchService] = None


def get_enhanced_search_service() -> EnhancedSearchService:
    """Get the singleton enhanced search service."""
    global _enhanced_search_service
    if _enhanced_search_service is None:
        _enhanced_search_service = EnhancedSearchService()
    return _enhanced_search_service