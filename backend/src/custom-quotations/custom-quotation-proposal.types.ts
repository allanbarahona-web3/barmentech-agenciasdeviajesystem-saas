export type CustomQuotationProposalDocument = {
  company: {
    name: string;
    legalId: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    logoSrc: string | null;
    primaryColor: string | null;
  };
  quotationNumber: string;
  versionNumber: number;
  issuedAt: Date;
  quotationValidUntil: Date | null;
  timezone: string;
  customer: { fullName: string; identification: string | null; email: string | null; phone: string | null };
  title: string;
  lines: Array<{ displayOrder: number; description: string; quantity: string; commercialNote: string | null }>;
  paymentConditionType: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  commercialObservations: string | null;
  currency: string;
  finalSellingPrice: string;
};
