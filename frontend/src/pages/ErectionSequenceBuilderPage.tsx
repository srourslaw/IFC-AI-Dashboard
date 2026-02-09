/**
 * Erection Sequence Builder Page
 * Simplified grid-based methodology generation following Rosehill pattern
 *
 * User flow:
 * 1. Select a grid area (e.g., Grid 1-8 / B-J)
 * 2. Click "Generate Stages" - creates Columns then Beams stages
 * 3. Use playback to view each stage - ONLY that stage's elements are shown
 *
 * Grid Coordinate System:
 * - U-axes: Typically letters (A, B, C...) representing horizontal grid lines
 * - V-axes: Typically numbers (1, 2, 3...) representing vertical grid lines
 * - Grid cells: Intersections of U and V axes (e.g., A1, B2, C3)
 * - Selection mapping: User selects grid cells → backend maps to world coordinates
 *   using grid axis positions (in mm) to filter elements by bounding box
 *
 * Model Alignment:
 * - On load, model bounding box minimum (minX, minZ) is aligned to grid origin (0,0)
 * - This ensures consistent mapping between grid selection and world coordinates
 * - The same alignment transform is used by selection → world mapping logic
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Squares2X2Icon,
  PlayIcon,
  PauseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CubeIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  EyeIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton } from '@/components/ui'
import { IFCViewer, IFCViewerHandle } from '@/components/IFCViewer'
import { useMethodologyAnalysis, useGridData } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ErectionStage } from '@/lib/api'
import toast from 'react-hot-toast'

// Magenta color like Rosehill PDF for current stage
const CURRENT_STAGE_COLOR = 0xff00ff
const COMPLETED_STAGE_COLOR = 0x666666

// Playback speed in milliseconds
const PLAYBACK_SPEED_MS = 3000 // 3 seconds per stage

interface GridSelection {
  vStart: string
  vEnd: string
  uStart: string
  uEnd: string
}

export function ErectionSequenceBuilderPage() {
  const { currentModel } = useAppStore()
  const { isLoading: methodologyLoading } = useMethodologyAnalysis()
  const { data: gridData, isLoading: gridLoading } = useGridData()

  // Grid selection state
  // gridSelection: "draft" selection while dragging
  // appliedSelection: last selection that has been explicitly applied to the viewer
  const [gridSelection, setGridSelection] = useState<GridSelection | null>(null)
  const [appliedSelection, setAppliedSelection] = useState<{ uStart: string; uEnd: string; vStart: string; vEnd: string } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ v: string; u: string } | null>(null)
  const [includeFootings, setIncludeFootings] = useState(true)

  // Generated stages
  const [generatedStages, setGeneratedStages] = useState<ErectionStage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Viewer state
  const [isViewerReady, setIsViewerReady] = useState(false)
  const [viewerInitialized, setViewerInitialized] = useState(false)
  const [viewMode, setViewMode] = useState<'plan' | '3d'>('plan')
  const [gridOverlayOpacity, setGridOverlayOpacity] = useState(0.8)
  const [modelOpacity, setModelOpacity] = useState(1)

  // Playback state
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Express IDs cache
  const [stageExpressIds, setStageExpressIds] = useState<Map<string, number[]>>(new Map())
  // ALL elements in the selected grid area (full building section)
  const [sectionIds, setSectionIds] = useState<number[]>([])

  // Hover sync state
  const [hoveredCell, setHoveredCell] = useState<{ row: number, col: number } | null>(null)

  const viewerRef = useRef<IFCViewerHandle>(null)

  // Grid axes from API
  const uAxes = useMemo(() => {
    if (!gridData || !gridData.u_axes || !Array.isArray(gridData.u_axes)) return []
    // Sort by position DESCENDING so higher positions (top of model) appear at top of grid
    // This matches the 3D viewer where higher Y/Z positions are at the top
    return [...gridData.u_axes]
      .sort((a, b) => b.position - a.position)
      .map(a => a.tag)
  }, [gridData])

  const vAxes = useMemo(() => {
    if (!gridData || !gridData.v_axes || !Array.isArray(gridData.v_axes)) return []
    return gridData.v_axes
      .map(a => a.tag)
      .sort((a, b) => {
        // Sort numbers numerically
        const numA = parseInt(a) || 0
        const numB = parseInt(b) || 0
        return numA - numB
      })
  }, [gridData])

  // Reset on model change
  useEffect(() => {
    setGridSelection(null)
    setAppliedSelection(null)
    setGeneratedStages([])
    setCurrentStageIndex(-1)
    setStageExpressIds(new Map())
    setIsViewerReady(false)
    setViewerInitialized(false)
    setIsPlaying(false)
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
    }
  }, [currentModel?.file_id])

  // Initialize viewer - show full model initially
  useEffect(() => {
    if (isViewerReady && viewerRef.current && !viewerInitialized) {
      // Initially show the full model
      viewerRef.current.showAllMeshes()
      viewerRef.current.clearHighlights()
      setViewerInitialized(true)
    }
  }, [isViewerReady, viewerInitialized])

  // Cleanup playback timer on unmount
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
      }
    }
  }, [])

  // Grid cell click handlers
  const handleCellMouseDown = useCallback((v: string, u: string) => {
    setIsSelecting(true)
    setSelectionStart({ v, u })
    setGridSelection({ vStart: v, vEnd: v, uStart: u, uEnd: u })
  }, [])

  const handleCellHover = useCallback((v: string, u: string) => {
    // Convert to indices for viewer
    const vIdx = vAxes.indexOf(v)
    const uIdx = uAxes.indexOf(u)
    if (vIdx !== -1 && uIdx !== -1) {
      setHoveredCell({ row: uIdx, col: vIdx })
    }
  }, [vAxes, uAxes])

  const handleViewerHover = useCallback((cell: { row: number, col: number } | null) => {
    setHoveredCell(cell)
  }, [])

  const handleCellMouseEnter = useCallback((v: string, u: string) => {
    if (!isSelecting || !selectionStart) return

    // Calculate selection bounds
    const vStartIdx = vAxes.indexOf(selectionStart.v)
    const vEndIdx = vAxes.indexOf(v)
    const uStartIdx = uAxes.indexOf(selectionStart.u)
    const uEndIdx = uAxes.indexOf(u)

    const vMin = Math.min(vStartIdx, vEndIdx)
    const vMax = Math.max(vStartIdx, vEndIdx)
    const uMin = Math.min(uStartIdx, uEndIdx)
    const uMax = Math.max(uStartIdx, uEndIdx)

    setGridSelection({
      vStart: vAxes[vMin],
      vEnd: vAxes[vMax],
      uStart: uAxes[uMin],
      uEnd: uAxes[uMax],
    })
  }, [isSelecting, selectionStart, vAxes, uAxes])

  const handleMouseUp = useCallback(() => {
    setIsSelecting(false)
    setSelectionStart(null)
  }, [])

  // Check if a cell is in the current selection
  const isCellSelected = useCallback((v: string, u: string) => {
    if (!gridSelection) return false

    const vIdx = vAxes.indexOf(v)
    const uIdx = uAxes.indexOf(u)
    const vStartIdx = vAxes.indexOf(gridSelection.vStart)
    const vEndIdx = vAxes.indexOf(gridSelection.vEnd)
    const uStartIdx = uAxes.indexOf(gridSelection.uStart)
    const uEndIdx = uAxes.indexOf(gridSelection.uEnd)

    return vIdx >= vStartIdx && vIdx <= vEndIdx && uIdx >= uStartIdx && uIdx <= uEndIdx
  }, [gridSelection, vAxes, uAxes])

  // Generate stages from selection
  const handleGenerateStages = useCallback(async () => {
    if (!gridSelection || !currentModel) return

    setIsGenerating(true)
    try {
      const apiSequences = [{
        sequence_number: 1,
        name: `Grid ${gridSelection.vStart}-${gridSelection.vEnd} / ${gridSelection.uStart}-${gridSelection.uEnd}`,
        grid_selection: {
          v_start: gridSelection.vStart,
          v_end: gridSelection.vEnd,
          u_start: gridSelection.uStart,
          u_end: gridSelection.uEnd,
        },
        splits: [], // No splits - simple Columns then Beams
      }]

      const result = await api.generateFromSequences(apiSequences, currentModel.file_id, includeFootings)

      if (result.success && result.stages.length > 0) {
        setGeneratedStages(result.stages)
        setCurrentStageIndex(-1)

        // Cache express IDs for stages
        const idsMap = new Map<string, number[]>()
        for (const stage of result.stages) {
          if (stage.express_ids && stage.express_ids.length > 0) {
            idsMap.set(stage.stage_id, stage.express_ids)
          }
        }
        setStageExpressIds(idsMap)

        // Store ALL elements in the grid area (full building section)
        if (result.section_ids && result.section_ids.length > 0) {
          setSectionIds(result.section_ids)
          console.log(`[SECTION] Full building section: ${result.section_ids.length} elements`)
        }

        // Show ONLY the building section (full section view)
        if (viewerRef.current) {
          viewerRef.current.clearHighlights()
          if (result.section_ids && result.section_ids.length > 0) {
            viewerRef.current.showOnlyElements(result.section_ids)
          } else {
            // Fallback: hide all meshes if no section IDs
            viewerRef.current.hideAllMeshes()
          }
        }

        toast.success(`Generated ${result.stages.length} stages (${result.section_count || 0} section elements)`)
      } else {
        toast.error('No elements found in selected grid area')
      }
    } catch (err) {
      console.error('Failed to generate stages:', err)
      toast.error('Failed to generate stages')
    } finally {
      setIsGenerating(false)
    }
  }, [gridSelection, currentModel, includeFootings])

  // Go to a specific stage - CORE VISUALIZATION LOGIC
  // Now shows FULL BUILDING SECTION with stage elements highlighted
  const goToStage = useCallback((index: number) => {
    if (!viewerRef.current || !isViewerReady || index < 0 || index >= generatedStages.length) return

    const stage = generatedStages[index]
    const expressIds = stageExpressIds.get(stage.stage_id) || []

    console.log(`[STAGE ${index}] ${stage.name}: ${expressIds.length} elements`)

    // Step 1: Clear any previous highlights
    viewerRef.current.clearHighlights()

    // Step 2: Show the FULL building section (all elements in grid area)
    if (sectionIds.length > 0) {
      viewerRef.current.showOnlyElements(sectionIds)
    } else {
      // Fallback: hide everything if no section IDs
      viewerRef.current.hideAllMeshes()
    }

    // Step 3: Highlight completed stages in grey (dimmed)
    for (let i = 0; i < index; i++) {
      const prevStage = generatedStages[i]
      const prevIds = stageExpressIds.get(prevStage.stage_id)
      if (prevIds && prevIds.length > 0) {
        // Highlight with grey color and 0.4 opacity
        viewerRef.current.highlightElements(prevIds, COMPLETED_STAGE_COLOR, 0.4)
      }
    }

    // Step 4: Highlight CURRENT stage elements in magenta (full brightness)
    if (expressIds.length > 0) {
      // Highlight with magenta color and full opacity
      viewerRef.current.highlightElements(expressIds, CURRENT_STAGE_COLOR, 1)
    }

    setCurrentStageIndex(index)
  }, [generatedStages, stageExpressIds, isViewerReady, sectionIds])

  // Navigation handlers
  const handlePrevStage = useCallback(() => {
    if (currentStageIndex > 0) {
      goToStage(currentStageIndex - 1)
    }
  }, [currentStageIndex, goToStage])

  const handleNextStage = useCallback(() => {
    if (currentStageIndex < generatedStages.length - 1) {
      goToStage(currentStageIndex + 1)
    }
  }, [currentStageIndex, generatedStages.length, goToStage])

  // Play/Pause handler with proper timer management
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      // Stop playing
      setIsPlaying(false)
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current)
        playbackTimerRef.current = null
      }
    } else {
      // Start playing
      setIsPlaying(true)

      // If at end or not started, start from beginning
      const startIndex = (currentStageIndex === -1 || currentStageIndex >= generatedStages.length - 1)
        ? 0
        : currentStageIndex + 1

      if (startIndex === 0) {
        // Starting fresh
        goToStage(0)
      }

      // Schedule next stages
      const scheduleNext = (fromIndex: number) => {
        if (fromIndex < generatedStages.length - 1) {
          playbackTimerRef.current = setTimeout(() => {
            goToStage(fromIndex + 1)
            scheduleNext(fromIndex + 1)
          }, PLAYBACK_SPEED_MS)
        } else {
          // Reached the end
          setIsPlaying(false)
        }
      }

      scheduleNext(startIndex === 0 ? 0 : currentStageIndex)
    }
  }, [isPlaying, currentStageIndex, generatedStages.length, goToStage])

  // Reset view
  const handleReset = useCallback(() => {
    setCurrentStageIndex(-1)
    setIsPlaying(false)
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current)
      playbackTimerRef.current = null
    }
    if (viewerRef.current) {
      viewerRef.current.showAllMeshes()
      viewerRef.current.clearHighlights()
    }
  }, [])

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setGridSelection(null)
    setAppliedSelection(null)
    setGeneratedStages([])
    setCurrentStageIndex(-1)
    setStageExpressIds(new Map())
    setSectionIds([])
    if (viewerRef.current) {
      viewerRef.current.showAllMeshes()
      viewerRef.current.clearHighlights()
    }
  }, [])

  // Apply current draft selection to the 3D viewer WITHOUT regenerating stages
  const handleApplySelectionToViewer = useCallback(async () => {
    if (!gridSelection || !currentModel) {
      toast.error('Select a grid area first')
      return
    }
    if (!viewerRef.current) return

    try {
      // Persist applied selection
      setAppliedSelection(gridSelection)

      // Fetch all elements in the selected grid area (all types)
      const res = await api.getGridAreaExpressIds(
        gridSelection.vStart,
        gridSelection.vEnd,
        gridSelection.uStart,
        gridSelection.uEnd,
        undefined,
        currentModel.file_id
      )

      if (!res.express_ids || res.express_ids.length === 0) {
        toast.error('No elements found in selected grid area')
        return
      }

      // Show ONLY the selected members in the viewer
      viewerRef.current.clearHighlights()
      viewerRef.current.showOnlyElements(res.express_ids)
      setSectionIds(res.express_ids)

      toast.success(`Showing ${res.count} elements in selected grid area`)
    } catch (err) {
      console.error('Failed to apply selection to viewer:', err)
      toast.error('Failed to apply selection to viewer')
    }
  }, [gridSelection, currentModel])

  if (!currentModel) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <Squares2X2Icon className="h-16 w-16 mx-auto text-slate-400" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-4">No Model Loaded</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              Load an IFC model to build erection sequences
            </p>
            <Link to="/">
              <Button className="mt-6">Go to Files</Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  if (methodologyLoading || gridLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="h-full flex flex-col overflow-hidden"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Erection Methodology</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              Select grid area → Generate stages → View construction sequence
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-2 gap-6 p-6 min-h-0 overflow-hidden">
        {/* Left Panel - Grid Selector */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Squares2X2Icon className="w-4 h-4" />
                Select Grid Area
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {/* Instructions */}
            {!gridSelection && generatedStages.length === 0 && (
              <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm">
                <p className="text-blue-700 dark:text-blue-300 font-medium">How to use:</p>
                <ol className="text-slate-600 dark:text-slate-300 mt-2 space-y-1 list-decimal list-inside">
                  <li>Click and drag on the grid to select an area</li>
                  <li>Click "Generate Stages" to create Columns → Beams sequence</li>
                  <li>Use the playback controls to step through stages</li>
                </ol>
              </div>
            )}

            {/* Grid Selector */}
            {vAxes.length > 0 && uAxes.length > 0 ? (
              <div className="space-y-4">
                {/* Selected Range Display (draft selection) */}
                {gridSelection && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Selected Range:</p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                          Rows {gridSelection.uStart}–{gridSelection.uEnd}, Cols {gridSelection.vStart}–{gridSelection.vEnd}
                        </p>
                        <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                          ({gridSelection.uStart}{gridSelection.vStart} → {gridSelection.uEnd}{gridSelection.vEnd})
                        </p>
                      </div>
                      <button
                        onClick={handleClearSelection}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Grid Display */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 overflow-auto">
                  <div className="inline-block min-w-max relative">
                    {/* V axis labels (numbers) on top */}
                    <div className="flex">
                      <div className="w-8 h-6" /> {/* Corner spacer */}
                      {vAxes.map(v => (
                        <div key={v} className="w-8 h-6 text-xs text-slate-500 dark:text-slate-400 text-center font-medium">
                          {v}
                        </div>
                      ))}
                    </div>

                    {/* Grid cells with U axis labels (letters) on left */}
                    {uAxes.map(u => (
                      <div key={u} className="flex">
                        <div className="w-8 h-8 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center font-medium">
                          {u}
                        </div>
                        {vAxes.map(v => (
                          <div
                            key={`${v}-${u}`}
                            onMouseDown={() => handleCellMouseDown(v, u)}
                            onMouseEnter={() => {
                              handleCellMouseEnter(v, u)
                              handleCellHover(v, u)
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={cn(
                              'w-8 h-8 border-2 cursor-crosshair transition-all relative',
                              isCellSelected(v, u)
                                ? 'bg-blue-500/60 border-blue-600 dark:border-blue-400 shadow-sm'
                                : (hoveredCell && hoveredCell.row === uAxes.indexOf(u) && hoveredCell.col === vAxes.indexOf(v))
                                  ? 'bg-blue-300/40 border-blue-400' // Hover style
                                  : 'border-slate-300 dark:border-slate-600 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 hover:border-blue-400 dark:hover:border-blue-600'
                            )}
                            title={`Grid ${v} / ${u}`}
                          >
                            {isCellSelected(v, u) && (
                              <div className="absolute inset-0 bg-blue-500/20 animate-pulse" />
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Generate Button & Options */}
                {gridSelection && (
                  <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg space-y-3">
                    {/* Footing Toggle */}
                    <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-900/50">
                      <label htmlFor="footing-toggle" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-2">
                        <input
                          id="footing-toggle"
                          type="checkbox"
                          checked={includeFootings}
                          onChange={(e) => setIncludeFootings(e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span>Include Footings</span>
                      </label>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {includeFootings ? 'Footings → Columns → Beams' : 'Columns → Beams'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={handleApplySelectionToViewer}
                        type="button"
                        variant="outline"
                        className="flex-1 px-4"
                      >
                        <EyeIcon className="w-4 h-4 mr-2" />
                        Apply Selection to Viewer
                      </Button>
                      <Button
                        onClick={handleGenerateStages}
                        disabled={isGenerating}
                        className="flex-1 px-4"
                      >
                        {isGenerating ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                            Generating Stages...
                          </>
                        ) : (
                          <>
                            <DocumentTextIcon className="w-4 h-4 mr-2" />
                            Generate Stages
                          </>
                        )}
                      </Button>
                    </div>
                    {!isGenerating && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                        This will create {includeFootings ? 'Footings → ' : ''}Columns → Beams sequence for the selected area
                      </p>
                    )}
                  </div>
                )}

                {/* Generated Stages List */}
                {generatedStages.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <DocumentTextIcon className="w-4 h-4" />
                        Stages ({generatedStages.length})
                      </h3>

                      {/* Playback Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleReset}
                          className="p-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                          title="Reset View"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handlePrevStage}
                          disabled={currentStageIndex <= 0}
                          className="p-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Previous Stage"
                        >
                          <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handlePlayPause}
                          className={cn(
                            'p-2 rounded transition-colors',
                            isPlaying
                              ? 'bg-orange-500 hover:bg-orange-600 text-white'
                              : 'bg-green-500 hover:bg-green-600 text-white'
                          )}
                          title={isPlaying ? 'Pause' : 'Play Sequence'}
                        >
                          {isPlaying ? (
                            <PauseIcon className="w-4 h-4" />
                          ) : (
                            <PlayIcon className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={handleNextStage}
                          disabled={currentStageIndex >= generatedStages.length - 1}
                          className="p-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Next Stage"
                        >
                          <ChevronRightIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stage List */}
                    <div className="space-y-2">
                      {generatedStages.map((stage, idx) => {
                        const isComplete = idx < currentStageIndex
                        const isCurrent = idx === currentStageIndex

                        return (
                          <div
                            key={stage.stage_id}
                            onClick={() => goToStage(idx)}
                            className={cn(
                              'p-3 rounded-lg border cursor-pointer transition-all',
                              isCurrent
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : isComplete
                                  ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/30'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                                  isCurrent
                                    ? 'bg-blue-500 text-white'
                                    : isComplete
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                                      : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                                )}
                              >
                                {isComplete ? (
                                  <CheckCircleIcon className="w-5 h-5" />
                                ) : (
                                  stage.stage_id
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className={cn(
                                  'text-sm font-medium truncate',
                                  isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                                )}>
                                  {stage.name}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {stage.element_count} elements
                                </p>
                              </div>
                              {isCurrent && (
                                <div className="flex-shrink-0">
                                  <EyeIcon className="w-5 h-5 text-blue-500" />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">3D View Legend:</p>
                      <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ff00ff' }} />
                          <span className="text-slate-600 dark:text-slate-300">Current Stage</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded bg-gray-500 opacity-50" />
                          <span className="text-slate-600 dark:text-slate-300">Completed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded border border-slate-400 dark:border-slate-600" />
                          <span className="text-slate-600 dark:text-slate-300">Hidden</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <p>No grid detected in this model.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Viewer */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <div className="flex items-center gap-3">
                <CubeIcon className="w-4 h-4" />
                <div className="inline-flex items-center rounded-full bg-slate-800/60 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('plan')}
                    className={cn(
                      'px-3 py-1 rounded-full transition-colors',
                      viewMode === 'plan'
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    )}
                  >
                    Plan View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('3d')}
                    className={cn(
                      'px-3 py-1 rounded-full transition-colors',
                      viewMode === '3d'
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    )}
                  >
                    3D View
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {viewMode === 'plan' && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Grid overlay</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={gridOverlayOpacity}
                      onChange={(e) => setGridOverlayOpacity(parseFloat(e.target.value))}
                      className="w-24"
                    />
                  </div>
                )}
                {/* Transparency Slider */}
                {viewMode === 'plan' && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Model Opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.1}
                      value={modelOpacity}
                      onChange={(e) => setModelOpacity(parseFloat(e.target.value))}
                      className="w-24"
                    />
                  </div>
                )}
                {currentStageIndex >= 0 && generatedStages[currentStageIndex] && (
                  <span className="text-sm px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                    {generatedStages[currentStageIndex].name}
                  </span>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent noPadding className="flex-1 relative min-h-0">
            <IFCViewer
              ref={viewerRef}
              fileId={currentModel.file_id}
              fileName={currentModel.file_name}
              onStoreysLoaded={() => setIsViewerReady(true)}
              gridData={gridData ? { u_axes: gridData.u_axes, v_axes: gridData.v_axes } : undefined}
              mode={viewMode === 'plan' ? 'plan' : '3d'}
              gridOverlayOpacity={gridOverlayOpacity}
              modelOpacity={modelOpacity}
              // Selection Sync
              draftSelection={gridSelection ? {
                uStart: gridSelection.uStart,
                uEnd: gridSelection.uEnd,
                vStart: gridSelection.vStart,
                vEnd: gridSelection.vEnd
              } : null}
              appliedSelection={appliedSelection ? {
                uStart: appliedSelection.uStart,
                uEnd: appliedSelection.uEnd,
                vStart: appliedSelection.vStart,
                vEnd: appliedSelection.vEnd
              } : null}
              // Hover Sync
              hoverCell={hoveredCell}
              onOverlayHover={handleViewerHover}
            />
            {!isViewerReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 dark:bg-slate-900/80 z-10">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                  <p className="text-slate-500 dark:text-slate-400 mt-2">Loading model...</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div >
  )
}
