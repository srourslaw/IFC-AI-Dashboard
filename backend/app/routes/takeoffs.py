"""
Takeoff-related API routes.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..ifc_service import ifc_service
from ..models import TakeoffResponse

router = APIRouter(prefix="/takeoffs", tags=["Takeoffs"])


@router.post("/generate", response_model=TakeoffResponse)
async def generate_takeoffs(
    file_id: Optional[str] = Query(None),
    output_dir: Optional[str] = Query(None),
):
    """Generate cumulative takeoff IFC files."""
    try:
        results = ifc_service.create_cumulative_takeoffs(file_id, output_dir)
        return TakeoffResponse(
            success=True,
            message=f"Successfully generated {len(results)} takeoff files",
            steps=results,
            output_directory=output_dir or "takeoffs",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
