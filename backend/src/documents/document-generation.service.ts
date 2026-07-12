import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { 
  documentLayout, 
  documentHeader, 
  minorAuthorizationAnnex,
  formatDate,
  escapeHtml,
} from "./templates/shared";
import type { CompanyInfo } from "./templates/shared";
import type { SigningDocumentDefinition } from "./signing-session/signing-session.types";

/**
 * DocumentGenerationService
 * 
 * Generates HTML documents from templates for different document types.
 * 
 * Purpose:
 * - Centralize document HTML generation for all document types
 * - Support CONTRACT, MINOR_ANNEX, and future document types
 * - Use shared template components for consistency
 * 
 * Capabilities:
 * - Generate MINOR_ANNEX HTML from contract data
 * - Future: Generate CONTRACT HTML server-side
 * - Future: Generate WAIVER HTML
 */
@Injectable()
export class DocumentGenerationService {
  private readonly logger = new Logger(DocumentGenerationService.name);

  /**
   * Generate HTML for a document based on its type
   * 
   * @param documentDef Document definition from SigningSessionPlan
   * @param contractData Contract entity with payload
   * @param companyInfo Company/tenant information for header
   * @returns Complete HTML document ready for PDF rendering
   */
  async generateDocumentHtml(
    documentDef: SigningDocumentDefinition,
    contractData: {
      id: string;
      contractNumber: string;
      payload: any;
    },
    companyInfo: CompanyInfo,
  ): Promise<string> {
    const documentType = documentDef.type.toUpperCase();
    
    this.logger.log(
      `[generate] Generating HTML for documentType=${documentType} key=${documentDef.key}`,
    );

    switch (documentType) {
      case "MINOR_ANNEX":
        return this.generateMinorAnnexHtml(documentDef, contractData, companyInfo);
      
      case "CONTRACT":
        throw new BadRequestException(
          "CONTRACT HTML generation not yet implemented server-side. Use frontend-generated HTML.",
        );
      
      default:
        throw new BadRequestException(
          `Unsupported document type for generation: ${documentType}`,
        );
    }
  }

  /**
   * Generate HTML for a Minor Annex document
   * 
   * @param documentDef Document definition
   * @param contractData Contract with payload containing minor data
   * @param companyInfo Company information
   * @returns Complete HTML document
   */
  private generateMinorAnnexHtml(
    documentDef: SigningDocumentDefinition,
    contractData: {
      id: string;
      contractNumber: string;
      payload: any;
    },
    companyInfo: CompanyInfo,
  ): string {
    const payload = this.getPayloadRecord(contractData.payload);
    const minors = Array.isArray(payload.minors) ? payload.minors : [];

    // Extract minor index from document key (e.g., "minor-annex-0" -> 0)
    const minorIndexMatch = documentDef.key.match(/minor-annex-(\d+)/);
    if (!minorIndexMatch) {
      throw new BadRequestException(
        `Invalid minor annex document key: ${documentDef.key}`,
      );
    }

    const minorIndex = parseInt(minorIndexMatch[1], 10);
    const minor = minors[minorIndex];

    if (!minor) {
      throw new BadRequestException(
        `Minor not found at index ${minorIndex} for contract ${contractData.contractNumber}`,
      );
    }

    // Extract minor and tutor data
    const minorName = String(minor?.name || minor?.minorName || "").trim();
    const minorId = String(minor?.idNumber || minor?.minorId || "").trim();
    const tutorName = String(minor?.tutorName || "").trim();
    const tutorIdType = String(minor?.tutorIdType || "Cédula").trim();
    const tutorId = String(minor?.tutorIdNumber || minor?.tutorId || "").trim();
    const travelingWith = String(minor?.travelingWith || "").trim();

    // Find responsible adult signer from document definition
    const tutorSigner = documentDef.signers.find((s) => s.role === "TUTOR");
    const responsibleSigner = documentDef.signers.find(
      (s) => s.role === "ACOMPANANTE_RESPONSABLE",
    );

    if (!tutorSigner || !responsibleSigner) {
      throw new BadRequestException(
        `Missing required signers for minor annex ${documentDef.key}`,
      );
    }

    // Extract responsible adult ID info from payload
    // The responsible adult is either the client or a companion
    let responsibleAdultIdType = "Cédula";
    let responsibleAdultId = "";

    if (responsibleSigner.name === payload.clientFullName) {
      responsibleAdultIdType = String(payload.clientIdType || "Cédula");
      responsibleAdultId = String(payload.clientIdNumber || "");
    } else {
      const companions = Array.isArray(payload.companions) ? payload.companions : [];
      const companion = companions.find((c: any) => c.fullName === responsibleSigner.name);
      if (companion) {
        responsibleAdultIdType = String(companion.idType || "Cédula");
        responsibleAdultId = String(companion.idNumber || "");
      }
    }

    // Generate annex number
    const annexNumber = `ANX-MEN-${contractData.contractNumber}-${String(minorIndex + 1).padStart(2, "0")}`;

    // Generate header
    const headerHtml = documentHeader(
      companyInfo,
      {
        documentNumber: contractData.contractNumber,
        issuedAt: this.formatDateDisplay(payload.issuedAt || new Date().toISOString().slice(0, 10)),
        agentName: String(payload.generatedByAgentName || ""),
      },
    );

    // Format dates
    const formattedStartDate = this.formatDateDisplay(payload.startDate);
    const formattedEndDate = this.formatDateDisplay(payload.endDate);
    const formattedIssuedAt = this.formatDateDisplay(payload.issuedAt);

    // Generate annex content
    const annexContent = minorAuthorizationAnnex({
      annexNumber,
      contractNumber: contractData.contractNumber,
      minorName,
      minorId,
      destination: String(payload.destination || "").trim(),
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      tutorName,
      tutorIdType,
      tutorId,
      responsibleAdultName: responsibleSigner.name,
      responsibleAdultIdType,
      responsibleAdultId,
      tenantName: companyInfo.name,
      issuedAt: formattedIssuedAt,
    });

    // Wrap in full document layout
    const fullHtml = documentLayout(`${headerHtml}\n${annexContent}`, {
      title: `${annexNumber} - ${companyInfo.name}`,
      lang: "es",
      additionalStyles: this.getMinorAnnexStyles(),
    });

    return fullHtml;
  }

  /**
   * Get additional CSS styles for Minor Annex documents
   */
  private getMinorAnnexStyles(): string {
    return `
.annex-page {
  margin-top: 30px;
}

.annex-page h2 {
  font-size: 16pt;
  text-align: center;
  margin-bottom: 20px;
  text-transform: uppercase;
}

.annex-clause {
  margin-bottom: 18px;
}

.annex-clause p {
  margin-bottom: 8px;
}

.annex-clause ul {
  margin-left: 20px;
  list-style: disc;
}

.annex-clause ul li {
  margin-bottom: 4px;
}

.annex-sigs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-top: 40px;
}

.annex-sig-col {
  text-align: center;
}

.annex-sig-line {
  border-top: 1px solid #000;
  margin-bottom: 10px;
  padding-top: 5px;
}
    `;
  }

  /**
   * Format date for display (DD/MM/YYYY)
   */
  private formatDateDisplay(isoDate: string | null | undefined): string {
    if (!isoDate) return "";
    const [year, month, day] = String(isoDate).split("-");
    if (!year || !month || !day) return String(isoDate);
    return `${day}/${month}/${year}`;
  }

  /**
   * Safely extract payload as a record
   */
  private getPayloadRecord(payload: any): Record<string, any> {
    if (typeof payload !== "object" || payload === null) {
      return {};
    }
    return payload;
  }
}
