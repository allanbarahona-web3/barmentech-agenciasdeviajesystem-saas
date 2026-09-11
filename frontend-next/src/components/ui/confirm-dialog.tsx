"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { Button } from "@/components/ui/button"

type ConfirmDialogProps = Omit<React.ComponentProps<typeof AlertDialogPrimitive.Root>, "children"> & {
  trigger?: React.ReactElement
  title: React.ReactNode
  description?: React.ReactNode
  cancelLabel?: React.ReactNode
  confirmLabel?: React.ReactNode
  pendingLabel?: React.ReactNode
  variant?: "default" | "destructive"
  isPending?: boolean
  confirmDisabled?: boolean
  onConfirm?: React.MouseEventHandler<HTMLButtonElement>
}

function ConfirmDialog({
  trigger,
  title,
  description,
  cancelLabel = "Cancelar",
  confirmLabel = "Confirmar",
  pendingLabel = "Procesando…",
  variant = "default",
  isPending = false,
  confirmDisabled = false,
  onConfirm,
  ...props
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root {...props}>
      {trigger ? <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger> : null}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]" />
        <AlertDialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-ui-md outline-none">
          <AlertDialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</AlertDialogPrimitive.Title>
          {description ? <AlertDialogPrimitive.Description className="mt-2 text-sm leading-6 text-muted-foreground">{description}</AlertDialogPrimitive.Description> : null}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button type="button" variant="outline" disabled={isPending}>{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                type="button"
                variant={variant === "destructive" ? "destructive" : "default"}
                disabled={isPending || confirmDisabled}
                onClick={onConfirm}
              >
                {isPending ? pendingLabel : confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}

export { ConfirmDialog, type ConfirmDialogProps }
