import * as React from "react"

import { cn } from "@/lib/utils"

type DataTableShellProps = React.ComponentProps<"section"> & {
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  state?: React.ReactNode
}

function DataTableShell({
  className,
  toolbar,
  footer,
  state,
  children,
  ...props
}: DataTableShellProps) {
  return (
    <section data-slot="data-table-shell" className={cn("overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-ui-xs", className)} {...props}>
      {toolbar ? <div className="border-b border-border px-5 py-4">{toolbar}</div> : null}
      {state ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">{state}</div> : children}
      {footer ? <div className="border-t border-border px-5 py-3">{footer}</div> : null}
    </section>
  )
}

export { DataTableShell, type DataTableShellProps }
