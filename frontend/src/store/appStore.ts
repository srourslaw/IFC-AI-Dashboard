/**
 * Global application state management using Zustand
 */
import { create } from 'zustand'
import { IFCFileInfo, ModelAnalytics } from '@/lib/api'

interface LoadedModel {
  file_id: string
  file_name: string
  size_mb: number
  loaded_at: string
}

interface AppState {
  // Current model state
  currentModel: LoadedModel | null
  loadedModels: LoadedModel[]
  availableFiles: IFCFileInfo[]

  // Analytics cache
  currentAnalytics: ModelAnalytics | null

  // UI state
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'

  // Loading states
  isLoadingModel: boolean
  isProcessing: boolean
  processingMessage: string

  // Actions
  setCurrentModel: (model: LoadedModel | null) => void
  setLoadedModels: (models: LoadedModel[]) => void
  setAvailableFiles: (files: IFCFileInfo[]) => void
  setCurrentAnalytics: (analytics: ModelAnalytics | null) => void
  toggleSidebar: () => void
  setTheme: (theme: 'dark' | 'light') => void
  setIsLoadingModel: (loading: boolean) => void
  setProcessing: (processing: boolean, message?: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  currentModel: null,
  loadedModels: [],
  availableFiles: [],
  currentAnalytics: null,
  sidebarCollapsed: false,
  theme: 'light', // Light theme by default
  isLoadingModel: false,
  isProcessing: false,
  processingMessage: '',

  // Actions
  setCurrentModel: (model) => set({ currentModel: model }),
  setLoadedModels: (models) => set({ loadedModels: models }),
  setAvailableFiles: (files) => set({ availableFiles: files }),
  setCurrentAnalytics: (analytics) => set({ currentAnalytics: analytics }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
  setIsLoadingModel: (loading) => set({ isLoadingModel: loading }),
  setProcessing: (processing, message = '') => set({
    isProcessing: processing,
    processingMessage: message
  }),
}))
