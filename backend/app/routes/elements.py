"""
Element-related API routes.
"""
import math
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..ifc_service import ifc_service
from ..models import ElementCountsResponse, ElementsResponse

router = APIRouter(prefix="/elements", tags=["Elements"])


@router.get("/counts", response_model=ElementCountsResponse)
async def get_element_counts(file_id: Optional[str] = Query(None)):
    """Get element counts by IFC type."""
    try:
        counts = ifc_service.get_element_counts(file_id)
        total = sum(c.count for c in counts)
        return ElementCountsResponse(counts=counts, total_elements=total)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=ElementsResponse)
async def get_elements(
    file_id: Optional[str] = Query(None),
    ifc_type: Optional[str] = Query(None, description="Filter by IFC type"),
    storey_name: Optional[str] = Query(None, description="Filter by storey name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
):
    """Get elements with optional filtering and pagination."""
    try:
        elements, total_count = ifc_service.get_elements(
            file_id=file_id,
            ifc_type=ifc_type,
            storey_name=storey_name,
            page=page,
            page_size=page_size,
        )
        total_pages = math.ceil(total_count / page_size) if total_count > 0 else 1

        return ElementsResponse(
            elements=elements,
            total_count=total_count,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
