import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva("relative w-full rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-card text-card-foreground",
      destructive: "border-destructive/30 bg-destructive/5 text-destructive",
      success: "border-success/25 bg-success/5 text-success",
      warning: "border-warning/25 bg-warning/5 text-warning",
      info: "border-info/25 bg-info/5 text-info",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type AlertProps = React.ComponentProps<"div"> & VariantProps<typeof alertVariants>

function Alert({ className, variant, role = "alert", ...props }: AlertProps) {
  return <div data-slot="alert" role={role} className={cn(alertVariants({ variant }), className)} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 data-slot="alert-title" className={cn("font-medium", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("mt-1 leading-relaxed", className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, alertVariants, type AlertProps }
