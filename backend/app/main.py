"""
IFC AI POC - Enterprise API Server
Main FastAPI application entry point.
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .ifc_service import ifc_service
from .models import HealthCheck
from .routes import analytics, elements, exports, files, storeys, takeoffs, methodology, review

logger = logging.getLogger(__name__)

# Frontend static build directory (built by CI/CD pipeline)
FRONTEND_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"


# =============================================================================
# Startup: Auto-load IFC model
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Auto-load the first available IFC file at startup for instant demo access."""
    asyncio.create_task(_auto_load_model())
    yield


async def _auto_load_model():
    """Load the first IFC file in a background thread so the server stays responsive."""
    try:
        available = ifc_service.get_available_files()
        if available:
            first_file = available[0]
            logger.info(f"Auto-loading IFC model: {first_file.name} ({first_file.size_mb} MB)")
            await asyncio.to_thread(ifc_service.load_model, first_file.path)
            logger.info(f"Model loaded successfully: {first_file.name}")
        else:
            logger.info("No IFC files found in uploads directory, skipping auto-load")
    except Exception as e:
        logger.error(f"Failed to auto-load model: {e}")


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
    lifespan=lifespan,
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


# =============================================================================
# Frontend Static Files (SPA served from built frontend)
# =============================================================================

if FRONTEND_DIR.exists() and (FRONTEND_DIR / "index.html").exists():
    # Serve static assets (JS, CSS, images) from the Vite build
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="frontend-assets")

    @app.get("/{full_path:path}", tags=["Frontend"])
    async def serve_frontend(request: Request, full_path: str):
        """Serve the frontend SPA. All non-API routes fall through to index.html."""
        # Try to serve an exact file match first (e.g., favicon.ico, vite.svg)
        file_path = FRONTEND_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        # Otherwise return index.html for SPA routing
        return FileResponse(str(FRONTEND_DIR / "index.html"))
else:
    @app.get("/", tags=["Root"])
    async def root():
        """Root endpoint with API information (no frontend build found)."""
        return {
            "name": settings.API_TITLE,
            "version": settings.API_VERSION,
            "docs": "/api/docs",
            "health": "/api/health",
            "note": "Frontend not built. Run 'npm run build' in frontend/ directory.",
        }
