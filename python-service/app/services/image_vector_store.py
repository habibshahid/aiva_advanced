"""
Image Vector Store Service
Manages FAISS-based vector storage for images
"""

import logging
import pickle
from typing import List, Dict, Any, Optional
from pathlib import Path

import faiss
import numpy as np
import mysql.connector

from app.config import settings

logger = logging.getLogger(__name__)


class ImageVectorStore:
    """FAISS-based vector store for image embeddings"""
    
    def __init__(self, kb_id: str):
        """
        Initialize vector store for a knowledge base
        
        Args:
            kb_id: Knowledge base ID
        """
        self.kb_id = kb_id
        self.dimension = 512  # CLIP embedding dimension
        
        # Initialize empty index and metadata
        self.index = None
        self.metadata = []
        
        # Load existing index or create new
        self._load_or_create_index()
    
    def _get_mysql_connection(self):
        """Get MySQL connection"""
        return mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
    
    def _load_or_create_index(self):
        """Load existing FAISS index from database or create new one"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Check if KB has image index
            cursor.execute("""
                SELECT COUNT(*) as image_count 
                FROM yovo_tbl_aiva_images 
                WHERE kb_id = %s
            """, (self.kb_id,))
            
            result = cursor.fetchone()
            image_count = result['image_count']
            
            if image_count > 0:
                logger.info(f"Loading existing image index for KB {self.kb_id} ({image_count} images)")
                self._rebuild_index_from_db()
            else:
                logger.info(f"Creating new image index for KB {self.kb_id}")
                self._create_new_index()
                
        except Exception as e:
            logger.error(f"Error loading/creating index: {e}")
            self._create_new_index()
        finally:
            cursor.close()
            conn.close()
    
    def _create_new_index(self):
        """Create a new empty FAISS index"""
        # Use IndexFlatIP for cosine similarity (inner product with normalized vectors)
        self.index = faiss.IndexFlatIP(self.dimension)
        self.metadata = []
        logger.info("Created new empty FAISS index")
    
    def _rebuild_index_from_db(self):
        """Rebuild FAISS index from database"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Fetch all images for this KB
            cursor.execute("""
                SELECT id, embedding, metadata
                FROM yovo_tbl_aiva_images
                WHERE kb_id = %s
                ORDER BY created_at
            """, (self.kb_id,))
            
            images = cursor.fetchall()
            
            if not images:
                self._create_new_index()
                return
            
            # Determine index type based on size
            if len(images) > 1000:
                logger.info(f"Creating HNSW index for {len(images)} images")
                self.index = faiss.IndexHNSWFlat(self.dimension, 32)
                self.index.hnsw.efConstruction = 200
                self.index.hnsw.efSearch = 50
            else:
                logger.info(f"Creating Flat index for {len(images)} images")
                self.index = faiss.IndexFlatIP(self.dimension)
            
            # Collect embeddings and metadata
            embeddings = []
            self.metadata = []
            
            for img in images:
                # Parse embedding from JSON string
                import json
                embedding = json.loads(img['embedding'])
                embeddings.append(embedding)
                
                # Parse metadata
                meta = json.loads(img['metadata']) if img['metadata'] else {}
                meta['image_db_id'] = img['id']  # Store DB ID for reference
                self.metadata.append(meta)
            
            # Add to FAISS index
            embeddings_array = np.array(embeddings, dtype=np.float32)
            self.index.add(embeddings_array)
            
            logger.info(f"Rebuilt index with {len(embeddings)} images")
            
        except Exception as e:
            logger.error(f"Error rebuilding index from DB: {e}")
            self._create_new_index()
        finally:
            cursor.close()
            conn.close()
    
    async def add_image(self, image_id: str, embedding: List[float], metadata: Dict[str, Any]) -> int:
        """
        Add image embedding to the store
        
        Args:
            image_id: Unique image ID
            embedding: Image embedding vector
            metadata: Image metadata
            
        Returns:
            Index position in FAISS
        """
        try:
            # Convert to numpy array and normalize
            embedding_array = np.array([embedding], dtype=np.float32)
            faiss.normalize_L2(embedding_array)
            
            # Add to FAISS index
            self.index.add(embedding_array)
            
            # Add metadata
            idx = len(self.metadata)
            metadata['image_id'] = image_id
            metadata['faiss_idx'] = idx
            self.metadata.append(metadata)
            
            logger.info(f"Added image {image_id} to vector store at index {idx}")
            
            return idx
            
        except Exception as e:
            logger.error(f"Error adding image to vector store: {e}")
            raise
    
    async def search(self, query_embedding: List[float], k: int = 5, filters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        Search for similar images
        
        Args:
            query_embedding: Query embedding vector
            k: Number of results to return
            filters: Optional metadata filters
            
        Returns:
            List of search results with scores and metadata
        """
        if len(self.metadata) == 0:
            return []
        
        try:
            # Convert to numpy array and normalize
            query_array = np.array([query_embedding], dtype=np.float32)
            faiss.normalize_L2(query_array)
            
            # Search FAISS index
            k_search = min(k * 2, len(self.metadata))  # Get more candidates for filtering
            distances, indices = self.index.search(query_array, k_search)
            
            # Build results
            results = []
            for i, idx in enumerate(indices[0]):
                if idx == -1 or idx >= len(self.metadata):
                    continue
                
                meta = self.metadata[idx]
                score = float(distances[0][i])
                
                # Apply filters if provided
                if filters and not self._matches_filters(meta, filters):
                    continue
                
                results.append({
                    "image_id": meta.get('image_id'),
                    "score": score,
                    "similarity": score,
                    "metadata": meta
                })
                
                if len(results) >= k:
                    break
            
            return results
            
        except Exception as e:
            logger.error(f"Error searching vector store: {e}")
            return []
    
    def _matches_filters(self, metadata: Dict[str, Any], filters: Dict[str, Any]) -> bool:
        """Check if metadata matches filters"""
        for key, value in filters.items():
            if key not in metadata:
                return False
            if metadata[key] != value:
                return False
        return True
    
    async def delete_image(self, image_id: str) -> bool:
        """
        Delete an image from the vector store
        
        Args:
            image_id: Image ID to delete
            
        Returns:
            True if deleted successfully
        """
        try:
            # Find image in metadata
            idx_to_remove = None
            for i, meta in enumerate(self.metadata):
                if meta.get('image_id') == image_id:
                    idx_to_remove = i
                    break
            
            if idx_to_remove is None:
                logger.warning(f"Image {image_id} not found in vector store")
                return False
            
            # Remove from metadata
            self.metadata.pop(idx_to_remove)
            
            # Rebuild index (FAISS doesn't support deletion)
            await self._rebuild_index()
            
            logger.info(f"Deleted image {image_id} from vector store")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting image: {e}")
            return False
    
    async def _rebuild_index(self):
        """Rebuild FAISS index after deletion"""
        if len(self.metadata) == 0:
            self._create_new_index()
            return
        
        try:
            # Fetch embeddings from database
            conn = self._get_mysql_connection()
            cursor = conn.cursor(dictionary=True)
            
            # Get image IDs from metadata
            image_ids = [m.get('image_db_id') for m in self.metadata if m.get('image_db_id')]
            
            if not image_ids:
                self._create_new_index()
                return
            
            placeholders = ','.join(['%s'] * len(image_ids))
            cursor.execute(f"""
                SELECT embedding
                FROM yovo_tbl_aiva_images
                WHERE id IN ({placeholders})
                ORDER BY created_at
            """, image_ids)
            
            rows = cursor.fetchall()
            
            # Rebuild index
            import json
            embeddings = [json.loads(row['embedding']) for row in rows]
            embeddings_array = np.array(embeddings, dtype=np.float32)
            
            # Create new index
            if len(embeddings) > 1000:
                self.index = faiss.IndexHNSWFlat(self.dimension, 32)
                self.index.hnsw.efConstruction = 200
                self.index.hnsw.efSearch = 50
            else:
                self.index = faiss.IndexFlatIP(self.dimension)
            
            self.index.add(embeddings_array)
            
            cursor.close()
            conn.close()
            
            logger.info(f"Rebuilt index with {len(embeddings)} images")
            
        except Exception as e:
            logger.error(f"Error rebuilding index: {e}")
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get vector store statistics"""
        return {
            "kb_id": self.kb_id,
            "total_images": len(self.metadata),
            "index_type": type(self.index).__name__,
            "dimension": self.dimension
        }