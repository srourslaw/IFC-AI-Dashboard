/**
 * Badge Component - Light mode by default with dark mode support
 */
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps {
  children: ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  dot?: boolean
  pulse?: boolean
}

export function Badge({ children, variant = 'default', size = 'md', className, dot, pulse }: BadgeProps) {
  const variantClasses = {
    default: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
    primary: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    danger: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    info: 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  }

  const dotColors = {
    default: 'bg-slate-400',
    primary: 'bg-blue-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    info: 'bg-cyan-500',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant], pulse && 'animate-pulse')} />
      )}
      {children}
    </span>
  )
}

interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'error' | 'success'
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = {
    active: { variant: 'success' as const, label: 'Active' },
    inactive: { variant: 'default' as const, label: 'Inactive' },
    pending: { variant: 'warning' as const, label: 'Pending' },
    error: { variant: 'danger' as const, label: 'Error' },
    success: { variant: 'success' as const, label: 'Success' },
  }

  const { variant, label } = config[status]

  return (
    <Badge variant={variant} dot pulse={status === 'active' || status === 'pending'} className={className}>
      {label}
    </Badge>
  )
}
