import { ConflictException, Injectable } from "@nestjs/common";
import type { CustomQuotationProposalDocument } from "./custom-quotation-proposal.types";

@Injectable()
export class CustomQuotationProposalMapper {
  map(
    version: any,
    company: CustomQuotationProposalDocument["company"],
    timezone: string,
  ): CustomQuotationProposalDocument {
    const recipient = snapshotRecipient(version);
    if (!recipient) throw new ConflictException("CUSTOM_QUOTATION_RECIPIENT_SNAPSHOT_REQUIRED");
    return {
      company: { ...company },
      quotationNumber: version.customQuotation.quotationNumber,
      versionNumber: version.versionNumber,
      issuedAt: version.createdAt,
      quotationValidUntil: version.quotationValidUntil,
      timezone,
      customer: {
        fullName: recipient.fullName,
        identification: null,
        email: recipient.email,
        phone: recipient.phone,
      },
      title: version.title,
      lines: version.lines.map((line: any) => ({
        displayOrder: line.displayOrder,
        description: line.description,
        quantity: decimalString(line.quantity),
        commercialNote: line.commercialNote,
      })),
      paymentConditionType: version.paymentConditionType,
      paymentTermValue: version.paymentTermValue,
      paymentTermUnit: version.paymentTermUnit,
      commercialObservations: version.commercialObservations,
      currency: version.currency,
      finalSellingPrice: decimalString(version.finalSellingPrice),
    };
  }
}

function snapshotRecipient(version: any) {
  if (typeof version.recipientFullName !== "string" || !version.recipientFullName.trim()) return null;
  return {
    fullName: version.recipientFullName.trim(),
    email: normalizedOrNull(version.recipientEmail),
    phone: normalizedOrNull(version.recipientPhone),
  };
}

function normalizedOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new Error("CUSTOM_QUOTATION_PROPOSAL_DECIMAL_INVALID");
}
