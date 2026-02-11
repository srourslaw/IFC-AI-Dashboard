/**
 * Files Page - Clean file management with upload and model stats
 */
import { useCallback, useRef, useState } from 'react'
import {
  CloudArrowUpIcon,
  DocumentIcon,
  TrashIcon,
  XMarkIcon,
  CubeIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { useFiles, useLoadModel, useUnloadModel, useUploadFile, useDeleteFile, useCurrentModel, useAnalytics, useElementCounts, useLoadingStatus } from '@/hooks/useIFCData'
import { formatFileSize, formatDate, formatNumber } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'

export function FilesPage() {
  const { currentModel } = useAppStore()
  const { data: filesData, isLoading } = useFiles()
  const { data: analytics } = useAnalytics()
  const { data: elementData } = useElementCounts()
  const { data: loadingStatus } = useLoadingStatus()
  const loadModel = useLoadModel()
  const unloadModel = useUnloadModel()
  const uploadFile = useUploadFile()
  const deleteFile = useDeleteFile()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  useCurrentModel()

  const hasModel = !!currentModel
  const hasFiles = (filesData?.files?.length ?? 0) > 0

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.toLowerCase().endsWith('.ifc')) {
      return
    }

    setUploadProgress(0)
    try {
      await uploadFile.mutateAsync({
        file,
        onProgress: (percent) => setUploadProgress(percent),
      })
    } finally {
      setUploadProgress(null)
    }
  }, [uploadFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleLoad = (fileId: string) => {
    loadModel.mutate(fileId)
  }

  const handleUnload = (fileId: string) => {
    unloadModel.mutate(fileId)
  }

  const handleDelete = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Remove this file from the application?')) {
      deleteFile.mutate(fileId)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // No files - show upload prompt
  if (!hasFiles) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ifc"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleUploadClick}
          className={`w-full max-w-lg p-12 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500'
          }`}
        >
          <div className="text-center">
            <CloudArrowUpIcon className={`h-12 w-12 mx-auto ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mt-4">
              {isDragging ? 'Drop your file here' : 'Upload an IFC file'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              Drag and drop or click to browse
            </p>
            {uploadProgress !== null && (
              <div className="mt-4">
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Has files - show file list and model info
  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Files</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {filesData?.total_count} file{filesData?.total_count !== 1 ? 's' : ''} available
          </p>
        </div>
        <button
          onClick={handleUploadClick}
          disabled={uploadFile.isPending}
          className="btn-primary"
        >
          <CloudArrowUpIcon className="h-5 w-5" />
          Upload
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* File List */}
        <div className="lg:col-span-1">
          <div className="card">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`divide-y divide-slate-100 dark:divide-slate-700 ${isDragging ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            >
              {filesData?.files.map((file) => {
                const isActive = currentModel?.file_id === file.id
                const isLoadingThis = loadModel.isPending || loadingStatus?.is_loading
                return (
                  <div
                    key={file.id}
                    onClick={() => !isActive && !isLoadingThis && handleLoad(file.id)}
                    className={`p-4 group cursor-pointer ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100 dark:bg-blue-900/50' : 'bg-slate-100 dark:bg-slate-700'}`}>
                        <DocumentIcon className={`h-5 w-5 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-white truncate text-sm">{file.name}</p>
                          {isActive && (
                            <span className="badge-success text-xs">Active</span>
                          )}
                          {isLoadingThis && !isActive && (
                            <div className="flex items-center gap-1.5">
                              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent"></div>
                              <span className="text-xs text-blue-500">Loading model...</span>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatFileSize(file.size_mb)} • {formatDate(file.modified_at)}
                        </p>
                        {!isActive && !isLoadingThis && (
                          <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">Click to load model</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isActive ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUnload(file.id) }}
                            disabled={unloadModel.isPending}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                            title="Close"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleDelete(file.id, e)}
                            disabled={deleteFile.isPending}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remove"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Upload progress */}
            {uploadProgress !== null && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                      <div
                        className="bg-blue-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">{uploadProgress}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Model Info / Empty State */}
        <div className="lg:col-span-2">
          {hasModel ? (
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                      <CubeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {formatNumber(analytics?.total_elements || 0)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Elements</p>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                      <ChartBarIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {analytics?.total_storeys || 0}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Storeys</p>
                    </div>
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                      <DocumentIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-semibold text-slate-900 dark:text-white">
                        {elementData?.counts.length || 0}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Types</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Element Distribution */}
              {elementData && elementData.counts.length > 0 && (
                <div className="card">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-700">
                    <h3 className="font-medium text-slate-900 dark:text-white">Element Distribution</h3>
                  </div>
                  <div className="p-4 space-y-3">
                    {elementData.counts.slice(0, 8).map((item) => (
                      <div key={item.ifc_type} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-slate-600 dark:text-slate-400 truncate">
                          {item.ifc_type.replace('Ifc', '')}
                        </div>
                        <div className="flex-1">
                          <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full"
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-16 text-right text-sm text-slate-500 dark:text-slate-400">
                          {formatNumber(item.count)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-4">
                <Link to="/viewer" className="card p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
                  <CubeIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  <h4 className="font-medium text-slate-900 dark:text-white mt-3">3D Viewer</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Explore model in 3D with erection methodology
                  </p>
                </Link>
                <Link to="/export" className="card p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
                  <ChartBarIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="font-medium text-slate-900 dark:text-white mt-3">Export Data</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Generate Excel reports and split storeys
                  </p>
                </Link>
              </div>
            </div>
          ) : loadingStatus?.is_loading ? (
            <div className="card p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-3 border-blue-600 border-t-transparent mx-auto"></div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mt-4">Loading Model...</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                Preparing your IFC model. This may take a minute for large files.
              </p>
            </div>
          ) : (
            <div className="card p-12 text-center">
              <CubeIcon className="h-12 w-12 mx-auto text-slate-400" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mt-4">No Model Selected</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                Select a file from the list to view its details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
