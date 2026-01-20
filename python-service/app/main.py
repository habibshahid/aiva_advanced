"""
FastAPI main application
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from app.config import settings
from app.routes import health, documents, search, images
import sys

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)  # Explicitly output to stdout
    ],
    force=True  # Python 3.8+: Force reconfiguration
)

# Set root logger level explicitly
root_logger = logging.getLogger()
root_logger.setLevel(getattr(logging, settings.LOG_LEVEL))

# Ensure all app loggers inherit from root
logging.getLogger('app').setLevel(getattr(logging, settings.LOG_LEVEL))

logger = logging.getLogger(__name__)

# Global image processor instance (singleton)
_image_processor = None

def get_image_processor():
    """Get the global image processor instance"""
    global _image_processor
    if _image_processor is None:
        raise RuntimeError("Image processor not initialized")
    return _image_processor

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager - runs on startup and shutdown
    Loads CLIP model ONCE and shares across all workers
    """
    global _image_processor
    
    # Startup: Load CLIP model once
    logger.info("=" * 60)
    logger.info("Starting up: Loading CLIP model (ONE TIME)...")
    logger.info("=" * 60)
    
    from app.services.image_processor import ImageProcessor
    _image_processor = ImageProcessor()
    
    logger.info("✓ CLIP model loaded and ready!")
    logger.info("=" * 60)
    
    from app.services.scrape_sync_service import get_scrape_sync_service
    import asyncio
    
    sync_service = get_scrape_sync_service()
    sync_task = asyncio.create_task(sync_service.run_sync_loop(check_interval_minutes=5))
    logger.info("✓ Scrape sync background loop started")
    
    yield  # Application runs
    
    
    logger.info("Shutting down: Stopping scrape sync loop...")
    sync_service.stop_sync_loop()
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        pass
    logger.info("✓ Scrape sync loop stopped")
    
    logger.info("Shutting down: Cleaning up resources...")
    _image_processor = None
    
    # Shutdown: Cleanup
    logger.info("Shutting down: Cleaning up resources...")
    _image_processor = None

# Create FastAPI app with lifespan
app = FastAPI(
    title="AIVA Knowledge Service",
    description="Document processing, embeddings, image search, and vector search",
    version="1.0.0",
    lifespan=lifespan  # ✅ Add lifespan event
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key authentication middleware
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    # Skip auth for health check
    if request.url.path == "/health":
        return await call_next(request)
    
    api_key = request.headers.get("X-API-Key")
    
    if not api_key or api_key != settings.PYTHON_API_KEY:
        return JSONResponse(
            status_code=401,
            content={
                "error": "Unauthorized",
                "details": "Invalid or missing API key",
                "timestamp": datetime.utcnow().isoformat()
            }
        )
    
    return await call_next(request)

# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "details": str(exc),
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(documents.router, prefix="/api/v1", tags=["Documents"])
app.include_router(search.router, prefix="/api/v1", tags=["Search"])
app.include_router(images.router, prefix="/api/v1", tags=["Images"])

@app.get("/")
async def root():
    return {
        "service": "AIVA Knowledge Service",
        "version": "1.0.0",
        "status": "running",
        "features": [
            "Document processing",
            "Text embeddings",
            "Image processing (CLIP)",
            "Vector search",
            "Multi-format support"
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.PYTHON_HOST,
        port=settings.PYTHON_PORT,
        workers=settings.PYTHON_WORKERS,
        reload=False
    )