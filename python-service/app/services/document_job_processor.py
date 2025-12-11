"""
Document Job Processor - Background Processing Service
Handles async document processing with status tracking

LOCATION: python-service/app/services/document_job_processor.py
"""

import asyncio
import logging
import json
import time
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path
import redis
import mysql.connector
import uuid

from app.config import settings

logger = logging.getLogger(__name__)


class DocumentJobProcessor:
    """
    Background processor for document jobs.
    Handles chunking, embedding generation, and vector storage asynchronously.
    """
    
    # Job statuses
    STATUS_QUEUED = "queued"
    STATUS_PROCESSING = "processing"
    STATUS_CHUNKING = "chunking"
    STATUS_EMBEDDING = "embedding"
    STATUS_STORING = "storing"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    
    def __init__(self):
        self.redis_client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD or None,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        self.job_prefix = "doc_job:"
        self.temp_storage_path = Path(getattr(settings, 'STORAGE_PATH', '/etc/aiva-oai/storage')) / "temp_documents"
        self.temp_storage_path.mkdir(parents=True, exist_ok=True)
        
        logger.info(f"DocumentJobProcessor initialized. Temp storage: {self.temp_storage_path}")
    
    def _get_mysql_connection(self):
        """Get MySQL connection"""
        return mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
    
    def _get_job_key(self, document_id: str) -> str:
        """Get Redis key for job"""
        return f"{self.job_prefix}{document_id}"
    
    async def create_job(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        filename: str,
        file_size: int,
        content_type: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Create a new processing job and store file temporarily.
        Returns immediately with job info.
        """
        job_data = {
            "document_id": document_id,
            "kb_id": kb_id,
            "tenant_id": tenant_id,
            "filename": filename,
            "file_size": file_size,
            "content_type": content_type,
            "metadata": json.dumps(metadata or {}),
            "status": self.STATUS_QUEUED,
            "progress": 0,
            "current_step": "Queued for processing",
            "total_chunks": 0,
            "processed_chunks": 0,
            "error_message": "",
            "created_at": datetime.now().isoformat(),
            "started_at": "",
            "completed_at": ""
        }
        
        # Store job in Redis (TTL: 24 hours)
        job_key = self._get_job_key(document_id)
        self.redis_client.hset(job_key, mapping=job_data)
        self.redis_client.expire(job_key, 86400)  # 24 hours
        
        logger.info(f"Created job for document {document_id}")
        return job_data
    
    async def get_job_status(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get current job status"""
        job_key = self._get_job_key(document_id)
        job_data = self.redis_client.hgetall(job_key)
        
        if not job_data:
            # Try to get from MySQL if not in Redis
            return await self._get_status_from_db(document_id)
        
        # Parse JSON fields
        if job_data.get("metadata"):
            try:
                job_data["metadata"] = json.loads(job_data["metadata"])
            except:
                pass
        
        # Convert string numbers to int
        for field in ["progress", "total_chunks", "processed_chunks", "file_size"]:
            if field in job_data and job_data[field]:
                try:
                    job_data[field] = int(job_data[field])
                except:
                    pass
        
        return job_data
    
    async def _get_status_from_db(self, document_id: str) -> Optional[Dict[str, Any]]:
        """Get document status from MySQL"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute(
                """SELECT id, kb_id, status, processing_stats, error_message, created_at, updated_at 
                   FROM yovo_tbl_aiva_documents WHERE id = %s""",
                (document_id,)
            )
            doc = cursor.fetchone()
            
            if not doc:
                return None
            
            # Parse processing_stats if available
            processing_stats = {}
            if doc.get("processing_stats"):
                try:
                    processing_stats = json.loads(doc["processing_stats"]) if isinstance(doc["processing_stats"], str) else doc["processing_stats"]
                except:
                    pass
            
            return {
                "document_id": doc["id"],
                "kb_id": doc["kb_id"],
                "status": doc["status"],
                "progress": 100 if doc["status"] == "completed" else 0,
                "current_step": "Completed" if doc["status"] == "completed" else doc["status"],
                "total_chunks": processing_stats.get("total_chunks", 0),
                "processed_chunks": processing_stats.get("total_chunks", 0),
                "error_message": doc.get("error_message"),
                "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
                "completed_at": doc["updated_at"].isoformat() if doc.get("updated_at") else None
            }
        finally:
            cursor.close()
            conn.close()
    
    async def update_job_status(
        self,
        document_id: str,
        status: str,
        progress: int = None,
        current_step: str = None,
        total_chunks: int = None,
        processed_chunks: int = None,
        error_message: str = None
    ):
        """Update job status in Redis"""
        job_key = self._get_job_key(document_id)
        
        updates = {"status": status}
        
        if progress is not None:
            updates["progress"] = progress
        if current_step is not None:
            updates["current_step"] = current_step
        if total_chunks is not None:
            updates["total_chunks"] = total_chunks
        if processed_chunks is not None:
            updates["processed_chunks"] = processed_chunks
        if error_message is not None:
            updates["error_message"] = error_message
        
        if status == self.STATUS_PROCESSING and not self.redis_client.hget(job_key, "started_at"):
            updates["started_at"] = datetime.now().isoformat()
        
        if status in [self.STATUS_COMPLETED, self.STATUS_FAILED]:
            updates["completed_at"] = datetime.now().isoformat()
        
        self.redis_client.hset(job_key, mapping=updates)
        logger.debug(f"Updated job {document_id}: {updates}")
    
    def save_temp_file(self, document_id: str, file_content: bytes, filename: str) -> str:
        """Save file to temporary storage, return path"""
        # Create subdirectory for this document
        doc_dir = self.temp_storage_path / document_id
        doc_dir.mkdir(parents=True, exist_ok=True)
        
        file_path = doc_dir / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        logger.info(f"Saved temp file: {file_path} ({len(file_content)} bytes)")
        return str(file_path)
    
    def get_temp_file(self, document_id: str, filename: str) -> Optional[bytes]:
        """Read file from temporary storage"""
        file_path = self.temp_storage_path / document_id / filename
        
        if not file_path.exists():
            logger.error(f"Temp file not found: {file_path}")
            return None
        
        with open(file_path, 'rb') as f:
            return f.read()
    
    def cleanup_temp_file(self, document_id: str):
        """Remove temporary files for a document"""
        doc_dir = self.temp_storage_path / document_id
        
        if doc_dir.exists():
            import shutil
            shutil.rmtree(doc_dir)
            logger.info(f"Cleaned up temp files for {document_id}")
    
    async def process_document_background(
        self,
        document_id: str,
        kb_id: str,
        tenant_id: str,
        file_content: bytes,
        filename: str,
        content_type: str,
        metadata: Dict[str, Any] = None
    ):
        """
        Main background processing function.
        This runs in a background task after the API returns.
        """
        from app.services.document_processor import DocumentProcessor
        from app.services.text_processor import TextProcessor
        from app.services.embeddings import EmbeddingService
        from app.services.vector_store import VectorStore
        
        start_time = time.time()
        
        try:
            # Update status to processing
            await self.update_job_status(
                document_id,
                self.STATUS_PROCESSING,
                progress=5,
                current_step="Starting document processing..."
            )
            
            # Initialize services
            doc_processor = DocumentProcessor()
            text_processor = TextProcessor()
            embedding_service = EmbeddingService()
            vector_store = VectorStore()
            
            # Step 1: Extract content (5-20%)
            await self.update_job_status(
                document_id,
                self.STATUS_PROCESSING,
                progress=10,
                current_step="Extracting document content..."
            )
            
            extraction_result = await doc_processor._extract_content(
                file_content,
                filename,
                content_type,
                document_id=document_id,
                kb_id=kb_id,
                tenant_id=tenant_id
            )
            
            table_chunks = extraction_result.get("table_chunks", [])
            table_processing_stats = extraction_result.get("table_processing_stats", {})

            if table_chunks:
                logger.info(f"Document {document_id}: Found {len(table_chunks)} table row chunks")

            # Update job status to show table processing progress
            if table_processing_stats:
                await self.update_job_status(
                    document_id,
                    self.STATUS_PROCESSING,
                    progress=20,
                    current_step=f"Processed {table_processing_stats.get('tables_processed', 0)} tables"
                )
                
            await self.update_job_status(
                document_id,
                self.STATUS_PROCESSING,
                progress=20,
                current_step=f"Extracted {extraction_result.get('pages', 1)} pages"
            )
            
            # Step 2: Process text and create chunks (20-40%)
            await self.update_job_status(
                document_id,
                self.STATUS_CHUNKING,
                progress=25,
                current_step="Creating document chunks..."
            )
            
            processed = await text_processor.process_text(
                text=extraction_result["text"],
                document_id=document_id,
                kb_id=kb_id,
                metadata={
                    **(metadata or {}),
                    "filename": filename,
                    "content_type": content_type,
                    "pages": extraction_result.get("pages", 0),
                    "extracted_images": extraction_result.get("images", 0)
                },
                preserve_formatting=True
            )
            
            table_chunks = extraction_result.get("table_chunks", [])
            if table_chunks:
                logger.info(f"Adding {len(table_chunks)} table row chunks")
                
                # Get the current chunk count to continue indexing
                current_chunk_count = len(processed["chunks"])
                
                for idx, chunk in enumerate(table_chunks):
                    chunk_id = str(uuid.uuid4())
                    processed["chunks"].append({
                        "chunk_id": chunk_id,
                        "chunk_index": current_chunk_count + idx,  # ADD THIS LINE
                        "content": chunk["content"],
                        "type": "table",
                        "metadata": {
                            **chunk.get("metadata", {}),
                            "document_id": document_id,
                            "kb_id": kb_id
                        }
                    })
                    
            total_chunks = len(processed["chunks"])
            
            await self.update_job_status(
                document_id,
                self.STATUS_CHUNKING,
                progress=40,
                current_step=f"Created {total_chunks} chunks",
                total_chunks=total_chunks
            )
            
            logger.info(f"Document {document_id}: Created {total_chunks} chunks")
            
            # Step 3: Generate embeddings in batches (40-80%)
            await self.update_job_status(
                document_id,
                self.STATUS_EMBEDDING,
                progress=45,
                current_step="Generating embeddings..."
            )
            
            # Use batch embedding for efficiency
            embeddings_result = await self._generate_embeddings_batched(
                embedding_service,
                processed["chunks"],
                document_id,
                batch_size=100  # Process 100 chunks per API call
            )
            
            await self.update_job_status(
                document_id,
                self.STATUS_EMBEDDING,
                progress=80,
                current_step=f"Generated {len(embeddings_result['embeddings'])} embeddings",
                processed_chunks=len(embeddings_result['embeddings'])
            )
            
            # Step 4: Store in vector store (80-95%)
            await self.update_job_status(
                document_id,
                self.STATUS_STORING,
                progress=85,
                current_step="Storing vectors..."
            )
            
            await vector_store.store_document(
                document_id=document_id,
                kb_id=kb_id,
                tenant_id=tenant_id,
                chunks=processed["chunks"],
                embeddings=embeddings_result["embeddings"]
            )
            
            # Step 5: Update database and finalize (95-100%)
            processing_time = int((time.time() - start_time) * 1000)
            
            processing_stats = {
                "total_pages": extraction_result.get("pages", 0),
                "total_chunks": total_chunks,
                "extracted_images": extraction_result.get("images", 0),
                "detected_tables": extraction_result.get("tables", 0),  # Already exists but now has real count
                "table_chunks_added": len(extraction_result.get("table_chunks", [])),  # NEW
                "table_processing_cost": extraction_result.get("table_processing_stats", {}).get("estimated_cost_usd", 0),  # NEW               
                "total_tokens": embeddings_result.get("total_tokens", 0),
                "processing_time_ms": processing_time,
                "chunks_by_type": processed.get("chunks_by_type", {}),
                "languages": processed.get("languages", []),
                "embedding_model": embedding_service.model
            }
            
            # Update document in MySQL
            await self._update_document_completed(document_id, processing_stats)
            try:
                import aiohttp
                async with aiohttp.ClientSession() as session:
                    node_api_url = os.getenv('NODE_API_URL', 'http://localhost:62001')
                    node_api_key = settings.PYTHON_API_KEY
                    
                    await session.post(
                        f"{node_api_url}/api/knowledge/document-complete",
                        json={
                            "document_id": document_id,
                            "kb_id": kb_id,
                            "tenant_id": tenant_id
                        },
                        headers={"X-Internal-Key": node_api_key}
                    )
                    logger.info(f"Notified Node.js of document completion: {document_id}")
            except Exception as notify_error:
                logger.warning(f"Could not notify Node.js of completion: {notify_error}")
                
            await self._update_kb_stats(kb_id)
            
            # Update job status
            await self.update_job_status(
                document_id,
                self.STATUS_COMPLETED,
                progress=100,
                current_step="Processing completed",
                processed_chunks=total_chunks
            )
            
            # Cleanup temp files
            self.cleanup_temp_file(document_id)
            
            logger.info(f"Document {document_id} processed successfully in {processing_time}ms")
            
        except Exception as e:
            logger.error(f"Document processing failed for {document_id}: {e}", exc_info=True)
            
            # Update job status to failed
            await self.update_job_status(
                document_id,
                self.STATUS_FAILED,
                current_step="Processing failed",
                error_message=str(e)
            )
            
            # Update document in MySQL
            await self._update_document_failed(document_id, str(e))
            
            # Cleanup temp files
            self.cleanup_temp_file(document_id)
    
    async def _generate_embeddings_batched(
        self,
        embedding_service,
        chunks: List[Dict[str, Any]],
        document_id: str,
        batch_size: int = 100
    ) -> Dict[str, Any]:
        """
        Generate embeddings in batches for efficiency.
        OpenAI allows up to 2048 texts per request.
        
        Note: embedding_service.generate_batch_embeddings() returns List[List[float]]
        """
        all_embeddings = []
        total_tokens = 0
        
        total_chunks = len(chunks)
        
        for i in range(0, total_chunks, batch_size):
            batch = chunks[i:i + batch_size]
            batch_texts = [chunk["content"] for chunk in batch]
            
            # Generate batch embeddings
            try:
                # generate_batch_embeddings returns List[List[float]] - just the raw embeddings
                batch_embedding_vectors = await embedding_service.generate_batch_embeddings(batch_texts)
                
                # Map embeddings to chunks
                for j, (chunk, embedding_vector) in enumerate(zip(batch, batch_embedding_vectors)):
                    # Count tokens for this chunk
                    chunk_tokens = embedding_service.count_tokens(chunk["content"])
                    
                    all_embeddings.append({
                        "chunk_id": chunk["chunk_id"],
                        "embedding": embedding_vector,
                        "tokens": chunk_tokens
                    })
                    total_tokens += chunk_tokens
                
                # Update progress
                processed_so_far = i + len(batch)
                progress = 45 + int((processed_so_far / total_chunks) * 35)  # 45-80%
                await self.update_job_status(
                    document_id,
                    self.STATUS_EMBEDDING,
                    progress=progress,
                    current_step=f"Generating embeddings... ({processed_so_far}/{total_chunks})",
                    processed_chunks=processed_so_far
                )
                
                logger.debug(f"Processed batch {i // batch_size + 1}: {len(batch)} chunks")
                
            except Exception as e:
                logger.error(f"Batch embedding failed at index {i}: {e}")
                # Fall back to individual processing for this batch
                for chunk in batch:
                    try:
                        result = await embedding_service.generate_embedding(chunk["content"])
                        all_embeddings.append({
                            "chunk_id": chunk["chunk_id"],
                            "embedding": result["embedding"],
                            "tokens": result["tokens"]
                        })
                        total_tokens += result["tokens"]
                    except Exception as chunk_error:
                        logger.error(f"Failed to generate embedding for chunk {chunk['chunk_id']}: {chunk_error}")
        
        return {
            "embeddings": all_embeddings,
            "total_embeddings": len(all_embeddings),
            "total_tokens": total_tokens,
            "model": embedding_service.model,
            "dimension": embedding_service.dimension
        }
    
    async def _update_document_completed(self, document_id: str, processing_stats: Dict[str, Any]):
        """Update document status to completed in MySQL"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """UPDATE yovo_tbl_aiva_documents 
                   SET status = 'completed', 
                       processing_stats = %s,
                       updated_at = NOW()
                   WHERE id = %s""",
                (json.dumps(processing_stats), document_id)
            )
            conn.commit()
            logger.info(f"Document {document_id} marked as completed in database")
        except Exception as e:
            logger.error(f"Failed to update document status: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()
    
    async def _update_document_failed(self, document_id: str, error_message: str):
        """Update document status to failed in MySQL"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                """UPDATE yovo_tbl_aiva_documents 
                   SET status = 'failed', 
                       error_message = %s,
                       updated_at = NOW()
                   WHERE id = %s""",
                (error_message[:1000], document_id)  # Truncate error message
            )
            conn.commit()
            logger.info(f"Document {document_id} marked as failed in database")
        except Exception as e:
            logger.error(f"Failed to update document status: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()

    # Add this new method to the DocumentJobProcessor class

    async def _update_kb_stats(self, kb_id: str):
        """Update KB statistics after document processing"""
        conn = self._get_mysql_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Count completed documents
            cursor.execute(
                """SELECT COUNT(*) as count FROM yovo_tbl_aiva_documents 
                   WHERE kb_id = %s AND status = 'completed'""",
                (kb_id,)
            )
            doc_count = cursor.fetchone()['count']
            
            # Count chunks
            cursor.execute(
                """SELECT COUNT(*) as count FROM yovo_tbl_aiva_document_chunks 
                   WHERE kb_id = %s""",
                (kb_id,)
            )
            chunk_count = cursor.fetchone()['count']
            
            # Count images
            cursor.execute(
                """SELECT COUNT(*) as count FROM yovo_tbl_aiva_images 
                   WHERE kb_id = %s""",
                (kb_id,)
            )
            image_count = cursor.fetchone()['count']
            
            # Count products
            cursor.execute(
                """SELECT COUNT(*) as count FROM yovo_tbl_aiva_products 
                   WHERE kb_id = %s AND status = 'active'""",
                (kb_id,)
            )
            product_count = cursor.fetchone()['count']
            
            # Calculate total size
            cursor.execute(
                """SELECT COALESCE(SUM(file_size_bytes), 0) as total_bytes 
                   FROM yovo_tbl_aiva_documents WHERE kb_id = %s""",
                (kb_id,)
            )
            
            total_size = cursor.fetchone()['total_bytes']
            total_size_mb = round(float(total_size) / (1024 * 1024), 2) if total_size else 0.0
            
            # Build stats JSON
            stats = json.dumps({
                "document_count": int(doc_count),
                "chunk_count": int(chunk_count),
                "image_count": int(image_count),
                "product_count": int(product_count),
                "total_size_mb": float(total_size_mb)
            })
            
            # Count all documents (not just completed) for metadata
            cursor.execute(
                """SELECT COUNT(*) as count FROM yovo_tbl_aiva_documents 
                   WHERE kb_id = %s AND status != 'deleted'""",
                (kb_id,)
            )
            total_doc_count = cursor.fetchone()['count']
            
            # Update KB stats and metadata
            cursor.execute(
                """UPDATE yovo_tbl_aiva_knowledge_bases 
                   SET stats = %s,
                       has_documents = %s,
                       has_products = %s,
                       document_count = %s,
                       product_count = %s,
                       content_updated_at = NOW()
                   WHERE id = %s""",
                (
                    stats,
                    total_doc_count > 0,
                    product_count > 0,
                    total_doc_count,
                    product_count,
                    kb_id
                )
            )
            conn.commit()
            logger.info(f"Updated KB stats for {kb_id}: docs={doc_count}, chunks={chunk_count}")
            
        except Exception as e:
            logger.error(f"Failed to update KB stats for {kb_id}: {e}")
            conn.rollback()
        finally:
            cursor.close()
            conn.close()

# Singleton instance
_job_processor: Optional[DocumentJobProcessor] = None


def get_document_job_processor() -> DocumentJobProcessor:
    """Get or create the document job processor singleton"""
    global _job_processor
    if _job_processor is None:
        _job_processor = DocumentJobProcessor()
    return _job_processor
