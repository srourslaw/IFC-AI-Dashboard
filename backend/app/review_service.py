"""
Review Service - AI and rule-based methodology review with persistence.
"""
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import settings
from .models import (
    AISuggestion,
    MethodologyReview,
    ReviewStatus,
    StageEdit,
    ZoneEdit,
)

# Try to import OpenAI
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


# Construction sequence rules (element types in order)
CONSTRUCTION_SEQUENCE = [
    "footings",
    "columns",
    "bracing",
    "beams",
    "slabs",
    "walls",
    "railings",
    "stairs",
]

# Element types that should come before others (safety rules)
SAFETY_DEPENDENCIES = {
    "columns": ["footings"],  # columns need footings first
    "beams": ["columns"],     # beams need columns
    "bracing": ["columns"],   # bracing needs columns
    "slabs": ["beams"],       # slabs need beams
    "railings": ["slabs"],    # railings need slabs
}


class ReviewService:
    """Service for methodology review with AI and rule-based analysis."""

    def __init__(self):
        self._reviews: Dict[str, MethodologyReview] = {}
        self._reviews_dir = settings.OUTPUT_DIRECTORY / "reviews"
        os.makedirs(self._reviews_dir, exist_ok=True)
        self._openai_client = None
        if OPENAI_AVAILABLE and settings.OPENAI_API_KEY:
            self._openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

    # ========================================================================
    # Review Management
    # ========================================================================

    def get_review(self, file_id: str) -> Optional[MethodologyReview]:
        """Get existing review or None."""
        # Check memory first
        if file_id in self._reviews:
            return self._reviews[file_id]

        # Try to load from file
        review_path = self._get_review_path(file_id)
        if review_path.exists():
            try:
                with open(review_path, 'r') as f:
                    data = json.load(f)
                review = MethodologyReview(**data)
                self._reviews[file_id] = review
                return review
            except Exception as e:
                print(f"Error loading review: {e}")

        return None

    def create_review(
        self,
        file_id: str,
        file_name: str,
        methodology_data: Dict[str, Any]
    ) -> MethodologyReview:
        """Create a new review from methodology analysis."""
        now = datetime.now()

        # Convert methodology to editable zones/stages
        zones = []
        all_element_ids = set()

        for zone_data in methodology_data.get("zones", []):
            zone_stages = []
            zone_id = zone_data.get("zone_id", 0)

            # Find stages for this zone
            for stage_data in methodology_data.get("stages", []):
                if stage_data.get("zone_id") == zone_id:
                    stage = StageEdit(
                        stage_id=stage_data.get("stage_id", ""),
                        name=stage_data.get("name", ""),
                        element_type=stage_data.get("element_type", ""),
                        zone_id=zone_id,
                        sequence_order=stage_data.get("sequence_order", 0),
                        element_ids=stage_data.get("element_ids", []),
                        is_reviewed=False,
                    )
                    zone_stages.append(stage)
                    all_element_ids.update(stage.element_ids)

            zone = ZoneEdit(
                zone_id=zone_id,
                name=zone_data.get("zone_name", f"Zone {zone_id}"),
                storey_name=zone_data.get("storey_name", ""),
                stages=zone_stages,
            )
            zones.append(zone)

        review = MethodologyReview(
            file_id=file_id,
            file_name=file_name,
            status=ReviewStatus(status="draft", last_updated=now),
            zones=zones,
            suggestions=[],
            unassigned_elements=[],
            total_elements=methodology_data.get("total_elements", 0),
            assigned_elements=len(all_element_ids),
            created_at=now,
            updated_at=now,
        )

        self._reviews[file_id] = review
        self._save_review(review)

        return review

    def save_review(self, review: MethodologyReview) -> None:
        """Save review to memory and disk."""
        review.updated_at = datetime.now()
        self._reviews[review.file_id] = review
        self._save_review(review)

    def _save_review(self, review: MethodologyReview) -> None:
        """Save review to disk."""
        review_path = self._get_review_path(review.file_id)
        with open(review_path, 'w') as f:
            json.dump(review.model_dump(mode='json'), f, indent=2, default=str)

    def _get_review_path(self, file_id: str) -> Path:
        """Get path to review JSON file."""
        return self._reviews_dir / f"{file_id}_review.json"

    # ========================================================================
    # Rule-Based Analysis
    # ========================================================================

    def run_rule_based_analysis(self, review: MethodologyReview) -> List[AISuggestion]:
        """Run rule-based analysis and return suggestions."""
        suggestions = []

        # Collect all stages flat
        all_stages = []
        for zone in review.zones:
            all_stages.extend(zone.stages)

        # Check 1: Sequence order within zones
        suggestions.extend(self._check_sequence_order(review.zones))

        # Check 2: Safety dependencies
        suggestions.extend(self._check_safety_dependencies(all_stages))

        # Check 3: Missing element assignments
        if review.total_elements > review.assigned_elements:
            missing_count = review.total_elements - review.assigned_elements
            suggestions.append(AISuggestion(
                id=str(uuid.uuid4())[:8],
                type="missing",
                severity="warning",
                title=f"{missing_count} unassigned elements",
                description=f"There are {missing_count} elements in the model that haven't been assigned to any construction stage.",
                affected_stages=[],
                suggestion="Review unassigned elements and add them to appropriate stages, or create new stages for them.",
                auto_fixable=False,
                status="pending",
                created_at=datetime.now(),
            ))

        # Check 4: Empty stages
        suggestions.extend(self._check_empty_stages(all_stages))

        # Check 5: Naming consistency
        suggestions.extend(self._check_naming_consistency(all_stages))

        return suggestions

    def _check_sequence_order(self, zones: List[ZoneEdit]) -> List[AISuggestion]:
        """Check if stages are in correct construction sequence within each zone."""
        suggestions = []

        for zone in zones:
            # Group stages by element type
            type_order = {}
            for stage in zone.stages:
                et = stage.element_type.lower()
                if et in CONSTRUCTION_SEQUENCE:
                    expected_order = CONSTRUCTION_SEQUENCE.index(et)
                    if et not in type_order:
                        type_order[et] = []
                    type_order[et].append((stage.sequence_order, stage.stage_id))

            # Check if element types appear in correct order
            prev_expected = -1
            prev_type = None
            for et in CONSTRUCTION_SEQUENCE:
                if et in type_order:
                    min_actual_order = min(s[0] for s in type_order[et])
                    expected = CONSTRUCTION_SEQUENCE.index(et)

                    if expected < prev_expected and prev_type:
                        suggestions.append(AISuggestion(
                            id=str(uuid.uuid4())[:8],
                            type="sequence",
                            severity="warning",
                            title=f"Sequence issue in Zone {zone.zone_id}",
                            description=f"{et.title()} stages appear after {prev_type.title()} stages, but should typically come before.",
                            affected_stages=[s[1] for s in type_order[et]],
                            suggestion=f"Consider reordering {et} stages to come before {prev_type} stages for proper construction sequence.",
                            auto_fixable=True,
                            status="pending",
                            created_at=datetime.now(),
                        ))

                    prev_expected = expected
                    prev_type = et

        return suggestions

    def _check_safety_dependencies(self, stages: List[StageEdit]) -> List[AISuggestion]:
        """Check if safety dependencies are met."""
        suggestions = []

        # Build map of element types to their earliest sequence order
        type_first_order = {}
        for stage in stages:
            et = stage.element_type.lower()
            if et not in type_first_order or stage.sequence_order < type_first_order[et]:
                type_first_order[et] = stage.sequence_order

        # Check dependencies
        for element_type, required_before in SAFETY_DEPENDENCIES.items():
            if element_type in type_first_order:
                for required in required_before:
                    if required not in type_first_order:
                        suggestions.append(AISuggestion(
                            id=str(uuid.uuid4())[:8],
                            type="safety",
                            severity="error",
                            title=f"Missing prerequisite: {required.title()}",
                            description=f"{element_type.title()} elements are scheduled, but {required.title()} elements are missing from the methodology.",
                            affected_stages=[s.stage_id for s in stages if s.element_type.lower() == element_type],
                            suggestion=f"Add {required.title()} stages before {element_type.title()} stages for safe construction sequence.",
                            auto_fixable=False,
                            status="pending",
                            created_at=datetime.now(),
                        ))
                    elif type_first_order[required] >= type_first_order[element_type]:
                        suggestions.append(AISuggestion(
                            id=str(uuid.uuid4())[:8],
                            type="safety",
                            severity="error",
                            title=f"Safety concern: {element_type.title()} before {required.title()}",
                            description=f"{element_type.title()} stages are scheduled before or same time as {required.title()} stages. This may be unsafe.",
                            affected_stages=[s.stage_id for s in stages if s.element_type.lower() == element_type],
                            suggestion=f"Ensure all {required.title()} stages complete before {element_type.title()} stages begin.",
                            auto_fixable=True,
                            status="pending",
                            created_at=datetime.now(),
                        ))

        return suggestions

    def _check_empty_stages(self, stages: List[StageEdit]) -> List[AISuggestion]:
        """Check for stages with no elements."""
        suggestions = []

        empty_stages = [s for s in stages if len(s.element_ids) == 0]
        if empty_stages:
            suggestions.append(AISuggestion(
                id=str(uuid.uuid4())[:8],
                type="grouping",
                severity="info",
                title=f"{len(empty_stages)} empty stage(s)",
                description=f"Some stages have no elements assigned: {', '.join(s.name for s in empty_stages[:3])}{'...' if len(empty_stages) > 3 else ''}",
                affected_stages=[s.stage_id for s in empty_stages],
                suggestion="Remove empty stages or assign elements to them.",
                auto_fixable=True,
                status="pending",
                created_at=datetime.now(),
            ))

        return suggestions

    def _check_naming_consistency(self, stages: List[StageEdit]) -> List[AISuggestion]:
        """Check for naming consistency issues."""
        suggestions = []

        # Check for duplicate names
        names = [s.name for s in stages]
        duplicates = set([n for n in names if names.count(n) > 1])

        if duplicates:
            suggestions.append(AISuggestion(
                id=str(uuid.uuid4())[:8],
                type="naming",
                severity="info",
                title="Duplicate stage names",
                description=f"Multiple stages share the same name: {', '.join(duplicates)}",
                affected_stages=[s.stage_id for s in stages if s.name in duplicates],
                suggestion="Consider using unique names for each stage for clarity.",
                auto_fixable=False,
                status="pending",
                created_at=datetime.now(),
            ))

        return suggestions

    # ========================================================================
    # AI-Enhanced Analysis (OpenAI)
    # ========================================================================

    def run_ai_analysis(self, review: MethodologyReview) -> List[AISuggestion]:
        """Run AI-enhanced analysis using OpenAI."""
        if not self._openai_client:
            return []

        suggestions = []

        try:
            # Prepare methodology summary for AI
            summary = self._prepare_methodology_summary(review)

            # Call OpenAI
            response = self._openai_client.chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": """You are an expert construction methodology reviewer.
                        Analyze the given erection methodology for a building and provide suggestions for improvement.
                        Focus on:
                        1. Construction sequence safety and feasibility
                        2. Logical grouping of elements
                        3. Zone organization
                        4. Missing considerations

                        Respond in JSON format with an array of suggestions:
                        [{"type": "safety|sequence|grouping|naming", "severity": "error|warning|info", "title": "short title", "description": "detailed description", "suggestion": "what to do"}]

                        Only include actionable, specific suggestions. Maximum 5 suggestions."""
                    },
                    {
                        "role": "user",
                        "content": f"Review this construction erection methodology:\n\n{summary}"
                    }
                ],
                temperature=0.3,
                max_tokens=1000,
            )

            # Parse response
            content = response.choices[0].message.content
            if content:
                # Try to extract JSON from response
                import re
                json_match = re.search(r'\[.*\]', content, re.DOTALL)
                if json_match:
                    ai_suggestions = json.loads(json_match.group())
                    for s in ai_suggestions:
                        suggestions.append(AISuggestion(
                            id=str(uuid.uuid4())[:8],
                            type=s.get("type", "info"),
                            severity=s.get("severity", "info"),
                            title=s.get("title", "AI Suggestion"),
                            description=s.get("description", ""),
                            affected_stages=[],
                            suggestion=s.get("suggestion", ""),
                            auto_fixable=False,
                            status="pending",
                            created_at=datetime.now(),
                        ))
        except Exception as e:
            print(f"AI analysis error: {e}")

        return suggestions

    def _prepare_methodology_summary(self, review: MethodologyReview) -> str:
        """Prepare a text summary of methodology for AI."""
        lines = [
            f"Building: {review.file_name}",
            f"Total Elements: {review.total_elements}",
            f"Assigned Elements: {review.assigned_elements}",
            f"Zones: {len(review.zones)}",
            "",
            "Methodology Breakdown:",
        ]

        for zone in review.zones:
            lines.append(f"\n{zone.name} ({zone.storey_name}):")
            for stage in sorted(zone.stages, key=lambda s: s.sequence_order):
                lines.append(f"  {stage.sequence_order}. {stage.name} - {stage.element_type} ({len(stage.element_ids)} elements)")

        return "\n".join(lines)

    # ========================================================================
    # Stage/Zone Editing
    # ========================================================================

    def update_stage(
        self,
        review: MethodologyReview,
        stage_id: str,
        updates: Dict[str, Any]
    ) -> Tuple[bool, str]:
        """Update a stage with new values."""
        for zone in review.zones:
            for stage in zone.stages:
                if stage.stage_id == stage_id:
                    if "name" in updates and updates["name"]:
                        stage.name = updates["name"]
                    if "zone_id" in updates and updates["zone_id"] is not None:
                        # Move to different zone
                        new_zone_id = updates["zone_id"]
                        if new_zone_id != zone.zone_id:
                            zone.stages.remove(stage)
                            for z in review.zones:
                                if z.zone_id == new_zone_id:
                                    stage.zone_id = new_zone_id
                                    z.stages.append(stage)
                                    break
                    if "sequence_order" in updates and updates["sequence_order"] is not None:
                        stage.sequence_order = updates["sequence_order"]
                    if "element_ids" in updates and updates["element_ids"] is not None:
                        stage.element_ids = updates["element_ids"]
                    if "is_reviewed" in updates and updates["is_reviewed"] is not None:
                        stage.is_reviewed = updates["is_reviewed"]
                    if "reviewer_notes" in updates and updates["reviewer_notes"] is not None:
                        stage.reviewer_notes = updates["reviewer_notes"]

                    self.save_review(review)
                    return True, "Stage updated successfully"

        return False, "Stage not found"

    def create_stage(
        self,
        review: MethodologyReview,
        name: str,
        element_type: str,
        zone_id: int,
        element_ids: List[int]
    ) -> Tuple[bool, str, Optional[StageEdit]]:
        """Create a new stage."""
        # Find the zone
        target_zone = None
        for zone in review.zones:
            if zone.zone_id == zone_id:
                target_zone = zone
                break

        if not target_zone:
            return False, "Zone not found", None

        # Generate stage ID
        max_stage = 0
        for z in review.zones:
            for s in z.stages:
                try:
                    parts = s.stage_id.split(".")
                    if len(parts) == 2:
                        max_stage = max(max_stage, int(parts[0]) * 100 + int(parts[1]))
                except:
                    pass

        new_stage_num = max_stage + 1
        stage_id = f"{zone_id}.{len(target_zone.stages) + 1}"

        stage = StageEdit(
            stage_id=stage_id,
            name=name,
            element_type=element_type,
            zone_id=zone_id,
            sequence_order=len(target_zone.stages) + 1,
            element_ids=element_ids,
            is_reviewed=False,
        )

        target_zone.stages.append(stage)
        review.assigned_elements = self._count_assigned_elements(review)
        self.save_review(review)

        return True, "Stage created successfully", stage

    def delete_stage(self, review: MethodologyReview, stage_id: str) -> Tuple[bool, str]:
        """Delete a stage."""
        for zone in review.zones:
            for stage in zone.stages:
                if stage.stage_id == stage_id:
                    zone.stages.remove(stage)
                    review.assigned_elements = self._count_assigned_elements(review)
                    self.save_review(review)
                    return True, "Stage deleted successfully"

        return False, "Stage not found"

    def create_zone(
        self,
        review: MethodologyReview,
        name: str,
        storey_name: str
    ) -> Tuple[bool, str, Optional[ZoneEdit]]:
        """Create a new zone."""
        # Generate zone ID
        max_zone_id = max((z.zone_id for z in review.zones), default=0)
        new_zone_id = max_zone_id + 1

        zone = ZoneEdit(
            zone_id=new_zone_id,
            name=name,
            storey_name=storey_name,
            stages=[],
        )

        review.zones.append(zone)
        self.save_review(review)

        return True, "Zone created successfully", zone

    def delete_zone(self, review: MethodologyReview, zone_id: int) -> Tuple[bool, str]:
        """Delete a zone (must be empty)."""
        for zone in review.zones:
            if zone.zone_id == zone_id:
                if zone.stages:
                    return False, "Cannot delete zone with stages. Move or delete stages first."
                review.zones.remove(zone)
                self.save_review(review)
                return True, "Zone deleted successfully"

        return False, "Zone not found"

    def _count_assigned_elements(self, review: MethodologyReview) -> int:
        """Count total assigned elements."""
        all_ids = set()
        for zone in review.zones:
            for stage in zone.stages:
                all_ids.update(stage.element_ids)
        return len(all_ids)

    # ========================================================================
    # Finalization
    # ========================================================================

    def finalize_review(
        self,
        review: MethodologyReview,
        reviewed_by: Optional[str] = None,
        comments: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Finalize the methodology review."""
        # Check if there are unresolved error suggestions
        unresolved_errors = [
            s for s in review.suggestions
            if s.severity == "error" and s.status == "pending"
        ]

        if unresolved_errors:
            return False, f"Cannot finalize: {len(unresolved_errors)} unresolved error(s). Please address all errors first."

        review.status.status = "finalized"
        review.status.last_updated = datetime.now()
        review.status.reviewed_by = reviewed_by
        review.status.comments = comments

        self.save_review(review)

        return True, "Methodology finalized successfully"

    def update_status(self, review: MethodologyReview, status: str) -> None:
        """Update review status."""
        review.status.status = status
        review.status.last_updated = datetime.now()
        self.save_review(review)


# Global service instance
review_service = ReviewService()
