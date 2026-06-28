// Página pública de firma de contratos
// Implementación pública de firma de contratos (Next.js App Router).

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import "./styles.css";
import {
  getPublicSigningSession,
  markContractViewed,
  finalizeContractSignature,
  type SigningSessionData,
  type SigningResponse,
} from "@/lib/public-signing-api";
import { SignatureCanvas, type SignatureCanvasRef } from "./SignatureCanvas";

// ─── Tipos de Estado ──────────────────────────────────────────────────────────

type PageState = "loading" | "error" | "read" | "sign" | "success";

type ErrorType =
  | "invalid_token"
  | "expired_token"
  | "not_found"
  | "already_signed"
  | "unknown";

// ─── Componente Principal ────────────────────────────────────────────────────

function SignContractContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [pageState, setPageState] = useState<PageState>("loading");
  const [sessionData, setSessionData] = useState<SigningSessionData | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>("unknown");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signingResponse, setSigningResponse] = useState<SigningResponse | null>(null);

  const canvasRef = useRef<SignatureCanvasRef>(null);

  // ─── Carga Inicial ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setErrorType("invalid_token");
      setErrorMessage("El enlace de firma no contiene token.");
      setPageState("error");
      return;
    }

    (async () => {
      try {
        const data = await getPublicSigningSession(token);
        setSessionData(data);

        // Si ya está firmado, mostrar en modo lectura con mensaje
        if (data.status === "SIGNED") {
          setStatusMessage("Este contrato ya fue firmado por todas las partes.");
          setPageState("read");
        } else {
          setStatusMessage("Cargando contrato...");
          setPageState("read");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        setErrorMessage(message);

        // Mapear errores a tipos específicos
        if (message.toLowerCase().includes("invalido") || message.toLowerCase().includes("invalid")) {
          setErrorType("invalid_token");
        } else if (message.toLowerCase().includes("expir")) {
          setErrorType("expired_token");
        } else if (message.toLowerCase().includes("no encontrado") || message.toLowerCase().includes("not found")) {
          setErrorType("not_found");
        } else if (message.toLowerCase().includes("cerrado") || message.toLowerCase().includes("firmado")) {
          setErrorType("already_signed");
        } else {
          setErrorType("unknown");
        }

        setPageState("error");
      }
    })();
  }, [token]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleIframeLoad = () => {
    if (sessionData?.status !== "SIGNED") {
      setStatusMessage("Contrato cargado. Revísalo y presiona Firmar cuando estés listo.");
    }
  };

  const handleGoToSign = async () => {
    // Marcar como visto (non-blocking)
    void markContractViewed(token);

    // Limpiar y preparar canvas
    if (canvasRef.current) {
      canvasRef.current.clearCanvas();
    }

    setStatusMessage("Dibuja tu firma y presiona Enviar firma.");
    setPageState("sign");
  };

  const handleBackToRead = () => {
    setStatusMessage("");
    setPageState("read");
  };

  const handleClearCanvas = () => {
    if (canvasRef.current) {
      canvasRef.current.clearCanvas();
    }
  };

  const handleSubmitSignature = async () => {
    if (!canvasRef.current) return;

    if (!canvasRef.current.isDirty) {
      setStatusMessage("Debes dibujar tu firma antes de enviar.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Exportando firma...");

    try {
      const signatureBase64 = await canvasRef.current.exportToPngBase64();
      
      setStatusMessage("Enviando firma...");

      const signerName = sessionData?.signerName || sessionData?.clientName || "";
      const result = await finalizeContractSignature(token, signerName, signatureBase64);

      setSigningResponse(result);
      setPageState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo enviar la firma.";
      setStatusMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render Loading ───────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div className="sign-page-body">
        <div className="sign-page">
          <div className="sign-loading">
            <p>Cargando contrato&hellip;</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Error ─────────────────────────────────────────────────────────

  if (pageState === "error") {
    let title = "No fue posible abrir este enlace";
    let hint = "Si necesitas ayuda, contacta a tu asesor de viajes.";

    if (errorType === "already_signed") {
      title = "Proceso de firma cerrado";
      hint = "";
    }

    return (
      <div className="sign-page-body">
        <div className="sign-page">
          <div className="sign-error">
            <article className="sign-error-card">
              <img
                src="/assets/LOGO ALMANOVA BLANCO.png"
                alt="Viajes Alma Nova"
                className="sign-error-logo"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <p className="sign-error-eyebrow">Viajes Alma Nova</p>
              <h1 className="sign-error-title">{title}</h1>
              <p className="sign-error-message">{errorMessage}</p>
              {hint && <p className="sign-error-hint">{hint}</p>}
            </article>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Read Step ─────────────────────────────────────────────────────

  if (pageState === "read") {
    const isAlreadySigned = sessionData?.status === "SIGNED";

    return (
      <div className="sign-page-body">
        <div className="sign-page">
          <div className="sign-step">
            <header className="sign-header">
              <img
                src="/assets/LOGO ALMANOVA BLANCO.png"
                alt="Viajes Alma Nova"
                className="sign-logo"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <div className="sign-meta">
                <p className="sign-contract-number">{sessionData?.contractNumber || "–"}</p>
                <p className="sign-client-name">{sessionData?.clientName || "–"}</p>
                <p className="sign-state-badge">{sessionData?.status || "–"}</p>
              </div>
            </header>

            <p className="sign-instruction">Lee el contrato completo antes de firmar.</p>

            <div className="sign-contract-frame-wrap">
              <iframe
                className="sign-contract-frame"
                title="Contrato"
                sandbox="allow-same-origin"
                src={sessionData?.contractHtmlUrl || ""}
                onLoad={handleIframeLoad}
              />
            </div>

            <div className="sign-actions">
              <button
                type="button"
                className="sign-btn sign-btn--primary"
                onClick={handleGoToSign}
                disabled={isAlreadySigned || !sessionData?.contractHtmlUrl}
              >
                Firmar contrato
              </button>
            </div>

            {statusMessage && (
              <p className="sign-status" role="status" aria-live="polite">
                {statusMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Sign Step ─────────────────────────────────────────────────────

  if (pageState === "sign") {
    return (
      <div className="sign-page-body">
        <div className="sign-page">
          <div className="sign-step">
            <header className="sign-header">
              <img
                src="/assets/LOGO ALMANOVA BLANCO.png"
                alt="Viajes Alma Nova"
                className="sign-logo"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
              <p className="sign-step-label">Paso 2 &mdash; Firma</p>
            </header>

            <p className="sign-instruction">
              Firma con tu dedo o el ratón en el recuadro de abajo.
            </p>

            <div className="sign-canvas-wrap">
              <p className="sign-canvas-label">Tu firma</p>
              <SignatureCanvas ref={canvasRef} />
            </div>

            <div className="sign-actions sign-actions--row">
              <button
                type="button"
                className="sign-btn sign-btn--ghost"
                onClick={handleBackToRead}
              >
                Atrás
              </button>
              <button
                type="button"
                className="sign-btn sign-btn--ghost"
                onClick={handleClearCanvas}
              >
                Borrar
              </button>
              <button
                type="button"
                className="sign-btn sign-btn--primary"
                onClick={handleSubmitSignature}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Enviando..." : "Enviar firma"}
              </button>
            </div>

            {statusMessage && (
              <p
                className={`sign-status ${statusMessage.toLowerCase().includes("error") || statusMessage.toLowerCase().includes("debes") ? "sign-status--error" : ""}`}
                role="status"
                aria-live="polite"
              >
                {statusMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render Success Step ──────────────────────────────────────────────────

  if (pageState === "success") {
    let successMessage = "Tu firma fue enviada correctamente.";

    if (signingResponse) {
      const nextStatus = signingResponse.status;
      if (nextStatus === "SIGNED") {
        successMessage = "Contrato firmado. Todas las partes han completado el proceso.";
      } else {
        const signed = signingResponse.signedCount;
        const total = signingResponse.totalSigners;
        if (signed && total) {
          successMessage = `Firma registrada (${signed}/${total} firmantes completados).`;
        }
      }
    }

    return (
      <div className="sign-page-body">
        <div className="sign-page">
          <div className="sign-step">
            <div className="sign-success">
              <div className="sign-success-icon" aria-hidden="true">
                &#10003;
              </div>
              <h2>¡Firma registrada!</h2>
              <p>{successMessage}</p>
              <button
                type="button"
                className="sign-btn sign-btn--primary"
                onClick={() => window.close()}
                style={{ marginTop: "24px" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
export default function SignContractPage() {
  return (
    <Suspense
      fallback={
        <div className="sign-loading">
          <div className="sign-loading__spinner" />
          <p>Cargando...</p>
        </div>
      }
    >
      <SignContractContent />
    </Suspense>
  );
}