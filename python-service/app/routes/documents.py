"""
Document management routes - ASYNC VERSION (CORRECTED)
Handles document upload with background processing
Preserves ALL existing endpoints
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from typing import Optional
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel
import logging
import asyncio

logger = logging.getLogger(__name__)

from app.models.requests import DocumentUploadRequest
from app.models.responses import DocumentUploadResponse, ErrorResponse, DocumentProcessingResult, EmbeddingResult
from app.services.document_processor import DocumentProcessor
from app.utils.cost_tracking import CostTracker
from app.services.web_scraper import WebScraper
from app.services.document_job_processor import get_document_job_processor

router = APIRouter()
document_processor = DocumentProcessor()
cost_tracker = CostTracker()
web_scraper = WebScraper()


class TestUrlRequest(BaseModel):
    url: str


class ScrapeUrlRequest(BaseModel):
    url: str
    kb_id: str
    tenant_id: str
    max_depth: int = 2
    max_pages: int = 20
    metadata: Optional[Dict[str, Any]] = {}


class ScrapeSitemapRequest(BaseModel):
    sitemap_url: str
    kb_id: str
    tenant_id: str
    max_pages: int = 50
    metadata: Optional[Dict[str, Any]] = {}


class DocumentStatusResponse(BaseModel):
    """Response model for document status"""
    document_id: str
    status: str
    progress: int = 0
    current_step: Optional[str] = None
    total_chunks: int = 0
    processed_chunks: int = 0
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class AsyncDocumentUploadResponse(BaseModel):
    """Response model for async document upload"""
    document_id: str
    filename: str
    file_type: str
    file_size_bytes: int
    status: str
    message: str
    estimated_time_seconds: Optional[int] = None


# ============================================
# ASYNC Document Upload (NEW - Primary endpoint)
# ============================================

@router.post("/documents/upload", response_model=AsyncDocumentUploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    kb_id: str = Form(...),
    tenant_id: str = Form(...),
    document_id: str = Form(...),
    metadata: Optional[str] = Form("{}")
):
    """
    Upload a document for async processing.
    Returns immediately with document_id and status "queued".
    Use GET /documents/{document_id}/status to check progress.
    """
    try:
        # Parse metadata
        metadata_dict = json.loads(metadata) if metadata else {}
        
        # Read file
        file_content = await file.read()
        file_size = len(file_content)
        
        # Check file size
        from app.config import settings
        max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
        if file_size > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File size exceeds maximum of {settings.MAX_FILE_SIZE_MB}MB"
            )
        
        # Get job processor
        job_processor = get_document_job_processor()
        
        # Create job record
        await job_processor.create_job(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            filename=file.filename,
            file_size=file_size,
            content_type=file.content_type,
            metadata=metadata_dict
        )
        
        # Save file temporarily
        job_processor.save_temp_file(document_id, file_content, file.filename)
        
        # Estimate processing time (rough: 1 second per 10KB + 0.5 second per expected chunk)
        estimated_chunks = max(1, file_size // 1500)  # Rough estimate
        estimated_time = max(10, (file_size // 10000) + (estimated_chunks // 2))
        
        # Add background task for processing
        background_tasks.add_task(
            job_processor.process_document_background,
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            file_content=file_content,
            filename=file.filename,
            content_type=file.content_type,
            metadata=metadata_dict
        )
        
        logger.info(f"Document {document_id} queued for processing (size: {file_size} bytes)")
        
        return AsyncDocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            file_type=file.content_type,
            file_size_bytes=file_size,
            status="queued",
            message="Document uploaded and queued for processing. Use GET /documents/{document_id}/status to check progress.",
            estimated_time_seconds=estimated_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SYNC Document Upload (for backward compatibility)
# ============================================

@router.post("/documents/upload-sync", response_model=DocumentUploadResponse)
async def upload_document_sync(
    file: UploadFile = File(...),
    kb_id: str = Form(...),
    tenant_id: str = Form(...),
    document_id: str = Form(...),
    metadata: Optional[str] = Form("{}")
):
    """
    Upload and process a document synchronously.
    WARNING: May timeout for large documents. Use /documents/upload for large files.
    """
    try:
        # Parse metadata
        metadata_dict = json.loads(metadata) if metadata else {}
        
        # Read file
        file_content = await file.read()
        
        # Check file size
        from app.config import settings
        max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=413,
                detail=f"File size exceeds maximum of {settings.MAX_FILE_SIZE_MB}MB"
            )
        
        # Process document synchronously (original behavior)
        result = await document_processor.process_document(
            document_id=document_id,
            kb_id=kb_id,
            tenant_id=tenant_id,
            file_content=file_content,
            filename=file.filename,
            content_type=file.content_type,
            metadata=metadata_dict
        )
        
        # Calculate cost
        cost = cost_tracker.calculate_document_processing_cost(result)
        
        return DocumentUploadResponse(
            document_id=document_id,
            filename=file.filename,
            file_type=file.content_type,
            file_size_bytes=len(file_content),
            status="completed",
            processing_results=result.processing_results,
            embeddings=result.embeddings,
            cost=cost
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Document Status (Enhanced)
# ============================================

@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(document_id: str):
    """
    Get document processing status.
    Returns progress percentage and current processing step.
    """
    try:
        job_processor = get_document_job_processor()
        status = await job_processor.get_job_status(document_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return DocumentStatusResponse(
            document_id=document_id,
            status=status.get("status", "unknown"),
            progress=status.get("progress", 0),
            current_step=status.get("current_step"),
            total_chunks=status.get("total_chunks", 0),
            processed_chunks=status.get("processed_chunks", 0),
            error_message=status.get("error_message"),
            created_at=status.get("created_at"),
            started_at=status.get("started_at"),
            completed_at=status.get("completed_at")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Document Delete
# ============================================

@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """
    Delete document and all associated data
    """
    try:
        await document_processor.delete_document(document_id)
        
        # Also cleanup any temp files
        job_processor = get_document_job_processor()
        job_processor.cleanup_temp_file(document_id)
        
        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Document Reprocess (async)
# ============================================

@router.post("/documents/{document_id}/reprocess")
async def reprocess_document(document_id: str, background_tasks: BackgroundTasks):
    """
    Reprocess an existing document
    """
    try:
        # Get document info from database
        from app.services.vector_store import VectorStore
        import mysql.connector
        from app.config import settings
        
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute(
            """SELECT id, kb_id, tenant_id, filename, original_filename, 
                      file_type, storage_url, metadata 
               FROM yovo_tbl_aiva_documents WHERE id = %s""",
            (document_id,)
        )
        doc = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Read file from storage
        storage_path = doc.get("storage_url", "")
        if not storage_path:
            raise HTTPException(status_code=400, detail="Document file not found")
        
        # Try to read the file
        try:
            with open(storage_path, 'rb') as f:
                file_content = f.read()
        except FileNotFoundError:
            raise HTTPException(status_code=400, detail="Document file not found on disk")
        
        # Delete existing chunks
        vector_store = VectorStore()
        await vector_store.delete_document(document_id)
        
        # Get job processor and reprocess
        job_processor = get_document_job_processor()
        
        metadata = {}
        if doc.get("metadata"):
            try:
                metadata = json.loads(doc["metadata"]) if isinstance(doc["metadata"], str) else doc["metadata"]
            except:
                pass
        
        # Create new job
        await job_processor.create_job(
            document_id=document_id,
            kb_id=doc["kb_id"],
            tenant_id=doc["tenant_id"],
            filename=doc["original_filename"] or doc["filename"],
            file_size=len(file_content),
            content_type=doc["file_type"],
            metadata=metadata
        )
        
        # Add background task
        background_tasks.add_task(
            job_processor.process_document_background,
            document_id=document_id,
            kb_id=doc["kb_id"],
            tenant_id=doc["tenant_id"],
            file_content=file_content,
            filename=doc["original_filename"] or doc["filename"],
            content_type=doc["file_type"],
            metadata=metadata
        )
        
        return {
            "message": "Document reprocessing started",
            "document_id": document_id,
            "status": "queued"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reprocess failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Similar Documents (PRESERVED from original)
# ============================================

@router.get("/documents/{document_id}/similar")
async def get_similar_documents(document_id: str, top_k: int = 5):
    """
    Get similar documents
    """
    try:
        similar = await document_processor.get_similar_documents(document_id, top_k)
        return {"similar_documents": similar}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Extract Text (PRESERVED from original)
# ============================================

@router.post("/documents/extract")
async def extract_text(file: UploadFile = File(...)):
    """
    Extract text from document without indexing
    """
    try:
        file_content = await file.read()
        
        extracted = await document_processor.extract_text_only(
            file_content=file_content,
            filename=file.filename,
            content_type=file.content_type
        )
        
        return {
            "filename": file.filename,
            "text": extracted["text"],
            "pages": extracted.get("pages", 0),
            "word_count": len(extracted["text"].split())
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Web Scraping - Test URL (PRESERVED)
# ============================================

@router.post("/documents/test-url")
async def test_url(request: TestUrlRequest):
    """
    Test URL accessibility
    """
    try:
        result = await web_scraper.test_url_accessibility(request.url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Scrape URL (PRESERVED - synchronous as original)
# ============================================

@router.post("/documents/scrape-url")
async def scrape_url(request: ScrapeUrlRequest):
    """
    Scrape URL and add to knowledge base
    (Synchronous - as in original implementation)
    """
    try:
        # Scrape website
        scrape_result = await web_scraper.scrape_url(
            url=request.url,
            max_depth=request.max_depth,
            max_pages=request.max_pages
        )
        
        if scrape_result['total_pages'] == 0:
            raise HTTPException(status_code=400, detail="No pages could be scraped")
        
        # Process each scraped page
        processed_documents = []
        
        for page in scrape_result['pages']:
            document_id = str(uuid.uuid4())
            
            # Process as text document (uses existing synchronous method)
            result = await document_processor.process_text_content(
                document_id=document_id,
                kb_id=request.kb_id,
                tenant_id=request.tenant_id,
                text=page['text'],
                title=page['title'],
                source_url=page['url'],
                metadata={
                    **request.metadata,
                    **page['metadata'],
                    'source_type': 'web_scrape',
                    'depth': page['depth']
                }
            )
            
            processed_documents.append({
                'document_id': document_id,
                'url': page['url'],
                'title': page['title'],
                'chunks': result.processing_results.total_chunks
            })
        
        return {
            'total_pages_scraped': scrape_result['total_pages'],
            'documents_processed': len(processed_documents),
            'documents': processed_documents,
            'base_url': request.url
        }
        
    except Exception as e:
        logger.error(f"Scrape URL error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Scrape Sitemap (PRESERVED - synchronous as original)
# ============================================

@router.post("/documents/scrape-sitemap")
async def scrape_sitemap(request: ScrapeSitemapRequest):
    """
    Scrape URLs from sitemap.xml
    (Synchronous - as in original implementation)
    """
    try:
        import aiohttp
        
        # Get URLs from sitemap
        urls = await web_scraper.scrape_sitemap(request.sitemap_url)
        
        if not urls:
            raise HTTPException(status_code=400, detail="No URLs found in sitemap")
        
        # Limit number of URLs
        urls = urls[:request.max_pages]
        
        # Scrape each URL
        processed_documents = []
        
        async with aiohttp.ClientSession() as session:
            for url in urls:
                try:
                    page_data = await web_scraper._scrape_single_page(session, url)
                    
                    if not page_data:
                        continue
                    
                    document_id = str(uuid.uuid4())
                    
                    result = await document_processor.process_text_content(
                        document_id=document_id,
                        kb_id=request.kb_id,
                        tenant_id=request.tenant_id,
                        text=page_data['text'],
                        title=page_data['title'],
                        source_url=url,
                        metadata={
                            **request.metadata,
                            **page_data['metadata'],
                            'source_type': 'sitemap_scrape'
                        }
                    )
                    
                    processed_documents.append({
                        'document_id': document_id,
                        'url': url,
                        'title': page_data['title']
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing URL {url}: {e}")
                    continue
        
        return {
            'total_urls_found': len(urls),
            'documents_processed': len(processed_documents),
            'documents': processed_documents
        }
        
    except Exception as e:
        logger.error(f"Scrape sitemap error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
