"use client";

import { useState } from "react";

type SupportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
};

export function SupportModal({
  isOpen,
  onClose,
  userName,
  userEmail,
}: SupportModalProps) {
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!message.trim()) {
      return;
    }

    const whatsappMessage = `Hola BarmenTech, necesito soporte técnico.

Usuario: ${userName}
Email: ${userEmail}

Consulta:
${message.trim()}`;

    const whatsappUrl = `https://wa.me/17863918722?text=${encodeURIComponent(whatsappMessage)}`;
    window.open(whatsappUrl, "_blank");
    
    // Limpiar y cerrar
    setMessage("");
    onClose();
  };

  const handleClose = () => {
    setMessage("");
    onClose();
  };

  return (
    <section
      className="viewer-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="viewer-panel" style={{ maxWidth: "600px" }} onClick={(event) => event.stopPropagation()}>
        <div className="confirmation-modal-head">
          <h2>💬 Soporte Técnico</h2>
          <button 
            type="button" 
            className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" 
            onClick={handleClose} 
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="confirmation-modal-body" style={{ padding: "1.5rem" }}>
          <p style={{ marginBottom: "1rem", color: "#4b5563", fontSize: "0.95rem" }}>
            Describe tu consulta o problema. Te contactaremos por WhatsApp para ayudarte.
          </p>
          
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f3f4f6", borderRadius: "0.5rem", fontSize: "0.875rem" }}>
            <p style={{ margin: 0, color: "#6b7280" }}>
              <strong>Usuario:</strong> {userName}
            </p>
            <p style={{ margin: "0.25rem 0 0 0", color: "#6b7280" }}>
              <strong>Email:</strong> {userEmail}
            </p>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escribe tu consulta aquí..."
            rows={6}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.5rem",
              fontSize: "0.95rem",
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: "120px",
            }}
            autoFocus
          />
        </div>

        <div className="confirmation-modal-actions">
          <button 
            type="button" 
            className="rounded-xl px-4 py-2.5 bg-white text-blue-900 border border-blue-200 font-semibold transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0" 
            onClick={handleClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-xl px-4 py-3 bg-gradient-to-b from-green-500 to-green-700 text-white font-bold shadow-lg shadow-green-500/25 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/30 active:translate-y-0 active:saturate-75 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSubmit}
            disabled={!message.trim()}
          >
            📱 Abrir WhatsApp
          </button>
        </div>
      </div>
    </section>
  );
}
