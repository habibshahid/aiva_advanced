"""
Image Routes
API endpoints for image upload, search, and management
"""

import logging
import json
import time
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pathlib import Path

from app.models.requests import ImageSearchRequest, ImageUploadRequest
from app.models.responses import (
    ImageUploadResponse,
    ImageSearchResponse,
    ImageResult
)
from app.services.image_processor import ImageProcessor
from app.services.image_vector_store import ImageVectorStore
from app.services.image_search import ImageSearchService
from app.utils.cost_tracking import CostTracker
import mysql.connector
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)
cost_tracker = CostTracker()


@router.post("/images/upload", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    kb_id: str = Form(...),
    tenant_id: str = Form(...),
    metadata: Optional[str] = Form(None)
):
    """
    Upload and process an image
    """
    try:
        start_time = time.time()
        
        # Parse metadata
        meta = {}
        if metadata:
            try:
                meta = json.loads(metadata)
            except:
                pass
        
        # Read file
        contents = await file.read()
        
        # Initialize processor
        processor = ImageProcessor()
        
        # Process image
        result = await processor.process_image_bytes(contents, metadata=meta)
        
        image_id = result['image_id']
        embedding = result['embedding']
        image_metadata = result['metadata']
        
        # Add KB and tenant info to metadata
        image_metadata['kb_id'] = kb_id
        image_metadata['tenant_id'] = tenant_id
        image_metadata['original_filename'] = file.filename
        
        print(f"{image_metadata}")
        # Generate storage URL (you may need to adjust this based on your setup)
        
        storage_base_path = getattr(settings, 'STORAGE_PATH', '/etc/aiva-oai/storage')
        file_storage_path = Path(storage_base_path) / "images" / kb_id
        file_storage_path.mkdir(parents=True, exist_ok=True)
        
        # Save file to disk
        final_file_path = file_storage_path / f"{image_id}_{file.filename}"
        with open(final_file_path, 'wb') as f:
            f.write(contents)
        
        logger.info(f"Image saved to: {final_file_path}")
        
        # Update storage_url to match the physical path
        storage_url = str(final_file_path)
        
        # Store in database with EXISTING schema
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor()
        
        try:
            # Insert using EXISTING column names
            cursor.execute("""
                INSERT INTO yovo_tbl_aiva_images (
                    id, kb_id, tenant_id, filename, storage_url,
                    image_type, width, height, file_size_bytes,
                    description, metadata, vector_id
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                image_id,
                kb_id,
                tenant_id,
                file.filename,
                storage_url,
                file.content_type or 'image/jpeg',
                image_metadata.get('width'),
                image_metadata.get('height'),
                len(contents),
                meta.get('description'),
                json.dumps(image_metadata),
                f"clip_{image_id}"  # vector_id for reference
            ))
            
            # Store the embedding separately in a vector table or encode in metadata
            # Since we need to store the 512-dim embedding, let's add it to metadata
            embedding_meta = {
                **image_metadata,
                'embedding': embedding,
                'embedding_model': 'openai/clip-vit-base-patch32',
                'embedding_dimension': len(embedding)
            }
            
            # Update metadata with embedding
            cursor.execute("""
                UPDATE yovo_tbl_aiva_images 
                SET metadata = %s 
                WHERE id = %s
            """, (json.dumps(embedding_meta), image_id))
            
            conn.commit()
            
        finally:
            cursor.close()
            conn.close()
        
        # Add to vector store
        vector_store = ImageVectorStore(kb_id)
        await vector_store.add_image(image_id, embedding, image_metadata)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Calculate cost
        cost = cost_tracker.calculate_image_processing_cost(
            image_count=1,
            processing_time_ms=processing_time
        )
        
        return ImageUploadResponse(
            image_id=image_id,
            filename=file.filename,
            kb_id=kb_id,
            status="completed",
            processing_time_ms=processing_time,
            embedding_dimension=result['dimension'],
            cost=cost
        )
        
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        

@router.post("/images/search", response_model=ImageSearchResponse)
async def search_images(request: ImageSearchRequest):
    """
    Search images by text query or image
    """
    try:
        start_time = time.time()
        
        # Initialize search service
        search_service = ImageSearchService(request.kb_id)
        
        # Perform search based on type
        if request.search_type == "text":
            results = await search_service.search_by_text(
                query_text=request.query,
                k=request.top_k,
                filters=request.filters
            )
        elif request.search_type == "image":
            if not request.image_base64:
                raise HTTPException(status_code=400, detail="Image data required for image search")
            
            # Decode base64 image
            import base64
            image_bytes = base64.b64decode(request.image_base64)
            
            results = await search_service.search_by_image_bytes(
                image_bytes=image_bytes,
                k=request.top_k,
                filters=request.filters
            )
        elif request.search_type == "hybrid":
            if not request.image_base64:
                raise HTTPException(status_code=400, detail="Image data required for hybrid search")
            
            # Save temporary image file
            import tempfile
            import base64
            image_bytes = base64.b64decode(request.image_base64)
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tmp_file:
                tmp_file.write(image_bytes)
                tmp_path = Path(tmp_file.name)
            
            try:
                results = await search_service.hybrid_search(
                    query_text=request.query,
                    image_path=tmp_path,
                    k=request.top_k,
                    text_weight=request.text_weight or 0.5,
                    filters=request.filters
                )
            finally:
                tmp_path.unlink()  # Clean up temp file
        else:
            raise HTTPException(status_code=400, detail=f"Invalid search_type: {request.search_type}")
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Calculate cost
        cost = cost_tracker.calculate_search_cost(
            query_tokens=len(request.query.split()) if request.query else 0,
            search_type="image"
        )
        
        # Format results
        image_results = []
        for result in results:
            meta = result.get('metadata', {})
            image_results.append(ImageResult(
                result_id=result['result_id'],
                type="image",
                image_id=result['result_id'],
                filename=meta.get('original_filename', meta.get('filename', 'unknown')),
                score=result['score'],
                similarity=result.get('similarity', result['score']),
                metadata=meta,
                search_type=result.get('search_type', request.search_type),
                image_url=result.get('image_url'),
                thumbnail_url=result.get('thumbnail_url'),
                description=result.get('description'),
                source=result.get('source')
            ))
        
        from app.models.responses import SearchMetrics
        
        return ImageSearchResponse(
            total_found=len(results),
            returned=len(image_results),
            results=image_results,
            metrics=SearchMetrics(
                query_tokens=len(request.query.split()) if request.query else 0,
                embedding_model="openai/clip-vit-base-patch32",
                processing_time_ms=processing_time,
                chunks_searched=0
            ),
            cost=cost
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching images: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/images/{kb_id}/stats")
async def get_image_stats(kb_id: str):
    """
    Get statistics for images in a knowledge base
    """
    try:
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Use EXISTING column names
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_images,
                    SUM(file_size_bytes) as total_size_bytes,
                    AVG(file_size_bytes) as avg_size_bytes
                FROM yovo_tbl_aiva_images
                WHERE kb_id = %s
            """, (kb_id,))
            
            stats = cursor.fetchone()
            
            # Get vector store stats
            vector_store = ImageVectorStore(kb_id)
            vector_stats = vector_store.get_stats()
            
            return {
                "kb_id": kb_id,
                "total_images": stats['total_images'] or 0,
                "total_size_mb": round((stats['total_size_bytes'] or 0) / (1024 * 1024), 2),
                "avg_size_kb": round((stats['avg_size_bytes'] or 0) / 1024, 2),
                "vector_store": vector_stats
            }
            
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        logger.error(f"Error getting image stats: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/images/{image_id}")
async def delete_image(image_id: str, kb_id: str = Query(...)):
    """
    Delete an image
    """
    try:
        # Delete from database
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor()
        
        try:
            # Delete the record (no status field, just delete)
            cursor.execute("""
                DELETE FROM yovo_tbl_aiva_images
                WHERE id = %s AND kb_id = %s
            """, (image_id, kb_id))
            
            conn.commit()
            
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Image not found")
            
        finally:
            cursor.close()
            conn.close()
        
        # Delete from vector store
        vector_store = ImageVectorStore(kb_id)
        await vector_store.delete_image(image_id)
        
        return {
            "success": True,
            "message": "Image deleted successfully",
            "image_id": image_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting image: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        

@router.get("/images/{kb_id}/list")
async def list_images(
    kb_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    List images in a knowledge base
    """
    try:
        offset = (page - 1) * limit
        
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Get images using EXISTING column names
            cursor.execute("""
                SELECT id, filename, image_type, file_size_bytes, width, height,
                       storage_url, thumbnail_url, description,
                       metadata, created_at
                FROM yovo_tbl_aiva_images
                WHERE kb_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, (kb_id, limit, offset))
            
            images = cursor.fetchall()
            
            # Get total count
            cursor.execute("""
                SELECT COUNT(*) as total
                FROM yovo_tbl_aiva_images
                WHERE kb_id = %s
            """, (kb_id,))
            
            total = cursor.fetchone()['total']
            storage_base_path_prefix = getattr(settings, 'STORAGE_PATH_PREFIX', '/aiva')

            # Parse metadata and convert URLs
            for img in images:
                if img['metadata']:
                    try:
                        img['metadata'] = json.loads(img['metadata'])
                    except:
                        img['metadata'] = {}
                # Map to frontend expected format
                img['content_type'] = img.pop('image_type', 'image/jpeg')
                
                # Convert storage_url to API URL
                img['url'] = f"/aiva/api/knowledge/{kb_id}/images/{img['id']}/view"
                img['thumbnail_url'] = img['url']
                
                # Remove storage_url (don't expose server paths)
                if 'storage_url' in img:
                    del img['storage_url']
            
            return {
                "kb_id": kb_id,
                "images": images,
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": (total + limit - 1) // limit
            }
            
        finally:
            cursor.close()
            conn.close()
            
    except Exception as e:
        logger.error(f"Error listing images: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        
    
@router.get("/images/{image_id}/file")
async def get_image_file(
    image_id: str,
    kb_id: str = Query(..., description="Knowledge base ID")
):
    """
    Get image file for viewing/download
    """
    try:
        import mysql.connector
        from fastapi.responses import Response
        
        from app.config import settings
        
        # Get image from database
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("""
            SELECT 
                storage_url, 
                image_type,
                file_size_bytes
            FROM yovo_tbl_aiva_images
            WHERE id = %s AND kb_id = %s
        """, (image_id, kb_id))
        
        image = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not image:
            raise HTTPException(status_code=404, detail="Image not found")
        
        # Read image file
        import os
        storage_path = image['storage_url']
        
        if not os.path.exists(storage_path):
            raise HTTPException(status_code=404, detail="Image file not found on disk")
        
        with open(storage_path, 'rb') as f:
            image_data = f.read()
        
        # Determine content type from image_type or default
        content_type = 'image/png'
        if image['image_type']:
            type_lower = image['image_type'].lower()
            if type_lower in ['jpg', 'jpeg']:
                content_type = 'image/jpeg'
            elif type_lower == 'png':
                content_type = 'image/png'
            elif type_lower == 'gif':
                content_type = 'image/gif'
            elif type_lower == 'webp':
                content_type = 'image/webp'
        
        # Return image
        return Response(
            content=image_data,
            media_type=content_type,
            headers={
                'Content-Length': str(len(image_data)),
                'Cache-Control': 'public, max-age=86400'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting image file: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        

@router.get("/images/queue/stats")
async def get_queue_stats():
    """
    Get image processing queue statistics
    """
    try:
        queue = get_image_queue()
        stats = queue.get_stats()
        
        return {
            "success": True,
            "stats": stats,
            "recommendations": _get_recommendations(stats)
        }
        
    except Exception as e:
        logger.error(f"Error getting queue stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _get_recommendations(stats: dict) -> dict:
    """Generate recommendations based on stats"""
    recommendations = {
        "concurrency": "optimal",
        "message": "Queue is performing well"
    }
    
    # High wait times
    if stats['avg_wait_time_ms'] > 5000:
        recommendations['concurrency'] = "increase"
        recommendations['message'] = "Consider increasing IMAGE_PROCESSING_CONCURRENCY if you have more RAM"
    
    # Low throughput
    if stats['throughput_per_minute'] < 5 and stats['total_processed'] > 10:
        recommendations['concurrency'] = "check_resources"
        recommendations['message'] = "Low throughput detected. Check server resources (RAM/CPU)"
    
    # Very high concurrency usage
    if stats['peak_concurrent'] == stats['max_concurrent'] and stats['avg_wait_time_ms'] > 2000:
        recommendations['concurrency'] = "bottleneck"
        recommendations['message'] = "Queue is bottlenecked. Add more RAM to increase concurrency"
    
    return recommendations


@router.post("/images/queue/concurrency")
async def update_queue_concurrency(max_concurrent: int = 1):
    """
    Update queue concurrency (requires restart to take full effect)
    """
    try:
        from app.services.image_queue import set_queue_concurrency
        
        if max_concurrent < 1 or max_concurrent > 10:
            raise HTTPException(
                status_code=400, 
                detail="max_concurrent must be between 1 and 10"
            )
        
        set_queue_concurrency(max_concurrent)
        
        return {
            "success": True,
            "message": f"Queue concurrency set to {max_concurrent}",
            "note": "Restart service for full effect"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating concurrency: {e}")
        raise HTTPException(status_code=500, detail=str(e))


