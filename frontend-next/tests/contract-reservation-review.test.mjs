import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canReviewContractReservations,
  contractReservationApprovePath,
  contractReservationEvidencePath,
  contractReservationPendingPath,
  contractReservationRejectPath,
  createContractReservationActionGate,
  normalizeRejectionReason,
  pendingReservationViewState,
  toViewerAttachments,
} from "../src/lib/contract-reservation-review.ts";

test("uses only the Finance reservation-review endpoints", () => {
  assert.equal(contractReservationPendingPath(), "/finance/contract-reservation-payments/pending");
  assert.equal(contractReservationApprovePath("payment/1"), "/finance/contract-reservation-payments/payment%2F1/approve");
  assert.equal(contractReservationRejectPath("payment/1"), "/finance/contract-reservation-payments/payment%2F1/reject");
  assert.equal(contractReservationEvidencePath("payment/1", "evidence/1"), "/finance/contract-reservation-payments/payment%2F1/evidence/evidence%2F1");
});

test("allows ADMIN and FACTURACION_COBROS but denies AGENT and CONTADOR", () => {
  assert.equal(canReviewContractReservations("ADMIN"), true);
  assert.equal(canReviewContractReservations("FACTURACION_COBROS"), true);
  assert.equal(canReviewContractReservations("AGENT"), false);
  assert.equal(canReviewContractReservations("CONTADOR"), false);
});

test("requires a trimmed rejection reason of at most 500 characters", () => {
  assert.equal(normalizeRejectionReason("  No coincide  "), "No coincide");
  assert.throws(() => normalizeRejectionReason("   "), /Debes proporcionar/);
  assert.throws(() => normalizeRejectionReason("x".repeat(501)), /500/);
});

test("represents loading, error, empty and populated list states", () => {
  assert.equal(pendingReservationViewState({ loading: true, error: "", count: 0 }), "loading");
  assert.equal(pendingReservationViewState({ loading: false, error: "falló", count: 0 }), "error");
  assert.equal(pendingReservationViewState({ loading: false, error: "", count: 0 }), "empty");
  assert.equal(pendingReservationViewState({ loading: false, error: "", count: 1 }), "ready");
});

test("prevents duplicate review actions until the active request finishes", () => {
  const gate = createContractReservationActionGate();
  assert.equal(gate.begin(), true);
  assert.equal(gate.begin(), false);
  gate.end();
  assert.equal(gate.begin(), true);
});

test("keeps multiple signed evidence URLs in viewer order and supports no evidence", () => {
  const evidence = [
    { id: "one", originalFileName: "one.pdf", mimeType: "application/pdf", url: "signed-one" },
    { id: "two", originalFileName: "two.png", mimeType: "image/png", url: "signed-two" },
  ];
  assert.deepEqual(toViewerAttachments(evidence), evidence);
  assert.deepEqual(toViewerAttachments([]), []);
});

test("pending-payments page is wired only to Finance and refreshes after both decisions", () => {
  const source = readFileSync(new URL("../src/app/admin/pending-payments/page.tsx", import.meta.url), "utf8");
  assert.match(source, /listPendingContractReservationPayments/);
  assert.match(source, /approveContractReservationPayment/);
  assert.match(source, /rejectContractReservationPayment/);
  assert.match(source, /getContractReservationEvidence/);
  assert.match(source, /Promise\.all\(payment\.evidence/);
  assert.match(source, /Sin comprobantes identificables/);
  assert.equal((source.match(/await load\(\)/g) || []).length >= 2, true);
  assert.doesNotMatch(source, /getBillingAdminReports|verifyBillingPayment|rejectBillingPayment|BillingAdminReportData/);
  assert.doesNotMatch(source, /\/billing\/admin\/reports|\/billing\/payments\//);
});
