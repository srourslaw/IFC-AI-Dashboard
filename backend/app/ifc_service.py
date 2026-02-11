"""
IFC Service - Core business logic for IFC file operations.
Wraps and extends the original ifc_ai_poc.py functionality.
"""
import hashlib
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import ifcopenshell

try:
    import pandas as pd
except ImportError:
    pd = None

from .config import settings
from .models import (
    ElementCount,
    ElementDetail,
    IFCFileInfo,
    ModelAnalytics,
    SplitStoreyResult,
    StoreyAnalytics,
    StoreyInfo,
    TakeoffStep,
)


@dataclass
class LoadedModel:
    """Represents a loaded IFC model with metadata."""
    file_id: str
    file_path: str
    file_name: str
    ifc: Any  # ifcopenshell.file
    loaded_at: datetime
    size_mb: float


class IFCService:
    """
    Service class for IFC file operations.
    Manages multiple loaded models and provides all IFC-related functionality.
    """

    def __init__(self):
        self._loaded_models: Dict[str, LoadedModel] = {}
        self._current_model_id: Optional[str] = None
        self._hidden_files: Set[str] = set()  # Files removed from UI (but not deleted from disk)
        self.is_loading: bool = False

    # ========================================================================
    # File Management
    # ========================================================================

    def get_available_files(self) -> List[IFCFileInfo]:
        """Get list of available IFC files in the configured directory."""
        files = []
        ifc_dir = settings.IFC_DIRECTORY

        for file_path in ifc_dir.glob("*.ifc"):
            if file_path.is_file():
                file_id = self._generate_file_id(str(file_path))
                # Skip files that have been hidden (removed from UI)
                if file_id in self._hidden_files:
                    continue
                stat = file_path.stat()
                files.append(
                    IFCFileInfo(
                        id=file_id,
                        name=file_path.name,
                        path=str(file_path),
                        size_mb=round(stat.st_size / (1024 * 1024), 2),
                        modified_at=datetime.fromtimestamp(stat.st_mtime),
                        is_loaded=file_id in self._loaded_models,
                    )
                )

        # Sort by name
        files.sort(key=lambda x: x.name)
        return files

    def hide_file(self, file_id: str, file_path: str) -> None:
        """Hide a file from the UI without deleting it from disk."""
        self._hidden_files.add(file_id)

    def unhide_file(self, file_id: str) -> None:
        """Make a hidden file visible again."""
        self._hidden_files.discard(file_id)

    def clear_hidden_files(self) -> None:
        """Clear all hidden files (show all files again)."""
        self._hidden_files.clear()

    def load_model(self, file_path: str) -> Tuple[str, LoadedModel]:
        """Load an IFC model into memory."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"IFC file not found: {file_path}")

        if not path.suffix.lower() == ".ifc":
            raise ValueError(f"Invalid file type: {path.suffix}")

        file_id = self._generate_file_id(file_path)

        # Return cached model if already loaded
        if file_id in self._loaded_models:
            self._current_model_id = file_id
            return file_id, self._loaded_models[file_id]

        # Load the IFC file (this is blocking I/O - caller should use asyncio.to_thread)
        self.is_loading = True
        try:
            ifc = ifcopenshell.open(str(path))
            stat = path.stat()

            model = LoadedModel(
                file_id=file_id,
                file_path=str(path),
                file_name=path.name,
                ifc=ifc,
                loaded_at=datetime.now(),
                size_mb=round(stat.st_size / (1024 * 1024), 2),
            )

            self._loaded_models[file_id] = model
            self._current_model_id = file_id

            return file_id, model
        finally:
            self.is_loading = False

    def unload_model(self, file_id: str) -> bool:
        """Unload a model from memory."""
        if file_id in self._loaded_models:
            del self._loaded_models[file_id]
            if self._current_model_id == file_id:
                self._current_model_id = None
            return True
        return False

    def get_current_model(self) -> Optional[LoadedModel]:
        """Get the currently active model."""
        if self._current_model_id:
            return self._loaded_models.get(self._current_model_id)
        return None

    def set_current_model(self, file_id: str) -> bool:
        """Set the current active model."""
        if file_id in self._loaded_models:
            self._current_model_id = file_id
            return True
        return False

    def get_loaded_models(self) -> List[LoadedModel]:
        """Get all loaded models."""
        return list(self._loaded_models.values())

    # ========================================================================
    # Storey Operations
    # ========================================================================

    def get_storeys(self, file_id: Optional[str] = None) -> List[StoreyInfo]:
        """Get building storeys ordered by elevation."""
        model = self._get_model(file_id)
        storeys = model.ifc.by_type("IfcBuildingStorey")

        result: List[StoreyInfo] = []
        for idx, s in enumerate(storeys):
            elevation = self._safe_float(getattr(s, "Elevation", 0.0))
            name = s.Name or f"Storey_{idx + 1}"

            # Count elements in this storey
            element_count = 0
            contains = getattr(s, "ContainsElements", []) or []
            for rel in contains:
                element_count += len(rel.RelatedElements)

            result.append(
                StoreyInfo(
                    index=idx,
                    name=name,
                    elevation=elevation,
                    element_count=element_count,
                )
            )

        result.sort(key=lambda x: x.elevation)
        # Re-index after sorting
        for idx, storey in enumerate(result):
            storey.index = idx

        return result

    # ========================================================================
    # Element Operations
    # ========================================================================

    def get_element_counts(self, file_id: Optional[str] = None) -> List[ElementCount]:
        """Get element counts by IFC type."""
        model = self._get_model(file_id)
        counts: Dict[str, int] = {}

        for e in model.ifc.by_type("IfcProduct"):
            if e.is_a("IfcOpeningElement"):
                continue
            t = e.is_a()
            counts[t] = counts.get(t, 0) + 1

        total = sum(counts.values())
        result = [
            ElementCount(
                ifc_type=ifc_type,
                count=count,
                percentage=round((count / total) * 100, 2) if total > 0 else 0,
            )
            for ifc_type, count in counts.items()
        ]

        # Sort by count descending
        result.sort(key=lambda x: x.count, reverse=True)
        return result

    def get_elements(
        self,
        file_id: Optional[str] = None,
        ifc_type: Optional[str] = None,
        storey_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 100,
    ) -> Tuple[List[ElementDetail], int]:
        """Get elements with optional filtering and pagination."""
        model = self._get_model(file_id)

        # Build storey mapping
        element_storey_map = self._build_element_storey_map(model.ifc)

        elements: List[ElementDetail] = []

        for e in model.ifc.by_type("IfcProduct"):
            if e.is_a("IfcOpeningElement"):
                continue

            # Apply filters
            if ifc_type and e.is_a() != ifc_type:
                continue

            eid = e.id()
            storey_info = element_storey_map.get(eid, (None, None))

            if storey_name and storey_info[0] != storey_name:
                continue

            predef = None
            if hasattr(e, "PredefinedType"):
                try:
                    predef = str(e.PredefinedType) if e.PredefinedType else None
                except Exception:
                    pass

            elements.append(
                ElementDetail(
                    step_id=eid,
                    ifc_type=e.is_a(),
                    global_id=getattr(e, "GlobalId", None),
                    name=getattr(e, "Name", None),
                    object_type=getattr(e, "ObjectType", None),
                    predefined_type=predef,
                    storey_name=storey_info[0],
                    storey_elevation=storey_info[1],
                )
            )

        total_count = len(elements)

        # Paginate
        start = (page - 1) * page_size
        end = start + page_size
        paginated = elements[start:end]

        return paginated, total_count

    # ========================================================================
    # Takeoff Operations
    # ========================================================================

    def create_cumulative_takeoffs(
        self, file_id: Optional[str] = None, output_dir: Optional[str] = None
    ) -> List[TakeoffStep]:
        """Create cumulative takeoff IFC files."""
        model = self._get_model(file_id)

        if output_dir is None:
            output_dir = str(settings.OUTPUT_DIRECTORY / settings.TAKEOFFS_DIR)

        os.makedirs(output_dir, exist_ok=True)

        storeys = self.get_storeys(file_id)
        if not storeys:
            raise RuntimeError("No IfcBuildingStorey entities found in the model.")

        results: List[TakeoffStep] = []

        for step_idx in range(len(storeys)):
            keep_count = step_idx + 1

            # Clone entire file
            new_ifc = ifcopenshell.file.from_string(model.ifc.to_string())

            # Get storeys in clone, sorted by elevation
            clone_storeys = list(new_ifc.by_type("IfcBuildingStorey"))
            clone_storeys.sort(key=lambda s: self._safe_float(getattr(s, "Elevation", 0.0)))

            storeys_to_keep = set(s.id() for s in clone_storeys[:keep_count])
            storeys_to_remove = [s for s in clone_storeys if s.id() not in storeys_to_keep]

            elements_to_remove = set()
            rels_to_remove = set()

            for s in storeys_to_remove:
                contains = getattr(s, "ContainsElements", []) or []
                for rel in contains:
                    rels_to_remove.add(rel)
                    for prod in rel.RelatedElements:
                        elements_to_remove.add(prod)

            # Remove in order: relations, elements, storeys
            for rel in rels_to_remove:
                try:
                    new_ifc.remove(rel)
                except Exception:
                    pass

            for e in elements_to_remove:
                try:
                    new_ifc.remove(e)
                except Exception:
                    pass

            for s in storeys_to_remove:
                try:
                    new_ifc.remove(s)
                except Exception:
                    pass

            floors_label = [si.name for si in storeys[:keep_count]]
            out_path = os.path.join(output_dir, f"takeoff_step_{keep_count}.ifc")
            new_ifc.write(out_path)

            results.append(
                TakeoffStep(
                    step=keep_count,
                    floors=floors_label,
                    file=out_path,
                    removed_elements=len(elements_to_remove),
                )
            )

        return results

    # ========================================================================
    # Split Storey Operations
    # ========================================================================

    def split_storeys(
        self, file_id: Optional[str] = None, output_dir: Optional[str] = None
    ) -> List[SplitStoreyResult]:
        """Split each storey into its own IFC file."""
        model = self._get_model(file_id)

        if output_dir is None:
            output_dir = str(settings.OUTPUT_DIRECTORY / settings.STOREY_IFCS_DIR)

        os.makedirs(output_dir, exist_ok=True)

        storeys = self.get_storeys(file_id)
        if not storeys:
            raise RuntimeError("No IfcBuildingStorey entities found in the model.")

        results: List[SplitStoreyResult] = []

        for idx, si in enumerate(storeys):
            # Clone entire file
            new_ifc = ifcopenshell.file.from_string(model.ifc.to_string())

            # Get storeys in clone, sorted by elevation
            clone_storeys = list(new_ifc.by_type("IfcBuildingStorey"))
            clone_storeys.sort(key=lambda s: self._safe_float(getattr(s, "Elevation", 0.0)))

            if idx >= len(clone_storeys):
                continue

            storey_to_keep = clone_storeys[idx]
            storeys_to_remove = [s for s in clone_storeys if s.id() != storey_to_keep.id()]

            elements_to_remove = set()
            rels_to_remove = set()

            for s in storeys_to_remove:
                contains = getattr(s, "ContainsElements", []) or []
                for rel in contains:
                    rels_to_remove.add(rel)
                    for prod in rel.RelatedElements:
                        elements_to_remove.add(prod)

            # Remove in order
            for rel in rels_to_remove:
                try:
                    new_ifc.remove(rel)
                except Exception:
                    pass

            for e in elements_to_remove:
                try:
                    new_ifc.remove(e)
                except Exception:
                    pass

            for s in storeys_to_remove:
                try:
                    new_ifc.remove(s)
                except Exception:
                    pass

            safe_name = "".join(
                c if c.isalnum() or c in "-_" else "_" for c in (si.name or f"Storey_{idx + 1}")
            )
            filename = f"storey_{idx + 1}_{safe_name}.ifc"
            out_path = os.path.join(output_dir, filename)
            new_ifc.write(out_path)

            results.append(
                SplitStoreyResult(
                    index=idx + 1,
                    storey_name=si.name,
                    file=out_path,
                    removed_elements=len(elements_to_remove),
                )
            )

        return results

    # ========================================================================
    # Export Operations
    # ========================================================================

    def export_to_excel(
        self, file_id: Optional[str] = None, output_path: Optional[str] = None
    ) -> Tuple[str, int]:
        """Export all elements to Excel file."""
        if pd is None:
            raise RuntimeError("pandas is not installed")

        model = self._get_model(file_id)

        if output_path is None:
            exports_dir = settings.OUTPUT_DIRECTORY / settings.EXPORTS_DIR
            os.makedirs(exports_dir, exist_ok=True)
            output_path = str(exports_dir / f"{model.file_name}_elements.xlsx")

        element_storey_map = self._build_element_storey_map(model.ifc)

        rows: List[Dict[str, Any]] = []

        for e in model.ifc.by_type("IfcProduct"):
            eid = e.id()
            storey_info = element_storey_map.get(eid, (None, None))

            predef = None
            if hasattr(e, "PredefinedType"):
                try:
                    predef = str(e.PredefinedType) if e.PredefinedType else None
                except Exception:
                    pass

            rows.append(
                {
                    "StepId": eid,
                    "IFCType": e.is_a(),
                    "GlobalId": getattr(e, "GlobalId", None),
                    "Name": getattr(e, "Name", None),
                    "ObjectType": getattr(e, "ObjectType", None),
                    "PredefinedType": predef,
                    "StoreyName": storey_info[0],
                    "StoreyElevation": storey_info[1],
                }
            )

        df = pd.DataFrame(rows)
        out_dir = os.path.dirname(output_path)
        if out_dir and not os.path.isdir(out_dir):
            os.makedirs(out_dir, exist_ok=True)

        df.to_excel(output_path, index=False)
        return output_path, len(rows)

    # ========================================================================
    # Analytics
    # ========================================================================

    def get_model_analytics(self, file_id: Optional[str] = None) -> ModelAnalytics:
        """Get comprehensive analytics for a model."""
        model = self._get_model(file_id)

        element_counts = self.get_element_counts(file_id)
        storeys = self.get_storeys(file_id)

        total_elements = sum(ec.count for ec in element_counts)

        # Build storey analytics
        storey_analytics: List[StoreyAnalytics] = []
        element_storey_map = self._build_element_storey_map(model.ifc)

        # Count elements per storey and type
        storey_type_counts: Dict[str, Dict[str, int]] = {}
        for e in model.ifc.by_type("IfcProduct"):
            if e.is_a("IfcOpeningElement"):
                continue
            eid = e.id()
            storey_name = element_storey_map.get(eid, (None, None))[0]
            if storey_name:
                if storey_name not in storey_type_counts:
                    storey_type_counts[storey_name] = {}
                ifc_type = e.is_a()
                storey_type_counts[storey_name][ifc_type] = (
                    storey_type_counts[storey_name].get(ifc_type, 0) + 1
                )

        for storey in storeys:
            type_counts = storey_type_counts.get(storey.name, {})
            storey_analytics.append(
                StoreyAnalytics(
                    name=storey.name,
                    elevation=storey.elevation,
                    element_count=storey.element_count or 0,
                    element_types=type_counts,
                )
            )

        return ModelAnalytics(
            file_name=model.file_name,
            total_elements=total_elements,
            total_storeys=len(storeys),
            element_type_distribution=element_counts,
            storey_analytics=storey_analytics,
            top_element_types=element_counts[:10],
        )

    # ========================================================================
    # Private Helpers
    # ========================================================================

    def _get_model(self, file_id: Optional[str] = None) -> LoadedModel:
        """Get model by ID or current model."""
        if file_id:
            model = self._loaded_models.get(file_id)
            if not model:
                raise ValueError(f"Model not loaded: {file_id}")
            return model

        model = self.get_current_model()
        if not model:
            raise ValueError("No model loaded. Please load an IFC file first.")
        return model

    def _generate_file_id(self, file_path: str) -> str:
        """Generate a unique ID for a file."""
        return hashlib.md5(file_path.encode()).hexdigest()[:12]

    def _safe_float(self, value: Any, default: float = 0.0) -> float:
        """Safely convert value to float."""
        try:
            return float(value) if value is not None else default
        except Exception:
            return default

    def _build_element_storey_map(
        self, ifc: Any
    ) -> Dict[int, Tuple[Optional[str], Optional[float]]]:
        """Build mapping of element ID to (storey_name, storey_elevation)."""
        element_storey_map: Dict[int, Tuple[Optional[str], Optional[float]]] = {}

        for s in ifc.by_type("IfcBuildingStorey"):
            elev = self._safe_float(getattr(s, "Elevation", 0.0))
            name = s.Name or ""
            contains = getattr(s, "ContainsElements", []) or []
            for rel in contains:
                for prod in rel.RelatedElements:
                    element_storey_map[prod.id()] = (name, elev)

        return element_storey_map


# Global service instance
ifc_service = IFCService()
