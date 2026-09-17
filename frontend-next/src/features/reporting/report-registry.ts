export const REPORT_KEYS = ["SALES", "SALES_TAX", "RECEIVABLES"] as const;

export type ReportKey = typeof REPORT_KEYS[number];

export type ReportPresentation = {
  key: ReportKey;
  title: string;
  description: string;
  href: string | null;
  available: boolean;
  allowedRoles: readonly string[];
};

/** Presentation registry mirrors report-level access; the server remains authoritative. */
export const REPORT_REGISTRY: readonly ReportPresentation[] = [
  {
    key: "SALES",
    title: "Ventas",
    description: "Documentos fiscales aceptados, resumidos por moneda.",
    href: "/reports/sales",
    available: true,
    allowedRoles: ["ADMIN", "CONTADOR"],
  },
  {
    key: "SALES_TAX",
    title: "Impuestos sobre ventas",
    description: "Resumen fiscal por impuesto y tasa.",
    href: "/reports/sales-tax",
    available: true,
    allowedRoles: ["ADMIN", "CONTADOR"],
  },
  {
    key: "RECEIVABLES",
    title: "Cuentas por cobrar",
    description: "CxC facturada y proyección contractual de cobros futuros.",
    href: "/reports/receivables",
    available: true,
    allowedRoles: ["ADMIN", "CONTADOR"],
  },
];

export function canAccessReport(role: string | null | undefined, reportKey: ReportKey): boolean {
  const normalizedRole = String(role ?? "").toUpperCase();
  return REPORT_REGISTRY.find((report) => report.key === reportKey)?.allowedRoles.includes(normalizedRole) ?? false;
}

export function reportsForRole(role: string | null | undefined): readonly ReportPresentation[] {
  return REPORT_REGISTRY.filter((report) => canAccessReport(role, report.key));
}
