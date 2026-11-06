import { Decimal } from "@prisma/client/runtime/library";
import { Injectable } from "@nestjs/common";
import { formatCustomQuotationValidityDate } from "./custom-quotation-validity";

export type CustomQuotationDeliveryEmailInput = {
  customerName: string;
  quotationNumber: string;
  title: string | null;
  currency: string;
  finalSellingPrice: string;
  quotationValidUntil: Date | null;
  approvalUrl: string;
};

@Injectable()
export class CustomQuotationDeliveryEmailMapper {
  map(input: CustomQuotationDeliveryEmailInput) {
    const title = input.title?.trim() ?? "";
    const validity = formatCustomQuotationValidityDate(input.quotationValidUntil);
    return {
      subject: "Propuesta comercial {{documentNumber}} - {{tenantName}}",
      template: "business-document-attachment" as const,
      templateData: {
        recipientName: input.customerName,
        documentLabel: "Propuesta comercial",
        documentNumber: input.quotationNumber,
        message: `Le compartimos la cotización${title ? ` “${title}”` : ""}. Precio final: ${formatMoney(input.currency, input.finalSellingPrice)}. Vigencia: ${validity}.`,
        attachmentSummary: "La propuesta comercial en PDF se encuentra adjunta a este correo.",
        actionUrl: input.approvalUrl,
        actionLabel: "Ver y responder cotización",
      },
    };
  }
}

function formatMoney(currency: string, value: string) {
  const fixed = new Decimal(value).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const grouped = (sign ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${currency} ${sign}${grouped},${fraction}`;
}
