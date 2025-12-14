"""
File management API routes.
"""
import os
import shutil
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse

from ..ifc_service import ifc_service
from ..models import APIResponse, IFCFileInfo, IFCFileListResponse
from ..config import settings

router = APIRouter(prefix="/files", tags=["Files"])


@router.get("", response_model=IFCFileListResponse)
async def list_files():
    """Get list of available IFC files."""
    files = ifc_service.get_available_files()
    return IFCFileListResponse(files=files, total_count=len(files))


@router.post("/upload", response_model=APIResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload a new IFC file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    if not file.filename.lower().endswith('.ifc'):
        raise HTTPException(status_code=400, detail="Only .ifc files are allowed")

    # Ensure upload directory exists
    upload_dir = settings.IFC_DIRECTORY
    os.makedirs(upload_dir, exist_ok=True)

    # Save file
    file_path = upload_dir / file.filename

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Get file info
        stat = file_path.stat()
        file_id = ifc_service._generate_file_id(str(file_path))

        # Unhide the file if it was previously hidden (re-uploading after removal)
        ifc_service.unhide_file(file_id)

        return APIResponse(
            success=True,
            message=f"Successfully uploaded {file.filename}",
            data={
                "file_id": file_id,
                "file_name": file.filename,
                "size_mb": round(stat.st_size / (1024 * 1024), 2),
                "path": str(file_path),
            },
        )
    except Exception as e:
        # Clean up on error
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{file_id}", response_model=APIResponse)
async def delete_file(file_id: str):
    """Remove an IFC file from the application (NEVER deletes source file)."""
    files = ifc_service.get_available_files()
    file_info = next((f for f in files if f.id == file_id), None)

    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")

    # Unload if loaded
    if file_id in ifc_service._loaded_models:
        ifc_service.unload_model(file_id)

    # Add to hidden files list so it won't appear in the UI
    ifc_service.hide_file(file_id, file_info.path)

    return APIResponse(
        success=True,
        message=f"Removed {file_info.name} from application (file preserved on disk)",
    )


@router.post("/{file_id}/load", response_model=APIResponse)
async def load_file(file_id: str):
    """Load an IFC file into memory."""
    files = ifc_service.get_available_files()
    file_info = next((f for f in files if f.id == file_id), None)

    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        loaded_id, model = ifc_service.load_model(file_info.path)
        return APIResponse(
            success=True,
            message=f"Successfully loaded {model.file_name}",
            data={
                "file_id": loaded_id,
                "file_name": model.file_name,
                "size_mb": model.size_mb,
                "loaded_at": model.loaded_at.isoformat(),
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{file_id}/unload", response_model=APIResponse)
async def unload_file(file_id: str):
    """Unload an IFC file from memory."""
    if ifc_service.unload_model(file_id):
        return APIResponse(success=True, message="Model unloaded successfully")
    raise HTTPException(status_code=404, detail="Model not found or not loaded")


@router.get("/loaded", response_model=APIResponse)
async def get_loaded_models():
    """Get list of currently loaded models."""
    models = ifc_service.get_loaded_models()
    return APIResponse(
        success=True,
        message=f"{len(models)} model(s) loaded",
        data=[
            {
                "file_id": m.file_id,
                "file_name": m.file_name,
                "size_mb": m.size_mb,
                "loaded_at": m.loaded_at.isoformat(),
            }
            for m in models
        ],
    )


@router.post("/{file_id}/set-current", response_model=APIResponse)
async def set_current_model(file_id: str):
    """Set the currently active model."""
    if ifc_service.set_current_model(file_id):
        return APIResponse(success=True, message="Current model updated")
    raise HTTPException(status_code=404, detail="Model not found or not loaded")


@router.get("/current", response_model=APIResponse)
async def get_current_model():
    """Get the currently active model."""
    model = ifc_service.get_current_model()
    if model:
        return APIResponse(
            success=True,
            message="Current model retrieved",
            data={
                "file_id": model.file_id,
                "file_name": model.file_name,
                "file_path": model.file_path,
                "size_mb": model.size_mb,
                "loaded_at": model.loaded_at.isoformat(),
            },
        )
    return APIResponse(success=True, message="No model currently loaded", data=None)


@router.get("/{file_id}/download")
async def download_ifc_file(file_id: str):
    """Download/serve an IFC file for 3D viewing."""
    files = ifc_service.get_available_files()
    file_info = next((f for f in files if f.id == file_id), None)

    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")

    if not os.path.exists(file_info.path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=file_info.path,
        filename=file_info.name,
        media_type="application/octet-stream",
    )
