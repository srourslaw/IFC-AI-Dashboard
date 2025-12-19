/**
 * Erection Sequence Builder Page
 * Simplified grid-based methodology generation following Rosehill pattern
 *
 * User flow:
 * 1. Select a grid area (e.g., Grid 1-8 / B-J)
 * 2. Click "Generate Stages" - creates Columns then Beams stages
 * 3. Use playback to view each stage - ONLY that stage's elements are shown
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
  const [gridSelection, setGridSelection] = useState<GridSelection | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectionStart, setSelectionStart] = useState<{ v: string; u: string } | null>(null)

  // Generated stages
  const [generatedStages, setGeneratedStages] = useState<ErectionStage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Viewer state
  const [isViewerReady, setIsViewerReady] = useState(false)
  const [viewerInitialized, setViewerInitialized] = useState(false)

  // Playback state
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playbackTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Express IDs cache
  const [stageExpressIds, setStageExpressIds] = useState<Map<string, number[]>>(new Map())
  // ALL elements in the selected grid area (full building section)
  const [sectionIds, setSectionIds] = useState<number[]>([])

  const viewerRef = useRef<IFCViewerHandle>(null)

  // Grid axes from API
  const uAxes = useMemo(() => {
    if (!gridData) return []
    return gridData.u_axes
      .map(a => a.tag)
      .sort((a, b) => {
        // Sort letters alphabetically
        return a.localeCompare(b)
      })
  }, [gridData])

  const vAxes = useMemo(() => {
    if (!gridData) return []
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

      const result = await api.generateFromSequences(apiSequences, currentModel.file_id)

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
  }, [gridSelection, currentModel])

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
    setGeneratedStages([])
    setCurrentStageIndex(-1)
    setStageExpressIds(new Map())
    setSectionIds([])
    if (viewerRef.current) {
      viewerRef.current.showAllMeshes()
      viewerRef.current.clearHighlights()
    }
  }, [])

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
              {gridSelection && (
                <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                  Clear
                </Button>
              )}
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
                {/* Grid Display */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800/50 overflow-auto">
                  <div className="inline-block min-w-max">
                    {/* V axis labels (numbers) on top */}
                    <div className="flex">
                      <div className="w-8 h-6" /> {/* Corner spacer */}
                      {vAxes.map(v => (
                        <div key={v} className="w-8 h-6 text-xs text-slate-500 dark:text-slate-400 text-center">
                          {v}
                        </div>
                      ))}
                    </div>

                    {/* Grid cells with U axis labels (letters) on left */}
                    {uAxes.map(u => (
                      <div key={u} className="flex">
                        <div className="w-8 h-8 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center">
                          {u}
                        </div>
                        {vAxes.map(v => (
                          <div
                            key={`${v}-${u}`}
                            onMouseDown={() => handleCellMouseDown(v, u)}
                            onMouseEnter={() => handleCellMouseEnter(v, u)}
                            className={cn(
                              'w-8 h-8 border border-slate-300 dark:border-slate-600 cursor-pointer transition-colors',
                              isCellSelected(v, u)
                                ? 'bg-blue-500/40 border-blue-500'
                                : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                            )}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Selection Info & Generate Button */}
                {gridSelection && (
                  <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Selected Area:</p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          Grid {gridSelection.vStart}-{gridSelection.vEnd} / {gridSelection.uStart}-{gridSelection.uEnd}
                        </p>
                      </div>
                      <Button
                        onClick={handleGenerateStages}
                        disabled={isGenerating}
                        className="px-6"
                      >
                        {isGenerating ? (
                          <>
                            <ArrowPathIcon className="w-4 h-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          'Generate Stages'
                        )}
                      </Button>
                    </div>
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

        {/* Right Panel - 3D Viewer */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          <CardHeader className="py-3 flex-shrink-0">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <CubeIcon className="w-4 h-4" />
                3D View
              </span>
              {currentStageIndex >= 0 && generatedStages[currentStageIndex] && (
                <span className="text-sm px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                  {generatedStages[currentStageIndex].name}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent noPadding className="flex-1 relative min-h-0">
            <IFCViewer
              ref={viewerRef}
              fileId={currentModel.file_id}
              fileName={currentModel.file_name}
              onStoreysLoaded={() => setIsViewerReady(true)}
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
    </motion.div>
  )
}
