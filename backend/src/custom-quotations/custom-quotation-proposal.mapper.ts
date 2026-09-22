import { Injectable } from "@nestjs/common";
import type { CustomQuotationProposalDocument } from "./custom-quotation-proposal.types";

@Injectable()
export class CustomQuotationProposalMapper {
  map(
    version: any,
    company: CustomQuotationProposalDocument["company"],
    timezone: string,
  ): CustomQuotationProposalDocument {
    return {
      company: { ...company },
      quotationNumber: version.customQuotation.quotationNumber,
      versionNumber: version.versionNumber,
      issuedAt: version.createdAt,
      quotationValidUntil: version.quotationValidUntil,
      timezone,
      customer: {
        fullName: version.customQuotation.customer.fullName,
        identification: version.customQuotation.customer.idNumber,
        email: version.customQuotation.customer.email,
        phone: version.customQuotation.customer.phone,
      },
      title: version.customQuotation.title,
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

function decimalString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "toString" in value) return String(value);
  throw new Error("CUSTOM_QUOTATION_PROPOSAL_DECIMAL_INVALID");
}
