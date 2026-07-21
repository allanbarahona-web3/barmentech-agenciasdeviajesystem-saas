export class HistoryContractItemDto {
  kind!: "CONTRACT" | "DRAFT";
  id!: string;
  draftId!: string | null;
  contractNumber!: string;
  paymentReference?: string | null;
  status!: string;
  source!: string | null;
  travelPackageId!: string | null;
  internalTripId!: string | null;
  clientFullName!: string;
  clientIdNumber!: string;
  clientEmail!: string;
  clientPhone!: string;
  destination!: string;
  generatedByName!: string;
  createdAt!: Date;
  documentCount!: number;
  signedContractResent!: boolean;
  signedContractResentAt!: string | null;

  static fromContract(
    item: any,
    payload: Record<string, any>,
    pendingSignatureStatus: string,
  ): HistoryContractItemDto {
    const emailDispatchLog = Array.isArray(payload.emailDispatchLog)
      ? payload.emailDispatchLog.filter((entry: any) => entry && typeof entry === "object")
      : [];
    const signedResendEntries = emailDispatchLog.filter(
      (entry: any) =>
        (String(entry?.type || "").toUpperCase() === "SIGNED_RESEND_MANUAL" ||
          String(entry?.type || "").toUpperCase() === "SIGNED_AUTO_SEND") &&
        Number(entry?.sentCount || 0) > 0,
    );
    const lastSignedResendEntry = signedResendEntries.length
      ? signedResendEntries[signedResendEntries.length - 1]
      : null;

    return Object.assign(new HistoryContractItemDto(), {
      kind: "CONTRACT",
      id: item.id,
      draftId: null,
      contractNumber: item.contractNumber,
      paymentReference: item.paymentReference || null,
      status: item.status || pendingSignatureStatus,
      source: item.source || null,
      travelPackageId: item.travelPackageId || null,
      internalTripId: item.internalTripId || null,
      clientFullName: item.client?.fullName || "-",
      clientIdNumber: item.client?.idNumber || "-",
      clientEmail: item.client?.email || "-",
      clientPhone: item.client?.phone || "-",
      destination: item.destination,
      generatedByName: item.generatedByName,
      createdAt: item.createdAt,
      documentCount: item.documents.length,
      signedContractResent: signedResendEntries.length > 0,
      signedContractResentAt: lastSignedResendEntry?.createdAt || null,
    });
  }

  static fromDraft(draft: any, draftStatus: string): HistoryContractItemDto {
    return Object.assign(new HistoryContractItemDto(), {
      kind: "DRAFT",
      id: draft.id,
      draftId: draft.id,
      contractNumber: draft.contractNumber,
      status: draftStatus,
      source: draft.source || null,
      travelPackageId: null,
      internalTripId: null,
      clientFullName: draft.clientFullName || "-",
      clientIdNumber: draft.clientIdNumber || "-",
      clientEmail: draft.clientEmail || "-",
      clientPhone: draft.clientPhone || "-",
      destination: draft.destination || "-",
      generatedByName: draft.generatedByName || "-",
      createdAt: draft.createdAt,
      documentCount: 0,
      signedContractResent: false,
      signedContractResentAt: null,
    });
  }
}
