"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

export type ToastMessage = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
};

type ToastNotificationProps = {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
};

export function ToastNotification({ toasts, onDismiss }: ToastNotificationProps) {
  useEffect(() => {
    toasts.forEach((toast) => {
      if (toast.duration && toast.duration > 0) {
        const timer = window.setTimeout(() => {
          onDismiss(toast.id);
        }, toast.duration);
        return () => window.clearTimeout(timer);
      }
    });
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          <div className="toast-icon">
            {toast.type === "success" && "✓"}
            {toast.type === "error" && "✕"}
            {toast.type === "warning" && "⚠"}
            {toast.type === "info" && "ℹ"}
          </div>
          <div className="toast-message">{toast.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar notificación"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook personalizado para manejar toasts
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: ToastType, message: string, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return {
    toasts,
    showSuccess: (msg: string, duration?: number) => showToast("success", msg, duration),
    showError: (msg: string, duration?: number) => showToast("error", msg, duration),
    showWarning: (msg: string, duration?: number) => showToast("warning", msg, duration),
    showInfo: (msg: string, duration?: number) => showToast("info", msg, duration),
    dismissToast,
  };
}
