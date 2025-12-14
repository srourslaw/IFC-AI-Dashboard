/**
 * Statistics Card Component
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
    primary: 'from-primary-500/10 to-transparent',
    success: 'from-success-500/10 to-transparent',
    warning: 'from-warning-500/10 to-transparent',
    danger: 'from-danger-500/10 to-transparent',
    info: 'from-cyan-500/10 to-transparent',
  }

  const iconColors = {
    primary: 'text-primary-400 bg-primary-500/10',
    success: 'text-success-400 bg-success-500/10',
    warning: 'text-warning-400 bg-warning-500/10',
    danger: 'text-danger-400 bg-danger-500/10',
    info: 'text-cyan-400 bg-cyan-500/10',
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
            <p className="text-sm font-medium text-secondary-400">{title}</p>
            {loading ? (
              <div className="h-8 w-24 bg-secondary-800 rounded animate-pulse mt-2" />
            ) : (
              <p className="text-3xl font-bold text-secondary-100 mt-2">
                {typeof value === 'number' ? formatNumber(value) : value}
              </p>
            )}
            {subtitle && (
              <p className="text-sm text-secondary-500 mt-1">{subtitle}</p>
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
                trend.isPositive ? 'text-success-400' : 'text-danger-400'
              )}
            >
              {trend.isPositive ? (
                <ArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArrowDownIcon className="h-4 w-4" />
              )}
              {Math.abs(trend.value)}%
            </span>
            <span className="text-sm text-secondary-500">vs last model</span>
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
        <div className="p-2 rounded-lg bg-secondary-800/50 text-secondary-400">
          {icon}
        </div>
      )}
      <div>
        <p className="text-xs text-secondary-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold text-secondary-100">
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
      </div>
    </div>
  )
}
