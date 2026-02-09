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
    STRUCTURAL_TYPES = {
        'columns': ['IfcColumn'],
        'beams': ['IfcBeam', 'IfcMember'],
        'bracing': ['IfcMember', 'IfcPlate'],  # Bracing often modeled as members
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
                except:
                    pass

            # Extract U axes (typically letters like A, B, C)
            if grid.UAxes:
                for axis in grid.UAxes:
                    pos = self._get_axis_position(axis, grid_placement, 'U')
                    if pos is not None:
                        u_axes.append(GridAxis(
                            tag=axis.AxisTag or f"U{len(u_axes)}",
                            direction='U',
                            position=pos
                        ))

            # Extract V axes (typically numbers like 1, 2, 3)
            if grid.VAxes:
                for axis in grid.VAxes:
                    pos = self._get_axis_position(axis, grid_placement, 'V')
                    if pos is not None:
                        v_axes.append(GridAxis(
                            tag=axis.AxisTag or f"V{len(v_axes)}",
                            direction='V',
                            position=pos
                        ))

        # Sort axes by position
        u_axes = sorted(u_axes, key=lambda a: a.position)
        v_axes = sorted(v_axes, key=lambda a: a.position)

        # Remove duplicates (same tag)
        seen_u = set()
        seen_v = set()
        unique_u = []
        unique_v = []

        for a in u_axes:
            if a.tag not in seen_u:
                seen_u.add(a.tag)
                unique_u.append(a)
                self.grid_axes[f"U_{a.tag}"] = a

        for a in v_axes:
            if a.tag not in seen_v:
                seen_v.add(a.tag)
                unique_v.append(a)
                self.grid_axes[f"V_{a.tag}"] = a

        # Create grid cells from axis intersections
        self._create_grid_cells(unique_u, unique_v)

    def _get_axis_position(self, axis, grid_placement, direction: str) -> Optional[float]:
        """Get the position coordinate of a grid axis"""
        curve = axis.AxisCurve
        if not curve:
            return None

        try:
            if curve.is_a('IfcPolyline') and curve.Points:
                # Get first point
                coords = curve.Points[0].Coordinates
                # For U axes (letters), position is typically Y
                # For V axes (numbers), position is typically X
                if direction == 'U':
                    return coords[1] if len(coords) > 1 else coords[0]
                else:
                    return coords[0]
            elif curve.is_a('IfcLine'):
                if curve.Pnt:
                    coords = curve.Pnt.Coordinates
                    if direction == 'U':
                        return coords[1] if len(coords) > 1 else coords[0]
                    else:
                        return coords[0]
        except:
            pass

        return None

    def _create_grid_cells(self, u_axes: List[GridAxis], v_axes: List[GridAxis]):
        """Create grid cells from axis intersections"""
        for i, u in enumerate(u_axes[:-1]):
            u_next = u_axes[i + 1]
            for j, v in enumerate(v_axes[:-1]):
                v_next = v_axes[j + 1]

                cell = GridCell(
                    u_axis=u.tag,
                    v_axis=v.tag,
                    x_min=min(v.position, v_next.position),
                    x_max=max(v.position, v_next.position),
                    y_min=min(u.position, u_next.position),
                    y_max=max(u.position, u_next.position)
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

        # Create U axes (Y direction)
        u_axes = []
        y_pos = y_min
        label_idx = 0
        labels = 'ABCDEFGHJKLMNPQRSTUVWXYZ'  # Skip I and O

        while y_pos <= y_max + grid_spacing:
            tag = labels[label_idx % len(labels)]
            if label_idx >= len(labels):
                tag = f"{labels[label_idx // len(labels) - 1]}{labels[label_idx % len(labels)]}"
            u_axes.append(GridAxis(tag=tag, direction='U', position=y_pos))
            self.grid_axes[f"U_{tag}"] = u_axes[-1]
            y_pos += grid_spacing
            label_idx += 1

        # Create V axes (X direction)
        v_axes = []
        x_pos = x_min
        num = 1

        while x_pos <= x_max + grid_spacing:
            tag = str(num).zfill(2)
            v_axes.append(GridAxis(tag=tag, direction='V', position=x_pos))
            self.grid_axes[f"V_{tag}"] = v_axes[-1]
            x_pos += grid_spacing
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
        """Convert level name to short form for display"""
        level_lower = level_name.lower()
        if 'ground' in level_lower or level_lower in ['l1', 'level 1', 'level1', 'gf']:
            return 'L1'
        elif 'mezzanine' in level_lower or 'mezz' in level_lower:
            return 'Mezz'
        elif 'roof' in level_lower:
            return 'Roof'
        elif 'level 2' in level_lower or 'l2' in level_lower:
            return 'L2'
        elif 'level 3' in level_lower or 'l3' in level_lower:
            return 'L3'
        else:
            # Try to extract a number
            match = re.search(r'(\d+)', level_name)
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
            # Re-map elements to this zone
            zone.elements = []
            zone.element_counts = defaultdict(int)

            for elem in self.elements.values():
                if x_range[0] <= elem.x < x_range[1]:
                    if y_range:
                        if y_range[0] <= elem.y < y_range[1]:
                            zone.elements.append(elem.global_id)
                    else:
                        zone.elements.append(elem.global_id)

                    for category, types in self.STRUCTURAL_TYPES.items():
                        if elem.ifc_type in types:
                            zone.element_counts[category] += 1
                            break

            zone.element_counts = dict(zone.element_counts)

        if y_range:
            zone.y_range = y_range

        # Regenerate stages for this zone
        self._regenerate_zone_stages(zone_id)

        return zone.to_dict()

    def _regenerate_zone_stages(self, zone_id: int):
        """Regenerate stages for a specific zone after update"""
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

        # Generate new stages
        for element_type in self.ERECTION_ORDER:
            if zone.element_counts.get(element_type, 0) > 0:
                stage_elements = [
                    eid for eid in zone.elements
                    if eid in self.elements and
                    self.elements[eid].ifc_type in self.STRUCTURAL_TYPES.get(element_type, [])
                ]

                if not stage_elements:
                    continue

                sub_stage = len([s for s in self.stages if s.zone_id == zone_id]) + 1
                stage_id = f"{zone_id}.{sub_stage}"

                instructions = self._generate_stage_instructions(
                    element_type, zone, len(stage_elements)
                )

                stage = ErectionStage(
                    stage_id=stage_id,
                    zone_id=zone_id,
                    name=f"Stage {stage_id} - {element_type.title()}",
                    description=f"Install {element_type} in {zone.name}",
                    element_type=element_type,
                    grid_range=zone.name,
                    elements=stage_elements,
                    sequence_order=0,  # Will be reordered
                    instructions=instructions
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
        - Grid tags (e.g., "A", "1") map to axis positions (in mm)
        - V-axes (numbers) map to X coordinates
        - U-axes (letters) map to Y coordinates
        - Selection bounds: [v_start, v_end] → [x_min, x_max], [u_start, u_end] → [y_min, y_max]
        - Elements are filtered by their (x, y) positions falling within these bounds
        
        Model Alignment:
        - Assumes model has been aligned so minX/minY map to grid origin
        - Uses tolerance (500mm) to account for elements near grid boundaries
        """
        """
        Get ExpressIDs for elements within a grid area.
        Grid area is defined by V-axis range (numbers) and U-axis range (letters).

        Uses a robust approach that works even if grid axis positions are incorrect:
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
        """Use actual grid axis positions for filtering"""
        v_positions = []
        u_positions = []

        for axis in v_axes:
            if axis.tag in [v_start, v_end]:
                v_positions.append(axis.position)
        for axis in u_axes:
            if axis.tag in [u_start, u_end]:
                u_positions.append(axis.position)

        if len(v_positions) < 2 or len(u_positions) < 2:
            return self._get_express_ids_by_proportional_grid(
                v_start, v_end, u_start, u_end, v_axes, u_axes, element_type
            )

        x_min, x_max = min(v_positions), max(v_positions)
        y_min, y_max = min(u_positions), max(u_positions)

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

        # Get V axis tags and their indices (numbers)
        v_tags = sorted([a.tag for a in v_axes], key=lambda t: int(t) if t.isdigit() else 0)
        # Get U axis tags and their indices (letters)
        u_tags = sorted([a.tag for a in u_axes], key=lambda t: ord(t[0].upper()) if t else 0)

        if not v_tags or not u_tags:
            # No grid axes, use all elements
            return self._filter_by_type(list(self.elements.values()), element_type)

        # Calculate proportional bounds for V (X direction)
        try:
            v_start_idx = v_tags.index(v_start) if v_start in v_tags else 0
            v_end_idx = v_tags.index(v_end) if v_end in v_tags else len(v_tags) - 1
        except:
            v_start_idx = 0
            v_end_idx = len(v_tags) - 1

        # Calculate proportional bounds for U (Y direction)
        try:
            u_start_idx = u_tags.index(u_start) if u_start in u_tags else 0
            u_end_idx = u_tags.index(u_end) if u_end in u_tags else len(u_tags) - 1
        except:
            u_start_idx = 0
            u_end_idx = len(u_tags) - 1

        # Ensure proper ordering
        v_start_idx, v_end_idx = min(v_start_idx, v_end_idx), max(v_start_idx, v_end_idx)
        u_start_idx, u_end_idx = min(u_start_idx, u_end_idx), max(u_start_idx, u_end_idx)

        # Calculate coordinate bounds as proportions of the building
        num_v_divisions = len(v_tags)
        num_u_divisions = len(u_tags)

        # Add tolerance (extra half grid on each side)
        x_start = x_min + (v_start_idx / num_v_divisions) * x_range - (x_range / num_v_divisions / 2)
        x_end = x_min + ((v_end_idx + 1) / num_v_divisions) * x_range + (x_range / num_v_divisions / 2)
        y_start = y_min + (u_start_idx / num_u_divisions) * y_range - (y_range / num_u_divisions / 2)
        y_end = y_min + ((u_end_idx + 1) / num_u_divisions) * y_range + (y_range / num_u_divisions / 2)

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
        - System generates stages: Columns first, then Beams for each sub-area

        Sequences format:
        [
            {
                "sequence_number": 1,
                "name": "Sequence 1",
                "grid_selection": {"v_start": "2", "v_end": "8", "u_start": "A", "u_end": "J"},
                "splits": ["5"]  # Split at Grid 5
            }
        ]

        This generates:
        - Stage 1.1: Grid 2-5 / A-J Columns
        - Stage 1.2: Grid 2-5 / A-J Beams
        - Stage 1.3: Grid 5-8 / A-J Columns
        - Stage 1.4: Grid 5-8 / A-J Beams
        """
        # Clear existing stages and zones
        self.stages = []
        self.zones = {}

        generated_stages = []
        stage_order = 1

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

            # For each v-range, generate Footings (if enabled), then Columns, then Beams stages
            sub_stage = 1
            for v_start, v_end in v_ranges:
                grid_range = f"Grid {v_start}-{v_end} / {grid['u_start']}-{grid['u_end']}"

                # Get elements in this grid area
                footing_ids = []
                if include_footings:
                    footing_ids = self.get_express_ids_by_grid_area(
                        v_start, v_end, grid['u_start'], grid['u_end'], 'footings'
                    )
                column_ids = self.get_express_ids_by_grid_area(
                    v_start, v_end, grid['u_start'], grid['u_end'], 'columns'
                )
                beam_ids = self.get_express_ids_by_grid_area(
                    v_start, v_end, grid['u_start'], grid['u_end'], 'beams'
                )
                bracing_ids = self.get_express_ids_by_grid_area(
                    v_start, v_end, grid['u_start'], grid['u_end'], 'bracing'
                )

                # Stage X.Y - Footings (if enabled and found)
                if include_footings and footing_ids:
                    stage_id = f"{seq_num}.{sub_stage}"
                    stage = ErectionStage(
                        stage_id=stage_id,
                        zone_id=zone_id,
                        name=f"Stage {stage_id} - {grid_range} Footings",
                        description=f"Install all footings/foundations in {grid_range}",
                        element_type='footings',
                        grid_range=grid_range,
                        elements=[str(eid) for eid in footing_ids],
                        sequence_order=stage_order,
                        instructions=self._generate_rosehill_instructions('footings', grid_range, len(footing_ids), grid)
                    )
                    self.stages.append(stage)
                    generated_stages.append(stage.to_dict(include_express_ids=True))
                    sub_stage += 1
                    stage_order += 1

                # Stage X.Y - Columns
                if column_ids:
                    stage_id = f"{seq_num}.{sub_stage}"
                    stage = ErectionStage(
                        stage_id=stage_id,
                        zone_id=zone_id,
                        name=f"Stage {stage_id} - {grid_range} Columns",
                        description=f"Erect all columns in {grid_range}",
                        element_type='columns',
                        grid_range=grid_range,
                        elements=[str(eid) for eid in column_ids],  # Store as strings for consistency
                        sequence_order=stage_order,
                        instructions=self._generate_rosehill_instructions('columns', grid_range, len(column_ids), grid)
                    )
                    self.stages.append(stage)
                    generated_stages.append(stage.to_dict(include_express_ids=True))
                    sub_stage += 1
                    stage_order += 1

                # Stage X.Y - Beams (includes bracing)
                all_beam_ids = beam_ids + bracing_ids
                if all_beam_ids:
                    stage_id = f"{seq_num}.{sub_stage}"
                    stage = ErectionStage(
                        stage_id=stage_id,
                        zone_id=zone_id,
                        name=f"Stage {stage_id} - {grid_range} Beams",
                        description=f"Install all beams and bracing in {grid_range}",
                        element_type='beams',
                        grid_range=grid_range,
                        elements=[str(eid) for eid in all_beam_ids],
                        sequence_order=stage_order,
                        instructions=self._generate_rosehill_instructions('beams', grid_range, len(all_beam_ids), grid)
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

        if element_type == 'columns':
            return [
                f"Erect all {count} columns in {grid_range}",
                f"Columns to be installed bay by bay from {u_start}-{chr(ord(u_start)+1)} through to {chr(ord(u_end)-1)}-{u_end}",
                "Columns to be plumbed, aligned, and snug tightened",
                "Temporary bracing to be installed as required to maintain stability",
            ]
        elif element_type == 'beams':
            return [
                f"Install all {count} beams between grids in {grid_range}",
                f"Install beams in each bay {u_start}-{chr(ord(u_start)+1)} through {chr(ord(u_end)-1)}-{u_end}",
                "Install wall struts, headers and cross bracing as per drawings",
                "Snug tighten all bolts and tension bracing where applicable",
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
        # Get grid coordinate bounds using the same logic as structural elements
        v_axes = sorted(
            [a for a in self.grid_axes.values() if a.direction == 'V'],
            key=lambda a: int(a.tag) if a.tag.isdigit() else ord(a.tag[0])
        )
        u_axes = sorted(
            [a for a in self.grid_axes.values() if a.direction == 'U'],
            key=lambda a: ord(a.tag[0].upper()) if a.tag else 0
        )

        # Calculate coordinate bounds using proportional method (most reliable)
        if not self.elements:
            return []

        xs = [e.x for e in self.elements.values()]
        ys = [e.y for e in self.elements.values()]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        x_range = x_max - x_min if x_max > x_min else 1
        y_range = y_max - y_min if y_max > y_min else 1

        v_tags = sorted([a.tag for a in v_axes], key=lambda t: int(t) if t.isdigit() else 0)
        u_tags = sorted([a.tag for a in u_axes], key=lambda t: ord(t[0].upper()) if t else 0)

        if not v_tags or not u_tags:
            return []

        # Get indices for the selected range
        try:
            v_start_idx = v_tags.index(v_start) if v_start in v_tags else 0
            v_end_idx = v_tags.index(v_end) if v_end in v_tags else len(v_tags) - 1
        except:
            v_start_idx = 0
            v_end_idx = len(v_tags) - 1

        try:
            u_start_idx = u_tags.index(u_start) if u_start in u_tags else 0
            u_end_idx = u_tags.index(u_end) if u_end in u_tags else len(u_tags) - 1
        except:
            u_start_idx = 0
            u_end_idx = len(u_tags) - 1

        v_start_idx, v_end_idx = min(v_start_idx, v_end_idx), max(v_start_idx, v_end_idx)
        u_start_idx, u_end_idx = min(u_start_idx, u_end_idx), max(u_start_idx, u_end_idx)

        num_v_divisions = len(v_tags)
        num_u_divisions = len(u_tags)

        # Calculate coordinate bounds with tolerance
        bound_x_min = x_min + (v_start_idx / num_v_divisions) * x_range - (x_range / num_v_divisions / 2)
        bound_x_max = x_min + ((v_end_idx + 1) / num_v_divisions) * x_range + (x_range / num_v_divisions / 2)
        bound_y_min = y_min + (u_start_idx / num_u_divisions) * y_range - (y_range / num_u_divisions / 2)
        bound_y_max = y_min + ((u_end_idx + 1) / num_u_divisions) * y_range + (y_range / num_u_divisions / 2)

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
