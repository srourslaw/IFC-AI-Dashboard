"""
Pydantic models for API request/response schemas.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================================
# IFC File Models
# ============================================================================

class IFCFileInfo(BaseModel):
    """Information about an IFC file."""
    id: str
    name: str
    path: str
    size_mb: float
    modified_at: datetime
    is_loaded: bool = False


class IFCFileListResponse(BaseModel):
    """Response containing list of available IFC files."""
    files: List[IFCFileInfo]
    total_count: int


# ============================================================================
# Storey Models
# ============================================================================

class StoreyInfo(BaseModel):
    """Information about a building storey."""
    index: int
    name: str
    elevation: float
    element_count: Optional[int] = None


class StoreyListResponse(BaseModel):
    """Response containing list of storeys."""
    storeys: List[StoreyInfo]
    total_count: int


# ============================================================================
# Element Models
# ============================================================================

class ElementCount(BaseModel):
    """Count of elements by type."""
    ifc_type: str
    count: int
    percentage: float


class ElementCountsResponse(BaseModel):
    """Response containing element counts."""
    counts: List[ElementCount]
    total_elements: int


class ElementDetail(BaseModel):
    """Detailed information about an IFC element."""
    step_id: int
    ifc_type: str
    global_id: Optional[str]
    name: Optional[str]
    object_type: Optional[str]
    predefined_type: Optional[str]
    storey_name: Optional[str]
    storey_elevation: Optional[float]


class ElementsResponse(BaseModel):
    """Paginated response containing elements."""
    elements: List[ElementDetail]
    total_count: int
    page: int
    page_size: int
    total_pages: int


# ============================================================================
# Takeoff Models
# ============================================================================

class TakeoffStep(BaseModel):
    """Information about a takeoff step."""
    step: int
    floors: List[str]
    file: str
    removed_elements: int


class TakeoffResponse(BaseModel):
    """Response from takeoff generation."""
    success: bool
    message: str
    steps: List[TakeoffStep]
    output_directory: str


# ============================================================================
# Split Storey Models
# ============================================================================

class SplitStoreyResult(BaseModel):
    """Result of splitting a single storey."""
    index: int
    storey_name: str
    file: str
    removed_elements: int


class SplitStoreysResponse(BaseModel):
    """Response from storey splitting."""
    success: bool
    message: str
    results: List[SplitStoreyResult]
    output_directory: str


# ============================================================================
# Export Models
# ============================================================================

class ExportRequest(BaseModel):
    """Request for exporting data."""
    format: str = Field(default="xlsx", description="Export format (xlsx, csv)")
    include_empty_storeys: bool = True


class ExportResponse(BaseModel):
    """Response from export operation."""
    success: bool
    message: str
    file_path: str
    row_count: int
    download_url: str


# ============================================================================
# Analytics Models
# ============================================================================

class StoreyAnalytics(BaseModel):
    """Analytics for a single storey."""
    name: str
    elevation: float
    element_count: int
    element_types: Dict[str, int]


class ModelAnalytics(BaseModel):
    """Overall model analytics."""
    file_name: str
    total_elements: int
    total_storeys: int
    element_type_distribution: List[ElementCount]
    storey_analytics: List[StoreyAnalytics]
    top_element_types: List[ElementCount]


# ============================================================================
# Job/Task Models (for async operations)
# ============================================================================

class JobStatus(BaseModel):
    """Status of a background job."""
    job_id: str
    status: str  # pending, running, completed, failed
    progress: float  # 0.0 to 1.0
    message: str
    result: Optional[Dict[str, Any]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


# ============================================================================
# WebSocket Models
# ============================================================================

class WSMessage(BaseModel):
    """WebSocket message format."""
    type: str  # progress, notification, error, data
    payload: Dict[str, Any]


# ============================================================================
# API Response Wrappers
# ============================================================================

class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool
    message: str
    data: Optional[Any] = None
    errors: Optional[List[str]] = None


class HealthCheck(BaseModel):
    """Health check response."""
    status: str
    version: str
    timestamp: datetime


# ============================================================================
# Review Models
# ============================================================================

class ReviewStatus(BaseModel):
    """Status of methodology review."""
    status: str = "draft"  # draft, ai_reviewed, human_reviewed, finalized
    last_updated: datetime
    reviewed_by: Optional[str] = None
    comments: Optional[str] = None


class AISuggestion(BaseModel):
    """AI suggestion for methodology improvement."""
    id: str
    type: str  # sequence, missing, grouping, safety, naming
    severity: str  # info, warning, error
    title: str
    description: str
    affected_stages: List[str] = []
    suggestion: str
    auto_fixable: bool = False
    status: str = "pending"  # pending, accepted, rejected, ignored
    created_at: datetime


class StageEdit(BaseModel):
    """Editable stage data."""
    stage_id: str
    name: str
    element_type: str
    zone_id: int
    sequence_order: int
    element_ids: List[int] = []
    is_reviewed: bool = False
    reviewer_notes: Optional[str] = None


class ZoneEdit(BaseModel):
    """Editable zone data."""
    zone_id: int
    name: str
    storey_name: str
    color: Optional[str] = None
    stages: List[StageEdit] = []


class MethodologyReview(BaseModel):
    """Complete methodology review state."""
    file_id: str
    file_name: str
    status: ReviewStatus
    zones: List[ZoneEdit] = []
    suggestions: List[AISuggestion] = []
    unassigned_elements: List[int] = []
    total_elements: int = 0
    assigned_elements: int = 0
    created_at: datetime
    updated_at: datetime


class UpdateStageRequest(BaseModel):
    """Request to update a stage."""
    name: Optional[str] = None
    zone_id: Optional[int] = None
    sequence_order: Optional[int] = None
    element_ids: Optional[List[int]] = None
    is_reviewed: Optional[bool] = None
    reviewer_notes: Optional[str] = None


class CreateStageRequest(BaseModel):
    """Request to create a new stage."""
    name: str
    element_type: str
    zone_id: int
    element_ids: List[int] = []


class CreateZoneRequest(BaseModel):
    """Request to create a new zone."""
    name: str
    storey_name: str


class ApplySuggestionRequest(BaseModel):
    """Request to apply or reject an AI suggestion."""
    action: str  # accept, reject, ignore


class FinalizeRequest(BaseModel):
    """Request to finalize methodology."""
    comments: Optional[str] = None
    reviewed_by: Optional[str] = None


class ReviewResponse(BaseModel):
    """Response containing review data."""
    success: bool
    message: str
    review: Optional[MethodologyReview] = None
