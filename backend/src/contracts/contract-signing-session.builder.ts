import { Injectable } from "@nestjs/common";
import {
  SigningSessionPlan,
  SigningDocumentDefinition,
  SigningParticipant,
} from "../documents/signing-session/signing-session.types";

/**
 * Input contract structure required for building a signing session plan.
 * This represents the minimal Contract entity shape needed by the builder.
 */
export type ContractForSigning = {
  id: string;
  contractNumber: string;
  payload: any;
  client?: {
    fullName: string;
    email: string;
  } | null;
};

/**
 * Builds a SigningSessionPlan from a Contract entity.
 *
 * Responsibility:
 * - Convert Contract → SigningSessionPlan
 * - Resolve signing participants using current business rules
 * - Generate a single SigningDocumentDefinition for the contract
 *
 * Does NOT:
 * - Send emails
 * - Generate PDFs
 * - Create signing tokens
 * - Write to database
 * - Perform HTTP requests
 *
 * This is a pure data transformation adapter.
 */
@Injectable()
export class ContractSigningSessionBuilder {
  /**
   * Build a signing session plan from a contract.
   *
   * Generates documents for:
   * - CONTRACT: Main contract signed by client and companions
   * - MINOR_ANNEX: One per qualifying minor, signed by tutor and responsible companion
   *
   * Participants are resolved using the same logic as today's implementation:
   * - Primary client (from contract.client or payload.clientFullName)
   * - Companions (from payload.companions array)
   *
   * @param contract - The contract entity to convert
   * @returns A complete signing session plan with one or more documents
   */
  buildFromContract(contract: ContractForSigning): SigningSessionPlan {
    const participants = this.resolveParticipants(contract);

    const contractDocument: SigningDocumentDefinition = {
      key: "contract",
      type: "CONTRACT",
      displayName: contract.contractNumber,
      signers: participants,
    };

    const documents: SigningDocumentDefinition[] = [contractDocument];

    // Add Minor Annex documents for qualifying minors
    const minorAnnexDocuments = this.buildMinorAnnexDocuments(contract, participants);
    documents.push(...minorAnnexDocuments);

    const plan: SigningSessionPlan = {
      processId: contract.id,
      processType: "CONTRACT",
      documents,
    };

    return plan;
  }

  /**
   * Resolve signing participants from the contract entity.
   *
   * This replicates the exact logic from ContractsService.getSigningParticipants()
   * to maintain backward compatibility.
   *
   * Participants:
   * 1. Primary client (key: "client", role: "CLIENTE")
   * 2. Companions (key: "companion-{index}", role: "ACOMPANANTE")
   *
   * @param contract - The contract entity
   * @returns Array of signing participants
   */
  private resolveParticipants(contract: ContractForSigning): SigningParticipant[] {
    const payload = this.getPayloadRecord(contract?.payload);
    const companions = Array.isArray(payload.companions) ? payload.companions : [];

    const participants: SigningParticipant[] = [
      {
        signerKey: "client",
        name: String(contract?.client?.fullName || payload.clientFullName || "").trim(),
        email: String(contract?.client?.email || payload.clientEmail || "").trim() || null,
        role: "CLIENTE",
      },
    ];

    companions.forEach((item: any, index: number) => {
      const name = String(item?.fullName || "").trim();
      if (!name) {
        return;
      }

      participants.push({
        signerKey: `companion-${index}`,
        name,
        email: String(item?.email || "").trim() || null,
        role: "ACOMPANANTE",
      });
    });

    return participants;
  }

  /**
   * Safely extract payload as a record.
   * Handles null, undefined, and non-object payloads.
   *
   * @param payload - Raw payload from contract
   * @returns Payload as a record, or empty object if invalid
   */
  private getPayloadRecord(payload: any): Record<string, any> {
    if (typeof payload !== "object" || payload === null) {
      return {};
    }
    return payload;
  }

  /**
   * Build Minor Annex documents for qualifying minors.
   *
   * A minor qualifies if they have:
   * - tutorName
   * - tutorEmail
   * - travelingWith (name of responsible adult)
   *
   * Each Minor Annex document requires exactly two signers:
   * - Tutor (legal guardian)
   * - Responsible Companion (adult traveling with the minor)
   *
   * @param contract - The contract entity
   * @param participants - List of resolved participants (client + companions)
   * @returns Array of Minor Annex documents
   */
  private buildMinorAnnexDocuments(
    contract: ContractForSigning,
    participants: SigningParticipant[],
  ): SigningDocumentDefinition[] {
    const payload = this.getPayloadRecord(contract?.payload);
    const minors = Array.isArray(payload.minors) ? payload.minors : [];

    const documents: SigningDocumentDefinition[] = [];

    minors.forEach((minor: any, index: number) => {
      const tutorName = String(minor?.tutorName || "").trim();
      const tutorEmail = String(minor?.tutorEmail || "").trim();
      const travelingWith = String(minor?.travelingWith || "").trim();
      const minorName = String(minor?.name || minor?.minorName || "").trim();

      // Skip if missing required data
      if (!tutorName || !tutorEmail || !travelingWith) {
        return;
      }

      // Find responsible adult participant by matching travelingWith name
      const responsibleAdult = participants.find(
        (participant) => participant.name === travelingWith,
      );

      // Skip if responsible adult not found in participants
      if (!responsibleAdult) {
        return;
      }

      // Build signers for this Minor Annex
      const signers: SigningParticipant[] = [
        {
          signerKey: `minor-${index}-tutor`,
          name: tutorName,
          email: tutorEmail,
          role: "TUTOR",
        },
        {
          signerKey: responsibleAdult.signerKey,
          name: responsibleAdult.name,
          email: responsibleAdult.email,
          role: "ACOMPANANTE_RESPONSABLE",
        },
      ];

      documents.push({
        key: `minor-annex-${index}`,
        type: "MINOR_ANNEX",
        displayName: `Anexo Menor ${index + 1} - ${minorName || "Sin nombre"}`,
        signers,
      });
    });

    return documents;
  }
}
