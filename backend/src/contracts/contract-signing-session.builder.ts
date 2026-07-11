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
   * For Story 3, this generates exactly one document representing the contract.
   * Participants are resolved using the same logic as today's implementation:
   * - Primary client (from contract.client or payload.clientFullName)
   * - Companions (from payload.companions array)
   *
   * @param contract - The contract entity to convert
   * @returns A complete signing session plan with one document
   */
  buildFromContract(contract: ContractForSigning): SigningSessionPlan {
    const participants = this.resolveParticipants(contract);

    const document: SigningDocumentDefinition = {
      id: contract.id,
      type: "contract",
      displayName: contract.contractNumber,
      signers: participants,
    };

    const plan: SigningSessionPlan = {
      processId: contract.id,
      processType: "contract",
      documents: [document],
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
}
