"use client";

import { useEffect, type ReactNode } from "react";

export type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  confirmVariant?: "primary" | "danger" | "warning";
  isLoading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  showCancel = true,
  confirmVariant = "primary",
  isLoading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Close on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!isLoading) onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isLoading, isOpen, onCancel]);

  if (!isOpen) return null;

  const confirmButtonClass = 
    confirmVariant === "danger" ? "confirm-modal-btn-danger" :
    confirmVariant === "warning" ? "confirm-modal-btn-warning" :
    "confirm-modal-btn-primary";

  return (
    <div
      className="confirm-modal-overlay"
      onClick={() => {
        if (!isLoading) onCancel();
      }}
    >
      <div 
        className="confirm-modal-container" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <h3 className="confirm-modal-title">{title}</h3>
        </div>
        
        <div className="confirm-modal-body">
          <div className="confirm-modal-message">{message}</div>
        </div>
        
        <div className="confirm-modal-footer">
          {showCancel ? (
            <button
              type="button"
              className="confirm-modal-btn confirm-modal-btn-cancel"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelText}
            </button>
          ) : null}
          <button 
            type="button"
            className={`confirm-modal-btn ${confirmButtonClass}`}
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
