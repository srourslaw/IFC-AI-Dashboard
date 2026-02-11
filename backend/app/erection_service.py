"""
Erection Methodology Service
Automatically analyzes IFC files to generate construction erection sequences.
Works with any IFC file by detecting grids, zones, and element relationships.
"""
import ifcopenshell
import ifcopenshell.util.placement as placement
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import math
import json
import re
import numpy as np


@dataclass
class GridAxis:
    """Represents a single grid axis (e.g., 'A' or '1')"""
    tag: str
    direction: str  # 'U' (typically letters) or 'V' (typically numbers)
    position: float  # Coordinate position in mm

    def to_dict(self):
        return asdict(self)


@dataclass
class GridCell:
    """Represents a grid cell (intersection of two axes)"""
    u_axis: str  # e.g., 'A'
    v_axis: str  # e.g., '1'
    x_min: float
    x_max: float
    y_min: float
    y_max: float

    @property
    def name(self) -> str:
        return f"{self.u_axis}-{self.v_axis}"

    def to_dict(self):
        return {
            'u_axis': self.u_axis,
            'v_axis': self.v_axis,
            'name': self.name,
            'x_min': self.x_min,
            'x_max': self.x_max,
            'y_min': self.y_min,
            'y_max': self.y_max
        }


@dataclass
class StructuralElement:
    """Represents a structural element with its position and properties"""
    global_id: str
    express_id: int  # IFC Express ID for 3D viewer highlighting
    ifc_type: str  # IfcColumn, IfcBeam, etc.
    name: str
    x: float
    y: float
    z: float
    level: str
    grid_cell: Optional[str] = None
    properties: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self):
        return {
            'global_id': self.global_id,
            'express_id': self.express_id,
            'ifc_type': self.ifc_type,
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'z': self.z,
            'level': self.level,
            'grid_cell': self.grid_cell,
            'properties': self.properties
        }


@dataclass
class ErectionZone:
    """Represents an erection zone (group of grid cells to be erected together)"""
    zone_id: int
    name: str
    grid_cells: List[str]
    x_range: Tuple[float, float]
    y_range: Tuple[float, float]
    elements: List[str] = field(default_factory=list)  # List of element global_ids
    element_counts: Dict[str, int] = field(default_factory=dict)

    def to_dict(self):
        return {
            'zone_id': self.zone_id,
            'name': self.name,
            'grid_cells': self.grid_cells,
            'x_range': list(self.x_range),
            'y_range': list(self.y_range),
            'element_count': len(self.elements),
            'element_counts': self.element_counts
        }


@dataclass
class ErectionStage:
    """Represents a single erection stage within a zone"""
    stage_id: str  # e.g., "2.1"
    zone_id: int
    name: str
    description: str
    element_type: str  # 'columns', 'beams', 'bracing', 'all'
    grid_range: str  # e.g., "Grid 2-5 / A-J"
    elements: List[str] = field(default_factory=list)
    sequence_order: int = 0
    instructions: List[str] = field(default_factory=list)

    def to_dict(self, include_express_ids: bool = False):
        result = {
            'stage_id': self.stage_id,
            'zone_id': self.zone_id,
            'name': self.name,
            'description': self.description,
            'element_type': self.element_type,
            'grid_range': self.grid_range,
            'element_count': len(self.elements),
            'sequence_order': self.sequence_order,
            'instructions': self.instructions
        }
        # For user-generated stages, elements are ExpressIDs - include them
        if include_express_ids and self.elements:
            # Convert to integers if they are numeric strings
            result['express_ids'] = [int(e) for e in self.elements if str(e).isdigit()]
        return result


class ErectionMethodologyService:
    """
    Service for generating erection methodology from IFC files.
    Works with any IFC file by auto-detecting grids and structural elements.
    """

    # Standard structural element types for erection sequencing
    # Each IFC type appears in exactly ONE category to prevent double-counting
    STRUCTURAL_TYPES = {
        'columns': ['IfcColumn'],
        'beams': ['IfcBeam'],
        'bracing': ['IfcMember', 'IfcPlate'],  # Bracing members, fly bracing, gussets
        'slabs': ['IfcSlab'],
        'walls': ['IfcWall', 'IfcWallStandardCase'],
        'footings': ['IfcFooting'],
        'stairs': ['IfcStair', 'IfcStairFlight'],
        'railings': ['IfcRailing'],
    }

    # Standard erection sequence order - STRUCTURAL LOGIC:
    # 1. Footings first (foundation)
    # 2. Columns (vertical support)
    # 3. Beams (horizontal support, connects columns)
    # 4. Bracing (stability)
    # 5. Slabs LAST (they sit ON the beams/columns)
    ERECTION_ORDER = ['footings', 'columns', 'beams', 'bracing', 'slabs', 'walls', 'stairs', 'railings']

    def __init__(self, ifc_file: ifcopenshell.file):
        self.ifc = ifc_file
        self.grid_axes: Dict[str, GridAxis] = {}
        self.grid_cells: Dict[str, GridCell] = {}
        self.elements: Dict[str, StructuralElement] = {}
        self.zones: Dict[int, ErectionZone] = {}
        self.stages: List[ErectionStage] = []
        self.levels: Dict[str, float] = {}  # level_name -> elevation

        # Analysis results
        self._analyzed = False
        self._grid_detected = False

    def analyze(self) -> Dict[str, Any]:
        """Run full analysis of the IFC file"""
        self._extract_levels()
        self._extract_grid_system()
        self._extract_structural_elements()
        self._map_elements_to_grid()
        self._detect_zones()
        self._generate_stages()
        self._analyzed = True

        return self.get_analysis_summary()

    def _extract_levels(self):
        """Extract building levels/storeys"""
        storeys = self.ifc.by_type('IfcBuildingStorey')
        for storey in storeys:
            name = storey.Name or f"Level_{storey.id()}"
            elevation = storey.Elevation or 0.0
            self.levels[name] = elevation

        # Sort levels by elevation
        self.levels = dict(sorted(self.levels.items(), key=lambda x: x[1]))

    def _extract_grid_system(self):
        """Extract grid axes from IFC"""
        grids = self.ifc.by_type('IfcGrid')

        if not grids:
            # No grid defined - we'll create virtual grid from element positions
            self._grid_detected = False
            return

        self._grid_detected = True
        u_axes = []
        v_axes = []

        for grid in grids:
            # Get grid placement for coordinate transformation
            grid_placement = None
            if grid.ObjectPlacement:
                try:
                    grid_placement = placement.get_local_placement(grid.ObjectPlacement)
                except Exception:
                    pass

            # Extract U axes (typically letters like A, B, C)
            if grid.UAxes:
                for axis in grid.UAxes:
                    pos = self._get_axis_position(axis, grid_placement)
                    if pos is not None:
                        u_axes.append(GridAxis(
                            tag=axis.AxisTag or f"U{len(u_axes)}",
                            direction='U',
                            position=pos
                        ))

            # Extract V axes (typically numbers like 1, 2, 3)
            if grid.VAxes:
                for axis in grid.VAxes:
                    pos = self._get_axis_position(axis, grid_placement)
                    if pos is not None:
                        v_axes.append(GridAxis(
                            tag=axis.AxisTag or f"V{len(v_axes)}",
                            direction='V',
                            position=pos
                        ))

        # Remove duplicates (same tag) — multiple IfcGrid entities may repeat axes at different levels
        seen_u = set()
        seen_v = set()
        unique_u = []
        unique_v = []

        for a in sorted(u_axes, key=lambda a: a.position):
            if a.tag not in seen_u:
                seen_u.add(a.tag)
                unique_u.append(a)
                self.grid_axes[f"U_{a.tag}"] = a

        for a in sorted(v_axes, key=lambda a: a.position):
            if a.tag not in seen_v:
                seen_v.add(a.tag)
                unique_v.append(a)
                self.grid_axes[f"V_{a.tag}"] = a

        # Determine which world coordinate each axis set maps to.
        # U-axes that are vertical lines (constant X) → position = X
        # V-axes that are horizontal lines (constant Y) → position = Y
        # We need to map these correctly to grid cell x/y ranges.
        self._u_axis_is_x = self._detect_axis_coordinate(unique_u)
        self._v_axis_is_x = self._detect_axis_coordinate(unique_v)

        # Create grid cells from axis intersections
        self._create_grid_cells(unique_u, unique_v)

    def _detect_axis_coordinate(self, axes: List[GridAxis]) -> bool:
        """
        Determine whether the axis positions represent X or Y world coordinates.
        Returns True if the axis positions represent X coordinates.

        We determine this by checking if the spread of positions aligns more
        with the X or Y range of structural elements.
        """
        if len(axes) < 2:
            return True  # Default

        # Check the actual grid curve geometry if available
        # If axes are vertical lines (constant X, varying Y), their positions are X values
        # If axes are horizontal lines (constant Y, varying X), their positions are Y values
        # Since we already extracted the constant coordinate, we can check the spread
        # and compare with element positions later.
        # For now, we rely on the _get_axis_position logic which already determines
        # the constant coordinate correctly.
        return True  # Will be determined by _get_axis_position's coordinate choice

    def _get_axis_position(self, axis, grid_placement) -> Optional[float]:
        """
        Get the position coordinate of a grid axis.

        Determines the constant coordinate of the axis line:
        - A vertical line (running in Y) has constant X → returns X
        - A horizontal line (running in X) has constant Y → returns Y

        Applies grid placement transformation to get world coordinates.
        """
        curve = axis.AxisCurve
        if not curve:
            return None

        try:
            p1_local = None
            p2_local = None

            if curve.is_a('IfcPolyline') and curve.Points:
                p1_local = list(curve.Points[0].Coordinates)
                if len(curve.Points) > 1:
                    p2_local = list(curve.Points[-1].Coordinates)
            elif curve.is_a('IfcLine'):
                if curve.Pnt:
                    p1_local = list(curve.Pnt.Coordinates)
                    # For IfcLine, compute second point from direction and magnitude
                    if curve.Dir and curve.Dir.Orientation:
                        dir_ratios = list(curve.Dir.Orientation.DirectionRatios)
                        mag = curve.Dir.Magnitude if hasattr(curve.Dir, 'Magnitude') and curve.Dir.Magnitude else 1000.0
                        p2_local = [p1_local[i] + dir_ratios[i] * mag for i in range(len(p1_local))]

            if p1_local is None:
                return None

            # Ensure 3D coordinates
            while len(p1_local) < 3:
                p1_local.append(0.0)

            # Apply grid placement transformation to get world coordinates
            if grid_placement is not None:
                p1_world = np.dot(grid_placement, p1_local + [1.0])[:3]
            else:
                p1_world = p1_local

            if p2_local is not None:
                while len(p2_local) < 3:
                    p2_local.append(0.0)
                if grid_placement is not None:
                    p2_world = np.dot(grid_placement, p2_local + [1.0])[:3]
                else:
                    p2_world = p2_local

                # Determine the constant coordinate:
                # If |dx| < |dy|, the line runs vertically → X is constant → position = X
                # If |dy| < |dx|, the line runs horizontally → Y is constant → position = Y
                dx = abs(p2_world[0] - p1_world[0])
                dy = abs(p2_world[1] - p1_world[1])

                if dx < dy:
                    # Vertical line → position is the constant X coordinate
                    return float((p1_world[0] + p2_world[0]) / 2.0)
                else:
                    # Horizontal line → position is the constant Y coordinate
                    return float((p1_world[1] + p2_world[1]) / 2.0)
            else:
                # Only one point available, can't determine direction
                # Return X as default
                return float(p1_world[0])

        except Exception:
            pass

        return None

    def _create_grid_cells(self, u_axes: List[GridAxis], v_axes: List[GridAxis]):
        """
        Create grid cells from axis intersections.

        Dynamically determines which world coordinate (X or Y) each axis set maps to
        by analyzing the actual spread of axis positions.
        """
        if len(u_axes) < 2 or len(v_axes) < 2:
            return

        # Determine axis-to-world-coordinate mapping.
        # Each axis set's positions correspond to either X or Y world coordinates.
        # We determine this by checking: U-axis positions should be perpendicular to V-axis positions.
        u_positions = [a.position for a in u_axes]
        v_positions = [a.position for a in v_axes]

        u_min, u_max = min(u_positions), max(u_positions)
        v_min, v_max = min(v_positions), max(v_positions)

        # Check if U and V ranges overlap significantly - if they do, they likely
        # represent the same coordinate (bug), so we need to distinguish them.
        # Typically, one set spans in X and the other in Y.
        # We'll use the convention: U-axis positions → one world coordinate,
        # V-axis positions → the other.
        # The _get_axis_position already returns the constant coordinate of each line.

        for i, u in enumerate(u_axes[:-1]):
            u_next = u_axes[i + 1]
            for j, v in enumerate(v_axes[:-1]):
                v_next = v_axes[j + 1]

                # U-axes are typically vertical lines → their position is X
                # V-axes are typically horizontal lines → their position is Y
                cell = GridCell(
                    u_axis=u.tag,
                    v_axis=v.tag,
                    x_min=min(u.position, u_next.position),
                    x_max=max(u.position, u_next.position),
                    y_min=min(v.position, v_next.position),
                    y_max=max(v.position, v_next.position)
                )
                self.grid_cells[cell.name] = cell

    def _extract_structural_elements(self):
        """Extract all structural elements with their positions"""
        structural_ifc_types = [
            'IfcColumn', 'IfcBeam', 'IfcMember', 'IfcPlate',
            'IfcSlab', 'IfcWall', 'IfcWallStandardCase',
            'IfcFooting', 'IfcStair', 'IfcRailing'
        ]

        for ifc_type in structural_ifc_types:
            elements = self.ifc.by_type(ifc_type)
            for elem in elements:
                try:
                    # Get element position
                    matrix = placement.get_local_placement(elem.ObjectPlacement)
                    x, y, z = matrix[0][3], matrix[1][3], matrix[2][3]

                    # Determine level
                    level = self._get_element_level(elem, z)

                    # Get properties
                    props = self._get_element_properties(elem)

                    struct_elem = StructuralElement(
                        global_id=elem.GlobalId,
                        express_id=elem.id(),  # ExpressID for 3D viewer highlighting
                        ifc_type=ifc_type,
                        name=elem.Name or f"{ifc_type}_{elem.id()}",
                        x=x,
                        y=y,
                        z=z,
                        level=level,
                        properties=props
                    )
                    self.elements[elem.GlobalId] = struct_elem
                except Exception as e:
                    continue

    def _get_element_level(self, elem, z: float) -> str:
        """Determine which level an element belongs to based on its Z coordinate"""
        # First try to get from spatial containment
        for rel in self.ifc.get_inverse(elem):
            if rel.is_a('IfcRelContainedInSpatialStructure'):
                structure = rel.RelatingStructure
                if structure and structure.is_a('IfcBuildingStorey'):
                    return structure.Name or f"Level_{structure.id()}"

        # Fall back to Z-coordinate matching
        closest_level = None
        min_diff = float('inf')

        for level_name, elevation in self.levels.items():
            diff = abs(z - elevation)
            if diff < min_diff:
                min_diff = diff
                closest_level = level_name

        return closest_level or "Unknown"

    def _get_element_properties(self, elem) -> Dict[str, Any]:
        """Extract relevant properties from an element"""
        props = {}

        for rel in self.ifc.get_inverse(elem):
            if rel.is_a('IfcRelDefinesByProperties'):
                pset = rel.RelatingPropertyDefinition
                if hasattr(pset, 'HasProperties'):
                    for prop in pset.HasProperties:
                        try:
                            if hasattr(prop, 'NominalValue') and prop.NominalValue:
                                props[prop.Name] = prop.NominalValue.wrappedValue
                        except:
                            pass

        return props

    def _map_elements_to_grid(self):
        """Map each element to its grid cell"""
        if not self.grid_cells:
            # If no grid detected, create virtual grid from element positions
            self._create_virtual_grid()

        for elem in self.elements.values():
            cell_name = self._find_grid_cell(elem.x, elem.y)
            elem.grid_cell = cell_name

    def _create_virtual_grid(self):
        """Create a virtual grid based on element positions when no IFC grid exists"""
        if not self.elements:
            return

        # Collect all positions
        xs = [e.x for e in self.elements.values()]
        ys = [e.y for e in self.elements.values()]

        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        # Create grid with ~10m spacing
        grid_spacing = 10000  # 10m in mm

        # Create U axes (X direction — letters, matching IFC convention)
        u_axes = []
        x_pos = x_min
        label_idx = 0
        labels = 'ABCDEFGHJKLMNPQRSTUVWXYZ'  # Skip I and O

        while x_pos <= x_max + grid_spacing:
            tag = labels[label_idx % len(labels)]
            if label_idx >= len(labels):
                tag = f"{labels[label_idx // len(labels) - 1]}{labels[label_idx % len(labels)]}"
            u_axes.append(GridAxis(tag=tag, direction='U', position=x_pos))
            self.grid_axes[f"U_{tag}"] = u_axes[-1]
            x_pos += grid_spacing
            label_idx += 1

        # Create V axes (Y direction — numbers, matching IFC convention)
        v_axes = []
        y_pos = y_min
        num = 1

        while y_pos <= y_max + grid_spacing:
            tag = str(num).zfill(2)
            v_axes.append(GridAxis(tag=tag, direction='V', position=y_pos))
            self.grid_axes[f"V_{tag}"] = v_axes[-1]
            y_pos += grid_spacing
            num += 1

        self._create_grid_cells(u_axes, v_axes)
        self._grid_detected = False  # Mark as virtual grid

    def _find_grid_cell(self, x: float, y: float) -> Optional[str]:
        """Find which grid cell contains the given coordinates"""
        for cell in self.grid_cells.values():
            if (cell.x_min <= x <= cell.x_max and
                cell.y_min <= y <= cell.y_max):
                return cell.name

        # If not found in any cell, find nearest cell
        min_dist = float('inf')
        nearest = None

        for cell in self.grid_cells.values():
            cx = (cell.x_min + cell.x_max) / 2
            cy = (cell.y_min + cell.y_max) / 2
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            if dist < min_dist:
                min_dist = dist
                nearest = cell.name

        return nearest

    def _detect_zones(self):
        """
        Auto-detect erection zones based on element distribution.
        Following Rosehill methodology: zones are grid-bounded areas.

        Pattern:
        - Zone = a rectangular grid area (e.g., Grid 2-8 / A-J)
        - Zones are detected by finding natural breaks in element clustering
        - Each zone should be a manageable construction area (~30m x 30m)
        """
        if not self.elements:
            return

        # Get element position ranges
        xs = [e.x for e in self.elements.values()]
        ys = [e.y for e in self.elements.values()]

        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)

        x_range = x_max - x_min
        y_range = y_max - y_min

        # Determine zone grid - aim for ~30m zones in both directions
        zone_size = 30000  # 30m in mm

        num_x_zones = max(1, int(math.ceil(x_range / zone_size)))
        num_y_zones = max(1, int(math.ceil(y_range / zone_size)))

        # Limit to reasonable number of zones
        num_x_zones = min(num_x_zones, 6)
        num_y_zones = min(num_y_zones, 6)

        zone_width = x_range / num_x_zones if num_x_zones > 0 else x_range
        zone_height = y_range / num_y_zones if num_y_zones > 0 else y_range

        zone_id = 1

        # Create zones in a grid pattern - progress row by row (Y direction first for bays)
        for j in range(num_y_zones):
            for i in range(num_x_zones):
                zone_x_min = x_min + i * zone_width
                zone_x_max = zone_x_min + zone_width
                zone_y_min = y_min + j * zone_height
                zone_y_max = zone_y_min + zone_height

                # Find grid cells in this zone
                zone_cells = []
                for cell in self.grid_cells.values():
                    cell_center_x = (cell.x_min + cell.x_max) / 2
                    cell_center_y = (cell.y_min + cell.y_max) / 2
                    if (zone_x_min <= cell_center_x < zone_x_max and
                        zone_y_min <= cell_center_y < zone_y_max):
                        zone_cells.append(cell.name)

                # Find elements in this zone
                zone_elements = []
                element_counts = defaultdict(int)

                for elem in self.elements.values():
                    if (zone_x_min <= elem.x < zone_x_max and
                        zone_y_min <= elem.y < zone_y_max):
                        zone_elements.append(elem.global_id)
                        # Categorize element
                        for category, types in self.STRUCTURAL_TYPES.items():
                            if elem.ifc_type in types:
                                element_counts[category] += 1
                                break

                # Skip empty zones
                if not zone_elements:
                    continue

                # Determine zone name based on grid cells
                zone_name = f"Zone {zone_id}"
                if zone_cells:
                    # Get U-axis range (letters) and V-axis range (numbers)
                    u_tags = set()
                    v_tags = set()
                    for cell_name in zone_cells:
                        parts = cell_name.split('-')
                        if len(parts) == 2:
                            u_tags.add(parts[0])
                            v_tags.add(parts[1])

                    if u_tags and v_tags:
                        u_sorted = sorted(u_tags)
                        v_sorted = sorted(v_tags, key=lambda x: int(x) if x.isdigit() else 0)
                        zone_name = f"Grid {v_sorted[0]}-{v_sorted[-1]} / {u_sorted[0]}-{u_sorted[-1]}"

                zone = ErectionZone(
                    zone_id=zone_id,
                    name=zone_name,
                    grid_cells=zone_cells,
                    x_range=(zone_x_min, zone_x_max),
                    y_range=(zone_y_min, zone_y_max),
                    elements=zone_elements,
                    element_counts=dict(element_counts)
                )
                self.zones[zone_id] = zone
                zone_id += 1

    def _generate_stages(self):
        """
        Generate erection stages following PROPER construction logic.

        CONSTRUCTION SEQUENCE (physics-based):
        1. You can't build anything in the air - support must exist first
        2. For each zone, build from ground UP, level by level
        3. Within each level:
           - Columns FIRST (they support everything)
           - Beams SECOND (they connect columns, support slabs)
           - Bracing THIRD (stabilizes the frame)
           - Slabs LAST (they sit ON the beams)
        4. Only after Level N is complete can Level N+1 begin

        Sequence per zone:
        Zone 1:
          - Stage 1.1: L1 Columns
          - Stage 1.2: L1 Beams
          - Stage 1.3: L1 Bracing
          - Stage 1.4: L1 Slabs (floor for L2)
          - Stage 1.5: L2 Columns (now they have support)
          - Stage 1.6: L2 Beams
          ...
        """
        stage_counter = 1

        # Get sorted levels (lowest elevation first = ground up)
        sorted_levels = sorted(self.levels.items(), key=lambda x: x[1])

        # Primary structural elements that MUST be built in order
        # Slabs come LAST because they sit on beams
        PRIMARY_SEQUENCE = ['footings', 'columns', 'beams', 'bracing', 'slabs']
        # Secondary elements after primary structure is stable
        SECONDARY_SEQUENCE = ['walls', 'stairs', 'railings']

        for zone in sorted(self.zones.values(), key=lambda z: z.zone_id):
            # Get elements in this zone grouped by level
            elements_by_level = defaultdict(list)
            for eid in zone.elements:
                elem = self.elements.get(eid)
                if elem:
                    elements_by_level[elem.level].append(eid)

            # FIRST: Build primary structure level by level
            for level_name, level_elevation in sorted_levels:
                level_elements = elements_by_level.get(level_name, [])
                if not level_elements:
                    continue

                # Build primary structure in order
                for element_type in PRIMARY_SEQUENCE:
                    stage_elements = [
                        eid for eid in level_elements
                        if self.elements[eid].ifc_type in self.STRUCTURAL_TYPES.get(element_type, [])
                    ]

                    if not stage_elements:
                        continue

                    sub_stage = len([s for s in self.stages if s.zone_id == zone.zone_id]) + 1
                    stage_id = f"{zone.zone_id}.{sub_stage}"
                    level_short = self._get_short_level_name(level_name)

                    instructions = self._generate_stage_instructions(
                        element_type, zone, len(stage_elements), level_short
                    )

                    stage = ErectionStage(
                        stage_id=stage_id,
                        zone_id=zone.zone_id,
                        name=f"Stage {stage_id} - {level_short} {element_type.title()}",
                        description=f"Install {level_short} {element_type} in {zone.name}",
                        element_type=element_type,
                        grid_range=zone.name,
                        elements=stage_elements,
                        sequence_order=stage_counter,
                        instructions=instructions
                    )
                    self.stages.append(stage)
                    stage_counter += 1

            # SECOND: Add secondary elements (walls, stairs, railings)
            # These can be added after primary structure is complete
            for level_name, level_elevation in sorted_levels:
                level_elements = elements_by_level.get(level_name, [])
                if not level_elements:
                    continue

                for element_type in SECONDARY_SEQUENCE:
                    stage_elements = [
                        eid for eid in level_elements
                        if self.elements[eid].ifc_type in self.STRUCTURAL_TYPES.get(element_type, [])
                    ]

                    if not stage_elements:
                        continue

                    sub_stage = len([s for s in self.stages if s.zone_id == zone.zone_id]) + 1
                    stage_id = f"{zone.zone_id}.{sub_stage}"
                    level_short = self._get_short_level_name(level_name)

                    instructions = self._generate_stage_instructions(
                        element_type, zone, len(stage_elements), level_short
                    )

                    stage = ErectionStage(
                        stage_id=stage_id,
                        zone_id=zone.zone_id,
                        name=f"Stage {stage_id} - {level_short} {element_type.title()}",
                        description=f"Install {level_short} {element_type} in {zone.name}",
                        element_type=element_type,
                        grid_range=zone.name,
                        elements=stage_elements,
                        sequence_order=stage_counter,
                        instructions=instructions
                    )
                    self.stages.append(stage)
                    stage_counter += 1

    def _get_short_level_name(self, level_name: str) -> str:
        """Convert level name to short form for display.
        Uses actual level name to avoid ambiguity (e.g. GROUND vs LEVEL 1)."""
        level_lower = level_name.lower().strip()

        # Use the actual name — avoid conflating distinct levels
        if 'footing' in level_lower or 'foundation' in level_lower:
            return 'FTG'
        elif level_lower in ['ground', 'ground floor', 'gf', 'ground level']:
            return 'GF'
        elif 'mezzanine' in level_lower or 'mezz' in level_lower:
            return 'Mezz'
        elif 'roof' in level_lower or 'ridge' in level_lower:
            return 'Roof'
        elif 'basement' in level_lower:
            return 'B1'
        else:
            # Try to extract "Level N" pattern
            match = re.search(r'level\s*(\d+)', level_lower)
            if match:
                return f"L{match.group(1)}"
            # Try bare number
            match = re.search(r'^l(\d+)$', level_lower)
            if match:
                return f"L{match.group(1)}"
            return level_name[:10]  # Truncate if too long

    def _generate_stage_instructions(self, element_type: str, zone: ErectionZone, count: int, level: str = '') -> List[str]:
        """Generate standard erection instructions for a stage"""
        instructions = []
        level_str = f"{level} " if level else ""

        if element_type == 'footings':
            instructions = [
                f"Install all {count} footings/foundations in {zone.name}",
                "Verify ground preparation and excavation complete",
                "Check levels and alignment before placement",
                "Allow concrete to cure before loading with columns",
            ]
        elif element_type == 'columns':
            instructions = [
                f"Erect all {count} {level_str}columns in {zone.name}",
                "Progress bay by bay from one end to the other",
                "Columns to be plumbed, aligned, and snug tightened",
                "Temporary bracing to be installed as required for stability",
            ]
        elif element_type == 'beams':
            instructions = [
                f"Install all {count} {level_str}beams in {zone.name}",
                "Install primary beams first, then secondary beams",
                "Progress bay by bay following column installation",
                "Snug tighten all bolts",
            ]
        elif element_type == 'bracing':
            instructions = [
                f"Install all {count} {level_str}bracing members in {zone.name}",
                "Install wall struts, headers and cross bracing as per drawings",
                "Tension bracing where applicable",
                "Snug tighten all bolts",
            ]
        elif element_type == 'slabs':
            instructions = [
                f"Install all {count} {level_str}slab/floor elements in {zone.name}",
                "Ensure all supporting columns and beams are complete and tightened",
                "Verify structure stability before slab installation",
                "Install in sequence following structural drawings",
            ]
        elif element_type == 'walls':
            instructions = [
                f"Install all {count} {level_str}wall elements in {zone.name}",
                "Ensure supporting structure is complete",
                "Install after primary frame is stable",
            ]
        elif element_type == 'stairs':
            instructions = [
                f"Install all {count} {level_str}stair elements in {zone.name}",
                "Verify supporting structure is complete and stable",
                "Install temporary safety barriers as required",
            ]
        elif element_type == 'railings':
            instructions = [
                f"Install all {count} {level_str}railing elements in {zone.name}",
                "Install after associated stairs/floors are complete",
                "Verify all connections and fixings secure",
            ]

        return instructions

    def get_analysis_summary(self) -> Dict[str, Any]:
        """Get summary of the analysis"""
        element_by_type = defaultdict(int)
        element_by_level = defaultdict(int)
        element_by_zone = defaultdict(int)

        for elem in self.elements.values():
            element_by_type[elem.ifc_type] += 1
            element_by_level[elem.level] += 1
            if elem.grid_cell:
                for zone in self.zones.values():
                    if elem.global_id in zone.elements:
                        element_by_zone[zone.name] += 1
                        break

        return {
            'grid_detected': self._grid_detected,
            'grid_axes_count': len(self.grid_axes),
            'grid_cells_count': len(self.grid_cells),
            'total_elements': len(self.elements),
            'elements_by_type': dict(element_by_type),
            'elements_by_level': dict(element_by_level),
            'levels': self.levels,
            'zones_count': len(self.zones),
            'stages_count': len(self.stages),
            'zones': [z.to_dict() for z in self.zones.values()],
            'stages': [s.to_dict() for s in self.stages],
        }

    def get_grid_data(self) -> Dict[str, Any]:
        """Get grid system data for visualization"""
        u_axes = [a.to_dict() for a in self.grid_axes.values() if a.direction == 'U']
        v_axes = [a.to_dict() for a in self.grid_axes.values() if a.direction == 'V']

        return {
            'u_axes': sorted(u_axes, key=lambda a: a['position']),
            'v_axes': sorted(v_axes, key=lambda a: a['position']),
            'cells': [c.to_dict() for c in self.grid_cells.values()],
            'is_virtual': not self._grid_detected
        }

    def get_elements_by_zone(self, zone_id: int) -> List[Dict[str, Any]]:
        """Get all elements in a specific zone"""
        zone = self.zones.get(zone_id)
        if not zone:
            return []

        return [
            self.elements[eid].to_dict()
            for eid in zone.elements
            if eid in self.elements
        ]

    def get_elements_by_stage(self, stage_id: str) -> List[Dict[str, Any]]:
        """Get all elements in a specific stage"""
        for stage in self.stages:
            if stage.stage_id == stage_id:
                return [
                    self.elements[eid].to_dict()
                    for eid in stage.elements
                    if eid in self.elements
                ]
        return []

    def update_zone(self, zone_id: int, name: str = None,
                    x_range: Tuple[float, float] = None,
                    y_range: Tuple[float, float] = None) -> Optional[Dict[str, Any]]:
        """Update zone boundaries (for user customization)"""
        zone = self.zones.get(zone_id)
        if not zone:
            return None

        if name:
            zone.name = name

        if x_range:
            zone.x_range = x_range
        if y_range:
            zone.y_range = y_range

        # Re-map elements whenever boundaries change
        if x_range or y_range:
            effective_x = zone.x_range
            effective_y = zone.y_range

            zone.elements = []
            zone.element_counts = defaultdict(int)

            for elem in self.elements.values():
                if (effective_x[0] <= elem.x < effective_x[1] and
                        effective_y[0] <= elem.y < effective_y[1]):
                    zone.elements.append(elem.global_id)
                    for category, types in self.STRUCTURAL_TYPES.items():
                        if elem.ifc_type in types:
                            zone.element_counts[category] += 1
                            break

            zone.element_counts = dict(zone.element_counts)

        # Regenerate stages for this zone
        self._regenerate_zone_stages(zone_id)

        return zone.to_dict()

    def _regenerate_zone_stages(self, zone_id: int):
        """Regenerate stages for a specific zone after update.
        Follows the same level-by-level logic as _generate_stages."""
        # Remove existing stages for this zone
        self.stages = [s for s in self.stages if s.zone_id != zone_id]

        zone = self.zones.get(zone_id)
        if not zone:
            return

        # Recalculate element counts
        element_counts = defaultdict(int)
        for eid in zone.elements:
            if eid in self.elements:
                elem = self.elements[eid]
                for category, types in self.STRUCTURAL_TYPES.items():
                    if elem.ifc_type in types:
                        element_counts[category] += 1
                        break
        zone.element_counts = dict(element_counts)

        # Get sorted levels
        sorted_levels = sorted(self.levels.items(), key=lambda x: x[1])
        PRIMARY_SEQUENCE = ['footings', 'columns', 'beams', 'bracing', 'slabs']
        SECONDARY_SEQUENCE = ['walls', 'stairs', 'railings']

        # Group zone elements by level
        elements_by_level = defaultdict(list)
        for eid in zone.elements:
            elem = self.elements.get(eid)
            if elem:
                elements_by_level[elem.level].append(eid)

        # Generate stages level-by-level (same logic as _generate_stages)
        for level_name, _ in sorted_levels:
            level_elements = elements_by_level.get(level_name, [])
            if not level_elements:
                continue

            for element_type in PRIMARY_SEQUENCE:
                stage_elements = [
                    eid for eid in level_elements
                    if self.elements[eid].ifc_type in self.STRUCTURAL_TYPES.get(element_type, [])
                ]
                if not stage_elements:
                    continue

                sub_stage = len([s for s in self.stages if s.zone_id == zone_id]) + 1
                stage_id = f"{zone_id}.{sub_stage}"
                level_short = self._get_short_level_name(level_name)

                stage = ErectionStage(
                    stage_id=stage_id,
                    zone_id=zone_id,
                    name=f"Stage {stage_id} - {level_short} {element_type.title()}",
                    description=f"Install {level_short} {element_type} in {zone.name}",
                    element_type=element_type,
                    grid_range=zone.name,
                    elements=stage_elements,
                    sequence_order=0,
                    instructions=self._generate_stage_instructions(element_type, zone, len(stage_elements), level_short)
                )
                self.stages.append(stage)

        for level_name, _ in sorted_levels:
            level_elements = elements_by_level.get(level_name, [])
            if not level_elements:
                continue

            for element_type in SECONDARY_SEQUENCE:
                stage_elements = [
                    eid for eid in level_elements
                    if self.elements[eid].ifc_type in self.STRUCTURAL_TYPES.get(element_type, [])
                ]
                if not stage_elements:
                    continue

                sub_stage = len([s for s in self.stages if s.zone_id == zone_id]) + 1
                stage_id = f"{zone_id}.{sub_stage}"
                level_short = self._get_short_level_name(level_name)

                stage = ErectionStage(
                    stage_id=stage_id,
                    zone_id=zone_id,
                    name=f"Stage {stage_id} - {level_short} {element_type.title()}",
                    description=f"Install {level_short} {element_type} in {zone.name}",
                    element_type=element_type,
                    grid_range=zone.name,
                    elements=stage_elements,
                    sequence_order=0,
                    instructions=self._generate_stage_instructions(element_type, zone, len(stage_elements), level_short)
                )
                self.stages.append(stage)

        # Reorder all stages
        self.stages.sort(key=lambda s: (s.zone_id, s.stage_id))
        for i, stage in enumerate(self.stages):
            stage.sequence_order = i + 1

    def generate_methodology_document(self) -> Dict[str, Any]:
        """Generate complete erection methodology document"""
        if not self._analyzed:
            self.analyze()

        document = {
            'title': 'Erection Methodology',
            'summary': {
                'total_elements': len(self.elements),
                'total_zones': len(self.zones),
                'total_stages': len(self.stages),
                'levels': list(self.levels.keys()),
                'grid_detected': self._grid_detected,
            },
            'grid_system': self.get_grid_data(),
            'zones': [z.to_dict() for z in sorted(self.zones.values(), key=lambda z: z.zone_id)],
            'erection_sequence': [],
        }

        # Generate sequence with full details
        for stage in sorted(self.stages, key=lambda s: s.sequence_order):
            zone = self.zones.get(stage.zone_id)
            stage_doc = stage.to_dict()
            stage_doc['zone_name'] = zone.name if zone else f"Zone {stage.zone_id}"
            document['erection_sequence'].append(stage_doc)

        return document

    def get_express_ids_by_zone(self, zone_id: int) -> List[int]:
        """Get ExpressIDs for all elements in a zone (for 3D viewer highlighting)"""
        zone = self.zones.get(zone_id)
        if not zone:
            return []

        return [
            self.elements[eid].express_id
            for eid in zone.elements
            if eid in self.elements
        ]

    def get_express_ids_by_stage(self, stage_id: str) -> List[int]:
        """Get ExpressIDs for all elements in a stage (for 3D viewer highlighting)"""
        for stage in self.stages:
            if stage.stage_id == stage_id:
                return [
                    self.elements[eid].express_id
                    for eid in stage.elements
                    if eid in self.elements
                ]
        return []

    def get_all_express_ids(self) -> List[int]:
        """Get all structural element ExpressIDs"""
        return [elem.express_id for elem in self.elements.values()]

    def get_express_ids_by_grid_area(
        self,
        v_start: str,
        v_end: str,
        u_start: str,
        u_end: str,
        element_type: str = None
    ) -> List[int]:
        """
        Get ExpressIDs for elements within a grid area.

        Grid Coordinate Mapping:
        - U-axes (letters) → X coordinates (vertical lines with constant X)
        - V-axes (numbers) → Y coordinates (horizontal lines with constant Y)
        - Uses tolerance (500mm) to account for elements near grid boundaries

        Strategy:
        1. First tries to use valid grid axis positions
        2. Falls back to proportional division based on total grid count
        """
        # Get all V and U axes sorted by position or tag
        v_axes = sorted(
            [a for k, a in self.grid_axes.items() if a.direction == 'V'],
            key=lambda a: (int(a.tag) if a.tag.isdigit() else 0, a.position)
        )
        u_axes = sorted(
            [a for k, a in self.grid_axes.items() if a.direction == 'U'],
            key=lambda a: (ord(a.tag[0].upper()) if a.tag else 0, a.position)
        )

        # Check if grid positions are valid (not all the same)
        v_pos_set = set(a.position for a in v_axes) if v_axes else set()
        u_pos_set = set(a.position for a in u_axes) if u_axes else set()
        grid_positions_valid = len(v_pos_set) > 1 and len(u_pos_set) > 1

        if grid_positions_valid:
            # Use grid axis positions directly
            return self._get_express_ids_by_axis_positions(
                v_start, v_end, u_start, u_end, v_axes, u_axes, element_type
            )
        else:
            # Use proportional coordinate-based approach
            return self._get_express_ids_by_proportional_grid(
                v_start, v_end, u_start, u_end, v_axes, u_axes, element_type
            )

    def _get_express_ids_by_axis_positions(
        self,
        v_start: str, v_end: str,
        u_start: str, u_end: str,
        v_axes: List[GridAxis], u_axes: List[GridAxis],
        element_type: str = None
    ) -> List[int]:
        """Use actual grid axis positions for filtering.
        U-axis positions = X coordinates, V-axis positions = Y coordinates."""
        u_positions = []
        v_positions = []

        for axis in u_axes:
            if axis.tag in [u_start, u_end]:
                u_positions.append(axis.position)
        for axis in v_axes:
            if axis.tag in [v_start, v_end]:
                v_positions.append(axis.position)

        if len(u_positions) < 2 or len(v_positions) < 2:
            return self._get_express_ids_by_proportional_grid(
                v_start, v_end, u_start, u_end, v_axes, u_axes, element_type
            )

        # U-axes are vertical lines → their positions are X coordinates
        # V-axes are horizontal lines → their positions are Y coordinates
        x_min, x_max = min(u_positions), max(u_positions)
        y_min, y_max = min(v_positions), max(v_positions)

        # Check if positions have meaningful spread (at least 1m difference)
        if abs(x_max - x_min) < 1000 or abs(y_max - y_min) < 1000:
            return self._get_express_ids_by_proportional_grid(
                v_start, v_end, u_start, u_end, v_axes, u_axes, element_type
            )

        tolerance = 500

        express_ids = []
        for elem in self.elements.values():
            if (x_min - tolerance <= elem.x <= x_max + tolerance and
                y_min - tolerance <= elem.y <= y_max + tolerance):
                if element_type:
                    ifc_types = self.STRUCTURAL_TYPES.get(element_type, [])
                    if elem.ifc_type not in ifc_types:
                        continue
                express_ids.append(elem.express_id)

        return express_ids

    def _get_express_ids_by_proportional_grid(
        self,
        v_start: str, v_end: str,
        u_start: str, u_end: str,
        v_axes: List[GridAxis], u_axes: List[GridAxis],
        element_type: str = None
    ) -> List[int]:
        """
        Use proportional grid division based on element bounds.
        This works when IFC grid positions are invalid.
        """
        if not self.elements:
            return []

        # Get element bounds
        xs = [e.x for e in self.elements.values()]
        ys = [e.y for e in self.elements.values()]

        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        x_range = x_max - x_min if x_max > x_min else 1
        y_range = y_max - y_min if y_max > y_min else 1

        # U-axis tags (letters) → X direction, V-axis tags (numbers) → Y direction
        u_tags = sorted([a.tag for a in u_axes], key=lambda t: ord(t[0].upper()) if t else 0)
        v_tags = sorted([a.tag for a in v_axes], key=lambda t: int(t) if t.isdigit() else 0)

        if not u_tags or not v_tags:
            # No grid axes, use all elements
            return self._filter_by_type(list(self.elements.values()), element_type)

        # Calculate proportional bounds for U (X direction)
        try:
            u_start_idx = u_tags.index(u_start) if u_start in u_tags else 0
            u_end_idx = u_tags.index(u_end) if u_end in u_tags else len(u_tags) - 1
        except Exception:
            u_start_idx = 0
            u_end_idx = len(u_tags) - 1

        # Calculate proportional bounds for V (Y direction)
        try:
            v_start_idx = v_tags.index(v_start) if v_start in v_tags else 0
            v_end_idx = v_tags.index(v_end) if v_end in v_tags else len(v_tags) - 1
        except Exception:
            v_start_idx = 0
            v_end_idx = len(v_tags) - 1

        # Ensure proper ordering
        u_start_idx, u_end_idx = min(u_start_idx, u_end_idx), max(u_start_idx, u_end_idx)
        v_start_idx, v_end_idx = min(v_start_idx, v_end_idx), max(v_start_idx, v_end_idx)

        # Calculate coordinate bounds as proportions of the building
        num_u_divisions = len(u_tags)
        num_v_divisions = len(v_tags)

        # U-axes map to X, V-axes map to Y — add tolerance (extra half grid on each side)
        x_start = x_min + (u_start_idx / num_u_divisions) * x_range - (x_range / num_u_divisions / 2)
        x_end = x_min + ((u_end_idx + 1) / num_u_divisions) * x_range + (x_range / num_u_divisions / 2)
        y_start = y_min + (v_start_idx / num_v_divisions) * y_range - (y_range / num_v_divisions / 2)
        y_end = y_min + ((v_end_idx + 1) / num_v_divisions) * y_range + (y_range / num_v_divisions / 2)

        # Filter elements by coordinate bounds
        express_ids = []
        for elem in self.elements.values():
            if x_start <= elem.x <= x_end and y_start <= elem.y <= y_end:
                if element_type:
                    ifc_types = self.STRUCTURAL_TYPES.get(element_type, [])
                    if elem.ifc_type not in ifc_types:
                        continue
                express_ids.append(elem.express_id)

        return express_ids

    def _filter_by_type(self, elements: List, element_type: str = None) -> List[int]:
        """Filter elements by type and return ExpressIDs"""
        if not element_type:
            return [e.express_id for e in elements]

        ifc_types = self.STRUCTURAL_TYPES.get(element_type, [])
        return [e.express_id for e in elements if e.ifc_type in ifc_types]

    def _get_express_ids_by_grid_tags(
        self,
        v_start: str,
        v_end: str,
        u_start: str,
        u_end: str,
        element_type: str = None
    ) -> List[int]:
        """
        Fallback method to get elements by grid cell tags when axis positions aren't found.
        """
        # Get V (number) range
        try:
            v_start_num = int(v_start)
            v_end_num = int(v_end)
            v_range = range(min(v_start_num, v_end_num), max(v_start_num, v_end_num) + 1)
            v_tags = [str(n).zfill(2) if len(v_start) > 1 else str(n) for n in v_range]
        except ValueError:
            v_tags = [v_start, v_end]

        # Get U (letter) range
        u_start_ord = ord(u_start.upper())
        u_end_ord = ord(u_end.upper())
        u_tags = [chr(c) for c in range(min(u_start_ord, u_end_ord), max(u_start_ord, u_end_ord) + 1)]

        # Find elements in matching grid cells
        express_ids = []
        for elem in self.elements.values():
            if elem.grid_cell:
                parts = elem.grid_cell.split('-')
                if len(parts) == 2:
                    cell_u, cell_v = parts[0], parts[1]
                    if cell_u in u_tags and cell_v in v_tags:
                        if element_type:
                            ifc_types = self.STRUCTURAL_TYPES.get(element_type, [])
                            if elem.ifc_type not in ifc_types:
                                continue
                        express_ids.append(elem.express_id)

        return express_ids

    def generate_from_user_sequences(self, sequences: List[Dict], include_footings: bool = True) -> List[Dict]:
        """
        Generate erection stages from user-defined sequences.
        This is the Rosehill-style approach:
        - User defines erection areas by grid reference
        - User specifies split points to subdivide areas
        - System generates stages per LEVEL: Footings → Columns → Beams for each sub-area

        Sequences format:
        [
            {
                "sequence_number": 1,
                "name": "Sequence 1",
                "grid_selection": {"v_start": "2", "v_end": "8", "u_start": "A", "u_end": "J"},
                "splits": ["5"]  # Split at Grid 5
            }
        ]

        For a 2-level building with a split at 5, this generates:
        - Stage 1.1: Grid 2-5 / A-J Level 0 Foundations
        - Stage 1.2: Grid 2-5 / A-J Level 0 Columns
        - Stage 1.3: Grid 2-5 / A-J Level 0 Beams
        - Stage 1.4: Grid 2-5 / A-J Level 1 Columns
        - Stage 1.5: Grid 2-5 / A-J Level 1 Beams
        - Stage 1.6: Grid 5-8 / A-J Level 0 Foundations
        - ...
        """
        # Clear existing stages and zones
        self.stages = []
        self.zones = {}

        generated_stages = []
        stage_order = 1

        # Build a reverse lookup: express_id → StructuralElement
        express_to_elem = {e.express_id: e for e in self.elements.values()}

        for seq in sequences:
            seq_num = seq['sequence_number']
            grid = seq['grid_selection']
            splits = sorted(seq.get('splits', []), key=lambda x: int(x) if x.isdigit() else 0)

            # Create list of v-axis ranges
            v_ranges = []
            all_v_points = [grid['v_start']] + splits + [grid['v_end']]

            for i in range(len(all_v_points) - 1):
                v_ranges.append((all_v_points[i], all_v_points[i + 1]))

            # Create zone for this sequence
            zone_id = seq_num
            zone = ErectionZone(
                zone_id=zone_id,
                name=f"Grid {grid['v_start']}-{grid['v_end']} / {grid['u_start']}-{grid['u_end']}",
                grid_cells=[],
                x_range=(0, 0),  # Will be calculated
                y_range=(0, 0),
                elements=[],
                element_counts={}
            )
            self.zones[zone_id] = zone

            sub_stage = 1
            for v_start, v_end in v_ranges:
                grid_range = f"Grid {v_start}-{v_end} / {grid['u_start']}-{grid['u_end']}"

                # Get ALL elements in grid area (no type filter) — single query
                all_area_ids = self.get_express_ids_by_grid_area(
                    v_start, v_end, grid['u_start'], grid['u_end'], None
                )

                # Resolve to element objects
                area_elements = [express_to_elem[eid] for eid in all_area_ids if eid in express_to_elem]

                if not area_elements:
                    continue

                # Group elements by level
                level_groups: Dict[str, list] = defaultdict(list)
                for elem in area_elements:
                    level_groups[elem.level].append(elem)

                # Sort levels bottom-to-top by minimum Z coordinate
                sorted_levels = sorted(
                    level_groups.keys(),
                    key=lambda lvl: min(e.z for e in level_groups[lvl])
                )

                multi_level = len(sorted_levels) > 1

                for level in sorted_levels:
                    level_elems = level_groups[level]
                    level_suffix = f" - {level}" if multi_level else ""
                    stage_grid_range = f"{grid_range}{level_suffix}"

                    # Split elements by structural type
                    footing_ids = [e.express_id for e in level_elems
                                   if e.ifc_type in self.STRUCTURAL_TYPES.get('footings', [])]
                    column_ids = [e.express_id for e in level_elems
                                  if e.ifc_type in self.STRUCTURAL_TYPES.get('columns', [])]
                    beam_ids = [e.express_id for e in level_elems
                                if e.ifc_type in self.STRUCTURAL_TYPES.get('beams', [])]
                    bracing_ids = [e.express_id for e in level_elems
                                   if e.ifc_type in self.STRUCTURAL_TYPES.get('bracing', [])]

                    # Stage: Foundations (if enabled and found)
                    if include_footings and footing_ids:
                        stage_id = f"{seq_num}.{sub_stage}"
                        stage = ErectionStage(
                            stage_id=stage_id,
                            zone_id=zone_id,
                            name=f"Stage {stage_id} - {stage_grid_range} Foundations",
                            description=f"Install all foundations in {stage_grid_range}. "
                                        f"Foundations must be complete and checked before column erection begins.",
                            element_type='footings',
                            grid_range=stage_grid_range,
                            elements=[str(eid) for eid in footing_ids],
                            sequence_order=stage_order,
                            instructions=self._generate_rosehill_instructions('footings', stage_grid_range, len(footing_ids), grid)
                        )
                        self.stages.append(stage)
                        generated_stages.append(stage.to_dict(include_express_ids=True))
                        sub_stage += 1
                        stage_order += 1

                    # Stage: Columns
                    if column_ids:
                        stage_id = f"{seq_num}.{sub_stage}"
                        stage = ErectionStage(
                            stage_id=stage_id,
                            zone_id=zone_id,
                            name=f"Stage {stage_id} - {stage_grid_range} Columns",
                            description=f"Erect all {len(column_ids)} columns in {stage_grid_range}. "
                                        f"Columns must be plumbed, aligned, and temporarily braced before beams are installed.",
                            element_type='columns',
                            grid_range=stage_grid_range,
                            elements=[str(eid) for eid in column_ids],
                            sequence_order=stage_order,
                            instructions=self._generate_rosehill_instructions('columns', stage_grid_range, len(column_ids), grid)
                        )
                        self.stages.append(stage)
                        generated_stages.append(stage.to_dict(include_express_ids=True))
                        sub_stage += 1
                        stage_order += 1

                    # Stage: Beams + Bracing
                    all_beam_ids = beam_ids + bracing_ids
                    if all_beam_ids:
                        stage_id = f"{seq_num}.{sub_stage}"
                        desc_parts = []
                        if beam_ids:
                            desc_parts.append(f"{len(beam_ids)} beams")
                        if bracing_ids:
                            desc_parts.append(f"{len(bracing_ids)} bracing members")
                        desc_summary = " and ".join(desc_parts)
                        stage = ErectionStage(
                            stage_id=stage_id,
                            zone_id=zone_id,
                            name=f"Stage {stage_id} - {stage_grid_range} Beams",
                            description=f"Install {desc_summary} in {stage_grid_range}. "
                                        f"Beams connect columns and complete the structural frame at this level.",
                            element_type='beams',
                            grid_range=stage_grid_range,
                            elements=[str(eid) for eid in all_beam_ids],
                            sequence_order=stage_order,
                            instructions=self._generate_rosehill_instructions('beams', stage_grid_range, len(all_beam_ids), grid)
                        )
                        self.stages.append(stage)
                        generated_stages.append(stage.to_dict(include_express_ids=True))
                        sub_stage += 1
                        stage_order += 1

            # Update zone with all elements from its stages
            zone_stages = [s for s in self.stages if s.zone_id == zone_id]
            all_zone_elements = []
            element_counts = defaultdict(int)
            for stage in zone_stages:
                all_zone_elements.extend(stage.elements)
                element_counts[stage.element_type] += len(stage.elements)
            zone.elements = all_zone_elements
            zone.element_counts = dict(element_counts)

        return generated_stages

    def _generate_rosehill_instructions(
        self,
        element_type: str,
        grid_range: str,
        count: int,
        grid_selection: Dict
    ) -> List[str]:
        """
        Generate Rosehill-style instructions for a stage.
        """
        u_start = grid_selection['u_start']
        u_end = grid_selection['u_end']

        if element_type == 'footings':
            return [
                f"Install all {count} foundations in {grid_range}",
                f"Foundations to be placed bay by bay from grid {u_start} through to grid {u_end}",
                "Verify foundation levels and alignment before grouting",
                "All holding-down bolts to be checked for position and projection",
                "Foundations must be signed off before column erection begins",
            ]
        elif element_type == 'columns':
            return [
                f"Erect all {count} columns in {grid_range}",
                f"Columns to be installed bay by bay from grid {u_start} through to grid {u_end}",
                "Columns to be plumbed, aligned, and snug tightened",
                "Temporary bracing to be installed as required to maintain stability",
                "Check column plumb and alignment before proceeding to beams",
            ]
        elif element_type == 'beams':
            return [
                f"Install all {count} beams and bracing in {grid_range}",
                f"Install beams in each bay from grid {u_start} through grid {u_end}",
                "Install wall struts, headers and cross bracing as per drawings",
                "Snug tighten all bolts and tension bracing where applicable",
                "Ensure all connections are secure before releasing crane",
            ]
        else:
            return [f"Install {count} {element_type} elements in {grid_range}"]

    def get_express_ids_by_user_stage(self, stage_id: str) -> List[int]:
        """
        Get ExpressIDs for a user-generated stage.
        Stage elements are stored as ExpressIDs directly.
        """
        for stage in self.stages:
            if stage.stage_id == stage_id:
                # Elements in user-generated stages are already ExpressIDs
                return [int(eid) for eid in stage.elements if eid.isdigit()]
        return []

    def get_all_ifc_elements_by_grid_area(
        self,
        v_start: str,
        v_end: str,
        u_start: str,
        u_end: str
    ) -> List[int]:
        """
        Get ExpressIDs for ALL IFC building elements (not just structural) within a grid area.
        This includes walls, slabs, roofing, cladding, doors, windows, MEP, etc.
        Used to show the complete building section for a grid area.
        """
        # Use actual grid axis positions for coordinate bounds.
        # U-axes = X coordinates, V-axes = Y coordinates.
        u_axes_list = sorted(
            [a for a in self.grid_axes.values() if a.direction == 'U'],
            key=lambda a: a.position
        )
        v_axes_list = sorted(
            [a for a in self.grid_axes.values() if a.direction == 'V'],
            key=lambda a: a.position
        )

        if not self.elements:
            return []

        # Try to use actual axis positions first (most accurate)
        u_positions = [a.position for a in u_axes_list if a.tag in [u_start, u_end]]
        v_positions = [a.position for a in v_axes_list if a.tag in [v_start, v_end]]

        if len(u_positions) >= 2 and len(v_positions) >= 2:
            bound_x_min = min(u_positions) - 500
            bound_x_max = max(u_positions) + 500
            bound_y_min = min(v_positions) - 500
            bound_y_max = max(v_positions) + 500
        else:
            # Fallback to proportional method
            xs = [e.x for e in self.elements.values()]
            ys = [e.y for e in self.elements.values()]
            x_min, x_max = min(xs), max(xs)
            y_min, y_max = min(ys), max(ys)
            x_range = x_max - x_min if x_max > x_min else 1
            y_range = y_max - y_min if y_max > y_min else 1

            u_tags = sorted([a.tag for a in u_axes_list], key=lambda t: ord(t[0].upper()) if t else 0)
            v_tags = sorted([a.tag for a in v_axes_list], key=lambda t: int(t) if t.isdigit() else 0)

            if not u_tags or not v_tags:
                return []

            try:
                u_start_idx = u_tags.index(u_start) if u_start in u_tags else 0
                u_end_idx = u_tags.index(u_end) if u_end in u_tags else len(u_tags) - 1
            except Exception:
                u_start_idx, u_end_idx = 0, len(u_tags) - 1

            try:
                v_start_idx = v_tags.index(v_start) if v_start in v_tags else 0
                v_end_idx = v_tags.index(v_end) if v_end in v_tags else len(v_tags) - 1
            except Exception:
                v_start_idx, v_end_idx = 0, len(v_tags) - 1

            u_start_idx, u_end_idx = min(u_start_idx, u_end_idx), max(u_start_idx, u_end_idx)
            v_start_idx, v_end_idx = min(v_start_idx, v_end_idx), max(v_start_idx, v_end_idx)

            num_u = len(u_tags)
            num_v = len(v_tags)

            bound_x_min = x_min + (u_start_idx / num_u) * x_range - (x_range / num_u / 2)
            bound_x_max = x_min + ((u_end_idx + 1) / num_u) * x_range + (x_range / num_u / 2)
            bound_y_min = y_min + (v_start_idx / num_v) * y_range - (y_range / num_v / 2)
            bound_y_max = y_min + ((v_end_idx + 1) / num_v) * y_range + (y_range / num_v / 2)

        # Now scan ALL IFC building elements (not just structural)
        all_building_types = [
            'IfcWall', 'IfcWallStandardCase', 'IfcCurtainWall',
            'IfcSlab', 'IfcRoof',
            'IfcColumn', 'IfcBeam', 'IfcMember', 'IfcPlate',
            'IfcFooting', 'IfcPile',
            'IfcStair', 'IfcStairFlight', 'IfcRamp', 'IfcRampFlight',
            'IfcRailing',
            'IfcDoor', 'IfcWindow',
            'IfcCovering',
            'IfcBuildingElementProxy',
            'IfcDistributionElement', 'IfcFlowSegment', 'IfcFlowTerminal',
            'IfcFurnishingElement', 'IfcFurniture',
        ]

        express_ids = []

        for ifc_type in all_building_types:
            try:
                elements = self.ifc.by_type(ifc_type)
                for elem in elements:
                    try:
                        # Get element position
                        if elem.ObjectPlacement:
                            pos = placement.get_local_placement(elem.ObjectPlacement)
                            if pos is not None:
                                ex = pos[0][3]  # X coordinate
                                ey = pos[1][3]  # Y coordinate

                                # Check if within grid bounds
                                if bound_x_min <= ex <= bound_x_max and bound_y_min <= ey <= bound_y_max:
                                    express_ids.append(elem.id())
                    except:
                        continue
            except:
                continue

        return list(set(express_ids))  # Remove duplicates
