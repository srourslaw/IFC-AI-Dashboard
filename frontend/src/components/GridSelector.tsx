/**
 * Grid Selector Component
 * Interactive grid for defining erection areas using grid references (e.g., Grid 2-8 / A-J)
 * Like the Rosehill methodology PDF - user selects regions by grid coordinates
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'

export interface GridAxis {
  tag: string
  direction: 'U' | 'V'
  position: number
}

export interface GridSelection {
  vStart: string  // Number axis start (e.g., "2")
  vEnd: string    // Number axis end (e.g., "8")
  uStart: string  // Letter axis start (e.g., "A")
  uEnd: string    // Letter axis end (e.g., "J")
}

export interface ErectionSequenceDefinition {
  sequenceNumber: number
  name: string
  gridSelection: GridSelection
  splits: string[]  // V-axis split points (e.g., ["5"] splits 2-8 into 2-5 and 5-8)
  color: string
}

interface GridSelectorProps {
  uAxes: GridAxis[]  // Letter axes (A, B, C...)
  vAxes: GridAxis[]  // Number axes (1, 2, 3...)
  sequences: ErectionSequenceDefinition[]
  onSequenceAdd: (sequence: ErectionSequenceDefinition) => void
  onSequenceUpdate: (index: number, sequence: ErectionSequenceDefinition) => void
  onSequenceRemove: (index: number) => void
  onGenerateStages: () => void
  isGenerating?: boolean
}

// Colors for different sequences
const SEQUENCE_COLORS = [
  { bg: 'bg-blue-500/30', border: 'border-blue-500', text: 'text-blue-400', hex: '#3b82f6' },
  { bg: 'bg-green-500/30', border: 'border-green-500', text: 'text-green-400', hex: '#22c55e' },
  { bg: 'bg-yellow-500/30', border: 'border-yellow-500', text: 'text-yellow-400', hex: '#eab308' },
  { bg: 'bg-purple-500/30', border: 'border-purple-500', text: 'text-purple-400', hex: '#a855f7' },
  { bg: 'bg-orange-500/30', border: 'border-orange-500', text: 'text-orange-400', hex: '#f97316' },
  { bg: 'bg-pink-500/30', border: 'border-pink-500', text: 'text-pink-400', hex: '#ec4899' },
  { bg: 'bg-cyan-500/30', border: 'border-cyan-500', text: 'text-cyan-400', hex: '#06b6d4' },
  { bg: 'bg-red-500/30', border: 'border-red-500', text: 'text-red-400', hex: '#ef4444' },
]

export function GridSelector({
  uAxes,
  vAxes,
  sequences,
  onSequenceAdd,
  onSequenceUpdate,
  onSequenceRemove,
  onGenerateStages,
  isGenerating = false,
}: GridSelectorProps) {
  const [selectionStart, setSelectionStart] = useState<{ u: number; v: number } | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<{ u: number; v: number } | null>(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [editingSequence, setEditingSequence] = useState<number | null>(null)
  const [splitInput, setSplitInput] = useState('')

  // Sort axes
  const sortedUAxes = useMemo(() =>
    [...uAxes].sort((a, b) => a.tag.localeCompare(b.tag)),
    [uAxes]
  )
  const sortedVAxes = useMemo(() =>
    [...vAxes].sort((a, b) => {
      const aNum = parseInt(a.tag) || 0
      const bNum = parseInt(b.tag) || 0
      return aNum - bNum
    }),
    [vAxes]
  )

  // Get cell color based on sequences
  const getCellSequence = useCallback((uIdx: number, vIdx: number): number | null => {
    const uTag = sortedUAxes[uIdx]?.tag
    const vTag = sortedVAxes[vIdx]?.tag
    if (!uTag || !vTag) return null

    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i]
      const uStartIdx = sortedUAxes.findIndex(a => a.tag === seq.gridSelection.uStart)
      const uEndIdx = sortedUAxes.findIndex(a => a.tag === seq.gridSelection.uEnd)
      const vStartIdx = sortedVAxes.findIndex(a => a.tag === seq.gridSelection.vStart)
      const vEndIdx = sortedVAxes.findIndex(a => a.tag === seq.gridSelection.vEnd)

      if (uIdx >= Math.min(uStartIdx, uEndIdx) && uIdx <= Math.max(uStartIdx, uEndIdx) &&
          vIdx >= Math.min(vStartIdx, vEndIdx) && vIdx <= Math.max(vStartIdx, vEndIdx)) {
        return i
      }
    }
    return null
  }, [sequences, sortedUAxes, sortedVAxes])

  // Check if cell is in current selection
  const isInSelection = useCallback((uIdx: number, vIdx: number): boolean => {
    if (!selectionStart || !selectionEnd) return false
    const minU = Math.min(selectionStart.u, selectionEnd.u)
    const maxU = Math.max(selectionStart.u, selectionEnd.u)
    const minV = Math.min(selectionStart.v, selectionEnd.v)
    const maxV = Math.max(selectionStart.v, selectionEnd.v)
    return uIdx >= minU && uIdx <= maxU && vIdx >= minV && vIdx <= maxV
  }, [selectionStart, selectionEnd])

  // Handle cell mouse down
  const handleCellMouseDown = (uIdx: number, vIdx: number) => {
    setSelectionStart({ u: uIdx, v: vIdx })
    setSelectionEnd({ u: uIdx, v: vIdx })
    setIsSelecting(true)
  }

  // Handle cell mouse enter during selection
  const handleCellMouseEnter = (uIdx: number, vIdx: number) => {
    if (isSelecting) {
      setSelectionEnd({ u: uIdx, v: vIdx })
    }
  }

  // Handle mouse up - finalize selection
  const handleMouseUp = useCallback(() => {
    if (isSelecting && selectionStart && selectionEnd) {
      const minU = Math.min(selectionStart.u, selectionEnd.u)
      const maxU = Math.max(selectionStart.u, selectionEnd.u)
      const minV = Math.min(selectionStart.v, selectionEnd.v)
      const maxV = Math.max(selectionStart.v, selectionEnd.v)

      const newSequence: ErectionSequenceDefinition = {
        sequenceNumber: sequences.length + 1,
        name: `Sequence ${sequences.length + 1}`,
        gridSelection: {
          uStart: sortedUAxes[minU].tag,
          uEnd: sortedUAxes[maxU].tag,
          vStart: sortedVAxes[minV].tag,
          vEnd: sortedVAxes[maxV].tag,
        },
        splits: [],
        color: SEQUENCE_COLORS[sequences.length % SEQUENCE_COLORS.length].hex,
      }

      onSequenceAdd(newSequence)
    }
    setIsSelecting(false)
    setSelectionStart(null)
    setSelectionEnd(null)
  }, [isSelecting, selectionStart, selectionEnd, sequences, sortedUAxes, sortedVAxes, onSequenceAdd])

  // Add mouse up listener
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  // Add split to sequence
  const addSplit = (seqIndex: number) => {
    if (!splitInput.trim()) return
    const seq = sequences[seqIndex]
    if (!seq.splits.includes(splitInput.trim())) {
      onSequenceUpdate(seqIndex, {
        ...seq,
        splits: [...seq.splits, splitInput.trim()].sort((a, b) => {
          const aNum = parseInt(a) || 0
          const bNum = parseInt(b) || 0
          return aNum - bNum
        }),
      })
    }
    setSplitInput('')
  }

  // Remove split from sequence
  const removeSplit = (seqIndex: number, splitValue: string) => {
    const seq = sequences[seqIndex]
    onSequenceUpdate(seqIndex, {
      ...seq,
      splits: seq.splits.filter(s => s !== splitValue),
    })
  }

  // Calculate stages preview for a sequence
  const getStagesPreview = (seq: ErectionSequenceDefinition): string[] => {
    const { vStart, vEnd } = seq.gridSelection
    const { uStart, uEnd } = seq.gridSelection
    const allSplits = [vStart, ...seq.splits, vEnd]

    const stages: string[] = []
    for (let i = 0; i < allSplits.length - 1; i++) {
      stages.push(`Grid ${allSplits[i]}-${allSplits[i + 1]} / ${uStart}-${uEnd} Columns`)
      stages.push(`Grid ${allSplits[i]}-${allSplits[i + 1]} / ${uStart}-${uEnd} Beams`)
    }
    return stages
  }

  return (
    <div className="space-y-4">
      {/* Grid Visualization */}
      <div className="bg-secondary-900 rounded-lg p-4 overflow-auto">
        <div className="inline-block min-w-max">
          {/* Header row - V axis labels (numbers) */}
          <div className="flex">
            <div className="w-8 h-8" /> {/* Corner spacer */}
            {sortedVAxes.map((axis) => (
              <div
                key={axis.tag}
                className="w-8 h-8 flex items-center justify-center text-xs font-mono text-secondary-400"
              >
                {axis.tag}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {sortedUAxes.map((uAxis, uIdx) => (
            <div key={uAxis.tag} className="flex">
              {/* U axis label (letters) */}
              <div className="w-8 h-8 flex items-center justify-center text-xs font-mono text-secondary-400">
                {uAxis.tag}
              </div>

              {/* Grid cells */}
              {sortedVAxes.map((vAxis, vIdx) => {
                const seqIndex = getCellSequence(uIdx, vIdx)
                const inSelection = isInSelection(uIdx, vIdx)
                const seqColor = seqIndex !== null ? SEQUENCE_COLORS[seqIndex % SEQUENCE_COLORS.length] : null

                return (
                  <div
                    key={`${uAxis.tag}-${vAxis.tag}`}
                    onMouseDown={() => handleCellMouseDown(uIdx, vIdx)}
                    onMouseEnter={() => handleCellMouseEnter(uIdx, vIdx)}
                    className={cn(
                      'w-8 h-8 border border-secondary-700 cursor-crosshair transition-all',
                      inSelection && 'bg-primary-500/40 border-primary-500',
                      seqColor && !inSelection && `${seqColor.bg} ${seqColor.border}`,
                      !seqColor && !inSelection && 'hover:bg-secondary-800'
                    )}
                    title={`Grid ${vAxis.tag} / ${uAxis.tag}`}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-2">
          {sequences.map((seq, idx) => (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs',
                SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length].bg,
                SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length].text
              )}
            >
              <span className="font-medium">Seq {seq.sequenceNumber}:</span>
              <span>Grid {seq.gridSelection.vStart}-{seq.gridSelection.vEnd} / {seq.gridSelection.uStart}-{seq.gridSelection.uEnd}</span>
            </div>
          ))}
          {sequences.length === 0 && (
            <p className="text-sm text-secondary-500">
              Click and drag on the grid to define an erection area
            </p>
          )}
        </div>
      </div>

      {/* Sequences List */}
      {sequences.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-secondary-300">Erection Sequences</h3>

          {sequences.map((seq, idx) => (
            <div
              key={idx}
              className={cn(
                'rounded-lg border p-4',
                SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length].border,
                'bg-secondary-800/50'
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className={cn(
                    'font-medium',
                    SEQUENCE_COLORS[idx % SEQUENCE_COLORS.length].text
                  )}>
                    Erection Sequence {seq.sequenceNumber}
                  </h4>
                  <p className="text-sm text-secondary-400 mt-1">
                    Area: Grid {seq.gridSelection.vStart}-{seq.gridSelection.vEnd} / {seq.gridSelection.uStart}-{seq.gridSelection.uEnd}
                  </p>
                </div>
                <button
                  onClick={() => onSequenceRemove(idx)}
                  className="text-secondary-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Split Points */}
              <div className="mb-3">
                <label className="text-xs text-secondary-400 block mb-1">
                  Split at Grid (divide into sub-areas):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`e.g., ${Math.floor((parseInt(seq.gridSelection.vStart) + parseInt(seq.gridSelection.vEnd)) / 2)}`}
                    value={editingSequence === idx ? splitInput : ''}
                    onChange={(e) => {
                      setEditingSequence(idx)
                      setSplitInput(e.target.value)
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && addSplit(idx)}
                    className="flex-1 px-2 py-1 text-sm bg-secondary-900 border border-secondary-700 rounded focus:border-primary-500 focus:outline-none text-secondary-200"
                  />
                  <button
                    onClick={() => addSplit(idx)}
                    className="px-3 py-1 text-sm bg-secondary-700 hover:bg-secondary-600 rounded text-secondary-200"
                  >
                    Add Split
                  </button>
                </div>

                {/* Current splits */}
                {seq.splits.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {seq.splits.map((split) => (
                      <span
                        key={split}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-secondary-700 rounded text-xs text-secondary-300"
                      >
                        Grid {split}
                        <button
                          onClick={() => removeSplit(idx, split)}
                          className="hover:text-red-400"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Stages Preview */}
              <div>
                <label className="text-xs text-secondary-400 block mb-1">
                  Generated Stages Preview:
                </label>
                <div className="bg-secondary-900 rounded p-2 max-h-32 overflow-y-auto">
                  {getStagesPreview(seq).map((stage, stageIdx) => (
                    <div key={stageIdx} className="text-xs text-secondary-300 py-0.5">
                      <span className="text-secondary-500 mr-2">{seq.sequenceNumber}.{stageIdx + 1}</span>
                      {stage}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Button */}
      {sequences.length > 0 && (
        <button
          onClick={onGenerateStages}
          disabled={isGenerating}
          className={cn(
            'w-full py-3 rounded-lg font-medium transition-all',
            isGenerating
              ? 'bg-secondary-700 text-secondary-400 cursor-not-allowed'
              : 'bg-primary-500 hover:bg-primary-600 text-white'
          )}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating Stages...
            </span>
          ) : (
            `Generate ${sequences.reduce((acc, seq) => acc + getStagesPreview(seq).length, 0)} Stages`
          )}
        </button>
      )}
    </div>
  )
}
