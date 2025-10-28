"""
Image Search Service
Handles text-to-image and image-to-image search
"""

import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.services.image_processor import ImageProcessor
from app.services.image_vector_store import ImageVectorStore

logger = logging.getLogger(__name__)


class ImageSearchService:
    """Service for searching images"""
    
    def __init__(self, kb_id: str):
        """
        Initialize image search service
        
        Args:
            kb_id: Knowledge base ID
        """
        self.kb_id = kb_id
        self.image_processor = ImageProcessor()
        self.vector_store = ImageVectorStore(kb_id)
    
    async def search_by_text(self, query_text: str, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Search images using text query
        
        Args:
            query_text: Search query text
            k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of search results
        """
        try:
            logger.info(f"Text-to-image search: '{query_text}' in KB {self.kb_id}")
            
            # Generate text embedding
            text_result = await self.image_processor.generate_text_embedding(query_text)
            text_embedding = text_result['embedding']
            
            # Search vector store
            results = await self.vector_store.search(
                query_embedding=text_embedding,
                k=k,
                filters=filters
            )
            
            # Enrich results
            enriched_results = []
            for result in results:
                enriched = {
                    "result_id": result['image_id'],
                    "type": "image",
                    "score": result['score'],
                    "similarity": result['similarity'],
                    "metadata": result['metadata'],
                    "search_type": "text_to_image"
                }
                enriched_results.append(enriched)
            
            logger.info(f"Found {len(enriched_results)} image results for text query")
            
            return enriched_results
            
        except Exception as e:
            logger.error(f"Error in text-to-image search: {e}")
            raise
    
    async def search_by_image(self, image_path: Path, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Search similar images using an image
        
        Args:
            image_path: Path to query image
            k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of search results
        """
        try:
            logger.info(f"Image-to-image search in KB {self.kb_id}")
            
            # Generate image embedding
            from PIL import Image
            image = Image.open(image_path)
            image_result = await self.image_processor.generate_image_embedding(image)
            image_embedding = image_result['embedding']
            
            # Search vector store
            results = await self.vector_store.search(
                query_embedding=image_embedding,
                k=k,
                filters=filters
            )
            
            # Enrich results
            enriched_results = []
            for result in results:
                enriched = {
                    "result_id": result['image_id'],
                    "type": "image",
                    "score": result['score'],
                    "similarity": result['similarity'],
                    "metadata": result['metadata'],
                    "search_type": "image_to_image"
                }
                enriched_results.append(enriched)
            
            logger.info(f"Found {len(enriched_results)} similar images")
            
            return enriched_results
            
        except Exception as e:
            logger.error(f"Error in image-to-image search: {e}")
            raise
    
    async def search_by_image_bytes(self, image_bytes: bytes, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Search similar images using image bytes
        
        Args:
            image_bytes: Image data as bytes
            k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of search results
        """
        try:
            logger.info(f"Image-to-image search (from bytes) in KB {self.kb_id}")
            
            # Generate image embedding
            from PIL import Image
            from io import BytesIO
            image = Image.open(BytesIO(image_bytes))
            image_result = await self.image_processor.generate_image_embedding(image)
            image_embedding = image_result['embedding']
            
            # Search vector store
            results = await self.vector_store.search(
                query_embedding=image_embedding,
                k=k,
                filters=filters
            )
            
            # Enrich results
            enriched_results = []
            for result in results:
                enriched = {
                    "result_id": result['image_id'],
                    "type": "image",
                    "score": result['score'],
                    "similarity": result['similarity'],
                    "metadata": result['metadata'],
                    "search_type": "image_to_image"
                }
                enriched_results.append(enriched)
            
            logger.info(f"Found {len(enriched_results)} similar images")
            
            return enriched_results
            
        except Exception as e:
            logger.error(f"Error in image-to-image search: {e}")
            raise
    
    async def hybrid_search(
        self, 
        query_text: str, 
        image_path: Optional[Path] = None,
        k: int = 5,
        text_weight: float = 0.5,
        filters: Dict[str, Any] = None
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search combining text and image queries
        
        Args:
            query_text: Search query text
            image_path: Optional path to query image
            k: Number of results to return
            text_weight: Weight for text results (0-1), image weight = 1 - text_weight
            filters: Optional metadata filters
            
        Returns:
            List of search results
        """
        try:
            logger.info(f"Hybrid search in KB {self.kb_id}")
            
            # Get text results
            text_results = await self.search_by_text(query_text, k=k*2, filters=filters)
            
            # Get image results if image provided
            image_results = []
            if image_path:
                image_results = await self.search_by_image(image_path, k=k*2, filters=filters)
            
            # Combine and rerank results
            combined = {}
            
            # Add text results
            for result in text_results:
                image_id = result['result_id']
                score = result['score'] * text_weight
                combined[image_id] = {
                    **result,
                    "combined_score": score,
                    "text_score": result['score'],
                    "image_score": 0.0
                }
            
            # Add/update with image results
            image_weight = 1.0 - text_weight
            for result in image_results:
                image_id = result['result_id']
                score = result['score'] * image_weight
                
                if image_id in combined:
                    combined[image_id]['combined_score'] += score
                    combined[image_id]['image_score'] = result['score']
                else:
                    combined[image_id] = {
                        **result,
                        "combined_score": score,
                        "text_score": 0.0,
                        "image_score": result['score']
                    }
            
            # Sort by combined score
            sorted_results = sorted(
                combined.values(),
                key=lambda x: x['combined_score'],
                reverse=True
            )[:k]
            
            # Mark as hybrid search
            for result in sorted_results:
                result['search_type'] = 'hybrid'
                result['score'] = result['combined_score']
            
            logger.info(f"Hybrid search returned {len(sorted_results)} results")
            
            return sorted_results
            
        except Exception as e:
            logger.error(f"Error in hybrid search: {e}")
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get search service statistics"""
        return {
            "kb_id": self.kb_id,
            "vector_store_stats": self.vector_store.get_stats()
        }