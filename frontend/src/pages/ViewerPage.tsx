/**
 * Viewer Page - 3D viewer with storey controls and erection methodology
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  EyeIcon,
  EyeSlashIcon,
  CubeIcon,
  ListBulletIcon,
  Squares2X2Icon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { IFCViewer, IFCViewerHandle, StoreyInfo } from '@/components/IFCViewer'
import { useMethodologyAnalysis, useRegenerateMethodology } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'
import { formatNumber } from '@/lib/utils'
import { api } from '@/lib/api'
import type { ErectionStage } from '@/lib/api'

// Zone colors for UI display
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

// Element type colors for 3D highlighting - distinct colors for each construction type
const ELEMENT_TYPE_COLORS: Record<string, number> = {
  footings: 0x64748b,  // slate/gray - foundation
  columns: 0x3b82f6,   // blue - vertical structure
  beams: 0x22c55e,     // green - horizontal structure
  bracing: 0xf59e0b,   // amber/orange - diagonal support
  slabs: 0xa855f7,     // purple - floor plates
  walls: 0xef4444,     // red - walls
  railings: 0x06b6d4,  // cyan - railings
  stairs: 0xec4899,    // pink - stairs
  default: 0x94a3b8,   // default gray
}

export function ViewerPage() {
  const { currentModel } = useAppStore()
  const { data: methodology, isLoading: methodLoading } = useMethodologyAnalysis()
  const regenerate = useRegenerateMethodology()

  // Viewer state
  const [storeys, setStoreys] = useState<StoreyInfo[]>([])
  const [visibleStoreys, setVisibleStoreys] = useState<Set<string>>(new Set())
  const [isViewerReady, setIsViewerReady] = useState(false)
  const viewerRef = useRef<IFCViewerHandle>(null)

  // Methodology state
  const [selectedTab, setSelectedTab] = useState<'storeys' | 'methodology'>('storeys')
  const [selectedZone, setSelectedZone] = useState<number | null>(null)
  const [highlightedStages, setHighlightedStages] = useState<Set<string>>(new Set())
  // Cache: stage_id -> { ids: number[], elementType: string }
  const [stageCache, setStageCache] = useState<Map<string, { ids: number[], elementType: string }>>(new Map())

  // Reset state when model changes
  useEffect(() => {
    setIsViewerReady(false)
    setHighlightedStages(new Set())
    setStageCache(new Map())
    setSelectedZone(null)
  }, [currentModel?.file_id])

  // When viewer is ready, hide all if methodology tab
  useEffect(() => {
    if (isViewerReady && viewerRef.current && selectedTab === 'methodology') {
      viewerRef.current.hideAllMeshes()
    }
  }, [isViewerReady, selectedTab])

  const handleStoreysLoaded = useCallback((loadedStoreys: StoreyInfo[]) => {
    const nonEmptyStoreys = loadedStoreys.filter(s => s.meshCount > 0)
    setStoreys(nonEmptyStoreys)
    setVisibleStoreys(new Set(nonEmptyStoreys.map(s => s.name)))
    setIsViewerReady(true)
  }, [])

  const toggleStorey = (storeyName: string) => {
    const newVisible = new Set(visibleStoreys)
    const isCurrentlyVisible = newVisible.has(storeyName)

    if (isCurrentlyVisible) {
      newVisible.delete(storeyName)
    } else {
      newVisible.add(storeyName)
    }
    setVisibleStoreys(newVisible)

    if (viewerRef.current) {
      viewerRef.current.setStoreyVisibility(storeyName, !isCurrentlyVisible)
    }
  }

  const showAllStoreys = () => {
    const allNames = new Set(storeys.map(s => s.name))
    setVisibleStoreys(allNames)
    if (viewerRef.current) {
      viewerRef.current.setAllStoreysVisibility(true)
    }
  }

  const hideAllStoreys = () => {
    setVisibleStoreys(new Set())
    if (viewerRef.current) {
      viewerRef.current.setAllStoreysVisibility(false)
    }
  }

  // Helper to update viewer with proper colors by element type
  const updateViewerHighlights = useCallback((
    stages: Set<string>,
    cache: Map<string, { ids: number[], elementType: string }>
  ) => {
    if (!viewerRef.current) return

    viewerRef.current.hideAllMeshes()
    viewerRef.current.clearHighlights()

    if (stages.size > 0) {
      // First, make all elements visible
      const visibleIds: number[] = []
      stages.forEach(sid => {
        const data = cache.get(sid)
        if (data?.ids) visibleIds.push(...data.ids)
      })

      if (visibleIds.length > 0) {
        viewerRef.current.setElementsOpacity([...new Set(visibleIds)], 1)

        // Then highlight each stage with its element type color
        stages.forEach(sid => {
          const data = cache.get(sid)
          if (data?.ids && data.ids.length > 0) {
            const color = ELEMENT_TYPE_COLORS[data.elementType] || ELEMENT_TYPE_COLORS.default
            viewerRef.current!.highlightElements(data.ids, color)
          }
        })
      }
    }
  }, [])

  // Toggle stage highlight
  const toggleStageHighlight = useCallback(async (stageId: string, elementType: string) => {
    if (!viewerRef.current || !isViewerReady) return

    const newStages = new Set(highlightedStages)
    const newCache = new Map(stageCache)

    if (newStages.has(stageId)) {
      newStages.delete(stageId)
    } else {
      // Fetch express IDs if not cached
      if (!newCache.has(stageId)) {
        try {
          const result = await api.getStageExpressIds(stageId, currentModel?.file_id)
          if (result.express_ids && result.express_ids.length > 0) {
            newCache.set(stageId, { ids: result.express_ids, elementType })
          }
        } catch (err) {
          console.error('Failed to get stage express IDs:', err)
          return
        }
      }
      newStages.add(stageId)
    }

    setHighlightedStages(newStages)
    setStageCache(newCache)
    updateViewerHighlights(newStages, newCache)
  }, [isViewerReady, highlightedStages, stageCache, currentModel?.file_id, updateViewerHighlights])

  const clearAllStages = useCallback(() => {
    if (viewerRef.current) {
      viewerRef.current.hideAllMeshes()
      viewerRef.current.clearHighlights()
    }
    setHighlightedStages(new Set())
  }, [])

  // View all stages (filtered by zone if selected)
  const viewAllStages = useCallback(async (zonedStages: ErectionStage[]) => {
    if (!viewerRef.current || !isViewerReady || zonedStages.length === 0) return

    const newStages = new Set(highlightedStages)
    const newCache = new Map(stageCache)

    // Fetch express IDs for all stages that aren't cached
    for (const stage of zonedStages) {
      if (!newCache.has(stage.stage_id)) {
        try {
          const result = await api.getStageExpressIds(stage.stage_id, currentModel?.file_id)
          if (result.express_ids && result.express_ids.length > 0) {
            newCache.set(stage.stage_id, { ids: result.express_ids, elementType: stage.element_type })
          }
        } catch (err) {
          console.error('Failed to get stage express IDs:', err)
        }
      }
      newStages.add(stage.stage_id)
    }

    setHighlightedStages(newStages)
    setStageCache(newCache)
    updateViewerHighlights(newStages, newCache)
  }, [isViewerReady, highlightedStages, stageCache, currentModel?.file_id, updateViewerHighlights])

  // Clear stages for a specific zone only
  const clearZoneStages = useCallback((zonedStages: ErectionStage[]) => {
    if (!viewerRef.current) return

    const zoneStageIds = new Set(zonedStages.map(s => s.stage_id))
    const newStages = new Set([...highlightedStages].filter(sid => !zoneStageIds.has(sid)))

    setHighlightedStages(newStages)
    updateViewerHighlights(newStages, stageCache)
  }, [highlightedStages, stageCache, updateViewerHighlights])

  // Switch to storeys tab - show all
  const handleTabChange = (tab: 'storeys' | 'methodology') => {
    setSelectedTab(tab)
    if (viewerRef.current) {
      if (tab === 'storeys') {
        viewerRef.current.showAllMeshes()
        viewerRef.current.clearHighlights()
      } else {
        viewerRef.current.hideAllMeshes()
        viewerRef.current.clearHighlights()
        setHighlightedStages(new Set())
      }
    }
  }

  if (!currentModel) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center max-w-md">
          <CubeIcon className="h-12 w-12 mx-auto text-slate-400" />
          <h2 className="text-lg font-medium text-slate-900 dark:text-white mt-4">No Model Loaded</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            Load an IFC model to view it in 3D
          </p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            Select a File
          </Link>
        </div>
      </div>
    )
  }

  const analysis = methodology?.analysis
  const zones = analysis?.zones || []
  const stages = selectedZone
    ? (analysis?.stages || []).filter(s => s.zone_id === selectedZone)
    : (analysis?.stages || [])

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* 3D Viewer */}
      <div className="flex-1 card overflow-hidden">
        <IFCViewer
          ref={viewerRef}
          fileId={currentModel.file_id}
          fileName={currentModel.file_name}
          onStoreysLoaded={handleStoreysLoaded}
        />
        {!isViewerReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto"></div>
              <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm">Loading 3D model...</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls Panel */}
      <div className="w-80 flex flex-col gap-4">
        {/* Tab Switch */}
        <div className="card p-1 flex gap-1">
          <button
            onClick={() => handleTabChange('storeys')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTab === 'storeys'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <CubeIcon className="h-4 w-4 inline mr-2" />
            Storeys
          </button>
          <button
            onClick={() => handleTabChange('methodology')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedTab === 'methodology'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <Squares2X2Icon className="h-4 w-4 inline mr-2" />
            Erection
          </button>
        </div>

        {/* Storeys Tab */}
        {selectedTab === 'storeys' && (
          <div className="card flex-1 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {storeys.length} Storeys
              </span>
              <div className="flex gap-1">
                <button
                  onClick={showAllStoreys}
                  disabled={!isViewerReady}
                  className="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Show All
                </button>
                <button
                  onClick={hideAllStoreys}
                  disabled={!isViewerReady}
                  className="px-2 py-1 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                  Hide All
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {storeys.map((storey) => {
                const isVisible = visibleStoreys.has(storey.name)
                return (
                  <button
                    key={storey.name}
                    onClick={() => toggleStorey(storey.name)}
                    className={`w-full px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-700 transition-colors ${
                      isVisible
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 opacity-60'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-sm font-medium ${isVisible ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {storey.name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {storey.elevation !== -Infinity ? `${(storey.elevation / 1000).toFixed(2)} m` : 'N/A'} • {formatNumber(storey.meshCount)} objects
                      </p>
                    </div>
                    {isVisible ? (
                      <EyeIcon className="h-5 w-5 text-blue-500" />
                    ) : (
                      <EyeSlashIcon className="h-5 w-5 text-slate-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Methodology Tab */}
        {selectedTab === 'methodology' && (
          <>
            {/* Zones */}
            <div className="card">
              <div className="p-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  Zones
                </span>
                <button
                  onClick={() => regenerate.mutate(currentModel?.file_id)}
                  disabled={regenerate.isPending}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                  title="Regenerate"
                >
                  <ArrowPathIcon className={`h-4 w-4 text-slate-500 ${regenerate.isPending ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="p-2 space-y-2">
                {/* Zone pills */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setSelectedZone(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      selectedZone === null
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    All ({analysis?.stages_count || 0})
                  </button>
                  {zones.map((zone) => {
                    const color = ZONE_COLORS[zone.zone_id % 8] || ZONE_COLORS[1]
                    const zoneStages = (analysis?.stages || []).filter(s => s.zone_id === zone.zone_id)
                    const zoneHighlightedCount = zoneStages.filter(s => highlightedStages.has(s.stage_id)).length
                    return (
                      <button
                        key={zone.zone_id}
                        onClick={() => setSelectedZone(zone.zone_id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          selectedZone === zone.zone_id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                        />
                        Z{zone.zone_id}
                        {zoneHighlightedCount > 0 && (
                          <span className="ml-1 px-1 py-0.5 bg-emerald-500 text-white rounded text-[10px]">
                            {zoneHighlightedCount}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Zone quick actions when a zone is selected */}
                {selectedZone !== null && (
                  <div className="flex gap-1 pt-1 border-t border-slate-100 dark:border-slate-700">
                    <button
                      onClick={() => {
                        const zoneStages = (analysis?.stages || []).filter(s => s.zone_id === selectedZone)
                        viewAllStages(zoneStages)
                      }}
                      disabled={!isViewerReady}
                      className="flex-1 px-2 py-1.5 text-xs rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors"
                    >
                      <EyeIcon className="h-3 w-3 inline mr-1" />
                      View Zone {selectedZone}
                    </button>
                    <button
                      onClick={() => {
                        const zoneStages = (analysis?.stages || []).filter(s => s.zone_id === selectedZone)
                        clearZoneStages(zoneStages)
                      }}
                      disabled={!isViewerReady}
                      className="flex-1 px-2 py-1.5 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      <EyeSlashIcon className="h-3 w-3 inline mr-1" />
                      Clear Zone {selectedZone}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stages */}
            <div className="card flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">
                    <ListBulletIcon className="h-4 w-4 inline mr-1" />
                    Stages
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {highlightedStages.size > 0 ? `${highlightedStages.size} of ${stages.length} shown` : `${stages.length} total`}
                    </span>
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => viewAllStages(stages)}
                    disabled={!isViewerReady || stages.length === 0}
                    className="flex-1 px-2 py-1.5 text-xs rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                  >
                    <EyeIcon className="h-3 w-3 inline mr-1" />
                    View All
                  </button>
                  <button
                    onClick={clearAllStages}
                    disabled={!isViewerReady || highlightedStages.size === 0}
                    className="flex-1 px-2 py-1.5 text-xs rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    <EyeSlashIcon className="h-3 w-3 inline mr-1" />
                    Clear All
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {methodLoading ? (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    Loading methodology...
                  </div>
                ) : stages.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">
                    No stages found
                  </div>
                ) : (
                  stages.map((stage) => (
                    <StageItem
                      key={stage.stage_id}
                      stage={stage}
                      isHighlighted={highlightedStages.has(stage.stage_id)}
                      onToggle={() => toggleStageHighlight(stage.stage_id, stage.element_type)}
                    />
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// CSS color classes matching ELEMENT_TYPE_COLORS for UI consistency
const ELEMENT_TYPE_CSS: Record<string, string> = {
  footings: 'bg-slate-500',    // matches 0x64748b
  columns: 'bg-blue-500',      // matches 0x3b82f6
  beams: 'bg-emerald-500',     // matches 0x22c55e
  bracing: 'bg-amber-500',     // matches 0xf59e0b
  slabs: 'bg-purple-500',      // matches 0xa855f7
  walls: 'bg-red-500',         // matches 0xef4444
  railings: 'bg-cyan-500',     // matches 0x06b6d4
  stairs: 'bg-pink-500',       // matches 0xec4899
}

function StageItem({
  stage,
  isHighlighted,
  onToggle,
}: {
  stage: ErectionStage
  isHighlighted: boolean
  onToggle: () => void
}) {
  const bgColor = ELEMENT_TYPE_CSS[stage.element_type] || 'bg-slate-500'

  return (
    <div
      className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700 cursor-pointer transition-colors ${
        isHighlighted
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white"
          style={{ backgroundColor: `#${(ELEMENT_TYPE_COLORS[stage.element_type] || ELEMENT_TYPE_COLORS.default).toString(16).padStart(6, '0')}` }}
        >
          {stage.stage_id}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
            {stage.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded text-white ${bgColor}`}>
              {stage.element_type}
            </span>
            <span className="text-xs text-slate-500">
              {formatNumber(stage.element_count)} elements
            </span>
          </div>
        </div>
        {isHighlighted ? (
          <EyeIcon className="h-5 w-5 text-blue-500" />
        ) : (
          <EyeSlashIcon className="h-5 w-5 text-slate-400" />
        )}
      </div>
    </div>
  )
}
