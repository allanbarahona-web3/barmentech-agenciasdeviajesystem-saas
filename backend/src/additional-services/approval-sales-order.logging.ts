import { HttpException } from "@nestjs/common";

const FALLBACK_FAILURE_CODE = "APPROVAL_SALES_ORDER_MATERIALIZATION_FAILED";

export function approvalSalesOrderFailureCode(error: unknown): string {
  if (!(error instanceof HttpException)) return FALLBACK_FAILURE_CODE;
  const response = error.getResponse();
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return FALLBACK_FAILURE_CODE;
  }
  const code = (response as Record<string, unknown>).code;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(code)
    ? code
    : FALLBACK_FAILURE_CODE;
}
