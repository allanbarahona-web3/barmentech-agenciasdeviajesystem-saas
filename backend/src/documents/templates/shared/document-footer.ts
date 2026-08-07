import type { CompanyInfo } from "./document-header";
import { escapeHtml } from "./template-helpers";

export const documentFooter = (company: CompanyInfo): string => {
  const contact = [company.contactEmail, company.contactPhone]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(escapeHtml)
    .join(" &nbsp;|&nbsp; ");

  return `
<footer class="doc-footer">
  <strong>${escapeHtml(company.name)}</strong>
  ${contact ? `<span>${contact}</span>` : ""}
</footer>`;
};
