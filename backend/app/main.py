"""
IFC AI POC - Enterprise API Server
Main FastAPI application entry point.
"""
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .models import HealthCheck
from .routes import analytics, elements, exports, files, storeys, takeoffs, methodology, review

# =============================================================================
# Application Setup
# =============================================================================

app = FastAPI(
    title=settings.API_TITLE,
    version=settings.API_VERSION,
    description=settings.API_DESCRIPTION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# =============================================================================
# Middleware
# =============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# API Routes
# =============================================================================

API_PREFIX = "/api"

app.include_router(files.router, prefix=API_PREFIX)
app.include_router(storeys.router, prefix=API_PREFIX)
app.include_router(elements.router, prefix=API_PREFIX)
app.include_router(takeoffs.router, prefix=API_PREFIX)
app.include_router(exports.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(methodology.router, prefix=API_PREFIX)
app.include_router(review.router, prefix=API_PREFIX)


# =============================================================================
# Health Check
# =============================================================================

@app.get("/api/health", response_model=HealthCheck, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return HealthCheck(
        status="healthy",
        version=settings.API_VERSION,
        timestamp=datetime.now(),
    )


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": settings.API_TITLE,
        "version": settings.API_VERSION,
        "docs": "/api/docs",
        "health": "/api/health",
    }
