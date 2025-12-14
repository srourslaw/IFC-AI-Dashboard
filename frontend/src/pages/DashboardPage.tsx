/**
 * Dashboard Page - Clean, upload-first IFC workspace
 */
import { useCallback, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CloudArrowUpIcon,
  DocumentIcon,
  TrashIcon,
  PlayIcon,
  CheckCircleIcon,
  CubeIcon,
  ChartBarIcon,
  Squares2X2Icon,
  ArrowDownTrayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { Card, CardContent, Button, Badge } from '@/components/ui'
import { useFiles, useLoadModel, useUnloadModel, useUploadFile, useDeleteFile, useCurrentModel } from '@/hooks/useIFCData'
import { formatFileSize, formatDate, cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'

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

export function DashboardPage() {
  const { currentModel } = useAppStore()
  const { data: filesData, isLoading } = useFiles()
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
    if (confirm('Are you sure you want to delete this file?')) {
      deleteFile.mutate(fileId)
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="h-full flex flex-col"
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {/* Header with Upload */}
      <motion.div variants={itemVariants} className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-secondary-100">IFC Workspace</h1>
            <p className="text-secondary-400 mt-1">Upload and analyze your BIM models</p>
          </div>
          <Button
            onClick={handleUploadClick}
            leftIcon={<CloudArrowUpIcon className="h-5 w-5" />}
            loading={uploadFile.isPending}
          >
            Upload IFC File
          </Button>
        </div>
      </motion.div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Loading state */}
        {isLoading && (
          <motion.div variants={itemVariants} className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
              <p className="text-secondary-400 mt-4">Loading workspace...</p>
            </div>
          </motion.div>
        )}

        {/* No files - Show upload zone prominently */}
        {!hasFiles && !isLoading && (
          <motion.div
            variants={itemVariants}
            className="flex-1 flex items-center justify-center"
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleUploadClick}
              className={cn(
                'w-full max-w-2xl p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all',
                isDragging
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-secondary-700 bg-secondary-900/30 hover:border-secondary-600 hover:bg-secondary-800/30'
              )}
            >
              <div className="text-center">
                <CloudArrowUpIcon className={cn(
                  'h-16 w-16 mx-auto transition-colors',
                  isDragging ? 'text-primary-400' : 'text-secondary-500'
                )} />
                <h3 className="text-xl font-semibold text-secondary-200 mt-4">
                  {isDragging ? 'Drop your IFC file here' : 'Upload your first IFC file'}
                </h3>
                <p className="text-secondary-400 mt-2">
                  Drag and drop or click to browse
                </p>
                <p className="text-secondary-500 text-sm mt-4">
                  Supports Industry Foundation Classes (.ifc) files
                </p>
                {uploadProgress !== null && (
                  <div className="mt-6">
                    <div className="w-full bg-secondary-700 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-secondary-400 mt-2">Uploading... {uploadProgress}%</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Has files - Show file list and workspace */}
        {hasFiles && !isLoading && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
            {/* Files Panel */}
            <motion.div variants={itemVariants} className="lg:col-span-1 flex flex-col min-h-0">
              <Card className="flex-1 flex flex-col min-h-0">
                <div className="px-6 py-4 border-b border-secondary-800/50 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-secondary-100">Your Files</h2>
                    <p className="text-sm text-secondary-500">{filesData?.total_count || 0} files</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUploadClick}
                    leftIcon={<CloudArrowUpIcon className="h-4 w-4" />}
                    loading={uploadFile.isPending}
                  >
                    Upload
                  </Button>
                </div>

                {/* Drop zone overlay */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'flex-1 overflow-y-auto relative',
                    isDragging && 'bg-primary-500/5'
                  )}
                >
                  <AnimatePresence>
                    {isDragging && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-primary-500/10 border-2 border-dashed border-primary-500 m-2 rounded-xl z-10"
                      >
                        <div className="text-center">
                          <CloudArrowUpIcon className="h-10 w-10 mx-auto text-primary-400" />
                          <p className="text-primary-400 font-medium mt-2">Drop to upload</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="divide-y divide-secondary-800/50">
                    {filesData?.files.map((file) => {
                        const isActive = currentModel?.file_id === file.id

                        return (
                          <div
                            key={file.id}
                            className={cn(
                              'p-4 transition-colors group',
                              isActive
                                ? 'bg-primary-500/10'
                                : 'hover:bg-secondary-800/30'
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div className={cn(
                                'p-2 rounded-lg flex-shrink-0',
                                isActive ? 'bg-primary-500/20' : 'bg-secondary-800'
                              )}>
                                <DocumentIcon className={cn(
                                  'h-5 w-5',
                                  isActive ? 'text-primary-400' : 'text-secondary-400'
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-secondary-100 truncate">{file.name}</p>
                                  {isActive && (
                                    <Badge variant="primary" size="sm" dot pulse>Active</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-secondary-500 mt-0.5">
                                  {formatFileSize(file.size_mb)} • {formatDate(file.modified_at)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {isActive ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleUnload(file.id)}
                                    loading={unloadModel.isPending}
                                    className="text-secondary-400 hover:text-secondary-100"
                                  >
                                    <XMarkIcon className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleLoad(file.id)}
                                      loading={loadModel.isPending}
                                      className="text-primary-400 hover:text-primary-300"
                                    >
                                      <PlayIcon className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => handleDelete(file.id, e)}
                                      loading={deleteFile.isPending}
                                      className="text-secondary-400 hover:text-red-400"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>

                  {/* Upload progress */}
                  {uploadProgress !== null && (
                    <div className="p-4 border-t border-secondary-800/50">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <div className="w-full bg-secondary-700 rounded-full h-1.5">
                            <div
                              className="bg-primary-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs text-secondary-400">{uploadProgress}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* Workspace Panel */}
            <motion.div variants={itemVariants} className="lg:col-span-2 flex flex-col min-h-0">
              {hasModel ? (
                // Active model workspace
                <Card className="flex-1 flex flex-col min-h-0">
                  {/* Model header */}
                  <div className="px-6 py-4 border-b border-secondary-800/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-success-500/10">
                        <CheckCircleIcon className="h-5 w-5 text-success-400" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold text-secondary-100">{currentModel.file_name}</h2>
                        <p className="text-sm text-secondary-500">
                          {currentModel.size_mb.toFixed(2)} MB • Ready for analysis
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnload(currentModel.file_id)}
                        loading={unloadModel.isPending}
                      >
                        Close Model
                      </Button>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <CardContent className="flex-1 flex flex-col">
                    <h3 className="text-sm font-medium text-secondary-400 uppercase tracking-wide mb-4">
                      Quick Actions
                    </h3>
                    <div className="grid grid-cols-2 gap-4 flex-1">
                      <Link to="/viewer" className="block">
                        <div className="h-full p-6 rounded-xl bg-secondary-800/30 hover:bg-secondary-800/50 transition-colors border border-secondary-700/50 hover:border-primary-500/30 group">
                          <CubeIcon className="h-8 w-8 text-primary-400 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-semibold text-secondary-100 mt-4">3D Viewer</h4>
                          <p className="text-sm text-secondary-400 mt-1">
                            Explore the model in 3D with storey controls
                          </p>
                        </div>
                      </Link>
                      <Link to="/analytics" className="block">
                        <div className="h-full p-6 rounded-xl bg-secondary-800/30 hover:bg-secondary-800/50 transition-colors border border-secondary-700/50 hover:border-primary-500/30 group">
                          <ChartBarIcon className="h-8 w-8 text-accent-400 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-semibold text-secondary-100 mt-4">Analytics</h4>
                          <p className="text-sm text-secondary-400 mt-1">
                            View element distribution and statistics
                          </p>
                        </div>
                      </Link>
                      <Link to="/methodology" className="block">
                        <div className="h-full p-6 rounded-xl bg-secondary-800/30 hover:bg-secondary-800/50 transition-colors border border-secondary-700/50 hover:border-primary-500/30 group">
                          <Squares2X2Icon className="h-8 w-8 text-warning-400 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-semibold text-secondary-100 mt-4">Methodology</h4>
                          <p className="text-sm text-secondary-400 mt-1">
                            Generate erection sequence and zones
                          </p>
                        </div>
                      </Link>
                      <Link to="/exports" className="block">
                        <div className="h-full p-6 rounded-xl bg-secondary-800/30 hover:bg-secondary-800/50 transition-colors border border-secondary-700/50 hover:border-primary-500/30 group">
                          <ArrowDownTrayIcon className="h-8 w-8 text-success-400 group-hover:scale-110 transition-transform" />
                          <h4 className="text-lg font-semibold text-secondary-100 mt-4">Exports</h4>
                          <p className="text-sm text-secondary-400 mt-1">
                            Export data to Excel, split storeys
                          </p>
                        </div>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // No active model - prompt to select one
                <Card className="flex-1 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="p-4 rounded-full bg-secondary-800 w-fit mx-auto">
                      <CubeIcon className="h-12 w-12 text-secondary-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-secondary-200 mt-6">No Model Selected</h3>
                    <p className="text-secondary-400 mt-2 max-w-md">
                      Select a file from the list or upload a new IFC file to start analyzing your BIM model.
                    </p>
                    <Button
                      variant="secondary"
                      className="mt-6"
                      onClick={handleUploadClick}
                      leftIcon={<CloudArrowUpIcon className="h-5 w-5" />}
                    >
                      Upload New File
                    </Button>
                  </div>
                </Card>
              )}
            </motion.div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
