"""
FastAPI main application
"""

import logging
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from app.config import settings
from app.routes import health, documents, search, images

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="AIVA Knowledge Service",
    description="Document processing, embeddings, image search, and vector search",
    version="1.0.0"
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
app.include_router(images.router, prefix="/api/v1", tags=["Images"])  # NEW: Image routes

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