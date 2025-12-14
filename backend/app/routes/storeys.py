"""
Storey-related API routes.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..ifc_service import ifc_service
from ..models import APIResponse, SplitStoreysResponse, StoreyListResponse

router = APIRouter(prefix="/storeys", tags=["Storeys"])


@router.get("", response_model=StoreyListResponse)
async def list_storeys(file_id: Optional[str] = Query(None)):
    """Get list of building storeys."""
    try:
        storeys = ifc_service.get_storeys(file_id)
        return StoreyListResponse(storeys=storeys, total_count=len(storeys))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/split", response_model=SplitStoreysResponse)
async def split_storeys(
    file_id: Optional[str] = Query(None),
    output_dir: Optional[str] = Query(None),
):
    """Split each storey into its own IFC file."""
    try:
        results = ifc_service.split_storeys(file_id, output_dir)
        return SplitStoreysResponse(
            success=True,
            message=f"Successfully split {len(results)} storeys",
            results=results,
            output_directory=output_dir or "storey_ifcs",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
