"""
Embeddings Service
Generate embeddings using OpenAI
"""

import logging
from typing import List, Dict, Any
import tiktoken
from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Generate embeddings for text"""
    
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = settings.EMBEDDING_MODEL
        self.dimension = settings.EMBEDDING_DIMENSION
        
        # Initialize tokenizer
        try:
            self.tokenizer = tiktoken.encoding_for_model(self.model)
        except:
            self.tokenizer = tiktoken.get_encoding("cl100k_base")
    
    async def generate_embedding(
        self,
        text: str,
        model: str = None
    ) -> Dict[str, Any]:
        """
        Generate embedding for a single text
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        model = model or self.model
        
        # Count tokens
        tokens = len(self.tokenizer.encode(text))
        
        # Truncate if too long (max 8191 tokens for text-embedding-3-small)
        max_tokens = 8191
        if tokens > max_tokens:
            logger.warning(f"Text too long ({tokens} tokens), truncating to {max_tokens}")
            encoded = self.tokenizer.encode(text)[:max_tokens]
            text = self.tokenizer.decode(encoded)
            tokens = max_tokens
        
        # Generate embedding
        try:
            response = self.client.embeddings.create(
                input=text,
                model=model
            )
            
            embedding = response.data[0].embedding
            
            return {
                "embedding": embedding,
                "model": model,
                "tokens": tokens,
                "dimension": len(embedding)
            }
            
        except Exception as e:
            logger.error(f"Embedding generation error: {e}")
            raise
    
    async def generate_embeddings_for_chunks(
        self,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate embeddings for multiple chunks
        """
        embeddings = []
        total_tokens = 0
        
        for chunk in chunks:
            text = chunk["content"]
            
            try:
                result = await self.generate_embedding(text)
                
                embeddings.append({
                    "chunk_id": chunk["chunk_id"],
                    "embedding": result["embedding"],
                    "tokens": result["tokens"]
                })
                
                total_tokens += result["tokens"]
                
            except Exception as e:
                logger.error(f"Failed to generate embedding for chunk {chunk['chunk_id']}: {e}")
                # Continue with other chunks
                continue
        
        return {
            "embeddings": embeddings,
            "total_embeddings": len(embeddings),
            "total_tokens": total_tokens,
            "model": self.model,
            "dimension": self.dimension
        }
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        return len(self.tokenizer.encode(text))
    
    async def generate_batch_embeddings(
        self,
        texts: List[str],
        model: str = None
    ) -> List[List[float]]:
        """
        Generate embeddings for batch of texts
        """
        model = model or self.model
        
        # Filter empty texts
        texts = [t for t in texts if t and t.strip()]
        
        if not texts:
            return []
        
        try:
            # OpenAI allows batch embedding requests
            response = self.client.embeddings.create(
                input=texts,
                model=model
            )
            
            embeddings = [data.embedding for data in response.data]
            
            return embeddings
            
        except Exception as e:
            logger.error(f"Batch embedding generation error: {e}")
            raise