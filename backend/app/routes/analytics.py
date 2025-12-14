"""
Analytics API routes.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..ifc_service import ifc_service
from ..models import ModelAnalytics

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("", response_model=ModelAnalytics)
async def get_analytics(file_id: Optional[str] = Query(None)):
    """Get comprehensive model analytics."""
    try:
        analytics = ifc_service.get_model_analytics(file_id)
        return analytics
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
