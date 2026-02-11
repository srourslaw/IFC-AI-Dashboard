/**
 * Custom hooks for IFC data fetching with React Query
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { api } from '@/lib/api'
import { useAppStore } from '@/store/appStore'

// =============================================================================
// Query Keys
// =============================================================================

export const queryKeys = {
  health: ['health'],
  files: ['files'],
  loadedModels: ['loadedModels'],
  currentModel: ['currentModel'],
  storeys: (fileId?: string) => ['storeys', fileId],
  elementCounts: (fileId?: string) => ['elementCounts', fileId],
  elements: (params: Record<string, unknown>) => ['elements', params],
  analytics: (fileId?: string) => ['analytics', fileId],
}

// =============================================================================
// Health Check
// =============================================================================

export function useHealthCheck() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.healthCheck(),
    refetchInterval: 30000, // Check every 30 seconds
  })
}

// =============================================================================
// Files
// =============================================================================

export function useFiles() {
  const setAvailableFiles = useAppStore((state) => state.setAvailableFiles)

  return useQuery({
    queryKey: queryKeys.files,
    queryFn: async () => {
      const data = await api.getFiles()
      setAvailableFiles(data.files)
      return data
    },
  })
}

export function useLoadModel() {
  const queryClient = useQueryClient()
  const { setIsLoadingModel, setCurrentModel } = useAppStore()

  return useMutation({
    mutationFn: async (fileId: string) => {
      setIsLoadingModel(true)
      return api.loadFile(fileId)
    },
    onSuccess: (data) => {
      if (data.data && typeof data.data === 'object' && 'file_id' in data.data) {
        setCurrentModel(data.data as { file_id: string; file_name: string; size_mb: number; loaded_at: string })
      }
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: queryKeys.files })
      queryClient.invalidateQueries({ queryKey: queryKeys.loadedModels })
      queryClient.invalidateQueries({ queryKey: queryKeys.currentModel })
    },
    onError: () => {
      toast.error('Failed to load model')
    },
    onSettled: () => {
      setIsLoadingModel(false)
    },
  })
}

export function useUnloadModel() {
  const queryClient = useQueryClient()
  const { setCurrentModel, currentModel } = useAppStore()

  return useMutation({
    mutationFn: (fileId: string) => api.unloadFile(fileId),
    onSuccess: (data, fileId) => {
      // Clear current model if we just unloaded it
      if (currentModel?.file_id === fileId) {
        setCurrentModel(null)
      }
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: queryKeys.files })
      queryClient.invalidateQueries({ queryKey: queryKeys.loadedModels })
      queryClient.invalidateQueries({ queryKey: queryKeys.currentModel })
    },
  })
}

export function useUploadFile() {
  const queryClient = useQueryClient()
  const { setProcessing } = useAppStore()

  return useMutation({
    mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => {
      setProcessing(true, 'Uploading IFC file...')
      return api.uploadFile(file, onProgress)
    },
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: queryKeys.files })
    },
    onError: () => {
      toast.error('Failed to upload file')
    },
    onSettled: () => {
      setProcessing(false)
    },
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()
  const { setCurrentModel, currentModel } = useAppStore()

  return useMutation({
    mutationFn: (fileId: string) => api.deleteFile(fileId),
    onSuccess: (data, fileId) => {
      // Clear current model if we just deleted it
      if (currentModel?.file_id === fileId) {
        setCurrentModel(null)
      }
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: queryKeys.files })
      queryClient.invalidateQueries({ queryKey: queryKeys.loadedModels })
      queryClient.invalidateQueries({ queryKey: queryKeys.currentModel })
    },
    onError: () => {
      toast.error('Failed to delete file')
    },
  })
}

export function useLoadedModels() {
  const setLoadedModels = useAppStore((state) => state.setLoadedModels)

  return useQuery({
    queryKey: queryKeys.loadedModels,
    queryFn: async () => {
      const data = await api.getLoadedModels()
      if (data.data && Array.isArray(data.data)) {
        setLoadedModels(data.data as Array<{ file_id: string; file_name: string; size_mb: number; loaded_at: string }>)
      }
      return data
    },
  })
}

export function useCurrentModel() {
  const { currentModel, setCurrentModel } = useAppStore()

  return useQuery({
    queryKey: queryKeys.currentModel,
    queryFn: async () => {
      const data = await api.getCurrentModel()
      if (data.data && typeof data.data === 'object' && 'file_id' in data.data) {
        setCurrentModel(data.data as { file_id: string; file_name: string; size_mb: number; loaded_at: string })
      } else {
        setCurrentModel(null)
      }
      return data
    },
    // Poll every 3 seconds when no model is loaded (waiting for auto-load to finish)
    refetchInterval: currentModel ? false : 3000,
  })
}

export function useLoadingStatus() {
  return useQuery({
    queryKey: ['loadingStatus'],
    queryFn: async () => {
      const data = await api.getLoadingStatus()
      return data.data
    },
    refetchInterval: 2000,
  })
}

// =============================================================================
// Storeys
// =============================================================================

export function useStoreys(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: queryKeys.storeys(effectiveFileId),
    queryFn: () => api.getStoreys(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useSplitStoreys() {
  const { setProcessing } = useAppStore()

  return useMutation({
    mutationFn: async (params: { fileId?: string; outputDir?: string }) => {
      setProcessing(true, 'Splitting storeys into separate IFC files...')
      return api.splitStoreys(params.fileId, params.outputDir)
    },
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onSettled: () => {
      setProcessing(false)
    },
  })
}

// =============================================================================
// Elements
// =============================================================================

export function useElementCounts(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: queryKeys.elementCounts(effectiveFileId),
    queryFn: () => api.getElementCounts(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useElements(params: {
  fileId?: string
  ifcType?: string
  storeyName?: string
  page?: number
  pageSize?: number
}) {
  return useQuery({
    queryKey: queryKeys.elements(params),
    queryFn: () => api.getElements(params),
  })
}

// =============================================================================
// Takeoffs
// =============================================================================

export function useGenerateTakeoffs() {
  const { setProcessing } = useAppStore()

  return useMutation({
    mutationFn: async (params: { fileId?: string; outputDir?: string }) => {
      setProcessing(true, 'Generating cumulative takeoff files...')
      return api.generateTakeoffs(params.fileId, params.outputDir)
    },
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onSettled: () => {
      setProcessing(false)
    },
  })
}

// =============================================================================
// Exports
// =============================================================================

export function useExportToExcel() {
  const { setProcessing } = useAppStore()

  return useMutation({
    mutationFn: async (params: { fileId?: string; outputPath?: string }) => {
      setProcessing(true, 'Exporting elements to Excel...')
      return api.exportToExcel(params.fileId, params.outputPath)
    },
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onSettled: () => {
      setProcessing(false)
    },
  })
}

// =============================================================================
// Analytics
// =============================================================================

export function useAnalytics(fileId?: string) {
  const { currentModel } = useAppStore()
  const setCurrentAnalytics = useAppStore((state) => state.setCurrentAnalytics)
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: queryKeys.analytics(effectiveFileId),
    queryFn: async () => {
      const data = await api.getAnalytics(effectiveFileId)
      setCurrentAnalytics(data)
      return data
    },
    enabled: !!effectiveFileId,
  })
}

// =============================================================================
// Methodology
// =============================================================================

export const methodologyKeys = {
  analysis: (fileId?: string) => ['methodology', 'analysis', fileId],
  grid: (fileId?: string) => ['methodology', 'grid', fileId],
  zones: (fileId?: string) => ['methodology', 'zones', fileId],
  stages: (fileId?: string) => ['methodology', 'stages', fileId],
  document: (fileId?: string) => ['methodology', 'document', fileId],
}

export function useMethodologyAnalysis(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: methodologyKeys.analysis(effectiveFileId),
    queryFn: () => api.getMethodologyAnalysis(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useGridData(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: methodologyKeys.grid(effectiveFileId),
    queryFn: () => api.getGridData(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useZones(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: methodologyKeys.zones(effectiveFileId),
    queryFn: () => api.getZones(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useStages(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: methodologyKeys.stages(effectiveFileId),
    queryFn: () => api.getStages(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useMethodologyDocument(fileId?: string) {
  const { currentModel } = useAppStore()
  const effectiveFileId = fileId || currentModel?.file_id

  return useQuery({
    queryKey: methodologyKeys.document(effectiveFileId),
    queryFn: () => api.getMethodologyDocument(effectiveFileId),
    enabled: !!effectiveFileId,
  })
}

export function useRegenerateMethodology() {
  const queryClient = useQueryClient()
  const { setProcessing } = useAppStore()

  return useMutation({
    mutationFn: async (fileId?: string) => {
      setProcessing(true, 'Regenerating erection methodology...')
      return api.regenerateMethodology(fileId)
    },
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['methodology'] })
    },
    onSettled: () => {
      setProcessing(false)
    },
  })
}
