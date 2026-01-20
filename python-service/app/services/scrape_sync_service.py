"""
Scrape Sync Service
Handles automatic synchronization of web scraped content
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import uuid

import mysql.connector
from app.config import settings
from app.services.web_scraper import WebScraper
from app.services.document_processor import DocumentProcessor
from app.services.vector_store import VectorStore

logger = logging.getLogger(__name__)


class ScrapeSyncService:
    """Service for auto-syncing web scraped content"""
    
    def __init__(self):
        self.web_scraper = WebScraper()
        self.document_processor = DocumentProcessor()
        self.vector_store = VectorStore()
        self._running = False
        self._sync_task = None
    
    def _get_db_connection(self):
        """Get database connection"""
        return mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
    
    @staticmethod
    def compute_content_hash(text: str) -> str:
        """Compute SHA-256 hash of content"""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    async def create_scrape_source(
        self,
        kb_id: str,
        tenant_id: str,
        url: str,
        scrape_type: str = 'single_url',
        max_depth: int = 2,
        max_pages: int = 20,
        auto_sync_enabled: bool = False,
        sync_interval_hours: int = 24,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Create a new scrape source for tracking"""
        source_id = str(uuid.uuid4())
        
        conn = self._get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            next_sync = None
            if auto_sync_enabled:
                next_sync = datetime.now() + timedelta(hours=sync_interval_hours)
            
            cursor.execute("""
                INSERT INTO yovo_tbl_aiva_scrape_sources
                (id, kb_id, tenant_id, url, scrape_type, max_depth, max_pages,
                 auto_sync_enabled, sync_interval_hours, next_sync_at, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                source_id, kb_id, tenant_id, url, scrape_type,
                max_depth, max_pages, auto_sync_enabled,
                sync_interval_hours, next_sync,
                json.dumps(metadata) if metadata else None
            ))
            
            conn.commit()
            
            return {
                'id': source_id,
                'kb_id': kb_id,
                'url': url,
                'auto_sync_enabled': auto_sync_enabled,
                'sync_interval_hours': sync_interval_hours,
                'next_sync_at': next_sync.isoformat() if next_sync else None
            }
            
        finally:
            cursor.close()
            conn.close()
    
    async def check_for_changes(self, source_id: str) -> Dict[str, Any]:
        """Check if scraped content has changed"""
        conn = self._get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Get source info
            cursor.execute("""
                SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE id = %s
            """, (source_id,))
            source = cursor.fetchone()
            
            if not source:
                raise ValueError(f"Scrape source not found: {source_id}")
            
            # Get existing documents for this source
            cursor.execute("""
                SELECT id, storage_url, content_hash 
                FROM yovo_tbl_aiva_documents 
                WHERE scrape_source_id = %s
            """, (source_id,))
            existing_docs = {row['storage_url']: row for row in cursor.fetchall()}
            
            # Scrape the URL(s) again
            if source['scrape_type'] == 'sitemap':
                urls = await self.web_scraper.scrape_sitemap(source['url'])
                urls = urls[:source['max_pages']]
            else:
                scrape_result = await self.web_scraper.scrape_url(
                    url=source['url'],
                    max_depth=source['max_depth'],
                    max_pages=source['max_pages']
                )
                urls = [page['url'] for page in scrape_result.get('pages', [])]
            
            changes = {
                'new_pages': [],
                'changed_pages': [],
                'removed_pages': [],
                'unchanged_pages': []
            }
            
            current_urls = set()
            
            # Check each scraped page
            for page in scrape_result.get('pages', []):
                page_url = page['url']
                current_urls.add(page_url)
                new_hash = self.compute_content_hash(page['text'])
                
                if page_url in existing_docs:
                    existing = existing_docs[page_url]
                    if existing['content_hash'] != new_hash:
                        changes['changed_pages'].append({
                            'url': page_url,
                            'document_id': existing['id'],
                            'old_hash': existing['content_hash'],
                            'new_hash': new_hash,
                            'page_data': page
                        })
                    else:
                        changes['unchanged_pages'].append(page_url)
                else:
                    changes['new_pages'].append({
                        'url': page_url,
                        'hash': new_hash,
                        'page_data': page
                    })
            
            # Find removed pages
            for url, doc in existing_docs.items():
                if url not in current_urls:
                    changes['removed_pages'].append({
                        'url': url,
                        'document_id': doc['id']
                    })
            
            return {
                'source_id': source_id,
                'has_changes': bool(changes['new_pages'] or changes['changed_pages'] or changes['removed_pages']),
                'changes': changes,
                'summary': {
                    'new': len(changes['new_pages']),
                    'changed': len(changes['changed_pages']),
                    'removed': len(changes['removed_pages']),
                    'unchanged': len(changes['unchanged_pages'])
                }
            }
            
        finally:
            cursor.close()
            conn.close()
    
    async def sync_source(self, source_id: str, force: bool = False) -> Dict[str, Any]:
        """Sync a scrape source - update changed content"""
        conn = self._get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            # Update status to syncing
            cursor.execute("""
                UPDATE yovo_tbl_aiva_scrape_sources 
                SET sync_status = 'syncing', last_sync_at = NOW()
                WHERE id = %s
            """, (source_id,))
            conn.commit()
            
            # Check for changes
            change_result = await self.check_for_changes(source_id)
            
            if not change_result['has_changes'] and not force:
                cursor.execute("""
                    UPDATE yovo_tbl_aiva_scrape_sources 
                    SET sync_status = 'idle',
                        next_sync_at = DATE_ADD(NOW(), INTERVAL sync_interval_hours HOUR)
                    WHERE id = %s
                """, (source_id,))
                conn.commit()
                return {'status': 'no_changes', 'details': change_result}
            
            # Get source details
            cursor.execute("SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE id = %s", (source_id,))
            source = cursor.fetchone()
            
            processed = {'added': 0, 'updated': 0, 'removed': 0}
            
            # Process new pages
            for page_info in change_result['changes']['new_pages']:
                try:
                    document_id = str(uuid.uuid4())
                    page = page_info['page_data']
                    
                    await self.document_processor.process_text_content(
                        document_id=document_id,
                        kb_id=source['kb_id'],
                        tenant_id=source['tenant_id'],
                        text=page['text'],
                        title=page['title'],
                        source_url=page['url'],
                        metadata={
                            'source_type': 'web_scrape',
                            'scrape_source_id': source_id,
                            'depth': page.get('depth', 0)
                        }
                    )
                    
                    # Update document with hash and source link
                    cursor.execute("""
                        UPDATE yovo_tbl_aiva_documents
                        SET content_hash = %s, scrape_source_id = %s, sync_status = 'synced'
                        WHERE id = %s
                    """, (page_info['hash'], source_id, document_id))
                    
                    processed['added'] += 1
                    
                except Exception as e:
                    logger.error(f"Error processing new page {page_info['url']}: {e}")
            
            # Process changed pages
            for page_info in change_result['changes']['changed_pages']:
                try:
                    document_id = page_info['document_id']
                    page = page_info['page_data']
                    
                    # Delete old chunks and vectors
                    await self.vector_store.delete_document_vectors(document_id)
                    
                    # Re-process the document
                    await self.document_processor.process_text_content(
                        document_id=document_id,
                        kb_id=source['kb_id'],
                        tenant_id=source['tenant_id'],
                        text=page['text'],
                        title=page['title'],
                        source_url=page['url'],
                        metadata={
                            'source_type': 'web_scrape',
                            'scrape_source_id': source_id,
                            'depth': page.get('depth', 0),
                            'updated_at': datetime.now().isoformat()
                        }
                    )
                    
                    # Update hash
                    cursor.execute("""
                        UPDATE yovo_tbl_aiva_documents
                        SET content_hash = %s, sync_status = 'synced', last_sync_at = NOW()
                        WHERE id = %s
                    """, (page_info['new_hash'], document_id))
                    
                    processed['updated'] += 1
                    
                except Exception as e:
                    logger.error(f"Error updating page {page_info['url']}: {e}")
            
            # Process removed pages
            for page_info in change_result['changes']['removed_pages']:
                try:
                    document_id = page_info['document_id']
                    
                    # Delete vectors
                    await self.vector_store.delete_document_vectors(document_id)
                    
                    # Delete document
                    cursor.execute("DELETE FROM yovo_tbl_aiva_documents WHERE id = %s", (document_id,))
                    
                    processed['removed'] += 1
                    
                except Exception as e:
                    logger.error(f"Error removing page {page_info['url']}: {e}")
            
            # Update source status
            cursor.execute("""
                UPDATE yovo_tbl_aiva_scrape_sources 
                SET sync_status = 'idle',
                    documents_count = (SELECT COUNT(*) FROM yovo_tbl_aiva_documents WHERE scrape_source_id = %s),
                    next_sync_at = DATE_ADD(NOW(), INTERVAL sync_interval_hours HOUR),
                    last_error = NULL
                WHERE id = %s
            """, (source_id, source_id))
            
            conn.commit()
            
            return {
                'status': 'synced',
                'processed': processed,
                'details': change_result
            }
            
        except Exception as e:
            logger.error(f"Sync error for source {source_id}: {e}")
            cursor.execute("""
                UPDATE yovo_tbl_aiva_scrape_sources 
                SET sync_status = 'error', last_error = %s
                WHERE id = %s
            """, (str(e), source_id))
            conn.commit()
            raise
            
        finally:
            cursor.close()
            conn.close()
    
    async def get_sources_due_for_sync(self) -> List[Dict[str, Any]]:
        """Get all scrape sources that are due for sync"""
        conn = self._get_db_connection()
        cursor = conn.cursor(dictionary=True)
        
        try:
            cursor.execute("""
                SELECT * FROM yovo_tbl_aiva_scrape_sources
                WHERE auto_sync_enabled = 1
                  AND sync_status != 'syncing'
                  AND (next_sync_at IS NULL OR next_sync_at <= NOW())
                ORDER BY next_sync_at ASC
                LIMIT 10
            """)
            return cursor.fetchall()
            
        finally:
            cursor.close()
            conn.close()
    
    async def run_sync_loop(self, check_interval_minutes: int = 5):
        """Background loop to check and sync sources"""
        self._running = True
        logger.info(f"Starting scrape sync loop (check every {check_interval_minutes} minutes)")
        
        while self._running:
            try:
                sources = await self.get_sources_due_for_sync()
                
                for source in sources:
                    try:
                        logger.info(f"Syncing source: {source['url']}")
                        result = await self.sync_source(source['id'])
                        logger.info(f"Sync completed: {result['status']} - {result.get('processed', {})}")
                    except Exception as e:
                        logger.error(f"Failed to sync source {source['id']}: {e}")
                
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
            
            await asyncio.sleep(check_interval_minutes * 60)
    
    def stop_sync_loop(self):
        """Stop the sync loop"""
        self._running = False


# Singleton instance
_scrape_sync_service = None

def get_scrape_sync_service() -> ScrapeSyncService:
    global _scrape_sync_service
    if _scrape_sync_service is None:
        _scrape_sync_service = ScrapeSyncService()
    return _scrape_sync_service