"""
Document Processor Service
Handles document upload, extraction, and processing
"""

import io
import logging
from typing import Dict, Any, Optional
from datetime import datetime
import json

from pypdf import PdfReader
from docx import Document
from pptx import Presentation
from openpyxl import load_workbook
from bs4 import BeautifulSoup

from app.config import settings
from app.services.text_processor import TextProcessor
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
from app.models.responses import DocumentProcessingResult, EmbeddingResult

logger = logging.getLogger(__name__)


class DocumentProcessor:
    """Process documents and extract content"""
    
    def __init__(self):
        self.text_processor = TextProcessor()
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStore()
    
    async def _create_document_record(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        filename: str,
        file_size: int,
        content_type: str,
        metadata: Dict[str, Any]
    ):
        """
        Create document record in database
        """
        import mysql.connector
        from app.config import settings
        
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO yovo_tbl_aiva_documents 
                (id, kb_id, tenant_id, filename, original_filename, file_type, 
                 file_size_bytes, storage_url, status, metadata, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
            """, (
                document_id,
                kb_id,
                tenant_id,
                filename,
                filename,
                content_type,
                file_size,
                f"/storage/documents/{document_id}",
                "processing",
                json.dumps(metadata)
            ))
            
            conn.commit()
            logger.info(f"Created document record: {document_id}")
            
        except Exception as e:
            conn.rollback()
            logger.error(f"Error creating document record: {e}")
            raise
        finally:
            cursor.close()
            conn.close()


    async def process_document(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        file_content: bytes,
        filename: str,
        content_type: str,
        metadata: Dict[str, Any]
    ) -> Any:
        """
        Process document and extract content
        """
        import time
        start_time = time.time()
        
        logger.info(f"Processing document: {filename} ({content_type})")
        
        # CREATE DOCUMENT RECORD FIRST
        await self._create_document_record(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            filename=filename,
            file_size=len(file_content),
            content_type=content_type,
            metadata=metadata
        )
        
        # Extract text based on file type
        extraction_result = await self._extract_content(file_content, filename, content_type)
        
        # Process text (clean, chunk, detect language)
        processed = await self.text_processor.process_text(
            text=extraction_result["text"],
            document_id=document_id,
            kb_id=kb_id,
            metadata={
                **metadata,
                "filename": filename,
                "content_type": content_type,
                "pages": extraction_result.get("pages", 0)
            }
        )
        
        # Generate embeddings
        embeddings_result = await self.embedding_service.generate_embeddings_for_chunks(
            chunks=processed["chunks"]
        )
        
        # Store in vector store
        await self.vector_store.store_document(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            chunks=processed["chunks"],
            embeddings=embeddings_result["embeddings"]
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Build response
        processing_results = DocumentProcessingResult(
            total_pages=extraction_result.get("pages", 0),
            total_chunks=len(processed["chunks"]),
            extracted_images=extraction_result.get("images", 0),
            detected_tables=extraction_result.get("tables", 0),
            detected_faqs=processed.get("faqs", 0),
            chunks_by_type=processed.get("chunks_by_type", {}),
            language_detected=processed.get("languages", []),
            has_roman_urdu=processed.get("has_roman_urdu", False),
            processing_time_ms=processing_time
        )
        
        embedding_result = EmbeddingResult(
            total_embeddings_generated=embeddings_result["total_embeddings"],
            embedding_model=embeddings_result["model"],
            total_tokens_embedded=embeddings_result["total_tokens"],
            vector_dimension=embeddings_result["dimension"]
        )
        
        class ProcessingResponse:
            def __init__(self, proc, emb):
                self.processing_results = proc
                self.embeddings = emb
        
        return ProcessingResponse(processing_results, embedding_result)
    
    async def _extract_content(
        self,
        file_content: bytes,
        filename: str,
        content_type: str
    ) -> Dict[str, Any]:
        """
        Extract content from different file types
        """
        file_ext = filename.lower().split('.')[-1]
        
        if file_ext == 'pdf' or 'pdf' in content_type:
            return await self._extract_pdf(file_content)
        elif file_ext in ['docx', 'doc'] or 'word' in content_type:
            return await self._extract_docx(file_content)
        elif file_ext in ['pptx', 'ppt'] or 'presentation' in content_type:
            return await self._extract_pptx(file_content)
        elif file_ext in ['xlsx', 'xls'] or 'spreadsheet' in content_type:
            return await self._extract_xlsx(file_content)
        elif file_ext == 'txt':
            return await self._extract_txt(file_content)
        elif file_ext == 'html':
            return await self._extract_html(file_content)
        else:
            raise ValueError(f"Unsupported file type: {file_ext}")
    
    async def _extract_pdf(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from PDF"""
        try:
            pdf_file = io.BytesIO(file_content)
            reader = PdfReader(pdf_file)
            
            text_parts = []
            total_pages = len(reader.pages)
            
            for page_num, page in enumerate(reader.pages, 1):
                text = page.extract_text()
                if text:
                    text_parts.append(f"[Page {page_num}]\n{text}")
            
            full_text = "\n\n".join(text_parts)
            
            return {
                "text": full_text,
                "pages": total_pages,
                "images": 0,  # TODO: Extract images
                "tables": 0   # TODO: Detect tables
            }
            
        except Exception as e:
            logger.error(f"PDF extraction error: {e}")
            raise
    
    async def _extract_docx(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from DOCX"""
        try:
            doc_file = io.BytesIO(file_content)
            doc = Document(doc_file)
            
            text_parts = []
            
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            # Extract tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join([cell.text for cell in row.cells])
                    if row_text.strip():
                        text_parts.append(row_text)
            
            full_text = "\n\n".join(text_parts)
            
            return {
                "text": full_text,
                "pages": len(doc.sections),
                "images": 0,
                "tables": len(doc.tables)
            }
            
        except Exception as e:
            logger.error(f"DOCX extraction error: {e}")
            raise
    
    async def _extract_pptx(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from PPTX"""
        try:
            pptx_file = io.BytesIO(file_content)
            prs = Presentation(pptx_file)
            
            text_parts = []
            
            for slide_num, slide in enumerate(prs.slides, 1):
                slide_text = [f"[Slide {slide_num}]"]
                
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_text.append(shape.text)
                
                if len(slide_text) > 1:
                    text_parts.append("\n".join(slide_text))
            
            full_text = "\n\n".join(text_parts)
            
            return {
                "text": full_text,
                "pages": len(prs.slides),
                "images": 0,
                "tables": 0
            }
            
        except Exception as e:
            logger.error(f"PPTX extraction error: {e}")
            raise
    
    async def _extract_xlsx(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from XLSX"""
        try:
            xlsx_file = io.BytesIO(file_content)
            wb = load_workbook(xlsx_file, data_only=True)
            
            text_parts = []
            
            for sheet_name in wb.sheetnames:
                sheet = wb[sheet_name]
                sheet_text = [f"[Sheet: {sheet_name}]"]
                
                for row in sheet.iter_rows(values_only=True):
                    row_text = " | ".join([str(cell) if cell is not None else "" for cell in row])
                    if row_text.strip():
                        sheet_text.append(row_text)
                
                if len(sheet_text) > 1:
                    text_parts.append("\n".join(sheet_text))
            
            full_text = "\n\n".join(text_parts)
            
            return {
                "text": full_text,
                "pages": len(wb.sheetnames),
                "images": 0,
                "tables": len(wb.sheetnames)
            }
            
        except Exception as e:
            logger.error(f"XLSX extraction error: {e}")
            raise
    
    async def _extract_txt(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from TXT"""
        try:
            text = file_content.decode('utf-8', errors='ignore')
            
            return {
                "text": text,
                "pages": 1,
                "images": 0,
                "tables": 0
            }
            
        except Exception as e:
            logger.error(f"TXT extraction error: {e}")
            raise
    
    async def _extract_html(self, file_content: bytes) -> Dict[str, Any]:
        """Extract text from HTML"""
        try:
            html = file_content.decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'lxml')
            
            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()
            
            text = soup.get_text()
            
            # Clean up whitespace
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            text = '\n'.join(chunk for chunk in chunks if chunk)
            
            return {
                "text": text,
                "pages": 1,
                "images": 0,
                "tables": 0
            }
            
        except Exception as e:
            logger.error(f"HTML extraction error: {e}")
            raise
    
    async def extract_text_only(
        self,
        file_content: bytes,
        filename: str,
        content_type: str
    ) -> Dict[str, Any]:
        """
        Extract text without processing
        """
        return await self._extract_content(file_content, filename, content_type)
    
    async def get_document_status(self, document_id: str) -> Dict[str, Any]:
        """Get document processing status"""
        # This would check Redis or DB for status
        return {
            "document_id": document_id,
            "status": "completed",
            "message": "Document processed successfully"
        }
    
    async def delete_document(self, document_id: str):
        """Delete document and all associated data"""
        await self.vector_store.delete_document(document_id)
    
    async def reprocess_document(self, document_id: str):
        """Reprocess existing document"""
        # TODO: Implement reprocessing logic
        raise NotImplementedError("Reprocess not yet implemented")
    
    async def get_similar_documents(self, document_id: str, top_k: int):
        """Get similar documents"""
        # TODO: Implement similarity search
        return []
        
    async def process_text_content(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        text: str,
        title: str,
        source_url: str,
        metadata: Dict[str, Any]
    ) -> Any:
        """
        Process text content directly (for web scraping)
        """
        import time
        start_time = time.time()
        
        logger.info(f"Processing text content: {title}")
        
        # CREATE DOCUMENT RECORD FIRST
        await self._create_document_record(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            filename=title,
            file_size=len(text.encode('utf-8')),
            content_type="text/html",
            metadata={
                **metadata,
                "source_url": source_url,
                "title": title
            }
        )
        
        # Process text (clean, chunk, detect language)
        processed = await self.text_processor.process_text(
            text=text,
            document_id=document_id,
            kb_id=kb_id,
            metadata={
                **metadata,
                "title": title,
                "source_url": source_url,
                "content_type": "text/html"
            }
        )
        
        # Generate embeddings
        embeddings_result = await self.embedding_service.generate_embeddings_for_chunks(
            chunks=processed["chunks"]
        )
        
        # Store in vector store
        await self.vector_store.store_document(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            chunks=processed["chunks"],
            embeddings=embeddings_result["embeddings"]
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Build response
        from app.models.responses import DocumentProcessingResult, EmbeddingResult
        
        processing_results = DocumentProcessingResult(
            total_pages=1,
            total_chunks=len(processed["chunks"]),
            extracted_images=0,
            detected_tables=0,
            detected_faqs=processed.get("faqs", 0),
            chunks_by_type=processed.get("chunks_by_type", {}),
            language_detected=processed.get("languages", []),
            has_roman_urdu=processed.get("has_roman_urdu", False),
            processing_time_ms=processing_time
        )
        
        embedding_result = EmbeddingResult(
            total_embeddings_generated=embeddings_result["total_embeddings"],
            embedding_model=embeddings_result["model"],
            total_tokens_embedded=embeddings_result["total_tokens"],
            vector_dimension=embeddings_result["dimension"]
        )
        
        class ProcessingResponse:
            def __init__(self, proc, emb):
                self.processing_results = proc
                self.embeddings = emb
        
        return ProcessingResponse(processing_results, embedding_result)