export const CONTRACT_RESERVATION_REVIEW_ROLES = ["ADMIN", "FACTURACION_COBROS"] as const;

export function canReviewContractReservations(role: unknown): boolean {
  return CONTRACT_RESERVATION_REVIEW_ROLES.includes(
    String(role || "").toUpperCase() as (typeof CONTRACT_RESERVATION_REVIEW_ROLES)[number],
  );
}

const REVIEW_ROOT = "/finance/contract-reservation-payments";

export const contractReservationPendingPath = () => `${REVIEW_ROOT}/pending`;
export const contractReservationApprovePath = (paymentId: string) => `${REVIEW_ROOT}/${encodeURIComponent(paymentId)}/approve`;
export const contractReservationRejectPath = (paymentId: string) => `${REVIEW_ROOT}/${encodeURIComponent(paymentId)}/reject`;
export const contractReservationEvidencePath = (paymentId: string, evidenceId: string) => `${REVIEW_ROOT}/${encodeURIComponent(paymentId)}/evidence/${encodeURIComponent(evidenceId)}`;

export function normalizeRejectionReason(value: unknown): string {
  const reason = String(value || "").trim();
  if (!reason) throw new Error("Debes proporcionar un motivo de rechazo.");
  if (reason.length > 500) throw new Error("El motivo de rechazo no puede superar 500 caracteres.");
  return reason;
}

export function pendingReservationViewState(input: { loading: boolean; error: string; count: number }) {
  if (input.loading) return "loading" as const;
  if (input.error) return "error" as const;
  if (input.count === 0) return "empty" as const;
  return "ready" as const;
}

export function createContractReservationActionGate() {
  let busy = false;
  return {
    begin(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    end(): void { busy = false; },
  };
}

export function toViewerAttachments(evidence: Array<{ id: string; originalFileName: string; mimeType: string; url: string }>) {
  return evidence.map(({ id, originalFileName, mimeType, url }) => ({ id, originalFileName, mimeType, url }));
}
