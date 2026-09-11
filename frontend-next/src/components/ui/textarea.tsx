import * as React from "react"

import { cn } from "@/lib/utils"

type TextareaProps = React.ComponentProps<"textarea"> & {
  size?: "sm" | "default" | "lg"
}

const textareaSizes = {
  sm: "min-h-20 px-2.5 py-2 text-sm",
  default: "min-h-24 px-3 py-2 text-sm",
  lg: "min-h-32 px-3.5 py-2.5 text-base",
} as const

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size = "default", ...props }, ref) => (
    <textarea
      ref={ref}
      data-slot="textarea"
      data-size={size}
      className={cn(
        "w-full min-w-0 resize-y rounded-md border border-input bg-background text-foreground shadow-ui-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        textareaSizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = "Textarea"

export { Textarea, type TextareaProps }
