"""
Image Processing Queue
Manages concurrent image processing with memory optimization
"""

import asyncio
import logging
import time
import torch
from typing import Callable, Any, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class ImageProcessingQueue:
    """
    Queue manager for image processing with concurrency control
    Prevents memory overload by limiting concurrent CLIP model operations
    """
    
    def __init__(self, max_concurrent: int = 1):
        """
        Initialize queue
        
        Args:
            max_concurrent: Maximum number of concurrent image processing tasks
        """
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.active_tasks = 0
        self.total_processed = 0
        self.total_failed = 0
        self.queue_stats = {
            'started_at': datetime.now(),
            'total_wait_time_ms': 0,
            'total_process_time_ms': 0,
            'peak_concurrent': 0
        }
        self._lock = asyncio.Lock()
        
        logger.info(f"Image processing queue initialized with max_concurrent={max_concurrent}")
    
    async def process(
        self, 
        func: Callable, 
        *args, 
        cleanup: bool = True,
        **kwargs
    ) -> Any:
        """
        Process an image through the queue with concurrency control
        
        Args:
            func: Async function to execute (should be image processing function)
            cleanup: Whether to cleanup memory after processing
            *args: Arguments to pass to function
            **kwargs: Keyword arguments to pass to function
            
        Returns:
            Result from the processing function
        """
        wait_start = time.time()
        
        # Wait for available slot
        async with self.semaphore:
            wait_time = int((time.time() - wait_start) * 1000)
            
            async with self._lock:
                self.active_tasks += 1
                self.queue_stats['total_wait_time_ms'] += wait_time
                if self.active_tasks > self.queue_stats['peak_concurrent']:
                    self.queue_stats['peak_concurrent'] = self.active_tasks
            
            process_start = time.time()
            
            try:
                logger.debug(
                    f"Processing image (active: {self.active_tasks}/{self.max_concurrent}, "
                    f"waited: {wait_time}ms)"
                )
                
                # Execute the processing function
                result = await func(*args, **kwargs)
                
                process_time = int((time.time() - process_start) * 1000)
                
                async with self._lock:
                    self.total_processed += 1
                    self.queue_stats['total_process_time_ms'] += process_time
                
                logger.debug(f"Image processed successfully in {process_time}ms")
                
                # Optional memory cleanup
                if cleanup:
                    self._cleanup_memory()
                
                return result
                
            except Exception as e:
                async with self._lock:
                    self.total_failed += 1
                
                logger.error(f"Image processing failed: {e}")
                raise
                
            finally:
                async with self._lock:
                    self.active_tasks -= 1
    
    def _cleanup_memory(self):
        """Cleanup GPU/CPU memory after processing"""
        try:
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                logger.debug("GPU cache cleared")
        except Exception as e:
            logger.warning(f"Memory cleanup warning: {e}")
    
    async def process_batch(
        self,
        items: list,
        func: Callable,
        on_item_complete: Optional[Callable] = None,
        on_item_error: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Process a batch of items through the queue
        
        Args:
            items: List of items to process
            func: Async function that takes one item and processes it
            on_item_complete: Optional callback when item completes (receives result)
            on_item_error: Optional callback when item fails (receives item, error)
            
        Returns:
            Dict with batch processing results
        """
        results = {
            'total': len(items),
            'successful': 0,
            'failed': 0,
            'results': [],
            'errors': []
        }
        
        batch_start = time.time()
        
        # Create tasks for all items
        tasks = []
        for i, item in enumerate(items):
            task = self._process_item_with_callback(
                item, i, func, on_item_complete, on_item_error, results
            )
            tasks.append(task)
        
        # Wait for all tasks to complete
        await asyncio.gather(*tasks, return_exceptions=True)
        
        batch_time = int((time.time() - batch_start) * 1000)
        
        logger.info(
            f"Batch processing complete: {results['successful']}/{results['total']} successful, "
            f"time: {batch_time}ms, avg: {batch_time/len(items):.0f}ms per item"
        )
        
        return results
    
    async def _process_item_with_callback(
        self,
        item: Any,
        index: int,
        func: Callable,
        on_complete: Optional[Callable],
        on_error: Optional[Callable],
        results: Dict
    ):
        """Process single item with callbacks"""
        try:
            # Process through queue
            result = await self.process(func, item)
            
            results['successful'] += 1
            results['results'].append({
                'index': index,
                'item': item,
                'result': result
            })
            
            # Call success callback
            if on_complete:
                if asyncio.iscoroutinefunction(on_complete):
                    await on_complete(result)
                else:
                    on_complete(result)
            
        except Exception as e:
            results['failed'] += 1
            results['errors'].append({
                'index': index,
                'item': item,
                'error': str(e)
            })
            
            logger.error(f"Item {index} failed: {e}")
            
            # Call error callback
            if on_error:
                if asyncio.iscoroutinefunction(on_error):
                    await on_error(item, e)
                else:
                    on_error(item, e)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics"""
        runtime = (datetime.now() - self.queue_stats['started_at']).total_seconds()
        
        avg_wait = 0
        avg_process = 0
        
        if self.total_processed > 0:
            avg_wait = self.queue_stats['total_wait_time_ms'] / self.total_processed
            avg_process = self.queue_stats['total_process_time_ms'] / self.total_processed
        
        return {
            'max_concurrent': self.max_concurrent,
            'active_tasks': self.active_tasks,
            'total_processed': self.total_processed,
            'total_failed': self.total_failed,
            'peak_concurrent': self.queue_stats['peak_concurrent'],
            'avg_wait_time_ms': round(avg_wait, 2),
            'avg_process_time_ms': round(avg_process, 2),
            'runtime_seconds': round(runtime, 2),
            'throughput_per_minute': round((self.total_processed / runtime) * 60, 2) if runtime > 0 else 0
        }
    
    def reset_stats(self):
        """Reset statistics"""
        self.total_processed = 0
        self.total_failed = 0
        self.queue_stats = {
            'started_at': datetime.now(),
            'total_wait_time_ms': 0,
            'total_process_time_ms': 0,
            'peak_concurrent': 0
        }
        logger.info("Queue statistics reset")


# Global queue instance
_global_queue: Optional[ImageProcessingQueue] = None


def get_image_queue(max_concurrent: int = 1) -> ImageProcessingQueue:
    """
    Get or create global image processing queue
    
    Args:
        max_concurrent: Max concurrent tasks (only used on first call)
        
    Returns:
        ImageProcessingQueue instance
    """
    global _global_queue
    
    if _global_queue is None:
        _global_queue = ImageProcessingQueue(max_concurrent=max_concurrent)
    
    return _global_queue


def set_queue_concurrency(max_concurrent: int):
    """
    Set queue concurrency (creates new queue)
    
    Args:
        max_concurrent: New max concurrent value
    """
    global _global_queue
    _global_queue = ImageProcessingQueue(max_concurrent=max_concurrent)
    logger.info(f"Image queue concurrency set to {max_concurrent}")