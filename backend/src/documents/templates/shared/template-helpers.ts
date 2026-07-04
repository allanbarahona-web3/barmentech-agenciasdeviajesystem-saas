/**
 * Template Helper Functions
 * 
 * Shared HTML utilities for document template generation.
 * These functions ensure consistent HTML escaping, formatting,
 * and value rendering across all document types.
 */

/**
 * Escape HTML special characters to prevent XSS and ensure valid HTML
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Escape HTML attribute values
 */
export const escapeAttribute = (value: unknown): string => escapeHtml(value);

/**
 * Format ISO date string to DD/MM/YYYY
 */
export const formatDate = (isoDate: string): string => {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
};

/**
 * Format money value with 2 decimal places
 */
export const formatMoney = (value: string | number): string => {
  const amount = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
};

/**
 * Wrap value in contract value span for visual emphasis
 * Returns blank underscores if value is empty
 */
export const contractValue = (value: unknown): string => 
  `<span class="cv">${escapeHtml(String(value ?? "___"))}</span>`;

/**
 * Pad number with leading zeros
 */
export const padNumber = (value: number, size = 2): string => 
  String(value).padStart(size, "0");

/**
 * Generate contract clause with title and body
 */
export const clause = (title: string, body: string): string => 
  `<section class="clause"><p><strong>${title}</strong></p>${body}</section>`;

/**
 * Generate signature placeholder block
 */
export const signatureBlock = (params: {
  signerKey: string;
  name: string;
  idType: string;
  idNumber: string;
  role: string;
  label: string;
  date: string;
}): string => `
  <div class="sig-box">
    <div class="sig-area" data-signer-key="${escapeAttribute(params.signerKey)}">
      <span class="sig-label">${escapeHtml(params.label)}</span>
    </div>
    <p class="sig-name">${contractValue(params.name)}</p>
    <p>${contractValue(params.idType)}: ${contractValue(params.idNumber)}</p>
    <p>${contractValue(params.role)}</p>
    <p>Fecha: ${contractValue(params.date)}</p>
  </div>`;

/**
 * Generate company signature block with embedded image
 */
export const companySignatureBlock = (params: {
  representativeName: string;
  representativeId: string;
  tenantName: string;
  signatureSrc: string;
  date: string;
}): string => `
  <div class="sig-box">
    <div class="sig-area sig-area--company" data-signer-key="company">
      <span class="sig-label">Firma del representante</span>
      <img class="sig-img sig-img--company"
           src="${escapeAttribute(params.signatureSrc)}" 
           alt="Firma de ${escapeAttribute(params.representativeName)}" />
    </div>
    <p class="sig-name">${escapeHtml(params.representativeName)}</p>
    <p>Cédula: ${escapeHtml(params.representativeId)}</p>
    <p>Representante legal de ${escapeHtml(params.tenantName)}</p>
    <p>Fecha: ${contractValue(params.date)}</p>
  </div>`;
