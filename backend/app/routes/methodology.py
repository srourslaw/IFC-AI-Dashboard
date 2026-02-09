"""
API Routes for Erection Methodology
Handles analysis, zone management, and document generation
"""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..ifc_service import ifc_service  # Use singleton instance
from ..erection_service import ErectionMethodologyService
from ..pdf_service import generate_methodology_pdf

router = APIRouter(prefix="/methodology", tags=["Methodology"])

# Cache for methodology services per file
_methodology_cache: Dict[str, ErectionMethodologyService] = {}


def get_methodology_service(file_id: str) -> ErectionMethodologyService:
    """Get or create methodology service for a file"""
    if file_id not in ifc_service._loaded_models:
        raise HTTPException(status_code=400, detail=f"Model {file_id} is not loaded")

    if file_id not in _methodology_cache:
        ifc_file = ifc_service._loaded_models[file_id].ifc
        service = ErectionMethodologyService(ifc_file)
        service.analyze()
        _methodology_cache[file_id] = service

    return _methodology_cache[file_id]


class ZoneUpdateRequest(BaseModel):
    name: Optional[str] = None
    x_min: Optional[float] = None
    x_max: Optional[float] = None
    y_min: Optional[float] = None
    y_max: Optional[float] = None


class StageUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[List[str]] = None


class GridSelection(BaseModel):
    """Grid-based area selection (e.g., Grid 2-8 / A-J)"""
    v_start: str  # Number axis start (e.g., "2")
    v_end: str    # Number axis end (e.g., "8")
    u_start: str  # Letter axis start (e.g., "A")
    u_end: str    # Letter axis end (e.g., "J")


class ErectionSequenceDefinition(BaseModel):
    """User-defined erection sequence based on grid references"""
    sequence_number: int
    name: str
    grid_selection: GridSelection
    splits: List[str] = []  # V-axis split points (e.g., ["5"] splits 2-8 into 2-5 and 5-8)


class GenerateFromSequencesRequest(BaseModel):
    """Request to generate stages from user-defined sequences"""
    sequences: List[ErectionSequenceDefinition]
    include_footings: bool = True  # Optional: include footings in stages (default True)


@router.get("/analyze")
async def analyze_model(file_id: Optional[str] = Query(None)):
    """
    Analyze IFC model for erection methodology.
    Auto-detects grid system, zones, and generates erection sequence.
    """
    # Use current model if no file_id specified
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    # Clear cache to force re-analysis
    if file_id in _methodology_cache:
        del _methodology_cache[file_id]

    service = get_methodology_service(file_id)
    summary = service.get_analysis_summary()

    return {
        "file_id": file_id,
        "analysis": summary
    }


@router.get("/grid")
async def get_grid_data(file_id: Optional[str] = Query(None)):
    """
    Get grid system data for visualization.
    Returns grid axes and cells.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    return service.get_grid_data()


@router.get("/zones")
async def get_zones(file_id: Optional[str] = Query(None)):
    """
    Get all erection zones for the model.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    return {
        "zones": [z.to_dict() for z in service.zones.values()],
        "total_count": len(service.zones)
    }


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: int, file_id: Optional[str] = Query(None)):
    """
    Get details for a specific zone including all elements.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    zone = service.zones.get(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")

    return {
        "zone": zone.to_dict(),
        "elements": service.get_elements_by_zone(zone_id)
    }


@router.put("/zones/{zone_id}")
async def update_zone(
    zone_id: int,
    update: ZoneUpdateRequest,
    file_id: Optional[str] = Query(None)
):
    """
    Update zone boundaries or name.
    User can customize zones for their specific needs.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    x_range = None
    y_range = None

    if update.x_min is not None and update.x_max is not None:
        x_range = (update.x_min, update.x_max)

    if update.y_min is not None and update.y_max is not None:
        y_range = (update.y_min, update.y_max)

    result = service.update_zone(zone_id, update.name, x_range, y_range)

    if not result:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")

    return {
        "zone": result,
        "message": "Zone updated successfully"
    }


@router.get("/stages")
async def get_stages(file_id: Optional[str] = Query(None)):
    """
    Get all erection stages in sequence order.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    stages = sorted(service.stages, key=lambda s: s.sequence_order)

    return {
        "stages": [s.to_dict() for s in stages],
        "total_count": len(stages)
    }


@router.get("/stages/{stage_id}")
async def get_stage(stage_id: str, file_id: Optional[str] = Query(None)):
    """
    Get details for a specific stage including all elements.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    stage = next((s for s in service.stages if s.stage_id == stage_id), None)
    if not stage:
        raise HTTPException(status_code=404, detail=f"Stage {stage_id} not found")

    return {
        "stage": stage.to_dict(),
        "elements": service.get_elements_by_stage(stage_id)
    }


@router.get("/elements")
async def get_elements(
    file_id: Optional[str] = Query(None),
    zone_id: Optional[int] = Query(None),
    stage_id: Optional[str] = Query(None),
    element_type: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(1000, le=10000),
    offset: int = Query(0)
):
    """
    Get structural elements with filtering options.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    # Start with all elements
    elements = list(service.elements.values())

    # Apply filters
    if zone_id is not None:
        zone = service.zones.get(zone_id)
        if zone:
            zone_element_ids = set(zone.elements)
            elements = [e for e in elements if e.global_id in zone_element_ids]

    if stage_id:
        stage = next((s for s in service.stages if s.stage_id == stage_id), None)
        if stage:
            stage_element_ids = set(stage.elements)
            elements = [e for e in elements if e.global_id in stage_element_ids]

    if element_type:
        elements = [e for e in elements if e.ifc_type.lower() == element_type.lower()]

    if level:
        elements = [e for e in elements if e.level == level]

    # Pagination
    total = len(elements)
    elements = elements[offset:offset + limit]

    return {
        "elements": [e.to_dict() for e in elements],
        "total_count": total,
        "offset": offset,
        "limit": limit
    }


@router.get("/document")
async def get_methodology_document(file_id: Optional[str] = Query(None)):
    """
    Generate complete erection methodology document.
    Returns structured data that can be exported to PDF.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    document = service.generate_methodology_document()

    # Add file info
    model_info = ifc_service._loaded_models.get(file_id)
    document['file_info'] = {
        'file_id': file_id,
        'file_name': model_info.file_name if model_info else 'Unknown',
        'file_path': model_info.file_path if model_info else ''
    }

    return document


@router.post("/regenerate")
async def regenerate_analysis(file_id: Optional[str] = Query(None)):
    """
    Force regeneration of methodology analysis.
    Clears cache and re-analyzes the model.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    # Clear cache
    if file_id in _methodology_cache:
        del _methodology_cache[file_id]

    # Re-analyze
    service = get_methodology_service(file_id)

    return {
        "message": "Analysis regenerated successfully",
        "summary": service.get_analysis_summary()
    }


@router.delete("/cache")
async def clear_cache(file_id: Optional[str] = Query(None)):
    """
    Clear methodology cache for a specific file or all files.
    """
    if file_id:
        if file_id in _methodology_cache:
            del _methodology_cache[file_id]
            return {"message": f"Cache cleared for {file_id}"}
        return {"message": f"No cache found for {file_id}"}
    else:
        _methodology_cache.clear()
        return {"message": "All cache cleared"}


@router.get("/zones/{zone_id}/express-ids")
async def get_zone_express_ids(zone_id: int, file_id: Optional[str] = Query(None)):
    """
    Get ExpressIDs for all elements in a zone (for 3D viewer highlighting).
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    express_ids = service.get_express_ids_by_zone(zone_id)

    return {
        "zone_id": zone_id,
        "express_ids": express_ids,
        "count": len(express_ids)
    }


@router.get("/stages/{stage_id}/express-ids")
async def get_stage_express_ids(stage_id: str, file_id: Optional[str] = Query(None)):
    """
    Get ExpressIDs for all elements in a stage (for 3D viewer highlighting).
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    express_ids = service.get_express_ids_by_stage(stage_id)

    return {
        "stage_id": stage_id,
        "express_ids": express_ids,
        "count": len(express_ids)
    }


@router.get("/express-ids")
async def get_all_express_ids(file_id: Optional[str] = Query(None)):
    """
    Get ExpressIDs for all structural elements (for 3D viewer).
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    express_ids = service.get_all_express_ids()

    return {
        "express_ids": express_ids,
        "count": len(express_ids)
    }


@router.post("/generate-from-sequences")
async def generate_from_sequences(
    request: GenerateFromSequencesRequest,
    file_id: Optional[str] = Query(None)
):
    """
    Generate erection stages from user-defined sequences.
    This is the Rosehill-style approach where user defines:
    - Erection areas by grid reference (e.g., Grid 2-8 / A-J)
    - Split points to subdivide areas (e.g., split at Grid 5)

    System then generates stages: Columns first, then Beams for each sub-area.

    Returns:
    - stages: The generated erection stages with express_ids
    - section_ids: ALL elements in the grid area (full building section)
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)

    # Generate stages from user sequences
    generated_stages = service.generate_from_user_sequences(
        [seq.model_dump() for seq in request.sequences],
        include_footings=request.include_footings
    )

    # Get ALL elements in the grid area (full building section)
    # This includes walls, slabs, roofing, cladding, etc.
    section_ids = []
    if request.sequences:
        # Use the first sequence's grid selection for the section bounds
        first_seq = request.sequences[0]
        grid = first_seq.grid_selection
        section_ids = service.get_all_ifc_elements_by_grid_area(
            grid.v_start, grid.v_end, grid.u_start, grid.u_end
        )

    # Update cache
    _methodology_cache[file_id] = service

    return {
        "success": True,
        "message": f"Generated {len(generated_stages)} stages from {len(request.sequences)} sequences",
        "stages": generated_stages,
        "section_ids": section_ids,  # ALL elements in the grid area
        "section_count": len(section_ids),
        "summary": service.get_analysis_summary()
    }


@router.get("/grid-express-ids")
async def get_grid_area_express_ids(
    v_start: str = Query(..., description="V-axis start (e.g., '2')"),
    v_end: str = Query(..., description="V-axis end (e.g., '8')"),
    u_start: str = Query(..., description="U-axis start (e.g., 'A')"),
    u_end: str = Query(..., description="U-axis end (e.g., 'J')"),
    element_type: Optional[str] = Query(None, description="Filter by element type: columns, beams, etc."),
    file_id: Optional[str] = Query(None)
):
    """
    Get ExpressIDs for elements within a grid area.
    Used for 3D viewer highlighting of specific grid regions.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    express_ids = service.get_express_ids_by_grid_area(
        v_start, v_end, u_start, u_end, element_type
    )

    return {
        "grid_area": f"Grid {v_start}-{v_end} / {u_start}-{u_end}",
        "element_type": element_type or "all",
        "express_ids": express_ids,
        "count": len(express_ids)
    }


@router.get("/export/pdf")
async def export_methodology_pdf(file_id: Optional[str] = Query(None)):
    """
    Export erection methodology as a PDF document.
    Returns a downloadable PDF file.
    """
    if not file_id:
        if not ifc_service._current_model_id:
            raise HTTPException(status_code=400, detail="No model loaded")
        file_id = ifc_service._current_model_id

    service = get_methodology_service(file_id)
    document = service.generate_methodology_document()

    # Add file info
    model_info = ifc_service._loaded_models.get(file_id)
    document['file_info'] = {
        'file_id': file_id,
        'file_name': model_info.file_name if model_info else 'Unknown',
        'file_path': model_info.file_path if model_info else ''
    }

    # Generate PDF
    pdf_buffer = generate_methodology_pdf(document)

    # Create filename from model name
    base_name = model_info.file_name.replace('.ifc', '').replace('.IFC', '') if model_info else 'methodology'
    filename = f"{base_name}_erection_methodology.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )
