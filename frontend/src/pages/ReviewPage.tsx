/**
 * Review Page - Human methodology review with AI chat assistant
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentCheckIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline'
import { useAppStore } from '@/store/appStore'
import { api, MethodologyReview, ZoneEdit, StageEdit } from '@/lib/api'
import { AIChatPanel } from '@/components/AIChatPanel'
import { IFCContext } from '@/contexts/AIContext'
import toast from 'react-hot-toast'

// Status colors and labels
const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
  ai_reviewed: { label: 'Reviewed', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  human_reviewed: { label: 'Reviewed', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  finalized: { label: 'Finalized', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
}

// Element type colors matching ViewerPage
const ELEMENT_TYPE_COLORS: Record<string, string> = {
  footings: 'bg-slate-500',
  columns: 'bg-blue-500',
  beams: 'bg-green-500',
  bracing: 'bg-amber-500',
  slabs: 'bg-purple-500',
  walls: 'bg-red-500',
  railings: 'bg-cyan-500',
  stairs: 'bg-pink-500',
}

export function ReviewPage() {
  const { currentModel } = useAppStore()
  const [review, setReview] = useState<MethodologyReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedZones, setExpandedZones] = useState<Set<number>>(new Set())
  const [editingStage, setEditingStage] = useState<string | null>(null)
  const [editingStageName, setEditingStageName] = useState('')
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [reviewerName, setReviewerName] = useState('')
  const [reviewComments, setReviewComments] = useState('')
  const [chatPanelOpen, setChatPanelOpen] = useState(false)

  const fileId = currentModel?.file_id

  // Build IFC context for AI chat
  const ifcContext = useMemo((): IFCContext | null => {
    if (!review) return null

    const elementTypes: Record<string, number> = {}
    const levels = new Set<string>()

    review.zones.forEach(zone => {
      levels.add(zone.storey_name)
      zone.stages.forEach(stage => {
        elementTypes[stage.element_type] = (elementTypes[stage.element_type] || 0) + stage.element_ids.length
      })
    })

    return {
      fileName: review.file_name,
      totalElements: review.total_elements,
      totalZones: review.zones.length,
      totalStages: review.zones.reduce((acc, z) => acc + z.stages.length, 0),
      levels: Array.from(levels),
      elementTypes,
      zones: review.zones.map(z => ({
        name: z.name,
        storeyName: z.storey_name,
        stageCount: z.stages.length,
        elementCount: z.stages.reduce((acc, s) => acc + s.element_ids.length, 0),
      })),
      stages: review.zones.flatMap(z =>
        z.stages.map(s => ({
          name: s.name,
          zoneName: z.name,
          elementType: s.element_type,
          elementCount: s.element_ids.length,
          sequenceOrder: s.sequence_order,
        }))
      ),
    }
  }, [review])

  // Load review on mount
  useEffect(() => {
    if (fileId) {
      loadReview()
    }
  }, [fileId])

  const loadReview = async () => {
    if (!fileId) return
    setLoading(true)
    try {
      const response = await api.getReview(fileId)
      if (response.review) {
        setReview(response.review)
        setExpandedZones(new Set(response.review.zones.map(z => z.zone_id)))
      }
    } catch (error) {
      console.error('Error loading review:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStageEdit = async (stageId: string, name: string) => {
    if (!fileId) return
    try {
      const response = await api.updateStage(fileId, stageId, { name })
      if (response.review) {
        setReview(response.review)
        toast.success('Stage updated')
      }
      setEditingStage(null)
    } catch (error) {
      console.error('Error updating stage:', error)
    }
  }

  const handleStageReview = async (stageId: string, isReviewed: boolean) => {
    if (!fileId) return
    try {
      const response = await api.updateStage(fileId, stageId, { is_reviewed: isReviewed })
      if (response.review) {
        setReview(response.review)
      }
    } catch (error) {
      console.error('Error updating stage:', error)
    }
  }

  const handleDeleteStage = async (stageId: string) => {
    if (!fileId) return
    if (!confirm('Are you sure you want to delete this stage?')) return
    try {
      const response = await api.deleteStage(fileId, stageId)
      if (response.review) {
        setReview(response.review)
        toast.success('Stage deleted')
      }
    } catch (error) {
      console.error('Error deleting stage:', error)
    }
  }

  const handleFinalize = async () => {
    if (!fileId) return
    try {
      const response = await api.finalizeReview(fileId, {
        reviewed_by: reviewerName || undefined,
        comments: reviewComments || undefined,
      })
      if (response.review) {
        setReview(response.review)
        toast.success('Methodology finalized!')
        setShowFinalizeModal(false)
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Cannot finalize')
    }
  }

  const handleReset = async () => {
    if (!fileId) return
    if (!confirm('Reset will discard all changes. Continue?')) return
    try {
      const response = await api.resetReview(fileId)
      if (response.review) {
        setReview(response.review)
        toast.success('Review reset')
      }
    } catch (error) {
      console.error('Error resetting review:', error)
    }
  }

  const toggleZone = (zoneId: number) => {
    const newExpanded = new Set(expandedZones)
    if (newExpanded.has(zoneId)) {
      newExpanded.delete(zoneId)
    } else {
      newExpanded.add(zoneId)
    }
    setExpandedZones(newExpanded)
  }

  // Calculate stats
  const totalStages = review?.zones.reduce((acc, z) => acc + z.stages.length, 0) || 0
  const reviewedStages = review?.zones.reduce((acc, z) => acc + z.stages.filter(s => s.is_reviewed).length, 0) || 0

  if (!currentModel) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <DocumentCheckIcon className="w-16 h-16 text-slate-300 dark:text-slate-600 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
          No Model Loaded
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Load an IFC file first to review methodology.
        </p>
        <Link to="/" className="btn-primary">
          Go to Files
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-600 dark:text-slate-400">Loading review...</span>
      </div>
    )
  }

  return (
    <div className={`space-y-6 transition-all ${chatPanelOpen ? 'mr-96' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Review Methodology
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {review?.file_name || currentModel.file_name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {review && (
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${STATUS_CONFIG[review.status.status].color}`}>
              {STATUS_CONFIG[review.status.status].label}
            </span>
          )}
          <button
            onClick={() => setChatPanelOpen(!chatPanelOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              chatPanelOpen
                ? 'bg-blue-600 text-white'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
            }`}
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
            AI Assistant
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {review && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {review.total_elements}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Total Elements</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {review.zones.length}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Zones</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {totalStages}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Stages</div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                {reviewedStages}/{totalStages}
              </div>
              {reviewedStages === totalStages && totalStages > 0 && (
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
              )}
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Stages Reviewed</div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        {review?.status.status !== 'finalized' && (
          <>
            <button
              onClick={() => setShowFinalizeModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <DocumentCheckIcon className="w-4 h-4" />
              Finalize Methodology
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              Reset
            </button>
          </>
        )}
      </div>

      {/* Methodology Editor - Full Width */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <DocumentCheckIcon className="w-5 h-5 text-green-500" />
          Erection Methodology
        </h2>

        {!review?.zones.length ? (
          <div className="text-center py-12">
            <DocumentCheckIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              No methodology data available. Load an IFC file with methodology data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {review.zones.map((zone) => (
              <ZoneCard
                key={zone.zone_id}
                zone={zone}
                expanded={expandedZones.has(zone.zone_id)}
                onToggle={() => toggleZone(zone.zone_id)}
                editingStage={editingStage}
                editingStageName={editingStageName}
                onStartEdit={(stageId, name) => {
                  setEditingStage(stageId)
                  setEditingStageName(name)
                }}
                onCancelEdit={() => setEditingStage(null)}
                onSaveEdit={(stageId) => handleStageEdit(stageId, editingStageName)}
                onStageNameChange={setEditingStageName}
                onStageReview={handleStageReview}
                onDeleteStage={handleDeleteStage}
                disabled={review.status.status === 'finalized'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Finalize Modal */}
      {showFinalizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Finalize Methodology
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
              Once finalized, the methodology cannot be edited.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Reviewer Name (optional)
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Comments (optional)
                </label>
                <textarea
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                  rows={3}
                  placeholder="Any final comments..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowFinalizeModal(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              >
                Cancel
              </button>
              <button onClick={handleFinalize} className="btn-primary">
                Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Chat Panel */}
      <AIChatPanel
        isOpen={chatPanelOpen}
        onToggle={() => setChatPanelOpen(!chatPanelOpen)}
        ifcContext={ifcContext}
      />
    </div>
  )
}

// Zone Card Component
function ZoneCard({
  zone,
  expanded,
  onToggle,
  editingStage,
  editingStageName,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onStageNameChange,
  onStageReview,
  onDeleteStage,
  disabled,
}: {
  zone: ZoneEdit
  expanded: boolean
  onToggle: () => void
  editingStage: string | null
  editingStageName: string
  onStartEdit: (stageId: string, name: string) => void
  onCancelEdit: () => void
  onSaveEdit: (stageId: string) => void
  onStageNameChange: (name: string) => void
  onStageReview: (stageId: string, isReviewed: boolean) => void
  onDeleteStage: (stageId: string) => void
  disabled: boolean
}) {
  const reviewedCount = zone.stages.filter(s => s.is_reviewed).length

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDownIcon className="w-5 h-5 text-slate-500" />
          ) : (
            <ChevronRightIcon className="w-5 h-5 text-slate-500" />
          )}
          <span className="font-semibold text-slate-900 dark:text-white text-lg">
            {zone.name}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded">
            {zone.storey_name}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {zone.stages.length} stages
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {reviewedCount}/{zone.stages.length}
            </span>
            {reviewedCount === zone.stages.length && zone.stages.length > 0 ? (
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
            ) : (
              <div className="w-5 h-5 rounded-full border-2 border-amber-400" />
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-2 bg-white dark:bg-slate-900/50">
          {zone.stages
            .sort((a, b) => a.sequence_order - b.sequence_order)
            .map((stage) => (
              <StageItem
                key={stage.stage_id}
                stage={stage}
                isEditing={editingStage === stage.stage_id}
                editingName={editingStageName}
                onStartEdit={() => onStartEdit(stage.stage_id, stage.name)}
                onCancelEdit={onCancelEdit}
                onSaveEdit={() => onSaveEdit(stage.stage_id)}
                onNameChange={onStageNameChange}
                onReview={(checked) => onStageReview(stage.stage_id, checked)}
                onDelete={() => onDeleteStage(stage.stage_id)}
                disabled={disabled}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// Stage Item Component
function StageItem({
  stage,
  isEditing,
  editingName,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onNameChange,
  onReview,
  onDelete,
  disabled,
}: {
  stage: StageEdit
  isEditing: boolean
  editingName: string
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onNameChange: (name: string) => void
  onReview: (checked: boolean) => void
  onDelete: () => void
  disabled: boolean
}) {
  const typeColor = ELEMENT_TYPE_COLORS[stage.element_type] || 'bg-slate-400'

  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg ${stage.is_reviewed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-slate-50 dark:bg-slate-800'} border border-slate-100 dark:border-slate-700`}>
      {/* Stage number */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold ${typeColor}`}>
        {stage.sequence_order}
      </div>

      {/* Stage info */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editingName}
              onChange={(e) => onNameChange(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit()
                if (e.key === 'Escape') onCancelEdit()
              }}
            />
            <button onClick={onSaveEdit} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg">
              <CheckIcon className="w-5 h-5" />
            </button>
            <button onClick={onCancelEdit} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-medium text-slate-900 dark:text-white">
              {stage.name}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full ${typeColor} text-white`}>
              {stage.element_type}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {stage.element_ids.length} elements
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {!disabled && !isEditing && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onReview(!stage.is_reviewed)}
            className={`p-2 rounded-lg transition-colors ${stage.is_reviewed ? 'text-green-600 bg-green-100 dark:bg-green-900/30' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            title={stage.is_reviewed ? 'Mark as not reviewed' : 'Mark as reviewed'}
          >
            <CheckCircleIcon className="w-5 h-5" />
          </button>
          <button
            onClick={onStartEdit}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg"
            title="Edit stage name"
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
            title="Delete stage"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Reviewed checkmark */}
      {stage.is_reviewed && !isEditing && disabled && (
        <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
      )}
    </div>
  )
}
