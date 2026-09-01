import { documentFooter, documentLayout, escapeHtml, formatDate, sectionHeading } from "../documents/templates/shared";

export type CustomerAccountStatement = {
  generatedAt: Date;
  customer: { id: string; name: string; identification: string | null; email: string | null };
  currencyCode: string;
  totals: { invoicedAmount: string; allocatedAmount: string; outstandingAmount: string; availableAmount: string };
  invoices: Array<{ id: string; number: string; documentType: string | null; recognizedAt: Date; dueDate: Date; originalAmount: string; allocatedAmount: string; outstandingAmount: string; status: string; allocations: Array<{ receiptNumber: string; amount: string; allocatedAt: Date; status: string; statusLabel: string }> }>;
  payments: Array<{ id: string; receiptNumber: string; receivedAt: Date; receivedAmount: string; availableAmount: string; paymentMethod: string; paymentMethodLabel: string; status: string; allocations: Array<{ invoiceNumber: string; amount: string; allocatedAt: Date; status: string; statusLabel: string }> }>;
};

const money = (currency: string, value: string) => `${escapeHtml(currency)} ${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}`;
export const customerAccountStatementStatusLabel = (value: string) => ({ OPEN: "Abierta", PARTIALLY_SETTLED: "Abonada", SETTLED: "Cancelada", CANCELLED: "Anulada", RECEIVED: "Recibido", PARTIALLY_ALLOCATED: "Aplicado parcialmente", FULLY_ALLOCATED: "Aplicado por completo", ACTIVE: "Aplicado", REVERSED: "Revertido" }[value] ?? value);
const calendarDate = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value;
  const year = part("year"); const month = part("month"); const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : "";
};
const instantDate = (value: Date, timezone: string) => formatDate(calendarDate(value, timezone));
const databaseDate = (value: Date) => formatDate(`${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`);
const generatedDateTime = (value: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const part = (type: "year" | "month" | "day" | "hour" | "minute") => parts.find((item) => item.type === type)?.value;
  const year = part("year"); const month = part("month"); const day = part("day"); const hour = part("hour"); const minute = part("minute");
  return year && month && day && hour && minute ? `${day}/${month}/${year} ${hour}:${minute}` : "";
};

export function customerAccountStatementTemplate(statement: CustomerAccountStatement, companyName: string, timezone = "America/Costa_Rica"): string {
  const c = statement.currencyCode;
  const content = `<header class="statement-header"><div><p>${escapeHtml(companyName)}</p><h1>Estado de cuenta</h1></div><div><strong>${escapeHtml(statement.customer.name)}</strong><span>${escapeHtml(statement.customer.identification ?? "Sin identificación")}</span><span>Generado ${generatedDateTime(statement.generatedAt, timezone)}</span></div></header>
  <section class="summary">${summary("Total facturado", money(c, statement.totals.invoicedAmount))}${summary("Pagos aplicados", money(c, statement.totals.allocatedAmount))}${summary("Saldo pendiente", money(c, statement.totals.outstandingAmount), "pending")}${summary("Saldo disponible", money(c, statement.totals.availableAmount), "available")}</section>
  <section>${sectionHeading("Detalle de facturas")}<table><thead><tr><th>Factura</th><th>Emisión</th><th>Vencimiento</th><th>Estado</th><th class="num">Original</th><th class="num">Aplicado</th><th class="num">Pendiente</th></tr></thead><tbody>${statement.invoices.map((invoice) => `<tr><td><strong>${escapeHtml(invoice.number)}</strong><small>${escapeHtml(invoice.documentType ?? "Cuenta por cobrar")}</small></td><td>${instantDate(invoice.recognizedAt, timezone)}</td><td>${databaseDate(invoice.dueDate)}</td><td>${escapeHtml(customerAccountStatementStatusLabel(invoice.status))}</td><td class="num">${money(c, invoice.originalAmount)}</td><td class="num">${money(c, invoice.allocatedAmount)}</td><td class="num pending">${money(c, invoice.outstandingAmount)}</td></tr>${invoice.allocations.length ? `<tr class="sub"><td colspan="7">${invoice.allocations.map((a) => `${escapeHtml(a.receiptNumber)} · ${money(c, a.amount)} · ${instantDate(a.allocatedAt, timezone)} · ${escapeHtml(a.statusLabel)}`).join("<br>")}</td></tr>` : ""}`).join("") || `<tr><td colspan="7">No hay facturas.</td></tr>`}</tbody></table></section>
  <section>${sectionHeading("Historial de pagos y asignaciones")}<table><thead><tr><th>Recibo</th><th>Fecha</th><th>Método</th><th>Estado</th><th>Facturas asignadas</th><th class="num">Recibido</th><th class="num">Disponible</th></tr></thead><tbody>${statement.payments.map((payment) => `<tr><td><strong>${escapeHtml(payment.receiptNumber)}</strong></td><td>${instantDate(payment.receivedAt, timezone)}</td><td>${escapeHtml(payment.paymentMethodLabel)}</td><td>${escapeHtml(customerAccountStatementStatusLabel(payment.status))}</td><td>${payment.allocations.map((a) => `${escapeHtml(a.invoiceNumber)} · ${money(c, a.amount)} · ${escapeHtml(a.statusLabel)}`).join("<br>") || "Sin asignaciones"}</td><td class="num">${money(c, payment.receivedAmount)}</td><td class="num available">${money(c, payment.availableAmount)}</td></tr>`).join("") || `<tr><td colspan="7">No hay pagos.</td></tr>`}</tbody></table></section>${documentFooter({ name: companyName })}`;
  return documentLayout(content, { title: `Estado de cuenta - ${statement.customer.name}`, additionalStyles: `@page{size:A4 landscape;margin:13mm}body{font-family:Arial,sans-serif;color:#172033;font-size:8pt}.statement-header{display:flex;justify-content:space-between;border-bottom:2px solid #21466f;padding-bottom:10pt;margin-bottom:10pt}.statement-header h1{margin:2pt 0;color:#102344;font-size:20pt}.statement-header p{margin:0;color:#315f9b;font-weight:700}.statement-header>div:last-child{display:grid;text-align:right;gap:2pt}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7pt;margin-bottom:12pt}.summary article{border:1px solid #d6dce3;padding:8pt}.summary span{display:block;color:#64748b}.summary strong{display:block;margin-top:3pt;font-size:11pt}.pending{color:#9b271f}.available{color:#17663b}table{width:100%;border-collapse:collapse;margin-bottom:12pt;table-layout:fixed}th{background:#21466f;color:#fff;text-align:left;padding:5pt}td{border:1px solid #d6dce3;padding:5pt;vertical-align:top}td small{display:block;color:#64748b;margin-top:2pt}.num{text-align:right;font-variant-numeric:tabular-nums}.sub td{background:#f5f8fc;color:#526175;padding-left:12pt}.section-heading{margin:8pt 0 4pt;font-size:11pt;color:#102344}tr{break-inside:avoid}` });
}

function summary(label: string, value: string, className = "") { return `<article><span>${escapeHtml(label)}</span><strong class="${className}">${value}</strong></article>`; }
