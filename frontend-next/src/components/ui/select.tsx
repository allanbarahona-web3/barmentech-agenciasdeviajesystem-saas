import * as React from "react"

import { cn } from "@/lib/utils"

type SelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default" | "lg"
}

const selectSizes = {
  sm: "h-8 px-2.5 text-sm",
  default: "h-9 px-3 text-sm",
  lg: "h-10 px-3.5 text-base",
} as const

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = "default", children, ...props }, ref) => (
    <select
      ref={ref}
      data-slot="select"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-background text-foreground shadow-ui-xs outline-none transition-[border-color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        selectSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = "Select"

export { Select, type SelectProps }
