"""
Image Search Service
Handles text-to-image and image-to-image search
"""

import logging
import uuid 
from typing import List, Dict, Any, Optional
from pathlib import Path

from app.services.image_processor import ImageProcessor
from app.services.image_vector_store import ImageVectorStore

logger = logging.getLogger(__name__)


class ImageSearchService:
    """Service for searching images"""
    
    def __init__(self, kb_id: str, image_processor: ImageProcessor = None):
        """
        Initialize image search service
        
        Args:
            kb_id: Knowledge base ID
            image_processor: ImageProcessor instance (singleton). If None, creates new instance
        """
        self.kb_id = kb_id
        
        # Use provided processor or create new one (fallback for compatibility)
        if image_processor is not None:
            self.image_processor = image_processor
        else:
            logger.warning("ImageSearchService initialized without singleton processor - creating new instance")
            self.image_processor = ImageProcessor()
            
        self.vector_store = ImageVectorStore(kb_id)
    
    async def search_by_text(self, query_text: str, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Search images using text query"""
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
            
            # Enrich with URLs from database
            enriched_results = await self._enrich_with_urls(results)
            
            logger.info(f"Found {len(enriched_results)} image results for text query")
            
            return enriched_results  # ✅ Return enriched results
            
        except Exception as e:
            logger.error(f"Error in text-to-image search: {e}")
            raise


    async def search_by_image(self, image_path: Path, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Search similar images using an image"""
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
            
            # Enrich with URLs from database
            enriched_results = await self._enrich_with_urls(results)
            
            logger.info(f"Found {len(enriched_results)} similar images")
            
            return enriched_results  # ✅ Return enriched results
            
        except Exception as e:
            logger.error(f"Error in image-to-image search: {e}")
            raise


    async def search_by_image_bytes(self, image_bytes: bytes, k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """Search similar images using image bytes"""
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
            
            # Enrich with URLs from database
            enriched_results = await self._enrich_with_urls(results)
            
            logger.info(f"Found {len(enriched_results)} similar images")
            
            return enriched_results  # ✅ Return enriched results
            
        except Exception as e:
            logger.error(f"Error in image-to-image search: {e}")
            raise
            
    async def _enrich_with_urls(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich search results with image URLs from database"""
        import mysql.connector
        import uuid
        from app.config import settings
        
        if not results:
            return []
        
        # Debug: Print what we're receiving
        logger.info(f"Enriching {len(results)} results")
        if results:
            logger.info(f"First result structure: {results[0]}")
        
        # Get MySQL connection
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Get image IDs - try multiple extraction methods
            image_ids = []
            for result in results:
                # Try multiple ways to get image_id
                image_id = (
                    result.get('image_id') or
                    result.get('metadata', {}).get('image_db_id') or
                    result.get('metadata', {}).get('image_id') or
                    result.get('metadata', {}).get('id')
                )
                
                if image_id:
                    image_ids.append(image_id)
                    logger.debug(f"Found image_id: {image_id}")
                else:
                    logger.warning(f"Could not extract image_id from result: {result.keys()}")
            
            if not image_ids:
                logger.warning("No image IDs found in results")
                return []
            
            logger.info(f"Found {len(image_ids)} image IDs: {image_ids}")
            
            # Fetch image details from database
            placeholders = ','.join(['%s'] * len(image_ids))
            query = f"""
                SELECT 
                    id,
                    kb_id,
                    document_id,
                    tenant_id,
                    filename,
                    storage_url,
                    thumbnail_url,
                    image_type,
                    width,
                    height,
                    file_size_bytes,
                    description,
                    page_number,
                    metadata,
                    vector_id,
                    created_at
                FROM yovo_tbl_aiva_images
                WHERE id IN ({placeholders})
            """
            
            cursor.execute(query, image_ids)
            db_images = cursor.fetchall()
            
            logger.info(f"Found {len(db_images)} images in database")
            
            # Create lookup map
            image_map = {img['id']: img for img in db_images}
            
            # Enrich results
            enriched_results = []
            for result in results:
                # Extract image_id using same logic
                image_id = (
                    result.get('image_id') or
                    result.get('metadata', {}).get('image_db_id') or
                    result.get('metadata', {}).get('image_id') or
                    result.get('metadata', {}).get('id')
                )
                
                if not image_id:
                    logger.warning(f"Skipping result with no image_id")
                    continue
                
                if image_id not in image_map:
                    logger.warning(f"Image {image_id} not found in database")
                    continue
                
                db_image = image_map[image_id]
                
                # Parse metadata
                import json
                metadata = {}
                if db_image['metadata']:
                    if isinstance(db_image['metadata'], str):
                        metadata = json.loads(db_image['metadata'])
                    else:
                        metadata = db_image['metadata']
                
                # ✅ REMOVE EMBEDDING FROM METADATA
                if 'embedding' in metadata:
                    del metadata['embedding']
                    
                # Generate image URL
                image_url = f"/api/knowledge/{db_image['kb_id']}/images/{db_image['id']}/view"
                thumbnail_url = db_image['thumbnail_url'] if db_image['thumbnail_url'] else None
                
                enriched = {
                    "result_id": str(image_id),
                    "type": "image",
                    "image_id": str(image_id),
                    "filename": db_image['filename'],
                    "image_url": image_url,  # ✅ This will now be set
                    "thumbnail_url": thumbnail_url,
                    "description": db_image['description'] or metadata.get('description') or metadata.get('title'),
                    "score": result.get('score', 0.0),
                    "similarity": result.get('score', 0.0),
                    "scoring_details": {
                        "similarity": result.get('score', 0.0),
                        "search_type": result.get('search_type', 'image')
                    },
                    "source": {
                        "kb_id": db_image['kb_id'],
                        "document_id": db_image['document_id'],
                        "filename": db_image['filename'],
                        "image_id": str(image_id),
                        "storage_url": db_image['storage_url'],
                        "page_number": db_image['page_number']
                    },
                    "metadata": {
                        **metadata,
                        "id": str(image_id),
                        "kb_id": db_image['kb_id'],
                        "tenant_id": db_image['tenant_id'],
                        "filename": db_image['filename'],
                        "image_type": db_image['image_type'],
                        "width": db_image['width'],
                        "height": db_image['height'],
                        "file_size_bytes": db_image['file_size_bytes'],
                        "description": db_image['description'],
                        "page_number": db_image['page_number'],
                        "created_at": str(db_image['created_at']) if db_image['created_at'] else None
                    },
                    "search_type": result.get('search_type', 'image')
                }
                
                enriched_results.append(enriched)
                logger.info(f"Enriched result with URL: {image_url}")
            
            logger.info(f"Successfully enriched {len(enriched_results)} results")
            return enriched_results
            
        finally:
            cursor.close()
            conn.close()
    
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