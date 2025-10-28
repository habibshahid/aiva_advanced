"""
Image Processor Service
Handles image processing and embedding generation using CLIP
"""

import logging
import uuid
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
from io import BytesIO

import torch
import numpy as np
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import requests

from app.config import settings

logger = logging.getLogger(__name__)


class ImageProcessor:
    """Process images and generate CLIP embeddings"""
    
    def __init__(self):
        """Initialize CLIP model and processor"""
        try:
            logger.info("Loading CLIP model...")
            self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
            self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
            
            # Move to GPU if available
            if torch.cuda.is_available():
                self.model = self.model.to("cuda")
                logger.info("CLIP model loaded on GPU")
            else:
                logger.info("CLIP model loaded on CPU")
                
        except Exception as e:
            logger.error(f"Failed to load CLIP model: {e}")
            raise
    
    async def generate_text_embedding(self, text: str) -> Dict[str, Any]:
        """
        Generate embedding for text query (for text-to-image search)
        
        Args:
            text: Query text
            
        Returns:
            Dict with embedding and metadata
        """
        start_time = time.time()
        
        try:
            # Preprocess text
            inputs = self.processor(
                text=text,
                return_tensors="pt",
                padding=True,
                truncation=True
            )
            
            # Move to GPU if available
            if torch.cuda.is_available():
                inputs = {k: v.to("cuda") for k, v in inputs.items()}
            
            # Generate text features
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                # Normalize
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)
            
            # Convert to list
            embedding = text_features.cpu().numpy().tolist()[0]
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return {
                "embedding": embedding,
                "dimension": len(embedding),
                "model": "openai/clip-vit-base-patch32",
                "processing_time_ms": processing_time,
                "tokens_estimated": len(text.split())  # Rough estimate
            }
            
        except Exception as e:
            logger.error(f"Error generating text embedding: {e}")
            raise
    
    async def generate_image_embedding(self, image: Image.Image) -> Dict[str, Any]:
        """
        Generate embedding for an image
        
        Args:
            image: PIL Image object
            
        Returns:
            Dict with embedding and metadata
        """
        start_time = time.time()
        
        try:
            # Preprocess image
            inputs = self.processor(
                images=image,
                return_tensors="pt",
                padding=True
            )
            
            # Move to GPU if available
            if torch.cuda.is_available():
                inputs = {k: v.to("cuda") for k, v in inputs.items()}
            
            # Generate image features
            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                # Normalize
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
            
            # Convert to list
            embedding = image_features.cpu().numpy().tolist()[0]
            
            processing_time = int((time.time() - start_time) * 1000)
            
            return {
                "embedding": embedding,
                "dimension": len(embedding),
                "model": "openai/clip-vit-base-patch32",
                "processing_time_ms": processing_time,
                "image_size": image.size
            }
            
        except Exception as e:
            logger.error(f"Error generating image embedding: {e}")
            raise
    
    async def process_image_file(self, file_path: Path, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process an image file and generate embedding
        
        Args:
            file_path: Path to image file
            metadata: Additional metadata
            
        Returns:
            Dict with embedding and enriched metadata
        """
        try:
            # Open image
            image = Image.open(file_path)
            
            # Generate embedding
            embedding_result = await self.generate_image_embedding(image)
            
            # Generate unique ID
            image_id = str(uuid.uuid4())
            
            # Build metadata
            image_metadata = {
                "id": image_id,
                "filename": file_path.name,
                "width": image.size[0],
                "height": image.size[1],
                "format": image.format,
                "mode": image.mode,
                "created_at": time.time()
            }
            
            # Add custom metadata
            if metadata:
                image_metadata.update(metadata)
            
            return {
                "image_id": image_id,
                "embedding": embedding_result["embedding"],
                "dimension": embedding_result["dimension"],
                "metadata": image_metadata,
                "processing_time_ms": embedding_result["processing_time_ms"]
            }
            
        except Exception as e:
            logger.error(f"Error processing image file {file_path}: {e}")
            raise
    
    async def process_image_url(self, image_url: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process an image from URL and generate embedding
        
        Args:
            image_url: URL of the image
            metadata: Additional metadata
            
        Returns:
            Dict with embedding and enriched metadata
        """
        try:
            # Download image
            response = requests.get(image_url, timeout=10, stream=True)
            response.raise_for_status()
            
            # Open image
            image = Image.open(BytesIO(response.content))
            
            # Generate embedding
            embedding_result = await self.generate_image_embedding(image)
            
            # Generate unique ID
            image_id = str(uuid.uuid4())
            
            # Build metadata
            image_metadata = {
                "id": image_id,
                "source_url": image_url,
                "width": image.size[0],
                "height": image.size[1],
                "format": image.format or "unknown",
                "mode": image.mode,
                "created_at": time.time()
            }
            
            # Add custom metadata
            if metadata:
                image_metadata.update(metadata)
            
            return {
                "image_id": image_id,
                "embedding": embedding_result["embedding"],
                "dimension": embedding_result["dimension"],
                "metadata": image_metadata,
                "processing_time_ms": embedding_result["processing_time_ms"]
            }
            
        except Exception as e:
            logger.error(f"Error processing image from URL {image_url}: {e}")
            raise
    
    async def process_image_bytes(self, image_bytes: bytes, metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Process image from bytes and generate embedding
        
        Args:
            image_bytes: Image data as bytes
            metadata: Additional metadata
            
        Returns:
            Dict with embedding and enriched metadata
        """
        try:
            # Open image from bytes
            image = Image.open(BytesIO(image_bytes))
            
            # Generate embedding
            embedding_result = await self.generate_image_embedding(image)
            
            # Generate unique ID
            image_id = str(uuid.uuid4())
            
            # Build metadata
            image_metadata = {
                "id": image_id,
                "width": image.size[0],
                "height": image.size[1],
                "format": image.format or "unknown",
                "mode": image.mode,
                "created_at": time.time()
            }
            
            # Add custom metadata
            if metadata:
                image_metadata.update(metadata)
            
            return {
                "image_id": image_id,
                "embedding": embedding_result["embedding"],
                "dimension": embedding_result["dimension"],
                "metadata": image_metadata,
                "processing_time_ms": embedding_result["processing_time_ms"]
            }
            
        except Exception as e:
            logger.error(f"Error processing image from bytes: {e}")
            raise