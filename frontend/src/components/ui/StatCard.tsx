/**
 * Statistics Card Component - Light mode by default with dark mode support
 */
import { ReactNode } from 'react'
import { cn, formatNumber } from '@/lib/utils'
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/solid'

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon?: ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  loading?: boolean
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
  loading,
  color = 'primary',
}: StatCardProps) {
  const colorClasses = {
    primary: 'from-blue-500/5 to-transparent dark:from-blue-500/10',
    success: 'from-emerald-500/5 to-transparent dark:from-emerald-500/10',
    warning: 'from-amber-500/5 to-transparent dark:from-amber-500/10',
    danger: 'from-red-500/5 to-transparent dark:from-red-500/10',
    info: 'from-cyan-500/5 to-transparent dark:from-cyan-500/10',
  }

  const iconColors = {
    primary: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
    success: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
    danger: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
    info: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30',
  }

  return (
    <div
      className={cn(
        'card relative overflow-hidden p-6',
        className
      )}
    >
      {/* Gradient background */}
      <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', colorClasses[color])} />

      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
            {loading ? (
              <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mt-2" />
            ) : (
              <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">
                {typeof value === 'number' ? formatNumber(value) : value}
              </p>
            )}
            {subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">{subtitle}</p>
            )}
          </div>

          {icon && (
            <div className={cn('p-3 rounded-xl', iconColors[color])}>
              {icon}
            </div>
          )}
        </div>

        {trend && (
          <div className="flex items-center gap-1.5 mt-4">
            <span
              className={cn(
                'flex items-center gap-0.5 text-sm font-medium',
                trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              )}
            >
              {trend.isPositive ? (
                <ArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArrowDownIcon className="h-4 w-4" />
              )}
              {Math.abs(trend.value)}%
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-500">vs last model</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface MiniStatProps {
  label: string
  value: number | string
  icon?: ReactNode
  className?: string
}

export function MiniStat({ label, value, icon, className }: MiniStatProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {icon && (
        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          {icon}
        </div>
      )}
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
      </div>
    </div>
  )
}
