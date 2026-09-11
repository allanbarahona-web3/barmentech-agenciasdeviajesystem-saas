import * as React from "react"

import { cn } from "@/lib/utils"

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default" | "lg"
}

const inputSizes = {
  sm: "h-8 px-2.5 text-sm",
  default: "h-9 px-3 text-sm",
  lg: "h-10 px-3.5 text-base",
} as const

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = "default", type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      data-size={size}
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-background text-foreground shadow-ui-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        inputSizes[size],
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = "Input"

export { Input, type InputProps }
