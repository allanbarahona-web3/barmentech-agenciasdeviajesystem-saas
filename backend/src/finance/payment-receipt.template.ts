import { documentFooter, documentLayout, escapeAttribute, escapeHtml, formatDate, sectionHeading } from "../documents/templates/shared";

export type PaymentReceipt = {
  receiptNumber: string;
  customer: { name: string; identification: string | null; email: string | null };
  currencyCode: string;
  receivedAmount: string;
  applicationCurrencyCode: string;
  appliedAmount: string;
  availableAmount: string;
  settlement: {
    currencyCode: string;
    amount: string;
    availableAmount: string;
    exchangeRate: string | null;
    exchangeRateSource: string | null;
    exchangeRateEffectiveDate: Date | null;
  } | null;
  receivedAt: Date;
  paymentMethodLabel: string;
  externalReference: string | null;
  description: string | null;
  statusLabel: string;
  registeredBy: string | null;
  applications: Array<{
    type: "ACCOUNT_RECEIVABLE" | "COMMERCIAL_OBLIGATION";
    reference: string;
    description: string | null;
    applicationDate: Date;
    currencyCode: string;
    amount: string;
    statusLabel: string;
    relatedDocumentReference: string | null;
  }>;
};

export type PaymentReceiptBranding = { name: string; logoUrl?: string | null; contactEmail?: string | null; contactPhone?: string | null; primaryColor?: string | null; secondaryColor?: string | null };

const money = (currency: string, value: string) => `${escapeHtml(currency)} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`;
const calendarDate = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const find = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  return `${find("year") ?? ""}-${find("month") ?? ""}-${find("day") ?? ""}`;
};

export function paymentReceiptTemplate(receipt: PaymentReceipt, branding: PaymentReceiptBranding, timezone = "America/Costa_Rica"): string {
  const primary = branding.primaryColor || "#21466f";
  const headerLogo = branding.logoUrl ? `<img src="${escapeAttribute(branding.logoUrl)}" alt="${escapeAttribute(branding.name)}" />` : "";
  const date = formatDate(calendarDate(receipt.receivedAt, timezone));
  const crossCurrency = Boolean(receipt.settlement && receipt.settlement.currencyCode !== receipt.currencyCode);
  const settlementDetails = crossCurrency && receipt.settlement ? `<section class="facts settlement"><div><span>Tipo de cambio</span><strong>${escapeHtml(receipt.settlement.exchangeRate ?? "No registrado")}</strong></div><div><span>Fuente del tipo de cambio</span><strong>${escapeHtml(exchangeRateSourceLabel(receipt.settlement.exchangeRateSource))}</strong></div><div><span>Fecha efectiva</span><strong>${receipt.settlement.exchangeRateEffectiveDate ? formatDate(calendarDate(receipt.settlement.exchangeRateEffectiveDate, timezone)) : "No registrada"}</strong></div></section>` : "";
  const amounts = crossCurrency && receipt.settlement
    ? `<section class="amounts"><article><span>Monto recibido</span><strong>${money(receipt.currencyCode, receipt.receivedAmount)}</strong></article><article><span>Equivalente de liquidación / aplicación</span><strong>${money(receipt.settlement.currencyCode, receipt.settlement.amount)}</strong></article><article><span>Monto aplicado</span><strong>${money(receipt.applicationCurrencyCode, receipt.appliedAmount)}</strong></article><article><span>Saldo disponible</span><strong>${money(receipt.applicationCurrencyCode, receipt.availableAmount)}</strong></article></section>${settlementDetails}`
    : `<section class="amounts"><article><span>Monto recibido</span><strong>${money(receipt.currencyCode, receipt.receivedAmount)}</strong></article><article><span>Monto aplicado</span><strong>${money(receipt.applicationCurrencyCode, receipt.appliedAmount)}</strong></article><article><span>Saldo disponible</span><strong>${money(receipt.applicationCurrencyCode, receipt.availableAmount)}</strong></article></section>`;
  const content = `<header class="receipt-header"><div class="brand">${headerLogo}<div><p>${escapeHtml(branding.name)}</p><h1>Recibo de dinero</h1></div></div><div class="receipt-number"><span>Recibo</span><strong>${escapeHtml(receipt.receiptNumber)}</strong></div></header>
  <section class="facts"><div><span>Cliente</span><strong>${escapeHtml(receipt.customer.name)}</strong></div><div><span>Identificación</span><strong>${escapeHtml(receipt.customer.identification ?? "No registrada")}</strong></div><div><span>Fecha de pago</span><strong>${date}</strong></div><div><span>Estado</span><strong>${escapeHtml(receipt.statusLabel)}</strong></div><div><span>Método de pago</span><strong>${escapeHtml(receipt.paymentMethodLabel)}</strong></div>${receipt.externalReference ? `<div><span>Referencia externa</span><strong>${escapeHtml(receipt.externalReference)}</strong></div>` : ""}${receipt.registeredBy ? `<div><span>Registrado por</span><strong>${escapeHtml(receipt.registeredBy)}</strong></div>` : ""}</section>
  ${amounts}
  ${receipt.description ? `<section class="notes">${sectionHeading("Notas")}<p>${escapeHtml(receipt.description)}</p></section>` : ""}
  <section>${sectionHeading("Aplicado a")}<table><thead><tr><th>Aplicación</th><th>Detalle</th><th>Fecha de aplicación</th><th>Estado</th><th class="num">Monto aplicado</th></tr></thead><tbody>${receipt.applications.map((application) => `<tr><td><strong>${escapeHtml(application.reference)}</strong></td><td>${escapeHtml(application.description ?? application.relatedDocumentReference ?? "—")}</td><td>${formatDate(calendarDate(application.applicationDate, timezone))}</td><td>${escapeHtml(application.statusLabel)}</td><td class="num">${money(application.currencyCode, application.amount)}</td></tr>`).join("") || `<tr><td colspan="5">Este recibo no tiene aplicaciones financieras registradas.</td></tr>`}</tbody></table></section>${documentFooter({ name: branding.name, contactEmail: branding.contactEmail, contactPhone: branding.contactPhone })}`;
  return documentLayout(content, { title: `Recibo de dinero - ${receipt.receiptNumber}`, additionalStyles: `@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#172033;font-size:9.5pt}.receipt-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${primary};padding-bottom:11pt;margin-bottom:13pt}.brand{display:flex;gap:10pt;align-items:center}.brand img{max-width:100pt;max-height:45pt;object-fit:contain}.brand p{margin:0;color:${primary};font-weight:700}.brand h1{margin:3pt 0 0;font-size:22pt;color:#102344}.receipt-number{text-align:right}.receipt-number span,.facts span,.amounts span{display:block;color:#64748b}.receipt-number strong{display:block;margin-top:3pt;font-size:13pt;color:${primary}}.facts{display:grid;grid-template-columns:repeat(3,1fr);gap:10pt;margin-bottom:13pt}.facts div{border-bottom:1px solid #d6dce3;padding:0 0 6pt}.facts strong{display:block;margin-top:3pt}.settlement{margin-top:-3pt}.amounts{display:grid;grid-template-columns:repeat(3,1fr);gap:9pt;margin-bottom:14pt}.amounts article{border:1px solid #d6dce3;border-top:3px solid ${primary};padding:10pt}.amounts strong{display:block;font-size:13pt;margin-top:4pt}.notes{margin-bottom:12pt}.notes p{margin:4pt 0;padding:8pt;background:#f5f8fc;white-space:pre-wrap}table{width:100%;border-collapse:collapse}th{background:${primary};color:#fff;text-align:left;padding:6pt}td{border:1px solid #d6dce3;padding:6pt;vertical-align:top}.num{text-align:right;font-variant-numeric:tabular-nums}.section-heading{margin:10pt 0 5pt;font-size:12pt;color:#102344}tr{break-inside:avoid}.doc-footer{margin-top:18pt}` });
}

export const paymentMethodLabel = (value: string) => ({ CASH: "Efectivo", BANK_TRANSFER: "Transferencia bancaria", CARD: "Tarjeta", CHECK: "Cheque", MOBILE_TRANSFER: "Transferencia móvil", OTHER: "Otro" } as Record<string, string>)[value] ?? value;
export const paymentStatusLabel = (value: string) => ({ RECEIVED: "Recibido", PARTIALLY_ALLOCATED: "Aplicado parcialmente", FULLY_ALLOCATED: "Aplicado por completo", CANCELLED: "Cancelado" } as Record<string, string>)[value] ?? value;
export const allocationStatusLabel = (value: string) => ({ ACTIVE: "Aplicado", REVERSED: "Revertido" } as Record<string, string>)[value] ?? value;
const exchangeRateSourceLabel = (value: string | null) => ({ BCCR: "BCCR", MANUAL: "Manual" } as Record<string, string>)[value ?? ""] ?? "No registrada";
