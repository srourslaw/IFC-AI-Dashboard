/**
 * Card Components - Light mode by default with dark mode support
 */
import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CardProps {
  children: ReactNode
  className?: string
  hover?: boolean
  gradient?: boolean
  glow?: boolean
}

export function Card({ children, className, hover, gradient, glow }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm',
        hover && 'transition-all duration-300 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md',
        gradient && 'bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900',
        glow && 'shadow-glow',
        className
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: ReactNode
  className?: string
  action?: ReactNode
}

export function CardHeader({ children, className, action }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700', className)}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  )
}

interface CardTitleProps {
  children: ReactNode
  className?: string
  subtitle?: string
}

export function CardTitle({ children, className, subtitle }: CardTitleProps) {
  return (
    <div className={className}>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{children}</h3>
      {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  )
}

interface CardContentProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

export function CardContent({ children, className, noPadding }: CardContentProps) {
  return (
    <div className={cn(!noPadding && 'p-6', className)}>
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: ReactNode
  className?: string
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn('px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50', className)}>
      {children}
    </div>
  )
}
