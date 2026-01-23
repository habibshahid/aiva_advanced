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
import random

logger = logging.getLogger(__name__)

from app.models.requests import DocumentUploadRequest
from app.models.responses import DocumentUploadResponse, ErrorResponse, DocumentProcessingResult, EmbeddingResult
from app.services.document_processor import DocumentProcessor
from app.utils.cost_tracking import CostTracker
from app.services.web_scraper import WebScraper
from app.services.document_job_processor import get_document_job_processor
from app.services.scrape_sync_service import get_scrape_sync_service

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


class CreateScrapeSourceRequest(BaseModel):
    kb_id: str
    tenant_id: str
    url: str
    scrape_type: str = 'single_url'
    max_depth: int = 2
    max_pages: int = 20
    auto_sync_enabled: bool = False
    sync_interval_hours: int = 24
    metadata: Optional[Dict[str, Any]] = None

class UpdateScrapeSourceRequest(BaseModel):
    auto_sync_enabled: Optional[bool] = None
    sync_interval_hours: Optional[int] = None
    max_depth: Optional[int] = None
    max_pages: Optional[int] = None
  
class ScrapeJobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued, scraping, processing, completed, failed
    progress: int = 0
    current_step: Optional[str] = None
    pages_scraped: int = 0
    pages_processed: int = 0
    total_pages: int = 0
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    
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
            
            # Process as text document
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
        
        # Update KB stats
        if processed_documents:
            from app.services.document_job_processor import get_document_job_processor
            job_processor = get_document_job_processor()
            await job_processor._update_kb_stats(request.kb_id)
        
        # ============================================
        # NEW: Create/Update scrape source for auto-sync tracking
        # ============================================
        source_id = None
        try:
            import mysql.connector
            from app.config import settings
            from datetime import timedelta
            
            # Get auto-sync settings from metadata
            auto_sync_enabled = request.metadata.get('auto_sync_enabled', False) if request.metadata else False
            sync_interval_hours = request.metadata.get('sync_interval_hours', 24) if request.metadata else 24
            
            conn = mysql.connector.connect(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD,
                database=settings.DB_NAME
            )
            cursor = conn.cursor(dictionary=True)
            
            # Check if source already exists for this URL and KB
            cursor.execute("""
                SELECT id FROM yovo_tbl_aiva_scrape_sources 
                WHERE kb_id = %s AND url = %s
            """, (request.kb_id, request.url))
            
            existing = cursor.fetchone()
            
            now = datetime.utcnow()
            next_sync = now + timedelta(hours=sync_interval_hours) if auto_sync_enabled else None
            
            if existing:
                # Update existing source
                source_id = existing['id']
                cursor.execute("""
                    UPDATE yovo_tbl_aiva_scrape_sources SET
                        auto_sync_enabled = %s,
                        sync_interval_hours = %s,
                        last_sync_at = %s,
                        next_sync_at = %s,
                        sync_status = 'idle',
                        documents_count = %s,
                        max_depth = %s,
                        max_pages = %s,
                        updated_at = %s
                    WHERE id = %s
                """, (
                    1 if auto_sync_enabled else 0,
                    sync_interval_hours,
                    now,
                    next_sync,
                    len(processed_documents),
                    request.max_depth,
                    request.max_pages,
                    now,
                    source_id
                ))
                logger.info(f"Updated scrape source {source_id} for {request.url}, auto_sync={auto_sync_enabled}")
            else:
                # Create new source
                source_id = str(uuid.uuid4())
                cursor.execute("""
                    INSERT INTO yovo_tbl_aiva_scrape_sources 
                    (id, kb_id, tenant_id, url, scrape_type, max_depth, max_pages, 
                     auto_sync_enabled, sync_interval_hours, last_sync_at, next_sync_at,
                     sync_status, documents_count, metadata, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    source_id,
                    request.kb_id,
                    request.tenant_id,
                    request.url,
                    'crawl',
                    request.max_depth,
                    request.max_pages,
                    1 if auto_sync_enabled else 0,
                    sync_interval_hours,
                    now,
                    next_sync,
                    'idle',
                    len(processed_documents),
                    json.dumps(request.metadata) if request.metadata else None,
                    now,
                    now
                ))
                logger.info(f"Created scrape source {source_id} for {request.url}, auto_sync={auto_sync_enabled}")
            
            # Update documents with scrape_source_id
            if processed_documents and source_id:
                doc_ids = [doc['document_id'] for doc in processed_documents]
                for doc_id in doc_ids:
                    cursor.execute("""
                        UPDATE yovo_tbl_aiva_documents 
                        SET scrape_source_id = %s, sync_status = 'synced', last_sync_at = %s
                        WHERE id = %s
                    """, (source_id, now, doc_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            
        except Exception as e:
            logger.error(f"Failed to create/update scrape source: {e}", exc_info=True)
            # Don't fail the whole request if source tracking fails
        
        # ============================================
        # END OF NEW CODE
        # ============================================
        
        # Refresh KB stats via Node.js API
        try:
            import httpx
            from app.config import settings
            
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"http://localhost:62001/api/kb/{request.kb_id}/refresh-stats",
                    headers={"x-api-key": settings.PYTHON_API_KEY}
                )
        except Exception as e:
            logger.warning(f"Failed to refresh KB stats: {e}")
        
        return {
            'total_pages_scraped': scrape_result['total_pages'],
            'documents_processed': len(processed_documents),
            'documents': processed_documents,
            'base_url': request.url,
            'scrape_source_id': source_id  # NEW: Return source ID
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
        import random
        
        # Get URLs from sitemap
        urls = await web_scraper.scrape_sitemap(request.sitemap_url)
        
        if not urls:
            raise HTTPException(status_code=400, detail="No URLs found in sitemap")
        
        # Limit number of URLs
        urls = urls[:request.max_pages]
        
        # Scrape each URL
        processed_documents = []
        
        if not web_scraper._stable_headers:
            stable_ua = random.choice(web_scraper.user_agents)
            web_scraper._stable_headers = {
                'User-Agent': stable_ua,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
            }
            
        async with aiohttp.ClientSession(headers=web_scraper._stable_headers) as session:
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
                    
                    if processed_documents:
                        from app.services.document_job_processor import get_document_job_processor
                        job_processor = get_document_job_processor()
                        await job_processor._update_kb_stats(request.kb_id)
                        
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


# ============================================
# Scrape Sources Management
# ============================================

@router.get("/kb/{kb_id}/scrape-sources")
async def list_scrape_sources(kb_id: str):
    """
    List all scrape sources for a knowledge base
    """
    try:
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
        
        # Check if table exists first
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_name = 'yovo_tbl_aiva_scrape_sources'
        """)
        table_exists = cursor.fetchone()['cnt'] > 0
        
        if not table_exists:
            cursor.close()
            conn.close()
            return {"sources": []}
        
        cursor.execute("""
            SELECT * FROM yovo_tbl_aiva_scrape_sources
            WHERE kb_id = %s
            ORDER BY created_at DESC
        """, (kb_id,))
        
        sources = cursor.fetchall()
        cursor.close()
        conn.close()
        
        # Convert datetime objects to ISO strings
        for source in sources:
            for key in ['created_at', 'updated_at', 'last_sync_at', 'next_sync_at']:
                if source.get(key):
                    source[key] = source[key].isoformat()
            # Parse metadata JSON if present
            if source.get('metadata'):
                try:
                    source['metadata'] = json.loads(source['metadata']) if isinstance(source['metadata'], str) else source['metadata']
                except:
                    pass
        
        return {"sources": sources}
        
    except Exception as e:
        logger.error(f"List scrape sources error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/scrape-sources/{source_id}/sync")
async def sync_scrape_source(source_id: str, force: bool = False):
    """
    Manually trigger sync for a scrape source
    """
    try:
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
        
        # Get source
        cursor.execute("SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE id = %s", (source_id,))
        source = cursor.fetchone()
        
        if not source:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Scrape source not found")
        
        cursor.close()
        conn.close()
        
        # TODO: Implement actual sync logic here
        # For now, just return a placeholder response
        return {
            "status": "sync_started",
            "source_id": source_id,
            "message": "Sync functionality will be implemented"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scrape-sources/{source_id}/check-changes")
async def check_scrape_source_changes(source_id: str):
    """
    Check if scraped content has changed without syncing
    """
    try:
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
        
        cursor.execute("SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE id = %s", (source_id,))
        source = cursor.fetchone()
        
        if not source:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Scrape source not found")
        
        cursor.close()
        conn.close()
        
        # TODO: Implement actual change detection
        return {
            "source_id": source_id,
            "has_changes": False,
            "message": "Change detection will be implemented"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Check changes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
@router.post("/documents/scrape-url-async")
async def scrape_url_async(request: ScrapeUrlRequest, background_tasks: BackgroundTasks):
    """
    Scrape URL asynchronously - returns immediately with job_id.
    Use GET /documents/scrape-job/{job_id}/status to check progress.
    """
    try:
        job_id = str(uuid.uuid4())
        
        # Get job processor for Redis status tracking
        job_processor = get_document_job_processor()
        
        # Create scrape job in Redis
        job_data = {
            "job_id": job_id,
            "kb_id": request.kb_id,
            "tenant_id": request.tenant_id,
            "url": request.url,
            "max_depth": request.max_depth,
            "max_pages": request.max_pages,
            "status": "queued",
            "progress": 0,
            "current_step": "Queued for scraping",
            "pages_scraped": 0,
            "pages_processed": 0,
            "total_pages": 0,
            "error_message": "",
            "created_at": datetime.now().isoformat(),
            "completed_at": ""
        }
        
        # Store job in Redis
        job_key = f"scrape_job:{job_id}"
        job_processor.redis_client.hset(job_key, mapping={k: str(v) if v is not None else "" for k, v in job_data.items()})
        job_processor.redis_client.expire(job_key, 86400)  # 24 hours TTL
        
        # Add background task
        background_tasks.add_task(
            _process_scrape_job_background,
            job_id=job_id,
            url=request.url,
            kb_id=request.kb_id,
            tenant_id=request.tenant_id,
            max_depth=request.max_depth,
            max_pages=request.max_pages,
            metadata=request.metadata or {}
        )
        
        logger.info(f"Scrape job {job_id} queued for URL: {request.url}")
        
        return {
            "job_id": job_id,
            "status": "queued",
            "message": "Scraping started. Use GET /documents/scrape-job/{job_id}/status to check progress."
        }
        
    except Exception as e:
        logger.error(f"Failed to create scrape job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/scrape-job/{job_id}/status", response_model=ScrapeJobStatusResponse)
async def get_scrape_job_status(job_id: str):
    """
    Get scrape job status
    """
    try:
        job_processor = get_document_job_processor()
        job_key = f"scrape_job:{job_id}"
        job_data = job_processor.redis_client.hgetall(job_key)
        
        if not job_data:
            raise HTTPException(status_code=404, detail="Scrape job not found")
        
        # Convert Redis data
        return ScrapeJobStatusResponse(
            job_id=job_data.get("job_id", job_id),
            status=job_data.get("status", "unknown"),
            progress=int(job_data.get("progress", 0)),
            current_step=job_data.get("current_step") or None,
            pages_scraped=int(job_data.get("pages_scraped", 0)),
            pages_processed=int(job_data.get("pages_processed", 0)),
            total_pages=int(job_data.get("total_pages", 0)),
            error_message=job_data.get("error_message") or None,
            created_at=job_data.get("created_at") or None,
            completed_at=job_data.get("completed_at") or None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get scrape job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _process_scrape_job_background(
    job_id: str,
    url: str,
    kb_id: str,
    tenant_id: str,
    max_depth: int,
    max_pages: int,
    metadata: dict
):
    """
    Background task to process scrape job
    """
    job_processor = get_document_job_processor()
    job_key = f"scrape_job:{job_id}"
    
    def update_status(status: str, progress: int = None, current_step: str = None, **kwargs):
        updates = {"status": status}
        if progress is not None:
            updates["progress"] = str(progress)
        if current_step:
            updates["current_step"] = current_step
        for k, v in kwargs.items():
            updates[k] = str(v) if v is not None else ""
        job_processor.redis_client.hset(job_key, mapping=updates)
    
    try:
        update_status("scraping", 10, "Starting web scrape...")
        
        # Scrape website
        scrape_result = await web_scraper.scrape_url(
            url=url,
            max_depth=max_depth,
            max_pages=max_pages
        )
        
        total_pages = scrape_result.get('total_pages', 0)
        update_status("scraping", 30, f"Scraped {total_pages} pages", 
                     pages_scraped=total_pages, total_pages=total_pages)
        
        if total_pages == 0:
            update_status("failed", 100, "No pages could be scraped",
                         error_message="No pages could be scraped from the URL",
                         completed_at=datetime.now().isoformat())
            return
        
        # Process each scraped page
        update_status("processing", 40, "Processing scraped content...")
        processed_count = 0
        
        for i, page in enumerate(scrape_result['pages']):
            document_id = str(uuid.uuid4())
            
            try:
                result = await document_processor.process_text_content(
                    document_id=document_id,
                    kb_id=kb_id,
                    tenant_id=tenant_id,
                    text=page['text'],
                    title=page['title'],
                    source_url=page['url'],
                    metadata={
                        **metadata,
                        **page.get('metadata', {}),
                        'source_type': 'web_scrape',
                        'depth': page.get('depth', 0),
                        'scrape_job_id': job_id
                    }
                )
                processed_count += 1
                
                # Update progress
                progress = 40 + int((i + 1) / total_pages * 50)
                update_status("processing", progress, 
                             f"Processed {processed_count}/{total_pages} pages",
                             pages_processed=processed_count)
                             
            except Exception as e:
                logger.error(f"Error processing page {page['url']}: {e}")
                continue
        
        # Update KB stats
        if processed_count > 0:
            await job_processor._update_kb_stats(kb_id)
        
        # Mark completed
        update_status("completed", 100, 
                     f"Completed: {processed_count} pages processed",
                     pages_processed=processed_count,
                     completed_at=datetime.now().isoformat())
        
        logger.info(f"Scrape job {job_id} completed: {processed_count}/{total_pages} pages")
        
    except Exception as e:
        logger.error(f"Scrape job {job_id} failed: {e}")
        update_status("failed", 100, str(e),
                     error_message=str(e),
                     completed_at=datetime.now().isoformat())