"""
Cross-Encoder Reranker Service for AIVA RAG
============================================
File: python-service/app/services/reranker.py

This service reranks search results using a cross-encoder model
for more accurate relevance scoring.

Options:
1. LLM-based reranking (uses OpenAI for scoring)
2. Local cross-encoder (uses sentence-transformers - optional)

Author: AIVA Team
Version: 1.0.0
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional, Tuple
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class BaseReranker(ABC):
    """Abstract base class for rerankers"""
    
    @abstractmethod
    async def rerank(
        self, 
        query: str, 
        results: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """Rerank results based on query relevance"""
        pass


class LLMReranker(BaseReranker):
    """
    Reranker using LLM (OpenAI) for relevance scoring.
    
    This is more accurate than cross-encoders for complex queries
    but has higher latency and cost.
    
    Usage:
        reranker = LLMReranker()
        reranked = await reranker.rerank(query, results, top_k=5)
    """
    
    def __init__(self, model: str = "gpt-4o-mini"):
        """
        Initialize LLM reranker.
        
        Args:
            model: OpenAI model to use for scoring
        """
        self.model = model
        self._client = None
        logger.info(f"LLMReranker initialized with model: {model}")
    
    @property
    def client(self):
        """Lazy load OpenAI client"""
        if self._client is None:
            from openai import OpenAI
            from app.config import settings
            self._client = OpenAI(api_key=settings.OPENAI_API_KEY)
        return self._client
    
    async def rerank(
        self, 
        query: str, 
        results: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Rerank results using LLM scoring.
        
        Args:
            query: User query
            results: List of search results with 'content' field
            top_k: Number of results to return
            
        Returns:
            Reranked results with updated scores
        """
        if not results:
            return []
        
        if len(results) <= 1:
            return results
        
        # Score each result
        scored_results = []
        
        # Process in parallel with batching
        batch_size = 5
        for i in range(0, len(results), batch_size):
            batch = results[i:i + batch_size]
            scores = await asyncio.gather(*[
                self._score_relevance(query, r.get("content", ""))
                for r in batch
            ])
            
            for result, score in zip(batch, scores):
                result_copy = result.copy()
                result_copy["rerank_score"] = score
                result_copy["original_score"] = result.get("score", 0)
                # Combine scores: 70% rerank, 30% original
                result_copy["score"] = 0.7 * score + 0.3 * result.get("score", 0)
                result_copy["scoring_details"] = result_copy.get("scoring_details", {})
                result_copy["scoring_details"]["rerank_score"] = score
                result_copy["scoring_details"]["reranking_model"] = self.model
                scored_results.append(result_copy)
        
        # Sort by new score
        scored_results.sort(key=lambda x: x["score"], reverse=True)
        
        logger.info(f"Reranked {len(results)} results, returning top {top_k}")
        
        return scored_results[:top_k]
    
    async def _score_relevance(self, query: str, content: str) -> float:
        """
        Score relevance of content to query using LLM.
        
        Returns:
            Relevance score between 0 and 1
        """
        if not content:
            return 0.0
        
        # Truncate content if too long
        max_content_len = 1000
        if len(content) > max_content_len:
            content = content[:max_content_len] + "..."
        
        prompt = f"""Rate the relevance of the following document to the query on a scale of 0 to 10.
Only respond with a single number.

Query: {query}

Document:
{content}

Relevance score (0-10):"""
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=5,
                temperature=0
            )
            
            score_text = response.choices[0].message.content.strip()
            
            # Parse score
            try:
                score = float(score_text)
                return min(max(score / 10.0, 0.0), 1.0)  # Normalize to 0-1
            except ValueError:
                # Try to extract number
                import re
                numbers = re.findall(r'\d+\.?\d*', score_text)
                if numbers:
                    score = float(numbers[0])
                    return min(max(score / 10.0, 0.0), 1.0)
                return 0.5  # Default
                
        except Exception as e:
            logger.error(f"LLM scoring error: {e}")
            return 0.5  # Default score on error


class SimpleReranker(BaseReranker):
    """
    Simple reranker using keyword and semantic signals.
    No external dependencies - pure Python implementation.
    
    This is a lightweight alternative when LLM reranking is too slow/expensive.
    """
    
    def __init__(self):
        logger.info("SimpleReranker initialized")
    
    async def rerank(
        self, 
        query: str, 
        results: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Rerank using keyword matching and position signals.
        """
        if not results:
            return []
        
        query_terms = set(self._tokenize(query.lower()))
        
        scored_results = []
        for result in results:
            content = result.get("content", "").lower()
            content_terms = set(self._tokenize(content))
            
            # Calculate keyword overlap
            if query_terms and content_terms:
                overlap = len(query_terms & content_terms) / len(query_terms)
            else:
                overlap = 0
            
            # Check for exact phrase match
            phrase_bonus = 0.2 if query.lower() in content else 0
            
            # Check for query terms appearing early in content
            early_match_bonus = 0
            first_500 = content[:500]
            for term in query_terms:
                if term in first_500:
                    early_match_bonus += 0.05
            early_match_bonus = min(early_match_bonus, 0.15)
            
            # Combine scores
            original_score = result.get("score", 0)
            rerank_score = (
                0.4 * overlap + 
                phrase_bonus + 
                early_match_bonus + 
                0.4 * original_score
            )
            
            result_copy = result.copy()
            result_copy["score"] = rerank_score
            result_copy["rerank_score"] = overlap + phrase_bonus + early_match_bonus
            result_copy["original_score"] = original_score
            scored_results.append(result_copy)
        
        # Sort by new score
        scored_results.sort(key=lambda x: x["score"], reverse=True)
        
        return scored_results[:top_k]
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization"""
        import re
        tokens = re.findall(r'\b\w+\b', text)
        return [t for t in tokens if len(t) > 2]


class HybridReranker(BaseReranker):
    """
    Hybrid reranker that uses simple reranking first,
    then LLM reranking on top candidates.
    
    This balances quality and cost.
    """
    
    def __init__(self, llm_model: str = "gpt-4o-mini", llm_top_k: int = 10):
        """
        Args:
            llm_model: Model for LLM reranking
            llm_top_k: How many top results to rerank with LLM
        """
        self.simple_reranker = SimpleReranker()
        self.llm_reranker = LLMReranker(model=llm_model)
        self.llm_top_k = llm_top_k
        logger.info(f"HybridReranker initialized (LLM top-{llm_top_k})")
    
    async def rerank(
        self, 
        query: str, 
        results: List[Dict[str, Any]], 
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Two-stage reranking:
        1. Simple reranking on all results
        2. LLM reranking on top candidates
        """
        if not results:
            return []
        
        # Stage 1: Simple reranking
        simple_reranked = await self.simple_reranker.rerank(
            query, results, top_k=self.llm_top_k
        )
        
        # Stage 2: LLM reranking on top candidates
        if len(simple_reranked) > 1:
            final_reranked = await self.llm_reranker.rerank(
                query, simple_reranked, top_k=top_k
            )
        else:
            final_reranked = simple_reranked
        
        return final_reranked[:top_k]


class RerankerFactory:
    """Factory to create appropriate reranker based on config"""
    
    @staticmethod
    def create(reranker_type: str = "simple", **kwargs) -> BaseReranker:
        """
        Create a reranker instance.
        
        Args:
            reranker_type: "simple", "llm", or "hybrid"
            **kwargs: Additional arguments for the reranker
            
        Returns:
            Reranker instance
        """
        if reranker_type == "simple":
            return SimpleReranker()
        elif reranker_type == "llm":
            return LLMReranker(model=kwargs.get("model", "gpt-4o-mini"))
        elif reranker_type == "hybrid":
            return HybridReranker(
                llm_model=kwargs.get("model", "gpt-4o-mini"),
                llm_top_k=kwargs.get("llm_top_k", 10)
            )
        else:
            logger.warning(f"Unknown reranker type: {reranker_type}, using simple")
            return SimpleReranker()


# Singleton instances
_reranker_instance = None

def get_reranker(reranker_type: str = None) -> BaseReranker:
    """
    Get reranker instance based on config.
    
    Uses config setting RERANKER_TYPE if reranker_type not specified.
    """
    global _reranker_instance
    
    if _reranker_instance is None:
        from app.config import settings
        
        if reranker_type is None:
            reranker_type = getattr(settings, 'RERANKER_TYPE', 'simple')
        
        _reranker_instance = RerankerFactory.create(reranker_type)
    
    return _reranker_instance
