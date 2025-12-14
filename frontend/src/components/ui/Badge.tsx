/**
 * Badge Component
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
    default: 'bg-secondary-700 text-secondary-200',
    primary: 'bg-primary-500/20 text-primary-300',
    success: 'bg-success-500/20 text-success-300',
    warning: 'bg-warning-500/20 text-warning-300',
    danger: 'bg-danger-500/20 text-danger-300',
    info: 'bg-cyan-500/20 text-cyan-300',
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-0.5 text-xs',
    lg: 'px-3 py-1 text-sm',
  }

  const dotColors = {
    default: 'bg-secondary-400',
    primary: 'bg-primary-400',
    success: 'bg-success-400',
    warning: 'bg-warning-400',
    danger: 'bg-danger-400',
    info: 'bg-cyan-400',
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
