"""
Semantic Cache Service
Cache query embeddings and results for similar queries to reduce costs and improve performance
"""

import logging
import json
import time
import hashlib
import numpy as np
import redis
from typing import Dict, Any, Optional, List
from app.config import settings

logger = logging.getLogger(__name__)


class SemanticCache:
    """
    Semantic caching for search queries
    
    Caches query embeddings and results, then matches similar queries
    using cosine similarity to avoid redundant API calls and searches.
    """
    
    def __init__(self):
        """Initialize semantic cache with Redis connection"""
        self.redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=False
        )
        
        # Cache configuration
        self.cache_prefix = "semantic_cache:"
        self.index_prefix = "cache_index:"
        
        # Similarity threshold for cache hits (0.95 = 95% similar)
        self.similarity_threshold = getattr(
            settings, 
            'SEMANTIC_CACHE_SIMILARITY_THRESHOLD', 
            0.95
        )
        
        # Cache TTL in seconds (default: 1 hour)
        self.ttl = getattr(
            settings, 
            'SEMANTIC_CACHE_TTL', 
            3600
        )
        
        logger.info(
            f"Semantic cache initialized (threshold: {self.similarity_threshold}, "
            f"TTL: {self.ttl}s)"
        )
    
    def _generate_cache_key(self, kb_id: str, query_hash: str) -> str:
        """Generate Redis key for cached query"""
        return f"{self.cache_prefix}{kb_id}:{query_hash}"
    
    def _generate_index_key(self, kb_id: str) -> str:
        """Generate Redis key for cache index"""
        return f"{self.index_prefix}{kb_id}"
    
    def _cosine_similarity(self, vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two vectors
        
        Returns value between -1 and 1, where:
        1 = identical vectors
        0 = orthogonal vectors
        -1 = opposite vectors
        """
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    async def get_cached_result(
        self, 
        kb_id: str, 
        query: str,
        query_embedding: List[float],
        search_type: str = "text"
    ) -> Optional[Dict[str, Any]]:
        """
        Check if similar query exists in cache
        
        Args:
            kb_id: Knowledge base ID
            query: Query text
            query_embedding: Query embedding vector
            search_type: Type of search (text, image, hybrid)
            
        Returns:
            Cached results if found, None otherwise
        """
        try:
            # Get cache index for this KB
            index_key = self._generate_index_key(kb_id)
            index_data = self.redis_client.get(index_key)
            
            if not index_data:
                logger.debug(f"No cache index for KB {kb_id}")
                return None
            
            cache_index = json.loads(index_data)
            
            # Filter by search type
            relevant_keys = [
                entry['key'] for entry in cache_index 
                if entry.get('search_type') == search_type
            ]
            
            if not relevant_keys:
                logger.debug(f"No cached queries for search type: {search_type}")
                return None
            
            query_vec = np.array(query_embedding)
            best_similarity = 0.0
            best_match = None
            best_key = None
            
            # Check similarity with cached queries
            for cache_key in relevant_keys:
                try:
                    cached_data = self.redis_client.get(cache_key)
                    if not cached_data:
                        continue
                    
                    cached_entry = json.loads(cached_data)
                    cached_embedding = np.array(cached_entry['embedding'])
                    
                    similarity = self._cosine_similarity(query_vec, cached_embedding)
                    
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match = cached_entry
                        best_key = cache_key
                        
                except Exception as e:
                    logger.error(f"Error checking cache key {cache_key}: {e}")
                    continue
            
            # Check if best match exceeds threshold
            if best_match and best_similarity >= self.similarity_threshold:
                logger.info(
                    f"✅ Cache HIT! Similarity: {best_similarity:.4f} | "
                    f"Original: '{best_match.get('query', '')[:50]}...' | "
                    f"Current: '{query[:50]}...'"
                )
                
                # Update access time
                best_match['last_accessed'] = time.time()
                best_match['access_count'] = best_match.get('access_count', 0) + 1
                self.redis_client.setex(
                    best_key,
                    self.ttl,
                    json.dumps(best_match)
                )
                
                return {
                    'results': best_match['results'],
                    'cached': True,
                    'cache_similarity': float(best_similarity),
                    'original_query': best_match.get('query', ''),
                    'cache_age_seconds': int(time.time() - best_match.get('created_at', 0)),
                    'access_count': best_match.get('access_count', 1)
                }
            
            logger.debug(
                f"❌ Cache MISS | Best similarity: {best_similarity:.4f} | "
                f"Threshold: {self.similarity_threshold}"
            )
            return None
            
        except Exception as e:
            logger.error(f"Cache lookup error: {e}")
            return None
    
    async def cache_result(
        self,
        kb_id: str,
        query: str,
        query_embedding: List[float],
        results: Dict[str, Any],
        search_type: str = "text",
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Cache query embedding and results
        
        Args:
            kb_id: Knowledge base ID
            query: Query text
            query_embedding: Query embedding vector
            results: Search results to cache
            search_type: Type of search
            metadata: Additional metadata to store
        """
        try:
            # Generate unique hash for this query
            query_hash = hashlib.md5(
                f"{query}:{search_type}".encode()
            ).hexdigest()
            
            cache_key = self._generate_cache_key(kb_id, query_hash)
            
            # Prepare cache entry
            cache_data = {
                'query': query,
                'query_hash': query_hash,
                'embedding': query_embedding,
                'results': results,
                'search_type': search_type,
                'created_at': time.time(),
                'last_accessed': time.time(),
                'access_count': 0,
                'metadata': metadata or {}
            }
            
            # Store cache entry
            self.redis_client.setex(
                cache_key,
                self.ttl,
                json.dumps(cache_data)
            )
            
            # Update cache index
            await self._update_cache_index(kb_id, cache_key, search_type, query)
            
            logger.info(f"💾 Cached query: '{query[:50]}...' | Type: {search_type}")
            
        except Exception as e:
            logger.error(f"Cache write error: {e}")
    
    async def _update_cache_index(
        self, 
        kb_id: str, 
        cache_key: str, 
        search_type: str,
        query: str
    ):
        """
        Update cache index with new entry
        
        Maintains a list of all cached queries for efficient lookup
        """
        try:
            index_key = self._generate_index_key(kb_id)
            index_data = self.redis_client.get(index_key)
            
            if index_data:
                cache_index = json.loads(index_data)
            else:
                cache_index = []
            
            # Add new entry to index
            cache_index.append({
                'key': cache_key,
                'search_type': search_type,
                'query_preview': query[:100],
                'created_at': time.time()
            })
            
            # Limit index size (keep last 1000 entries)
            if len(cache_index) > 1000:
                cache_index = cache_index[-1000:]
            
            # Store updated index with longer TTL
            self.redis_client.setex(
                index_key,
                self.ttl * 2,  # Index lives 2x longer
                json.dumps(cache_index)
            )
            
        except Exception as e:
            logger.error(f"Error updating cache index: {e}")
    
    async def clear_cache(self, kb_id: Optional[str] = None):
        """
        Clear cache for specific KB or all caches
        
        Args:
            kb_id: Knowledge base ID (if None, clears all caches)
        """
        try:
            if kb_id:
                # Clear specific KB cache
                pattern = f"{self.cache_prefix}{kb_id}:*"
                keys = self.redis_client.keys(pattern)
                
                if keys:
                    self.redis_client.delete(*keys)
                    logger.info(f"Cleared cache for KB: {kb_id} ({len(keys)} entries)")
                
                # Clear index
                index_key = self._generate_index_key(kb_id)
                self.redis_client.delete(index_key)
            else:
                # Clear all caches
                pattern = f"{self.cache_prefix}*"
                keys = self.redis_client.keys(pattern)
                
                if keys:
                    self.redis_client.delete(*keys)
                    logger.info(f"Cleared all caches ({len(keys)} entries)")
                
                # Clear all indexes
                index_pattern = f"{self.index_prefix}*"
                index_keys = self.redis_client.keys(index_pattern)
                if index_keys:
                    self.redis_client.delete(*index_keys)
                    
        except Exception as e:
            logger.error(f"Error clearing cache: {e}")
    
    async def get_cache_stats(self, kb_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Get cache statistics
        
        Args:
            kb_id: Knowledge base ID (if None, returns global stats)
            
        Returns:
            Cache statistics dictionary
        """
        try:
            if kb_id:
                pattern = f"{self.cache_prefix}{kb_id}:*"
            else:
                pattern = f"{self.cache_prefix}*"
            
            keys = self.redis_client.keys(pattern)
            
            total_entries = len(keys)
            total_hits = 0
            search_type_counts = {}
            oldest_entry = None
            newest_entry = None
            
            for key in keys:
                try:
                    data = json.loads(self.redis_client.get(key))
                    total_hits += data.get('access_count', 0)
                    
                    search_type = data.get('search_type', 'unknown')
                    search_type_counts[search_type] = search_type_counts.get(search_type, 0) + 1
                    
                    created_at = data.get('created_at', 0)
                    if oldest_entry is None or created_at < oldest_entry:
                        oldest_entry = created_at
                    if newest_entry is None or created_at > newest_entry:
                        newest_entry = created_at
                        
                except Exception as e:
                    logger.error(f"Error reading cache entry: {e}")
                    continue
            
            return {
                'kb_id': kb_id,
                'total_cached_queries': total_entries,
                'total_cache_hits': total_hits,
                'cache_hit_rate': f"{(total_hits / max(total_entries, 1)):.2f}",
                'search_types': search_type_counts,
                'oldest_entry_age_seconds': int(time.time() - oldest_entry) if oldest_entry else 0,
                'newest_entry_age_seconds': int(time.time() - newest_entry) if newest_entry else 0,
                'cache_ttl_seconds': self.ttl,
                'similarity_threshold': self.similarity_threshold
            }
            
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {
                'error': str(e)
            }