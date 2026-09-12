import * as React from "react"

import { cn } from "@/lib/utils"

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  meta?: React.ReactNode
}

function PageHeader({
  className,
  title,
  description,
  eyebrow,
  actions,
  meta,
  ...props
}: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">{eyebrow}</p> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export { PageHeader, type PageHeaderProps }
