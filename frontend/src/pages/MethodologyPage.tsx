/**
 * Methodology Page - Erection Methodology Generator
 * Auto-generates construction sequencing from IFC structural data
 * 3D viewer with zone/stage highlighting - the core feature
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Squares2X2Icon,
  ListBulletIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  CubeIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Skeleton } from '@/components/ui'
import { IFCViewer, IFCViewerHandle } from '@/components/IFCViewer'
import { useMethodologyAnalysis, useRegenerateMethodology } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { formatNumber, cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ErectionZone, ErectionStage } from '@/lib/api'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

// Zone colors for 3D highlighting - bright and distinct
const ZONE_COLORS: Record<number, number> = {
  1: 0x3b82f6, // blue
  2: 0x22c55e, // green
  3: 0xeab308, // yellow
  4: 0xf97316, // orange
  5: 0xa855f7, // purple
  6: 0xec4899, // pink
  7: 0x06b6d4, // cyan
  8: 0xef4444, // red
}

// Element type colors for badges
const elementTypeColors: Record<string, string> = {
  columns: 'bg-blue-500',
  beams: 'bg-green-500',
  bracing: 'bg-yellow-500',
  slabs: 'bg-purple-500',
  walls: 'bg-orange-500',
}

function ZoneCard({
  zone,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleHighlight
}: {
  zone: ErectionZone
  isSelected: boolean
  isHighlighted: boolean
  onSelect: () => void
  onToggleHighlight: () => void
}) {
  const zoneColor = ZONE_COLORS[((zone.zone_id - 1) % 8) + 1]
  const colorHex = `#${zoneColor.toString(16).padStart(6, '0')}`

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        'cursor-pointer p-4 rounded-lg border-2 transition-all',
        isSelected
          ? 'border-primary-500 bg-primary-500/10'
          : 'border-secondary-700 bg-secondary-800/50 hover:border-secondary-600'
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div onClick={onSelect} className="flex-1">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: colorHex }}
            />
            <h3 className="font-semibold text-secondary-200">Zone {zone.zone_id}</h3>
          </div>
          <p className="text-sm text-secondary-400 mt-1">{zone.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleHighlight(); }}
            className={cn(
              'p-2 rounded-lg transition-all',
              isHighlighted
                ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30'
                : 'bg-secondary-700 hover:bg-secondary-600 text-secondary-300'
            )}
            title={isHighlighted ? "Hide in 3D" : "Show in 3D"}
          >
            {isHighlighted ? (
              <EyeIcon className="w-4 h-4" />
            ) : (
              <EyeSlashIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2" onClick={onSelect}>
        <span className="text-xs px-2 py-1 rounded-full bg-secondary-700 text-secondary-300">
          {formatNumber(zone.element_count)} elements
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5" onClick={onSelect}>
        {Object.entries(zone.element_counts).map(([type, count]) => (
          <span
            key={type}
            className={cn(
              'text-xs px-2 py-0.5 rounded',
              elementTypeColors[type] || 'bg-secondary-600',
              'text-white'
            )}
          >
            {type}: {count}
          </span>
        ))}
      </div>
    </motion.div>
  )
}

function StageRow({
  stage,
  isHighlighted,
  onToggleHighlight
}: {
  stage: ErectionStage
  isHighlighted: boolean
  onToggleHighlight: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      variants={itemVariants}
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        isHighlighted
          ? 'border-green-500 bg-green-500/5'
          : 'border-secondary-700'
      )}
    >
      <div className="flex items-center gap-4 p-4 hover:bg-secondary-800/30 transition-colors">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-mono text-sm cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {stage.stage_id}
        </div>

        <div className="flex-grow cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <h4 className="font-medium text-secondary-200">{stage.name}</h4>
          <p className="text-sm text-secondary-400">{stage.description}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleHighlight(); }}
            className={cn(
              'p-2 rounded-lg transition-all',
              isHighlighted
                ? 'bg-green-500 text-white shadow-lg shadow-green-500/30'
                : 'bg-secondary-700 hover:bg-secondary-600 text-secondary-300'
            )}
            title={isHighlighted ? "Hide in 3D" : "Show in 3D"}
          >
            {isHighlighted ? (
              <EyeIcon className="w-4 h-4" />
            ) : (
              <EyeSlashIcon className="w-4 h-4" />
            )}
          </button>
          <span className={cn(
            'text-xs px-2 py-1 rounded',
            elementTypeColors[stage.element_type] || 'bg-secondary-600',
            'text-white'
          )}>
            {stage.element_type}
          </span>
          <span className="text-secondary-400 text-sm whitespace-nowrap">
            {formatNumber(stage.element_count)} elements
          </span>
          <svg
            className={cn(
              'w-5 h-5 text-secondary-400 transition-transform cursor-pointer',
              expanded && 'rotate-180'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            onClick={() => setExpanded(!expanded)}
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="px-4 pb-4 border-t border-secondary-700/50"
        >
          <div className="pt-4">
            <h5 className="text-sm font-medium text-secondary-300 mb-2">Instructions:</h5>
            <ul className="space-y-1">
              {stage.instructions.map((instruction, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-secondary-400">
                  <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  {instruction}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export function MethodologyPage() {
  const { currentModel } = useAppStore()
  const { data: methodology, isLoading, error } = useMethodologyAnalysis()
  const regenerate = useRegenerateMethodology()

  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  const [isViewerReady, setIsViewerReady] = useState(false)
  // Multi-select: track all highlighted zones and stages
  const [highlightedZones, setHighlightedZones] = useState<Set<number>>(new Set())
  const [highlightedStages, setHighlightedStages] = useState<Set<string>>(new Set())
  // Cache express IDs for highlighted items to avoid re-fetching
  const [highlightedExpressIds, setHighlightedExpressIds] = useState<Map<string, number[]>>(new Map())
  const [isExporting, setIsExporting] = useState(false)
  const viewerRef = useRef<IFCViewerHandle>(null)

  // Reset state when model changes
  useEffect(() => {
    setIsViewerReady(false)
    setHighlightedZones(new Set())
    setHighlightedStages(new Set())
    setHighlightedExpressIds(new Map())
  }, [currentModel?.file_id])

  // When viewer is ready, HIDE ALL meshes initially
  useEffect(() => {
    if (isViewerReady && viewerRef.current) {
      // HIDE ALL elements initially - user will toggle them ON step by step
      viewerRef.current.hideAllMeshes()
      console.log('MethodologyPage: All meshes hidden initially')
    }
  }, [isViewerReady])

  const handleViewerReady = useCallback(() => {
    setIsViewerReady(true)
  }, [])

  // Update the 3D view based on all currently toggled items
  // LOGIC: Everything starts HIDDEN. Only toggled items become VISIBLE.
  const updateViewer = useCallback((
    zones: Set<number>,
    stages: Set<string>,
    expressIdsCache: Map<string, number[]>
  ) => {
    if (!viewerRef.current || !isViewerReady) return

    // First, HIDE everything
    viewerRef.current.hideAllMeshes()
    viewerRef.current.clearHighlights()

    // If nothing selected, keep everything hidden
    if (zones.size === 0 && stages.size === 0) {
      console.log('MethodologyPage: No zones/stages selected, all hidden')
      return
    }

    // Collect all express IDs to show
    const visibleIds: number[] = []

    // Add zone express IDs
    zones.forEach(zoneId => {
      const ids = expressIdsCache.get(`zone-${zoneId}`)
      if (ids) {
        visibleIds.push(...ids)
      }
    })

    // Add stage express IDs
    stages.forEach(stageId => {
      const ids = expressIdsCache.get(`stage-${stageId}`)
      if (ids) {
        visibleIds.push(...ids)
      }
    })

    // Make visible IDs fully opaque (SHOW them)
    if (visibleIds.length > 0) {
      const uniqueVisibleIds = [...new Set(visibleIds)]
      console.log(`MethodologyPage: Showing ${uniqueVisibleIds.length} elements`)
      // Set opacity to 1 makes mesh.visible = true
      viewerRef.current.setElementsOpacity(uniqueVisibleIds, 1)

      // Apply colors to zones
      zones.forEach(zoneId => {
        const ids = expressIdsCache.get(`zone-${zoneId}`)
        if (ids) {
          const color = ZONE_COLORS[((zoneId - 1) % 8) + 1]
          viewerRef.current!.highlightElements(ids, color)
        }
      })

      // Apply green color to stages
      stages.forEach(stageId => {
        const ids = expressIdsCache.get(`stage-${stageId}`)
        if (ids) {
          viewerRef.current!.highlightElements(ids, 0x22c55e)
        }
      })
    }
  }, [isViewerReady])

  // Toggle zone highlight - multi-select
  const toggleZoneHighlight = useCallback(async (zoneId: number) => {
    if (!viewerRef.current || !isViewerReady) return

    const newZones = new Set(highlightedZones)
    const newCache = new Map(highlightedExpressIds)

    if (newZones.has(zoneId)) {
      // Turn off this zone
      newZones.delete(zoneId)
    } else {
      // Turn on this zone - fetch express IDs if not cached
      const cacheKey = `zone-${zoneId}`
      if (!newCache.has(cacheKey)) {
        try {
          const result = await api.getZoneExpressIds(zoneId, currentModel?.file_id)
          if (result.express_ids && result.express_ids.length > 0) {
            newCache.set(cacheKey, result.express_ids)
          }
        } catch (err) {
          console.error('Failed to get zone express IDs:', err)
          return
        }
      }
      newZones.add(zoneId)
    }

    setHighlightedZones(newZones)
    setHighlightedExpressIds(newCache)
    updateViewer(newZones, highlightedStages, newCache)
  }, [isViewerReady, highlightedZones, highlightedStages, highlightedExpressIds, currentModel?.file_id, updateViewer])

  // Toggle stage highlight - multi-select
  const toggleStageHighlight = useCallback(async (stageId: string) => {
    if (!viewerRef.current || !isViewerReady) return

    const newStages = new Set(highlightedStages)
    const newCache = new Map(highlightedExpressIds)

    if (newStages.has(stageId)) {
      // Turn off this stage
      newStages.delete(stageId)
    } else {
      // Turn on this stage - fetch express IDs if not cached
      const cacheKey = `stage-${stageId}`
      if (!newCache.has(cacheKey)) {
        try {
          const result = await api.getStageExpressIds(stageId, currentModel?.file_id)
          if (result.express_ids && result.express_ids.length > 0) {
            newCache.set(cacheKey, result.express_ids)
          }
        } catch (err) {
          console.error('Failed to get stage express IDs:', err)
          return
        }
      }
      newStages.add(stageId)
    }

    setHighlightedStages(newStages)
    setHighlightedExpressIds(newCache)
    updateViewer(highlightedZones, newStages, newCache)
  }, [isViewerReady, highlightedZones, highlightedStages, highlightedExpressIds, currentModel?.file_id, updateViewer])

  const clearAllHighlights = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.clearHighlights()
      // Hide everything again (back to initial state)
      viewerRef.current.hideAllMeshes()
    }
    setHighlightedZones(new Set())
    setHighlightedStages(new Set())
  }, [])

  const handleExportPdf = useCallback(async () => {
    if (!currentModel) return

    try {
      setIsExporting(true)
      const blob = await api.exportMethodologyPdf(currentModel.file_id)

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${currentModel.file_name.replace('.ifc', '').replace('.IFC', '')}_erection_methodology.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Failed to export PDF:', err)
    } finally {
      setIsExporting(false)
    }
  }, [currentModel])

  if (!currentModel) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <Squares2X2Icon className="h-16 w-16 mx-auto text-secondary-600" />
            <h2 className="text-xl font-semibold text-secondary-200 mt-4">No Model Loaded</h2>
            <p className="text-secondary-500 mt-2">
              Load an IFC model to generate erection methodology
            </p>
            <Link to="/dashboard">
              <Button className="mt-6">
                Upload a Model
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  if (error || !methodology) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-full flex items-center justify-center"
      >
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12">
            <Squares2X2Icon className="h-16 w-16 mx-auto text-red-500" />
            <h2 className="text-xl font-semibold text-secondary-200 mt-4">Analysis Error</h2>
            <p className="text-secondary-500 mt-2">
              Failed to analyze model for erection methodology. This model may not have structural elements.
            </p>
            <Button
              className="mt-6"
              onClick={() => regenerate.mutate(currentModel?.file_id)}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? 'Regenerating...' : 'Retry Analysis'}
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  const analysis = methodology.analysis
  const zones = analysis.zones
  const stages = selectedZone
    ? analysis.stages.filter(s => s.zone_id === selectedZone)
    : analysis.stages

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-full flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-secondary-100">Erection Methodology</h1>
            <p className="text-secondary-400 mt-1">
              Auto-generated construction sequence for {currentModel?.file_name}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => regenerate.mutate(currentModel?.file_id)}
              disabled={regenerate.isPending}
            >
              <ArrowPathIcon className={cn('w-4 h-4 mr-2', regenerate.isPending && 'animate-spin')} />
              Regenerate
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={isExporting}
            >
              <DocumentTextIcon className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-800/50 border border-secondary-700">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Squares2X2Icon className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-secondary-100">{analysis.grid_axes_count}</p>
              <p className="text-xs text-secondary-400">Grid Axes</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-800/50 border border-secondary-700">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CubeIcon className="w-4 h-4 text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-secondary-100">{formatNumber(analysis.total_elements)}</p>
              <p className="text-xs text-secondary-400">Elements</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-800/50 border border-secondary-700">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Squares2X2Icon className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-secondary-100">{analysis.zones_count}</p>
              <p className="text-xs text-secondary-400">Zones</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary-800/50 border border-secondary-700">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <ListBulletIcon className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-secondary-100">{analysis.stages_count}</p>
              <p className="text-xs text-secondary-400">Stages</p>
            </div>
          </div>
        </div>

        {/* Grid Status */}
        <div className="flex items-center gap-2 mt-3 text-sm">
          {analysis.grid_detected ? (
            <>
              <CheckCircleIcon className="w-4 h-4 text-green-500" />
              <span className="text-secondary-300">
                IFC Grid detected: {analysis.grid_cells_count} cells
              </span>
            </>
          ) : (
            <>
              <ClockIcon className="w-4 h-4 text-yellow-500" />
              <span className="text-secondary-300">
                Virtual grid created (no IfcGrid in model)
              </span>
            </>
          )}
        </div>
      </div>

      {/* Main Content - 3D Viewer + Controls */}
      <div className="flex-1 grid grid-cols-3 gap-4 px-6 pb-6 min-h-0">
        {/* Left Panel - Zones & Stages */}
        <div className="col-span-1 flex flex-col gap-4 overflow-hidden">
          {/* Zones */}
          <Card className="flex-shrink-0">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Squares2X2Icon className="w-4 h-4" />
                Erection Zones
                {highlightedZones.size > 0 && (
                  <span className="text-xs text-primary-400 ml-2">({highlightedZones.size} selected)</span>
                )}
                {(highlightedZones.size > 0 || highlightedStages.size > 0) && (
                  <button
                    onClick={clearAllHighlights}
                    className="ml-auto text-xs px-2 py-1 rounded bg-secondary-700 hover:bg-secondary-600 text-secondary-300"
                  >
                    Clear All
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
              <button
                onClick={() => { setSelectedZone(null); clearAllHighlights(); }}
                className={cn(
                  'w-full text-left p-2 rounded-lg border text-sm transition-all',
                  selectedZone === null
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-secondary-700 hover:border-secondary-600'
                )}
              >
                <span className="text-secondary-200 font-medium">All Zones</span>
                <span className="text-secondary-400 text-xs ml-2">({analysis.stages_count} stages)</span>
              </button>

              {zones.map((zone) => (
                <ZoneCard
                  key={zone.zone_id}
                  zone={zone}
                  isSelected={selectedZone === zone.zone_id}
                  isHighlighted={highlightedZones.has(zone.zone_id)}
                  onSelect={() => setSelectedZone(zone.zone_id)}
                  onToggleHighlight={() => toggleZoneHighlight(zone.zone_id)}
                />
              ))}
            </CardContent>
          </Card>

          {/* Stages */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-3 flex-shrink-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListBulletIcon className="w-4 h-4" />
                Erection Sequence
                {selectedZone && (
                  <span className="text-xs font-normal text-secondary-400">
                    - Zone {selectedZone}
                  </span>
                )}
                {highlightedStages.size > 0 && (
                  <span className="text-xs text-green-400 ml-2">({highlightedStages.size} selected)</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto space-y-2">
              {stages.length === 0 ? (
                <div className="text-center py-8 text-secondary-400 text-sm">
                  No stages found
                </div>
              ) : (
                stages.map((stage) => (
                  <StageRow
                    key={stage.stage_id}
                    stage={stage}
                    isHighlighted={highlightedStages.has(stage.stage_id)}
                    onToggleHighlight={() => toggleStageHighlight(stage.stage_id)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - 3D Viewer (ALWAYS VISIBLE) */}
        <div className="col-span-2 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CubeIcon className="w-4 h-4" />
                  3D Zone Visualization
                </CardTitle>
                <div className="flex items-center gap-2">
                  {highlightedZones.size > 0 && (
                    <span className="text-xs px-2 py-1 rounded bg-primary-500/20 text-primary-400">
                      {highlightedZones.size} zone{highlightedZones.size > 1 ? 's' : ''} shown
                    </span>
                  )}
                  {highlightedStages.size > 0 && (
                    <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
                      {highlightedStages.size} stage{highlightedStages.size > 1 ? 's' : ''} shown
                    </span>
                  )}
                  {highlightedZones.size === 0 && highlightedStages.size === 0 && isViewerReady && (
                    <span className="text-xs text-secondary-400">
                      All elements hidden - toggle to reveal step-by-step
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent noPadding className="flex-1 relative min-h-0">
              <IFCViewer
                ref={viewerRef}
                fileId={currentModel.file_id}
                fileName={currentModel.file_name}
                onStoreysLoaded={handleViewerReady}
              />
              {!isViewerReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-secondary-900/80 z-10">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                    <p className="text-secondary-400 mt-2">Loading 3D viewer...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}
