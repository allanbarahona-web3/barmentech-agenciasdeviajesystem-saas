export type ItineraryKind = "opening" | "custom" | "closing";

export type IdType = "Cedula" | "Pasaporte" | "DIMEX";

export type CivilStatus = "Soltero" | "Casado" | "Divorciado" | "Viudo";

export type PaymentFrequency = "QUINCENAL" | "MENSUAL";

export type Companion = {
  id: string;
  fullName: string;
  idType: IdType;
  idNumber: string;
  email: string;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  civilStatus: CivilStatus;
  profession: string;
  nationality: string;
  idFrontDocumentName: string;
  idBackDocumentName: string;
  passportDocumentName: string;
};

export type Minor = {
  id: string;
  minorName: string;
  minorId: string;
  tutorName: string;
  tutorIdType: IdType;
  tutorId: string;
  travelingWith: string;
  minorIdFrontDocumentName: string;
  minorIdBackDocumentName: string;
  minorPassportDocumentName: string;
  tutorIdFrontDocumentName: string;
  tutorIdBackDocumentName: string;
  tutorPassportDocumentName: string;
};

export type ItineraryItem = {
  id: string;
  kind: ItineraryKind;
  date: string;
  detail: string;
};

export type ContractFormState = {
  contractNumber: string;
  issuedAt: string;
  destination: string;
  travelPackageId?: string | null;
  startDate: string;
  endDate: string;
  accommodationType: string;
  lodgingType: string;
  clientFullName: string;
  clientIdType: IdType;
  clientIdNumber: string;
  clientEmail: string;
  clientPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  clientAddress: string;
  civilStatus: CivilStatus;
  profession: string;
  clientNationality: string;
  totalAmount: string;
  reservationAmount: string;
  balanceAmount: string;
  installmentCount: string;
  paymentFrequency: PaymentFrequency;
  monthlyInstallmentAmount: string;
  lastInstallmentAmount: string;
  paymentDueDate: string;
  companions: Companion[];
  hasMinorCompanion: boolean;
  minors: Minor[];
  itinerary: ItineraryItem[];
  luggageClause: string;
  insurance: {
    holder: boolean;
    companions: Record<string, boolean>;
    minors: Record<string, boolean>;
  };
  idFrontDocumentName: string;
  idBackDocumentName: string;
  passportDocumentName: string;
  contractDocumentsNames: string[];
  generatedByAgentName: string;
  generatedByAgentEmail: string;
 };
