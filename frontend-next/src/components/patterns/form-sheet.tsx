"use client"

import * as React from "react"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  type SheetContentProps,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type FormSheetProps = Omit<React.ComponentProps<typeof Sheet>, "children"> & {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  actions: React.ReactNode
  side?: SheetContentProps["side"]
  contentClassName?: string
}

function FormSheet({
  title,
  description,
  children,
  actions,
  side = "right",
  contentClassName,
  ...props
}: FormSheetProps) {
  return (
    <Sheet {...props}>
      <SheetContent side={side} className="overflow-hidden p-0">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5", contentClassName)}>{children}</div>
        <SheetFooter>{actions}</SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export { FormSheet, type FormSheetProps }
