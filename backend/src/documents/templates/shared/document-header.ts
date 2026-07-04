/**
 * Document Header Components
 * 
 * Reusable header components for document PDFs.
 * Includes company branding, logo, and metadata display.
 */

import { escapeHtml, escapeAttribute } from "./template-helpers";

export interface CompanyInfo {
  name: string;
  legalId?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoSrc?: string | null;
}

export interface DocumentMetadata {
  documentNumber: string;
  issuedAt: string;
  agentName?: string | null;
}

/**
 * Generate document header with company logo and information
 */
export const documentHeader = (
  company: CompanyInfo,
  metadata: DocumentMetadata,
): string => {
  const metaParts: string[] = [];

  if (company.legalId) {
    metaParts.push(`Cédula jurídica: <strong>${escapeHtml(company.legalId)}</strong>`);
  }

  if (company.contactEmail) {
    metaParts.push(`<strong>${escapeHtml(company.contactEmail)}</strong>`);
  }

  if (company.contactPhone) {
    metaParts.push(`Tel. <strong>${escapeHtml(company.contactPhone)}</strong>`);
  }

  const companyMeta = metaParts.length > 0 ? metaParts.join(" &nbsp;|&nbsp; ") + "<br />" : "";

  const docMetaParts: string[] = [
    `Contrato N.° <strong>${escapeHtml(metadata.documentNumber)}</strong>`,
    `Emitido: <strong>${escapeHtml(metadata.issuedAt)}</strong>`,
  ];

  if (metadata.agentName) {
    docMetaParts.push(`Agente: <strong>${escapeHtml(metadata.agentName)}</strong>`);
  }

  const docMeta = docMetaParts.join(" &nbsp;|&nbsp; ");

  return `
<header class="doc-header">
  <img class="doc-header-logo"
       src="${escapeAttribute(company.logoSrc || "")}" 
       alt="${escapeHtml(company.name)}" />
  <div class="doc-header-text">
    <h1>${escapeHtml(company.name)}</h1>
    <p class="doc-meta">
      ${companyMeta}
      ${docMeta}
    </p>
  </div>
</header>`;
};

/**
 * Generate document title section
 */
export const documentTitle = (title: string): string =>
  `<h2 class="contract-title">${escapeHtml(title)}</h2>`;

/**
 * Generate document metadata table
 */
export const documentMetadataTable = (metadata: Record<string, string>): string => {
  const rows = Object.entries(metadata)
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}:</td><td><strong>${escapeHtml(value)}</strong></td></tr>`,
    )
    .join("\n  ");

  return `
<table class="contract-meta">
  ${rows}
</table>`;
};

/**
 * Generate section heading
 */
export const sectionHeading = (title: string): string =>
  `<h3 class="section-heading">${escapeHtml(title)}</h3>`;
