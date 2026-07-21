"use client";

import { HistoryPackageDocument } from "@/lib/contracts-api";

type DocumentStatusIndicatorProps = {
  documents: HistoryPackageDocument[];
};

const getDocumentIcon = (type: string): string => {
  switch (type.toUpperCase()) {
    case "CONTRACT":
      return "📄";
    case "MINOR_ANNEX":
      return "👶";
    case "LIABILITY_WAIVER":
      return "⚠️";
    default:
      return "📋";
  }
};

const getDocumentLabel = (type: string): string => {
  switch (type.toUpperCase()) {
    case "CONTRACT":
      return "Contrato";
    case "MINOR_ANNEX":
      return "Anexo Menor";
    case "LIABILITY_WAIVER":
      return "Exoneración";
    default:
      return type;
  }
};

const getStatusColor = (signedCount: number, totalSigners: number): string => {
  if (signedCount === 0) {
    return "#ef4444"; // Rojo - nadie ha firmado
  }
  if (signedCount < totalSigners) {
    return "#f97316"; // Naranja - parcialmente firmado
  }
  return "#22c55e"; // Verde - completamente firmado
};

export function DocumentStatusIndicator({
  documents,
}: DocumentStatusIndicatorProps) {
  if (!documents || documents.length === 0) {
    return <div style={{ color: "#9ca3af", fontSize: "13px" }}>Sin documentos</div>;
  }

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      {documents.map((doc) => {
        const color = getStatusColor(doc.signedCount, doc.totalSigners);
        const icon = getDocumentIcon(doc.documentType);
        const label = getDocumentLabel(doc.documentType);
        const progress = `${doc.signedCount}/${doc.totalSigners}`;

        return (
          <div
            key={doc.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 8px",
              borderRadius: "12px",
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              fontSize: "12px",
            }}
            title={`${label}: ${progress} firmas completadas`}
          >
            <span>{icon}</span>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: color,
                display: "inline-block",
              }}
            />
            <span style={{ color: "#6b7280", fontWeight: 500 }}>{progress}</span>
          </div>
        );
      })}
    </div>
  );
}
