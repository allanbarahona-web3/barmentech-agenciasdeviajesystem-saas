"use client";

import { useEffect } from "react";

interface TenantSuspendedModalProps {
  isOpen: boolean;
  tenantName: string;
  reason: string;
  suspendedAt: Date;
  onClose: () => void;
}

export default function TenantSuspendedModal({
  isOpen,
  tenantName,
  reason,
  suspendedAt,
  onClose,
}: TenantSuspendedModalProps) {
  // Cerrar con ESC
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-slideUp">
        {/* Icono de advertencia */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Título */}
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">
          Cuenta Suspendida
        </h2>

        {/* Mensaje */}
        <div className="space-y-4 text-center mb-6">
          <p className="text-gray-700">
            La cuenta de <span className="font-semibold">{tenantName}</span> ha sido suspendida temporalmente.
          </p>
          
          {/* Razón de suspensión */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm font-medium text-red-900 mb-1">Motivo:</p>
            <p className="text-sm text-red-800">{reason}</p>
          </div>

          {/* Fecha de suspensión */}
          <p className="text-xs text-gray-500">
            Suspendido el {new Date(suspendedAt).toLocaleDateString("es-MX", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Información de contacto */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 text-center">
            Para resolver esta situación, por favor contacte a:
          </p>
          <p className="text-sm font-semibold text-center text-gray-900 mt-2">
            Soporte Técnico
          </p>
          <p className="text-xs text-gray-600 text-center mt-1">
            soporte@viajesmanova.com
          </p>
        </div>

        {/* Botón cerrar */}
        <button
          onClick={onClose}
          className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-lg transition-colors duration-200"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
