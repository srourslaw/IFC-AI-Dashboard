"""
Review API routes for methodology review and editing.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any

from ..models import (
    APIResponse,
    ApplySuggestionRequest,
    CreateStageRequest,
    CreateZoneRequest,
    FinalizeRequest,
    ReviewResponse,
    UpdateStageRequest,
)
from ..review_service import review_service
from ..ifc_service import ifc_service
from .methodology import _methodology_cache, get_methodology_service

router = APIRouter(prefix="/review", tags=["Review"])


def get_methodology_data(file_id: str) -> Dict[str, Any]:
    """Get methodology data from the methodology service as a dict for creating reviews."""
    if file_id not in ifc_service._loaded_models:
        return None

    service = get_methodology_service(file_id)

    # Get file name
    model_info = ifc_service._loaded_models.get(file_id)
    file_name = model_info.file_name if model_info else f"file_{file_id}"

    # Build methodology data structure
    zones_data = []
    for zone in service.zones.values():
        zone_dict = zone.to_dict()
        zones_data.append({
            "zone_id": zone_dict.get("zone_id", zone_dict.get("id", 0)),
            "zone_name": zone_dict.get("name", f"Zone {zone_dict.get('zone_id', 0)}"),
            "storey_name": zone_dict.get("storey_name", zone_dict.get("level", "")),
        })

    stages_data = []
    for stage in service.stages:
        stage_dict = stage.to_dict()
        # Get element IDs for this stage
        element_ids = []
        for elem in service.elements.values():
            if hasattr(elem, 'stage_id') and elem.stage_id == stage.stage_id:
                element_ids.append(elem.express_id)
            elif hasattr(stage, 'elements') and elem.global_id in stage.elements:
                element_ids.append(elem.express_id)

        stages_data.append({
            "stage_id": stage_dict.get("stage_id", ""),
            "name": stage_dict.get("name", ""),
            "element_type": stage_dict.get("element_type", ""),
            "zone_id": stage_dict.get("zone_id", 0),
            "sequence_order": stage_dict.get("sequence_order", 0),
            "element_ids": element_ids,
        })

    return {
        "file_id": file_id,
        "file_name": file_name,
        "zones": zones_data,
        "stages": stages_data,
        "total_elements": len(service.elements),
    }


@router.get("/{file_id}", response_model=ReviewResponse)
async def get_review(file_id: str):
    """Get the methodology review for a file."""
    review = review_service.get_review(file_id)

    if not review:
        # Try to create from existing methodology
        methodology = get_methodology_data(file_id)
        if methodology:
            file_name = methodology.get("file_name", f"file_{file_id}")
            review = review_service.create_review(file_id, file_name, methodology)
        else:
            raise HTTPException(status_code=404, detail="No methodology found. Please load a model and generate methodology first.")

    return ReviewResponse(
        success=True,
        message="Review loaded",
        review=review,
    )


@router.post("/{file_id}/create", response_model=ReviewResponse)
async def create_review(file_id: str):
    """Create or recreate review from current methodology."""
    methodology = get_methodology_data(file_id)
    if not methodology:
        raise HTTPException(status_code=404, detail="No methodology found. Please load a model and generate methodology first.")

    file_name = methodology.get("file_name", f"file_{file_id}")
    review = review_service.create_review(file_id, file_name, methodology)

    return ReviewResponse(
        success=True,
        message="Review created",
        review=review,
    )


@router.post("/{file_id}/analyze/rules", response_model=ReviewResponse)
async def run_rule_analysis(file_id: str):
    """Run rule-based analysis on the methodology."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    suggestions = review_service.run_rule_based_analysis(review)

    # Add new suggestions (don't replace existing ones)
    existing_ids = {s.id for s in review.suggestions}
    for s in suggestions:
        if s.id not in existing_ids:
            review.suggestions.append(s)

    review_service.update_status(review, "ai_reviewed")
    review_service.save_review(review)

    return ReviewResponse(
        success=True,
        message=f"Rule-based analysis complete. {len(suggestions)} suggestions generated.",
        review=review,
    )


@router.post("/{file_id}/analyze/ai", response_model=ReviewResponse)
async def run_ai_analysis(file_id: str):
    """Run AI-enhanced analysis on the methodology (requires OpenAI API key)."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    suggestions = review_service.run_ai_analysis(review)

    if not suggestions:
        return ReviewResponse(
            success=True,
            message="AI analysis not available. Configure OPENAI_API_KEY to enable.",
            review=review,
        )

    # Add new suggestions
    existing_ids = {s.id for s in review.suggestions}
    for s in suggestions:
        if s.id not in existing_ids:
            review.suggestions.append(s)

    review_service.save_review(review)

    return ReviewResponse(
        success=True,
        message=f"AI analysis complete. {len(suggestions)} suggestions generated.",
        review=review,
    )


@router.post("/{file_id}/analyze", response_model=ReviewResponse)
async def run_full_analysis(file_id: str):
    """Run both rule-based and AI analysis."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    # Run rule-based first
    rule_suggestions = review_service.run_rule_based_analysis(review)

    # Run AI analysis
    ai_suggestions = review_service.run_ai_analysis(review)

    # Combine suggestions
    all_suggestions = rule_suggestions + ai_suggestions
    existing_ids = {s.id for s in review.suggestions}
    for s in all_suggestions:
        if s.id not in existing_ids:
            review.suggestions.append(s)

    review_service.update_status(review, "ai_reviewed")
    review_service.save_review(review)

    return ReviewResponse(
        success=True,
        message=f"Analysis complete. {len(rule_suggestions)} rule-based + {len(ai_suggestions)} AI suggestions.",
        review=review,
    )


@router.put("/{file_id}/suggestions/{suggestion_id}", response_model=APIResponse)
async def update_suggestion(file_id: str, suggestion_id: str, request: ApplySuggestionRequest):
    """Accept, reject, or ignore a suggestion."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    for suggestion in review.suggestions:
        if suggestion.id == suggestion_id:
            if request.action not in ["accept", "reject", "ignore"]:
                raise HTTPException(status_code=400, detail="Invalid action")

            suggestion.status = request.action + "ed"  # accepted, rejected, ignored
            review_service.save_review(review)

            return APIResponse(
                success=True,
                message=f"Suggestion {request.action}ed",
            )

    raise HTTPException(status_code=404, detail="Suggestion not found")


@router.delete("/{file_id}/suggestions/{suggestion_id}", response_model=APIResponse)
async def delete_suggestion(file_id: str, suggestion_id: str):
    """Delete a suggestion."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    for suggestion in review.suggestions:
        if suggestion.id == suggestion_id:
            review.suggestions.remove(suggestion)
            review_service.save_review(review)
            return APIResponse(success=True, message="Suggestion deleted")

    raise HTTPException(status_code=404, detail="Suggestion not found")


@router.put("/{file_id}/stages/{stage_id}", response_model=ReviewResponse)
async def update_stage(file_id: str, stage_id: str, request: UpdateStageRequest):
    """Update a stage."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message = review_service.update_stage(review, stage_id, request.model_dump(exclude_none=True))

    if not success:
        raise HTTPException(status_code=404, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.post("/{file_id}/stages", response_model=ReviewResponse)
async def create_stage(file_id: str, request: CreateStageRequest):
    """Create a new stage."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message, stage = review_service.create_stage(
        review,
        request.name,
        request.element_type,
        request.zone_id,
        request.element_ids,
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.delete("/{file_id}/stages/{stage_id}", response_model=ReviewResponse)
async def delete_stage(file_id: str, stage_id: str):
    """Delete a stage."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message = review_service.delete_stage(review, stage_id)

    if not success:
        raise HTTPException(status_code=404, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.post("/{file_id}/zones", response_model=ReviewResponse)
async def create_zone(file_id: str, request: CreateZoneRequest):
    """Create a new zone."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message, zone = review_service.create_zone(review, request.name, request.storey_name)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.delete("/{file_id}/zones/{zone_id}", response_model=ReviewResponse)
async def delete_zone(file_id: str, zone_id: int):
    """Delete a zone."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message = review_service.delete_zone(review, zone_id)

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.post("/{file_id}/finalize", response_model=ReviewResponse)
async def finalize_review(file_id: str, request: FinalizeRequest):
    """Finalize the methodology review."""
    review = review_service.get_review(file_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    success, message = review_service.finalize_review(
        review,
        reviewed_by=request.reviewed_by,
        comments=request.comments,
    )

    if not success:
        raise HTTPException(status_code=400, detail=message)

    return ReviewResponse(
        success=True,
        message=message,
        review=review,
    )


@router.post("/{file_id}/reset", response_model=ReviewResponse)
async def reset_review(file_id: str):
    """Reset review to draft status and regenerate from methodology."""
    methodology = get_methodology_data(file_id)
    if not methodology:
        raise HTTPException(status_code=404, detail="No methodology found")

    file_name = methodology.get("file_name", f"file_{file_id}")
    review = review_service.create_review(file_id, file_name, methodology)

    return ReviewResponse(
        success=True,
        message="Review reset to draft",
        review=review,
    )
