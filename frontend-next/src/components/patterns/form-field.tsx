import * as React from "react"

import { cn } from "@/lib/utils"

type FormFieldProps = React.ComponentProps<"div"> & {
  label: React.ReactNode
  htmlFor?: string
  required?: boolean
  description?: React.ReactNode
  error?: React.ReactNode
}

function FormField({
  className,
  label,
  htmlFor,
  required = false,
  description,
  error,
  children,
  ...props
}: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("grid gap-1.5", className)} {...props}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
        {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
      </label>
      {children}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {!error && description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  )
}

export { FormField, type FormFieldProps }
