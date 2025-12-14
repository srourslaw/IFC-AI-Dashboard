"""
Export-related API routes.
"""
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from ..ifc_service import ifc_service
from ..models import ExportResponse

router = APIRouter(prefix="/exports", tags=["Exports"])


@router.post("/excel", response_model=ExportResponse)
async def export_to_excel(
    file_id: Optional[str] = Query(None),
    output_path: Optional[str] = Query(None),
):
    """Export elements to Excel file."""
    try:
        file_path, row_count = ifc_service.export_to_excel(file_id, output_path)
        filename = os.path.basename(file_path)
        return ExportResponse(
            success=True,
            message=f"Successfully exported {row_count} elements",
            file_path=file_path,
            row_count=row_count,
            download_url=f"/api/exports/download/{filename}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_export(filename: str):
    """Download an exported file."""
    from ..config import settings

    exports_dir = settings.IFC_DIRECTORY / settings.EXPORTS_DIR
    file_path = exports_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
