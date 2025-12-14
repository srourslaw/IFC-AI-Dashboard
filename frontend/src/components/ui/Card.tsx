/**
 * Card Components
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
        'bg-secondary-900/50 backdrop-blur-sm border border-secondary-800/50 rounded-xl',
        hover && 'transition-all duration-300 hover:border-primary-500/30 hover:shadow-soft',
        gradient && 'bg-gradient-to-br from-secondary-900/80 to-secondary-950/80',
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
    <div className={cn('flex items-center justify-between px-6 py-4 border-b border-secondary-800/50', className)}>
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
      <h3 className="text-lg font-semibold text-secondary-100">{children}</h3>
      {subtitle && <p className="text-sm text-secondary-400 mt-0.5">{subtitle}</p>}
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
    <div className={cn('px-6 py-4 border-t border-secondary-800/50 bg-secondary-900/30', className)}>
      {children}
    </div>
  )
}
