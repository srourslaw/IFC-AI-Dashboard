/**
 * Utility functions for the IFC AI Dashboard
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge Tailwind classes with proper conflict resolution
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format file size for display
 */
export function formatFileSize(sizeInMB: number): string {
  if (sizeInMB < 1) {
    return `${(sizeInMB * 1024).toFixed(0)} KB`
  }
  if (sizeInMB >= 1000) {
    return `${(sizeInMB / 1024).toFixed(2)} GB`
  }
  return `${sizeInMB.toFixed(2)} MB`
}

/**
 * Format number with thousands separator
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format elevation with unit
 * IFC elevations are typically in millimeters, convert to meters for display
 */
export function formatElevation(elevationMm: number): string {
  const meters = elevationMm / 1000
  return `${meters.toFixed(2)} m`
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return `${text.slice(0, length)}...`
}

/**
 * Get color for IFC type (for charts)
 */
export function getIfcTypeColor(type: string): string {
  const colorMap: Record<string, string> = {
    IfcWall: '#3b82f6',
    IfcWallStandardCase: '#3b82f6',
    IfcSlab: '#8b5cf6',
    IfcColumn: '#06b6d4',
    IfcBeam: '#f59e0b',
    IfcDoor: '#22c55e',
    IfcWindow: '#ec4899',
    IfcStair: '#14b8a6',
    IfcRailing: '#6366f1',
    IfcRoof: '#84cc16',
    IfcCurtainWall: '#0ea5e9',
    IfcPlate: '#a855f7',
    IfcMember: '#f97316',
    IfcFurniture: '#10b981',
    IfcSpace: '#64748b',
    IfcBuildingElementProxy: '#94a3b8',
  }
  return colorMap[type] || '#64748b'
}

/**
 * Generate chart colors
 */
export function generateChartColors(count: number): string[] {
  const baseColors = [
    '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e',
    '#ec4899', '#14b8a6', '#6366f1', '#84cc16', '#0ea5e9',
    '#a855f7', '#f97316', '#10b981', '#64748b', '#ef4444',
  ]

  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length])
  }
  return colors
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Get file name without extension
 */
export function getFileNameWithoutExt(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot === -1 ? fileName : fileName.slice(0, lastDot)
}

/**
 * Get file extension
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  return lastDot === -1 ? '' : fileName.slice(lastDot + 1).toLowerCase()
}

/**
 * Check if IFC type is structural
 */
export function isStructuralType(type: string): boolean {
  const structuralTypes = [
    'IfcColumn', 'IfcBeam', 'IfcSlab', 'IfcWall', 'IfcWallStandardCase',
    'IfcFooting', 'IfcPile', 'IfcPlate', 'IfcMember',
  ]
  return structuralTypes.includes(type)
}

/**
 * Check if IFC type is architectural
 */
export function isArchitecturalType(type: string): boolean {
  const architecturalTypes = [
    'IfcDoor', 'IfcWindow', 'IfcStair', 'IfcStairFlight', 'IfcRailing',
    'IfcRoof', 'IfcCurtainWall', 'IfcCovering', 'IfcFurniture',
  ]
  return architecturalTypes.includes(type)
}
