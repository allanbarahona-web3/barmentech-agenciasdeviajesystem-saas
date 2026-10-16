export type CustomerProposalLine = {
  displayOrder: number;
  description: string;
  quantity: string;
  commercialNote: string | null;
};

/**
 * Converts immutable commercial snapshots into customer-facing text without
 * consulting mutable Cost Engine, supplier, or source authorities.
 */
export function customerProposalLine(line: CustomerProposalLine): CustomerProposalLine {
  return {
    ...line,
    description: customerDescription(line.description),
    commercialNote: customerNote(line.commercialNote),
  };
}

function customerDescription(value: string): string {
  const normalized = text(value) ?? "Servicio";
  const match = /^(Vuelo|Transporte)\s*:?\s*(.*)$/i.exec(normalized);
  if (!match) return removeAirportCodes(normalized) ?? "Servicio";

  const label = match[1].toLocaleLowerCase() === "vuelo" ? "Vuelo" : "Transporte";
  const route = customerRoute(match[2]);
  return route ? `${label}: ${route}` : label;
}

function customerNote(value: string | null): string | null {
  const normalized = text(value);
  if (!normalized) return null;
  const visible = normalized
    .split("·")
    .map((part) => part.trim())
    .filter((part) => !/^(aerolínea|proveedor|supplier|fuente|referencia|url|evidencia)\s*:/i.test(part))
    .map((part) => formatIsoDates(removeAirportCodes(part) ?? ""))
    .filter(Boolean);
  return visible.length ? visible.join(" · ") : null;
}

function customerRoute(value: string): string | null {
  const [origin, destination] = value.split(/\s*(?:→|–|—)\s*/, 2).map(customerPlace);
  if (origin && destination) return `${origin} → ${destination}`;
  return origin ?? destination ?? null;
}

function customerPlace(value: string | undefined): string | null {
  return removeAirportCodes(text(value) ?? "");
}

function removeAirportCodes(value: string): string | null {
  const sanitized = value
    .replace(/\b[A-Z]{3}\b/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—→]+|[\s\-–—→]+$/g, "")
    .trim();
  return sanitized || null;
}

function formatIsoDates(value: string): string {
  return value.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3/$2/$1");
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
