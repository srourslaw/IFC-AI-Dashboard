/**
 * Export Page - Clean data export interface
 */
import { useState } from 'react'
import {
  ArrowDownTrayIcon,
  TableCellsIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { useExportToExcel, useGenerateTakeoffs, useSplitStoreys } from '@/hooks/useIFCData'
import { useAppStore } from '@/store/appStore'

interface ExportResult {
  type: string
  success: boolean
  message: string
  files?: string[]
}

export function ExportPage() {
  const { currentModel } = useAppStore()
  const exportToExcel = useExportToExcel()
  const generateTakeoffs = useGenerateTakeoffs()
  const splitStoreys = useSplitStoreys()
  const [results, setResults] = useState<ExportResult[]>([])

  const handleExportExcel = async () => {
    try {
      const result = await exportToExcel.mutateAsync({})
      setResults(prev => [{
        type: 'Excel',
        success: true,
        message: `Exported ${result.row_count} elements`,
        files: [result.file_path],
      }, ...prev.slice(0, 4)])
    } catch {
      setResults(prev => [{
        type: 'Excel',
        success: false,
        message: 'Export failed',
      }, ...prev.slice(0, 4)])
    }
  }

  const handleGenerateTakeoffs = async () => {
    try {
      const result = await generateTakeoffs.mutateAsync({})
      setResults(prev => [{
        type: 'Takeoffs',
        success: true,
        message: `Generated ${result.steps.length} files`,
        files: result.steps.map(s => s.file),
      }, ...prev.slice(0, 4)])
    } catch {
      setResults(prev => [{
        type: 'Takeoffs',
        success: false,
        message: 'Generation failed',
      }, ...prev.slice(0, 4)])
    }
  }

  const handleSplitStoreys = async () => {
    try {
      const result = await splitStoreys.mutateAsync({})
      setResults(prev => [{
        type: 'Split Storeys',
        success: true,
        message: `Created ${result.results.length} files`,
        files: result.results.map(r => r.file),
      }, ...prev.slice(0, 4)])
    } catch {
      setResults(prev => [{
        type: 'Split Storeys',
        success: false,
        message: 'Split failed',
      }, ...prev.slice(0, 4)])
    }
  }

  if (!currentModel) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="card p-12 text-center max-w-md">
          <ArrowDownTrayIcon className="h-12 w-12 mx-auto text-slate-400" />
          <h2 className="text-lg font-medium text-slate-900 dark:text-white mt-4">No Model Loaded</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
            Load an IFC model to export data
          </p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            Select a File
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Export</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Generate reports from {currentModel.file_name}
        </p>
      </div>

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Excel Export */}
        <div className="card p-6">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 w-fit">
            <TableCellsIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="font-medium text-slate-900 dark:text-white mt-4">Excel Export</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Export all elements with attributes to spreadsheet
          </p>
          <button
            onClick={handleExportExcel}
            disabled={exportToExcel.isPending}
            className="btn-primary w-full mt-4"
          >
            {exportToExcel.isPending ? 'Exporting...' : 'Export Excel'}
          </button>
        </div>

        {/* Takeoffs */}
        <div className="card p-6">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 w-fit">
            <DocumentTextIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="font-medium text-slate-900 dark:text-white mt-4">Takeoff Files</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Generate cumulative IFC files for sequencing
          </p>
          <button
            onClick={handleGenerateTakeoffs}
            disabled={generateTakeoffs.isPending}
            className="btn-primary w-full mt-4"
          >
            {generateTakeoffs.isPending ? 'Generating...' : 'Generate Takeoffs'}
          </button>
        </div>

        {/* Split Storeys */}
        <div className="card p-6">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 w-fit">
            <BuildingOffice2Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="font-medium text-slate-900 dark:text-white mt-4">Split Storeys</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Create separate IFC file for each storey
          </p>
          <button
            onClick={handleSplitStoreys}
            disabled={splitStoreys.isPending}
            className="btn-primary w-full mt-4"
          >
            {splitStoreys.isPending ? 'Splitting...' : 'Split Storeys'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
            <h3 className="font-medium text-slate-900 dark:text-white">Recent Exports</h3>
            <button
              onClick={() => setResults([])}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Clear
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {results.map((result, i) => (
              <div key={i} className="p-4 flex items-start gap-3">
                {result.success ? (
                  <CheckCircleIcon className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                ) : (
                  <XCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {result.type}: {result.message}
                  </p>
                  {result.files && result.files.length > 0 && (
                    <div className="mt-1">
                      {result.files.slice(0, 2).map((file, j) => (
                        <p key={j} className="text-xs text-slate-500 truncate">{file}</p>
                      ))}
                      {result.files.length > 2 && (
                        <p className="text-xs text-slate-400">+{result.files.length - 2} more</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
