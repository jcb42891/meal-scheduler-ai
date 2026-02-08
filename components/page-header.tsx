import { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  context?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  context,
  actions,
  footer,
  className,
}: PageHeaderProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm sm:p-5',
        className
      )}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
              {actions}
            </div>
          )}
        </div>

        {context && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {context}
          </div>
        )}

        {footer && (
          <div className="border-t border-border/70 pt-3">
            {footer}
          </div>
        )}
      </div>
    </section>
  )
}
