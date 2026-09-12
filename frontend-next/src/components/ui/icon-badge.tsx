import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const iconBadgeVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        primary: "bg-primary/10 text-primary",
        info: "bg-info/10 text-info",
        success: "bg-success/10 text-success",
        warning: "bg-warning/10 text-warning",
        destructive: "bg-destructive/10 text-destructive",
      },
      size: {
        sm: "size-7",
        default: "size-8",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "default",
    },
  }
)

interface IconBadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof iconBadgeVariants> {}

function IconBadge({ className, tone, size, ...props }: IconBadgeProps) {
  return <span className={cn(iconBadgeVariants({ tone, size }), className)} {...props} />
}

export { IconBadge, iconBadgeVariants, type IconBadgeProps }
