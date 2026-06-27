"use client";

import type { AttendanceState } from "@/lib/attendance-api";
import { useEffect, useState } from "react";

type BreakModalProps = {
  isOpen: boolean;
  currentState: AttendanceState | null;
  isEndingBreak?: boolean;
  onEndBreak: () => void;
  clockedInAt?: string | null;
  now?: number;
};

const getTitle = (state: AttendanceState | null): string => {
  if (state === "LUNCH") {
    return "Disfruta tu almuerzo";
  }
  return "Disfruta tu descanso";
};

const getIcon = (state: AttendanceState | null): string => {
  if (state === "LUNCH") {
    return "☕";
  }
  return "⏸️";
};

const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export function BreakModal({
  isOpen,
  currentState,
  isEndingBreak = false,
  onEndBreak,
  clockedInAt,
  now = Date.now(),
}: BreakModalProps) {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const elapsedSeconds = clockedInAt
    ? Math.max(0, Math.floor((now - new Date(clockedInAt).getTime()) / 1000))
    : 0;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
      setBlockedMessage(null);
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Descanso activo"
      onClick={() => setBlockedMessage("Debes terminar tu descanso para poder continuar.")}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.58)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2100,
        padding: "16px",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "460px",
          borderRadius: "20px",
          background: "linear-gradient(155deg, #ffffff 0%, #f8fafc 100%)",
          boxShadow: "0 24px 68px rgba(15, 23, 42, 0.34)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          padding: "34px 30px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "3rem",
            marginBottom: "14px",
          }}
        >
          {getIcon(currentState)}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: "1.55rem",
            fontWeight: 800,
            color: "#0f172a",
          }}
        >
          {getTitle(currentState)}
        </h2>

        {/* Contador de duración */}
        <div
          style={{
            margin: "16px 0",
            fontSize: "2.5rem",
            fontWeight: 800,
            color: "#059669",
            fontFamily: "monospace",
            letterSpacing: "2px",
          }}
        >
          {formatClock(elapsedSeconds)}
        </div>

        <p
          style={{
            margin: "8px 0 0 0",
            fontSize: "0.88rem",
            color: "#64748b",
            fontWeight: 600,
          }}
        >
          Tiempo transcurrido
        </p>

        <p
          style={{
            margin: "14px 0 0 0",
            fontSize: "1.3rem",
            color: "#475569",
            lineHeight: 1.65,
          }}
        >
          <strong>{currentState ?? "BREAK"}</strong>. Cuando regreses, presiona el botón para volver a
          WORKING.
        </p>

        {blockedMessage ? (
          <p
            style={{
              margin: "16px 0 0 0",
              borderRadius: "10px",
              background: "#fef3c7",
              color: "#92400e",
              padding: "10px 12px",
              fontSize: "0.88rem",
              fontWeight: 700,
            }}
          >
            {blockedMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onEndBreak}
          disabled={isEndingBreak}
          style={{
            width: "100%",
            marginTop: "22px",
            border: "none",
            borderRadius: "12px",
            padding: "13px 14px",
            background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
            color: "#fff",
            fontWeight: 800,
            fontSize: "1rem",
            cursor: isEndingBreak ? "not-allowed" : "pointer",
            opacity: isEndingBreak ? 0.72 : 1,
          }}
        >
          {isEndingBreak ? "Actualizando..." : "Volver a WORKING"}
        </button>
      </div>
    </div>
  );
}