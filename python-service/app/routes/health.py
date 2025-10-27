"""
Health check endpoint
"""

from fastapi import APIRouter
from datetime import datetime
from app.models.responses import HealthResponse
import redis
import mysql.connector
from app.config import settings

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    
    services = {
        "redis": False,
        "mysql": False,
        "openai": bool(settings.OPENAI_API_KEY)
    }
    
    # Check Redis
    try:
        r = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD,
            db=settings.REDIS_DB,
            decode_responses=True
        )
        r.ping()
        services["redis"] = True
    except Exception as e:
        print(f"Redis health check failed: {e}")
    
    # Check MySQL
    try:
        conn = mysql.connector.connect(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            database=settings.DB_NAME
        )
        conn.close()
        services["mysql"] = True
    except Exception as e:
        print(f"MySQL health check failed: {e}")
    
    return HealthResponse(
        status="healthy" if all(services.values()) else "degraded",
        version="1.0.2",
        whoami="aiva-python",
        timestamp=datetime.utcnow().isoformat(),
        services=services
    )