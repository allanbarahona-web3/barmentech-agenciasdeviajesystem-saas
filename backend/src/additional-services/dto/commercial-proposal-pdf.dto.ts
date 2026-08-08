import type {
  AdditionalServiceCurrency,
  AdditionalServiceTravelType,
  PaymentConditionType,
  PaymentTermUnit,
} from "../enums";
import type { AdditionalServiceParticipantRole } from "../repositories";

export class CommercialProposalPdfCompanyDto {
  name!: string;
  legalId!: string | null;
  contactEmail!: string | null;
  contactPhone!: string | null;
  businessAddress!: string | null;
  primaryColor!: string | null;
  logoSrc!: string | null;
}

export class CommercialProposalPdfCustomerDto {
  fullName!: string;
  identification!: string;
  email!: string | null;
  phone!: string | null;
}

export class CommercialProposalPdfParticipantDto {
  role!: AdditionalServiceParticipantRole;
  fullName!: string;
  identification!: string;
}

export class CommercialProposalPdfTravelDto {
  travelType!: AdditionalServiceTravelType;
  reference!: string;
  name!: string;
  destination!: string;
  departureDate!: string;
  returnDate!: string;
}

export class CommercialProposalPdfServiceDetailDto {
  label!: string;
  value!: string;
}

export class CommercialProposalPdfServiceDto {
  name!: string;
  details!: CommercialProposalPdfServiceDetailDto[];
  participants!: CommercialProposalPdfParticipantDto[];
  notes!: string | null;
  subtotal!: string;
  vatPercentage!: string;
  vatAmount!: string;
  total!: string;
}

export class CommercialProposalPdfPaymentTermsDto {
  condition!: PaymentConditionType | null;
  termValue!: number | null;
  termUnit!: PaymentTermUnit | null;
}

export class CommercialProposalPdfDto {
  company!: CommercialProposalPdfCompanyDto;
  proposalNumber!: string;
  issuedAt!: string;
  validUntil!: string | null;
  currency!: AdditionalServiceCurrency;
  customer!: CommercialProposalPdfCustomerDto;
  travel!: CommercialProposalPdfTravelDto | null;
  services!: CommercialProposalPdfServiceDto[];
  paymentTerms!: CommercialProposalPdfPaymentTermsDto;
  observations!: string | null;
  subtotal!: string;
  vatTotal!: string;
  total!: string;
}
