"""
PDF Image Extraction Service
Extracts images from PDF files and saves them properly to disk
"""

import fitz  # PyMuPDF
import io
import logging
import uuid
from pathlib import Path
from PIL import Image
from typing import List, Dict, Any
import time

logger = logging.getLogger(__name__)


class PDFImageExtractor:
    """Extract and save images from PDF documents"""
    
    def __init__(self, storage_base_path: str = "/etc/aiva-oai/storage"):
        self.storage_base_path = Path(storage_base_path)
        self.images_dir = self.storage_base_path / "images"
        self.images_dir.mkdir(parents=True, exist_ok=True)
    
    async def extract_pdf_images(
        self,
        pdf_content: bytes,
        document_id: str,
        kb_id: str,
        tenant_id: str
    ) -> List[Dict[str, Any]]:
        """
        Extract all images from a PDF document
        
        Args:
            pdf_content: PDF file content as bytes
            document_id: Document ID
            kb_id: Knowledge base ID
            tenant_id: Tenant ID
            
        Returns:
            List of extracted image metadata
        """
        try:
            # Open PDF document
            pdf_document = fitz.open(stream=pdf_content, filetype="pdf")
            extracted_images = []
            
            logger.info(f"Extracting images from PDF: {document_id}, {pdf_document.page_count} pages")
            
            # Iterate through pages
            for page_number in range(pdf_document.page_count):
                page = pdf_document[page_number]
                
                # Get list of images on this page
                image_list = page.get_images(full=True)
                
                logger.info(f"Page {page_number + 1}: Found {len(image_list)} images")
                
                # Extract each image
                for image_index, img in enumerate(image_list):
                    try:
                        xref = img[0]  # Image reference number
                        
                        # Extract image data
                        base_image = pdf_document.extract_image(xref)
                        image_bytes = base_image["image"]  # Image data as bytes
                        image_ext = base_image["ext"]  # Image extension (png, jpeg, etc.)
                        
                        # Generate unique image ID
                        image_id = str(uuid.uuid4())
                        
                        # Create storage directory for KB
                        kb_images_dir = self.images_dir / kb_id
                        kb_images_dir.mkdir(parents=True, exist_ok=True)
                        
                        # Save image file to disk
                        filename = f"{image_id}_page{page_number + 1}_img{image_index + 1}.{image_ext}"
                        file_path = kb_images_dir / filename
                        
                        # CRITICAL: Write image bytes to file
                        with open(file_path, "wb") as image_file:
                            image_file.write(image_bytes)
                        
                        logger.info(f"✅ Saved image: {file_path} ({len(image_bytes)} bytes)")
                        
                        # Get image dimensions using PIL
                        try:
                            pil_image = Image.open(io.BytesIO(image_bytes))
                            width, height = pil_image.size
                            mode = pil_image.mode
                            image_format = pil_image.format or image_ext.upper()
                        except Exception as e:
                            logger.warning(f"Could not get image dimensions: {e}")
                            width, height = None, None
                            mode = "RGB"
                            image_format = image_ext.upper()
                        
                        # Build image metadata
                        image_metadata = {
                            "id": image_id,
                            "document_id": document_id,
                            "kb_id": kb_id,
                            "tenant_id": tenant_id,
                            "page_number": page_number + 1,
                            "image_index": image_index + 1,
                            "filename": filename,
                            "storage_path": str(file_path),
                            "storage_url": f"/storage/images/{kb_id}/{filename}",
                            "file_size_bytes": len(image_bytes),
                            "width": width,
                            "height": height,
                            "format": image_format,
                            "mode": mode,
                            "content_type": f"image/{image_ext}",
                            "created_at": time.time(),
                            "embedding_dimension": 512  # CLIP embedding dimension
                        }
                        
                        extracted_images.append(image_metadata)
                        
                    except Exception as e:
                        logger.error(f"Error extracting image {image_index} from page {page_number + 1}: {e}")
                        continue
            
            pdf_document.close()
            
            logger.info(f"✅ Successfully extracted {len(extracted_images)} images from PDF {document_id}")
            
            return extracted_images
            
        except Exception as e:
            logger.error(f"Error extracting images from PDF {document_id}: {e}")
            raise
    
    async def save_extracted_image(
        self,
        image_bytes: bytes,
        image_id: str,
        kb_id: str,
        filename: str
    ) -> str:
        """
        Save extracted image bytes to disk
        
        Args:
            image_bytes: Image data as bytes
            image_id: Unique image ID
            kb_id: Knowledge base ID
            filename: Filename for the image
            
        Returns:
            Path to saved file
        """
        try:
            # Create storage directory
            kb_images_dir = self.images_dir / kb_id
            kb_images_dir.mkdir(parents=True, exist_ok=True)
            
            # Save file
            file_path = kb_images_dir / filename
            
            with open(file_path, "wb") as f:
                f.write(image_bytes)
            
            logger.info(f"Saved image to {file_path} ({len(image_bytes)} bytes)")
            
            return str(file_path)
            
        except Exception as e:
            logger.error(f"Error saving image {image_id}: {e}")
            raise