/**
 * API Client for IFC AI POC Backend
 * Centralized API communication layer with type safety
 */
import axios, { AxiosInstance, AxiosError } from 'axios'
import toast from 'react-hot-toast'

// =============================================================================
// Types
// =============================================================================

export interface IFCFileInfo {
  id: string
  name: string
  path: string
  size_mb: number
  modified_at: string
  is_loaded: boolean
}

export interface StoreyInfo {
  index: number
  name: string
  elevation: number
  element_count: number | null
}

export interface ElementCount {
  ifc_type: string
  count: number
  percentage: number
}

export interface ElementDetail {
  step_id: number
  ifc_type: string
  global_id: string | null
  name: string | null
  object_type: string | null
  predefined_type: string | null
  storey_name: string | null
  storey_elevation: number | null
}

export interface TakeoffStep {
  step: number
  floors: string[]
  file: string
  removed_elements: number
}

export interface SplitStoreyResult {
  index: number
  storey_name: string
  file: string
  removed_elements: number
}

export interface StoreyAnalytics {
  name: string
  elevation: number
  element_count: number
  element_types: Record<string, number>
}

export interface ModelAnalytics {
  file_name: string
  total_elements: number
  total_storeys: number
  element_type_distribution: ElementCount[]
  storey_analytics: StoreyAnalytics[]
  top_element_types: ElementCount[]
}

// Methodology Types
export interface GridAxis {
  tag: string
  direction: string
  position: number
}

export interface GridCell {
  u_axis: string
  v_axis: string
  name: string
  x_min: number
  x_max: number
  y_min: number
  y_max: number
}

export interface ErectionZone {
  zone_id: number
  name: string
  grid_cells: string[]
  x_range: [number, number]
  y_range: [number, number]
  element_count: number
  element_counts: Record<string, number>
}

export interface ErectionStage {
  stage_id: string
  zone_id: number
  name: string
  description: string
  element_type: string
  grid_range: string
  element_count: number
  sequence_order: number
  instructions: string[]
  express_ids?: number[]  // Express IDs for 3D viewer (included in user-generated stages)
}

export interface MethodologyAnalysis {
  file_id: string
  analysis: {
    grid_detected: boolean
    grid_axes_count: number
    grid_cells_count: number
    total_elements: number
    elements_by_type: Record<string, number>
    elements_by_level: Record<string, number>
    levels: Record<string, number>
    zones_count: number
    stages_count: number
    zones: ErectionZone[]
    stages: ErectionStage[]
  }
}

export interface GridData {
  u_axes: GridAxis[]
  v_axes: GridAxis[]
  cells: GridCell[]
  is_virtual: boolean
}

export interface APIResponse<T = unknown> {
  success: boolean
  message: string
  data: T
  errors?: string[]
}

// Review Types
export interface ReviewStatus {
  status: 'draft' | 'ai_reviewed' | 'human_reviewed' | 'finalized'
  last_updated: string
  reviewed_by?: string
  comments?: string
}

export interface AISuggestion {
  id: string
  type: 'sequence' | 'missing' | 'grouping' | 'safety' | 'naming'
  severity: 'info' | 'warning' | 'error'
  title: string
  description: string
  affected_stages: string[]
  suggestion: string
  auto_fixable: boolean
  status: 'pending' | 'accepted' | 'rejected' | 'ignored'
  created_at: string
}

export interface StageEdit {
  stage_id: string
  name: string
  element_type: string
  zone_id: number
  sequence_order: number
  element_ids: number[]
  is_reviewed: boolean
  reviewer_notes?: string
}

export interface ZoneEdit {
  zone_id: number
  name: string
  storey_name: string
  color?: string
  stages: StageEdit[]
}

export interface MethodologyReview {
  file_id: string
  file_name: string
  status: ReviewStatus
  zones: ZoneEdit[]
  suggestions: AISuggestion[]
  unassigned_elements: number[]
  total_elements: number
  assigned_elements: number
  created_at: string
  updated_at: string
}

export interface ReviewResponse {
  success: boolean
  message: string
  review?: MethodologyReview
}

export interface HealthCheck {
  status: string
  version: string
  timestamp: string
}

// =============================================================================
// API Client
// =============================================================================

// Get API base URL - in production use env var, in development use proxy
const getApiBaseUrl = (): string => {
  // If VITE_API_URL is set (production), use it
  if (import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}/api`
  }
  // Development: use Vite proxy
  return '/api'
}

class APIClient {
  private client: AxiosInstance
  private longTimeoutClient: AxiosInstance
  private isServerAwake: boolean = false

  constructor() {
    const baseConfig = {
      baseURL: getApiBaseUrl(),
      headers: {
        'Content-Type': 'application/json',
      },
    }

    // Standard client for quick operations (30 seconds)
    this.client = axios.create({
      ...baseConfig,
      timeout: 30000,
    })

    // Long timeout client for file operations (5 minutes)
    // Accounts for Render.com cold starts (30-60s) + large file processing
    this.longTimeoutClient = axios.create({
      ...baseConfig,
      timeout: 300000,
    })

    // Response interceptor for error handling
    const errorHandler = (error: AxiosError<{ detail?: string }>) => {
      const message = error.response?.data?.detail || error.message || 'An error occurred'
      // Don't show toast for timeout errors during wake-up
      if (!error.message?.includes('timeout')) {
        toast.error(message)
      }
      return Promise.reject(error)
    }

    this.client.interceptors.response.use((response) => response, errorHandler)
    this.longTimeoutClient.interceptors.response.use((response) => response, errorHandler)
  }

  // Wake up the server if it's in cold start state (Render.com free tier)
  private async ensureServerAwake(): Promise<void> {
    if (this.isServerAwake) return

    try {
      // Use a long timeout for the wake-up call
      await axios.get(`${getApiBaseUrl()}/health`, { timeout: 120000 })
      this.isServerAwake = true
      // Reset after 10 minutes of inactivity
      setTimeout(() => { this.isServerAwake = false }, 600000)
    } catch {
      // Server might still be waking up, continue anyway
      console.warn('Server wake-up check failed, continuing...')
    }
  }

  // ===========================================================================
  // Health
  // ===========================================================================

  async healthCheck(): Promise<HealthCheck> {
    const { data } = await this.client.get<HealthCheck>('/health')
    return data
  }

  // ===========================================================================
  // Files
  // ===========================================================================

  async getFiles(): Promise<{ files: IFCFileInfo[]; total_count: number }> {
    const { data } = await this.client.get('/files')
    return data
  }

  async uploadFile(file: File, onProgress?: (percent: number) => void): Promise<APIResponse<{
    file_id: string
    file_name: string
    size_mb: number
    path: string
  }>> {
    // Wake up server before upload (Render.com cold start)
    await this.ensureServerAwake()

    const formData = new FormData()
    formData.append('file', file)

    const { data } = await this.longTimeoutClient.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      },
    })
    return data
  }

  async deleteFile(fileId: string): Promise<APIResponse> {
    const { data } = await this.client.delete(`/files/${fileId}`)
    return data
  }

  async loadFile(fileId: string): Promise<APIResponse> {
    // Wake up server before load (Render.com cold start)
    await this.ensureServerAwake()
    // Use long timeout for large IFC files
    const { data } = await this.longTimeoutClient.post(`/files/${fileId}/load`)
    return data
  }

  async unloadFile(fileId: string): Promise<APIResponse> {
    const { data } = await this.client.post(`/files/${fileId}/unload`)
    return data
  }

  async getLoadedModels(): Promise<APIResponse> {
    const { data } = await this.client.get('/files/loaded')
    return data
  }

  async setCurrentModel(fileId: string): Promise<APIResponse> {
    const { data } = await this.client.post(`/files/${fileId}/set-current`)
    return data
  }

  async getCurrentModel(): Promise<APIResponse> {
    const { data } = await this.client.get('/files/current')
    return data
  }

  // ===========================================================================
  // Storeys
  // ===========================================================================

  async getStoreys(fileId?: string): Promise<{ storeys: StoreyInfo[]; total_count: number }> {
    const { data } = await this.client.get('/storeys', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async splitStoreys(fileId?: string, outputDir?: string): Promise<{
    success: boolean
    message: string
    results: SplitStoreyResult[]
    output_directory: string
  }> {
    const { data } = await this.client.post('/storeys/split', null, {
      params: {
        ...(fileId && { file_id: fileId }),
        ...(outputDir && { output_dir: outputDir }),
      },
    })
    return data
  }

  // ===========================================================================
  // Elements
  // ===========================================================================

  async getElementCounts(fileId?: string): Promise<{
    counts: ElementCount[]
    total_elements: number
  }> {
    const { data } = await this.client.get('/elements/counts', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getElements(params: {
    fileId?: string
    ifcType?: string
    storeyName?: string
    page?: number
    pageSize?: number
  }): Promise<{
    elements: ElementDetail[]
    total_count: number
    page: number
    page_size: number
    total_pages: number
  }> {
    const { data } = await this.client.get('/elements', {
      params: {
        ...(params.fileId && { file_id: params.fileId }),
        ...(params.ifcType && { ifc_type: params.ifcType }),
        ...(params.storeyName && { storey_name: params.storeyName }),
        page: params.page || 1,
        page_size: params.pageSize || 100,
      },
    })
    return data
  }

  // ===========================================================================
  // Takeoffs
  // ===========================================================================

  async generateTakeoffs(fileId?: string, outputDir?: string): Promise<{
    success: boolean
    message: string
    steps: TakeoffStep[]
    output_directory: string
  }> {
    const { data } = await this.client.post('/takeoffs/generate', null, {
      params: {
        ...(fileId && { file_id: fileId }),
        ...(outputDir && { output_dir: outputDir }),
      },
    })
    return data
  }

  // ===========================================================================
  // Exports
  // ===========================================================================

  async exportToExcel(fileId?: string, outputPath?: string): Promise<{
    success: boolean
    message: string
    file_path: string
    row_count: number
    download_url: string
  }> {
    const { data } = await this.client.post('/exports/excel', null, {
      params: {
        ...(fileId && { file_id: fileId }),
        ...(outputPath && { output_path: outputPath }),
      },
    })
    return data
  }

  // ===========================================================================
  // Analytics
  // ===========================================================================

  async getAnalytics(fileId?: string): Promise<ModelAnalytics> {
    // Use long timeout for large IFC file analytics
    const { data } = await this.longTimeoutClient.get('/analytics', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  // ===========================================================================
  // Methodology
  // ===========================================================================

  async getMethodologyAnalysis(fileId?: string): Promise<MethodologyAnalysis> {
    // Use long timeout for methodology generation on large IFC files
    const { data } = await this.longTimeoutClient.get('/methodology/analyze', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getGridData(fileId?: string): Promise<GridData> {
    const { data } = await this.client.get('/methodology/grid', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getZones(fileId?: string): Promise<{ zones: ErectionZone[]; total_count: number }> {
    const { data } = await this.client.get('/methodology/zones', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getStages(fileId?: string): Promise<{ stages: ErectionStage[]; total_count: number }> {
    const { data } = await this.client.get('/methodology/stages', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getMethodologyDocument(fileId?: string): Promise<{
    title: string
    summary: {
      total_elements: number
      total_zones: number
      total_stages: number
      levels: string[]
      grid_detected: boolean
    }
    grid_system: GridData
    zones: ErectionZone[]
    erection_sequence: ErectionStage[]
    file_info: {
      file_id: string
      file_name: string
      file_path: string
    }
  }> {
    const { data } = await this.client.get('/methodology/document', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async regenerateMethodology(fileId?: string): Promise<{
    message: string
    summary: MethodologyAnalysis['analysis']
  }> {
    // Use long timeout for methodology regeneration on large IFC files
    const { data } = await this.longTimeoutClient.post('/methodology/regenerate', null, {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getZoneExpressIds(zoneId: number, fileId?: string): Promise<{
    zone_id: number
    express_ids: number[]
    count: number
  }> {
    const { data } = await this.client.get(`/methodology/zones/${zoneId}/express-ids`, {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getStageExpressIds(stageId: string, fileId?: string): Promise<{
    stage_id: string
    express_ids: number[]
    count: number
  }> {
    const { data } = await this.client.get(`/methodology/stages/${stageId}/express-ids`, {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async getAllExpressIds(fileId?: string): Promise<{
    express_ids: number[]
    count: number
  }> {
    const { data } = await this.client.get('/methodology/express-ids', {
      params: fileId ? { file_id: fileId } : undefined,
    })
    return data
  }

  async exportMethodologyPdf(fileId?: string): Promise<Blob> {
    const response = await this.client.get('/methodology/export/pdf', {
      params: fileId ? { file_id: fileId } : undefined,
      responseType: 'blob',
    })
    return response.data
  }

  // User-defined erection sequences (Rosehill-style)
  async generateFromSequences(
    sequences: {
      sequence_number: number
      name: string
      grid_selection: {
        v_start: string
        v_end: string
        u_start: string
        u_end: string
      }
      splits: string[]
    }[],
    fileId?: string,
    includeFootings: boolean = true
  ): Promise<{
    success: boolean
    message: string
    stages: ErectionStage[]
    section_ids: number[]     // ALL elements in the grid area (full building section)
    section_count: number
    summary: MethodologyAnalysis['analysis']
  }> {
    const { data } = await this.longTimeoutClient.post('/methodology/generate-from-sequences',
      { sequences, include_footings: includeFootings },
      { params: fileId ? { file_id: fileId } : undefined }
    )
    return data
  }

  async getGridAreaExpressIds(
    vStart: string,
    vEnd: string,
    uStart: string,
    uEnd: string,
    elementType?: string,
    fileId?: string
  ): Promise<{
    grid_area: string
    element_type: string
    express_ids: number[]
    count: number
  }> {
    const { data } = await this.client.get('/methodology/grid-express-ids', {
      params: {
        v_start: vStart,
        v_end: vEnd,
        u_start: uStart,
        u_end: uEnd,
        ...(elementType && { element_type: elementType }),
        ...(fileId && { file_id: fileId }),
      },
    })
    return data
  }

  // ===========================================================================
  // Review
  // ===========================================================================

  async getReview(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.get(`/review/${fileId}`)
    return data
  }

  async createReview(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/create`)
    return data
  }

  async runAnalysis(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/analyze`)
    return data
  }

  async runRuleAnalysis(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/analyze/rules`)
    return data
  }

  async runAIAnalysis(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/analyze/ai`)
    return data
  }

  async updateSuggestion(fileId: string, suggestionId: string, action: 'accept' | 'reject' | 'ignore'): Promise<APIResponse> {
    const { data } = await this.client.put(`/review/${fileId}/suggestions/${suggestionId}`, { action })
    return data
  }

  async deleteSuggestion(fileId: string, suggestionId: string): Promise<APIResponse> {
    const { data } = await this.client.delete(`/review/${fileId}/suggestions/${suggestionId}`)
    return data
  }

  async updateStage(fileId: string, stageId: string, updates: {
    name?: string
    zone_id?: number
    sequence_order?: number
    element_ids?: number[]
    is_reviewed?: boolean
    reviewer_notes?: string
  }): Promise<ReviewResponse> {
    const { data } = await this.client.put(`/review/${fileId}/stages/${stageId}`, updates)
    return data
  }

  async createStage(fileId: string, stage: {
    name: string
    element_type: string
    zone_id: number
    element_ids?: number[]
  }): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/stages`, stage)
    return data
  }

  async deleteStage(fileId: string, stageId: string): Promise<ReviewResponse> {
    const { data } = await this.client.delete(`/review/${fileId}/stages/${stageId}`)
    return data
  }

  async createZone(fileId: string, zone: {
    name: string
    storey_name: string
  }): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/zones`, zone)
    return data
  }

  async deleteZone(fileId: string, zoneId: number): Promise<ReviewResponse> {
    const { data } = await this.client.delete(`/review/${fileId}/zones/${zoneId}`)
    return data
  }

  async finalizeReview(fileId: string, data: {
    reviewed_by?: string
    comments?: string
  }): Promise<ReviewResponse> {
    const { data: response } = await this.client.post(`/review/${fileId}/finalize`, data)
    return response
  }

  async resetReview(fileId: string): Promise<ReviewResponse> {
    const { data } = await this.client.post(`/review/${fileId}/reset`)
    return data
  }
}

export const api = new APIClient()
