"""
Document management routes
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

from app.models.requests import DocumentUploadRequest
from app.models.responses import DocumentUploadResponse, ErrorResponse
from app.services.document_processor import DocumentProcessor
from app.utils.cost_tracking import CostTracker
from app.services.web_scraper import WebScraper

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
    
@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    kb_id: str = Form(...),
    tenant_id: str = Form(...),
    metadata: Optional[str] = Form("{}")
):
    """
    Upload and process a document
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
        
        # Generate document ID
        document_id = str(uuid.uuid4())
        
        # Process document
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


@router.get("/documents/{document_id}/status")
async def get_document_status(document_id: str):
    """
    Get document processing status
    """
    try:
        status = await document_processor.get_document_status(document_id)
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """
    Delete document and all associated data
    """
    try:
        await document_processor.delete_document(document_id)
        return {"message": "Document deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/{document_id}/reprocess")
async def reprocess_document(document_id: str):
    """
    Reprocess an existing document
    """
    try:
        result = await document_processor.reprocess_document(document_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        
        return {
            'total_pages_scraped': scrape_result['total_pages'],
            'documents_processed': len(processed_documents),
            'documents': processed_documents,
            'base_url': request.url
        }
        
    except Exception as e:
        logger.error(f"Scrape URL error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/scrape-sitemap")
async def scrape_sitemap(request: ScrapeSitemapRequest):
    """
    Scrape URLs from sitemap.xml
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