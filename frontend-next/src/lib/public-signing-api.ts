// Cliente API para endpoints públicos de firma de contratos
// Reutiliza resolveApiBase() de runtime-config.ts

import { resolveApiBase } from "./runtime-config";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SigningSessionData {
  contractId: string;
  contractNumber: string;
  destination: string;
  clientName: string;
  signerName: string;
  signerRole: "CLIENTE" | "ACOMPANANTE";
  signerKey: string;
  status: "PENDING_SIGNATURE" | "VIEWED" | "SIGNED";
  pdfUrl: string;
  signedPdfUrl: string | null;
  signatureAnchor: {
    pageIndex: number;
    box: { x: number; y: number; width: number; height: number };
  } | null;
  contractHtmlUrl: string | null;
  expiresAt: string;
}

export interface SigningResponse {
  id: string;
  contractNumber: string;
  status: "SIGNED" | "PENDING_SIGNATURE";
  signedAt: string;
  signerName: string;
  signerRole: "CLIENTE" | "ACOMPANANTE";
  signedCount: number;
  totalSigners: number;
  pendingSigners: Array<{
    signerKey: string;
    signerName: string;
    signerRole: string;
    signerEmail: string | null;
  }>;
  billingInvoiceAutoEmail?: {
    ok: boolean;
    alreadySent?: boolean;
    sentToEmail?: string | null;
    invoiceNumber?: string;
    error?: string;
  } | null;
}

// ─── API Client ───────────────────────────────────────────────────────────────

/**
 * Obtiene datos iniciales de la sesión de firma
 * Endpoint: GET /contracts/public/signing-session?token={token}
 */
export async function getPublicSigningSession(
  token: string
): Promise<SigningSessionData> {
  const apiBase = resolveApiBase();

  if (!apiBase) {
    throw new Error(
      "No se pudo resolver la URL del backend. Verifica NEXT_PUBLIC_API_BASE."
    );
  }

  const response = await fetch(
    `${apiBase}/contracts/public/signing-session?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.message ||
      errorData.error ||
      "No se pudo cargar la sesión de firma.";
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }

  return response.json();
}

/**
 * Marca el contrato como visualizado (cuando usuario presiona "Firmar")
 * Endpoint: POST /contracts/public/mark-viewed
 * Nota: Este endpoint es non-blocking, si falla no afecta el flujo
 */
export async function markContractViewed(token: string): Promise<{ ok: boolean; status: string }> {
  const apiBase = resolveApiBase();

  if (!apiBase) {
    // Non-blocking: retornar ok aunque falle
    return { ok: false, status: "unknown" };
  }

  try {
    const response = await fetch(`${apiBase}/contracts/public/mark-viewed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return { ok: false, status: "unknown" };
    }

    return response.json();
  } catch {
    // Non-blocking: swallow error
    return { ok: false, status: "unknown" };
  }
}

/**
 * Envía la firma final al backend
 * Endpoint: POST /contracts/public/finalize-signature
 */
export async function finalizeContractSignature(
  token: string,
  signedByName: string,
  signatureImageBase64: string
): Promise<SigningResponse> {
  const apiBase = resolveApiBase();

  if (!apiBase) {
    throw new Error(
      "No se pudo resolver la URL del backend. Verifica NEXT_PUBLIC_API_BASE."
    );
  }

  const response = await fetch(`${apiBase}/contracts/public/finalize-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      signedByName,
      signatureImageBase64,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.message ||
      errorData.error ||
      "No se pudo procesar la firma.";
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }

  return response.json();
}
