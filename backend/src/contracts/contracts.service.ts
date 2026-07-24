import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import { PdfRenderService } from "./pdf-render.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { BillingService } from "../billing/billing.service";
import { ContractsEmailsService } from "./contracts-emails.service";
import { CustomersService } from "../customers/customers.service";
import { CustomerDocumentsService } from "../customers/documents/customer-documents.service";
import { DocumentSigningService } from "../documents/document-signing.service";
import { DocumentSigningAuditService } from "../documents/document-signing-audit.service";
import { DocumentSignatureFinalizationService } from "../documents/document-signature-finalization.service";
import { DocumentDeliveryService } from "../documents/document-delivery.service";
import { DocumentSigningSessionService } from "../documents/document-signing-session.service";
import { DocumentPackageService } from "../documents/document-package.service";
import { DocumentGenerationService } from "../documents/document-generation.service";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { ContractSigningSessionBuilder } from "./contract-signing-session.builder";
import { ArchiveContractDto } from "./dto/archive-contract.dto";
import { CustomerDocumentCategory } from "@prisma/client";

import { SendContractEmailDto } from "./dto/send-contract-email.dto";
import { SendSigningEmailDto } from "./dto/send-signing-email.dto";
import { SearchContractsDto } from "./dto/search-contracts.dto";
import { HistoryContractItemDto } from "./dto/history-contract-item.dto";
import { ResolvedTenant } from "../tenant/tenant.service";
import { getPublicAppBaseUrl } from "../common/utils/tenant-url.util";
import { SigningParticipant } from "../documents/signing-session/signing-session.types";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import {
  ARCHIVE_PROCESSING_JOB_NAME,
  ARCHIVE_PROCESSING_JOB_OPTIONS,
} from "./jobs/archive-processing-job.constants";
import type { ArchiveProcessingJobPayload } from "./jobs/archive-processing-job.types";
import {
  PACKAGE_COMPLETED_EVENT_VERSION,
  PackageCompletedDispatcher,
} from "./jobs";

const CONTRACT_STATUS_PENDING_PAYMENT_RESERVE = "PENDING_PAYMENT_RESERVE";
const CONTRACT_STATUS_RESERVE_IN_REVIEW = "RESERVE_IN_REVIEW";
const CONTRACT_STATUS_PENDING_SIGNATURE = "PENDING_SIGNATURE";
const CONTRACT_STATUS_VIEWED = "VIEWED";
const CONTRACT_STATUS_SIGNED = "SIGNED";
const CONTRACT_STATUS_DRAFT = "DRAFT";

type SigningRole = "CLIENTE" | "ACOMPANANTE";

type ArchiveDocument = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

type UploadedArchiveDocument = {
  kind?: string;
  originalFileName: string;
  objectKey: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private readonly maxDocumentCount = 20;
  private readonly maxDocumentSizeBytes = 5 * 1024 * 1024;
  private readonly maxDocumentTotalBytes = 25 * 1024 * 1024;
  private readonly allowedDocumentMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly pdfRenderService: PdfRenderService,
    private readonly billingService: BillingService,
    private readonly contractsEmailsService: ContractsEmailsService,
    private readonly customersService: CustomersService,
    private readonly customerDocumentsService: CustomerDocumentsService,
    private readonly documentSigningService: DocumentSigningService,
    private readonly documentSigningAuditService: DocumentSigningAuditService,
    private readonly documentSignatureFinalizationService: DocumentSignatureFinalizationService,
    private readonly documentDeliveryService: DocumentDeliveryService,
    private readonly documentSigningSessionService: DocumentSigningSessionService,
    private readonly documentPackageService: DocumentPackageService,
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly documentPdfService: DocumentPdfService,
    private readonly contractSigningSessionBuilder: ContractSigningSessionBuilder,
    private readonly storageService: StorageService,
    private readonly jobDispatcher: JobDispatcherService,
    private readonly packageCompletedDispatcher: PackageCompletedDispatcher,
  ) {}

  private pad(value: number, size = 2) {
    return String(value).padStart(size, "0");
  }

  private randomHex(bytes = 2) {
    return randomBytes(bytes).toString("hex").toUpperCase();
  }

  private buildContractNumber(prefix = "LUC") {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = this.pad(now.getMonth() + 1);
    const dd = this.pad(now.getDate());
    const hh = this.pad(now.getHours());
    const min = this.pad(now.getMinutes());
    const ss = this.pad(now.getSeconds());
    const ms = this.pad(now.getMilliseconds(), 3);
    const unique = this.randomHex(2);

    return `${prefix}-${yyyy}${mm}${dd}-${hh}${min}${ss}${ms}-${unique}`;
  }

  /**
   * Genera un código alfanumérico de 6 caracteres para identificar pagos.
   * GARANTIZA que sea mixto: al menos 1 letra Y al menos 1 número.
   * Formato: mayúsculas y números (sin I, O, 0, 1 para evitar confusión).
   * Ejemplo: "A3B7K9", "XY5Z2E"
   */
  private generatePaymentReference(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const numbers = '23456789';
    
    let result = '';
    let hasLetter = false;
    let hasNumber = false;
    const maxAttempts = 100;
    let attempts = 0;
    
    // Generar hasta que tenga al menos 1 letra Y 1 número
    while ((!hasLetter || !hasNumber) && attempts < maxAttempts) {
      result = '';
      hasLetter = false;
      hasNumber = false;
      
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Verificar que tenga al menos 1 letra y 1 número
      hasLetter = /[A-Z]/.test(result);
      hasNumber = /[0-9]/.test(result);
      attempts++;
    }
    
    // Fallback: si después de 100 intentos no cumple, forzar formato mixto
    if (!hasLetter || !hasNumber) {
      // Generar 3 letras + 3 números y mezclar
      const lettersPart = Array.from({ length: 3 }, () => 
        letters.charAt(Math.floor(Math.random() * letters.length))
      );
      const numbersPart = Array.from({ length: 3 }, () => 
        numbers.charAt(Math.floor(Math.random() * numbers.length))
      );
      
      // Mezclar aleatoriamente
      const mixed = [...lettersPart, ...numbersPart];
      for (let i = mixed.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
      }
      result = mixed.join('');
    }
    
    return result;
  }

  /**
   * Generate additional documents (MINOR_ANNEX, etc.) for the contract package
   * 
   * This method:
   * 1. Builds the signing session plan
   * 2. Generates HTML/PDF for each non-CONTRACT document
   * 3. Uploads to storage
   * 4. Adds to uploadedDocuments array with appropriate kind
   * 
   * @param contractData Contract data for document generation
   * @param baseFolder Storage folder for this contract
   * @param uploadedDocuments Array to append generated documents to
   * @param tenantId Tenant ID for company info
   */
  private async generateAdditionalDocuments(
    contractData: {
      id: string;
      contractNumber: string;
      payload: Record<string, any>;
    },
    baseFolder: string,
    uploadedDocuments: Array<{
      kind?: string;
      originalFileName: string;
      objectKey: string;
      mimeType: string;
      size: number;
    }>,
    tenantId: string,
  ): Promise<void> {
    // Build signing session plan to determine which documents need generation
    const signingPlan = this.contractSigningSessionBuilder.buildFromContract(contractData);

    // Get tenant info for document headers
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        legalId: true,
        contactEmail: true,
        contactPhone: true,
        logoUrl: true,
      },
    });

    const companyInfo = {
      name: tenant?.name || "Viajes Alma Nova",
      legalId: tenant?.legalId || null,
      contactEmail: tenant?.contactEmail || null,
      contactPhone: tenant?.contactPhone || null,
      logoSrc: tenant?.logoUrl || null,
    };

    // Process each document in the plan
    for (const documentDef of signingPlan.documents) {
      const documentType = documentDef.type.toUpperCase();

      // Skip CONTRACT (already handled by existing logic)
      if (documentType === "CONTRACT") {
        continue;
      }

      // Generate document based on type
      if (documentType === "MINOR_ANNEX" || documentType === "LIABILITY_WAIVER") {
        this.logger.log(
          `[generate] Generating ${documentType} document key=${documentDef.key}`,
        );

        // Generate HTML using DocumentGenerationService
        const documentHtml = await this.documentGenerationService.generateDocumentHtml(
          documentDef,
          contractData,
          companyInfo,
        );

        // Persist HTML before generating the dependent PDF artifact.
        const htmlKey = `${baseFolder}/${documentDef.key}.html`;
        await this.uploadToSpaces({
          objectKey: htmlKey,
          contentType: "text/html; charset=utf-8",
          body: Buffer.from(documentHtml, "utf-8"),
        });

        const { pdfBuffer } = await this.documentPdfService.renderDocumentToBuffer(
          documentHtml,
        );

        const pdfKey = `${baseFolder}/${documentDef.key}.pdf`;
        await this.uploadToSpaces({
          objectKey: pdfKey,
          contentType: "application/pdf",
          body: pdfBuffer,
        });

        this.logger.log(
          `[generate] ${documentType} generated successfully key=${documentDef.key} size=${pdfBuffer.length}`,
        );
      } else {
        this.logger.warn(
          `[generate] Unsupported document type for generation: ${documentType}`,
        );
      }
    }
  }

  /**
   * Populates DocumentSigning records with artifact metadata from generated documents.
   * Called after DocumentSigningSession is created to sync artifacts into DocumentSigning.
   * (Story 6 - Direct DocumentSigning Write Path)
   */
  private async populateDocumentSigningArtifacts(contractId: string): Promise<void> {
    // Find the active DocumentSigningSession for this contract
    const session = await (this.prisma as any).documentSigningSession.findFirst({
      where: {
        contractId,
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    });

    if (!session) {
      this.logger.warn(
        `[populate-artifacts] No active DocumentSigningSession found for contractId=${contractId}`,
      );
      return;
    }

    // Get contract info to reconstruct artifact paths
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        contractNumber: true,
        createdAt: true,
        payload: true,
        tenant: {
          select: { subdomain: true },
        },
      },
    });

    if (!contract) {
      this.logger.warn(`[populate-artifacts] Contract not found: ${contractId}`);
      return;
    }

    // Reconstruct baseFolder using same logic as archiveContract
    const tenantSubdomain = contract.tenant?.subdomain || 'unknown';
    const appEnv = this.configService.get<string>('APP_ENV', 'dev');
    const now = contract.createdAt;
    const y = now.getFullYear();
    const m = this.pad(now.getMonth() + 1);
    const d = this.pad(now.getDate());
    const baseFolder = `${appEnv}/${tenantSubdomain}/contracts/${y}/${m}/${d}/${this.sanitizeSegment(contract.contractNumber)}`;

    // Build signing plan to get document definitions
    const signingPlan = this.contractSigningSessionBuilder.buildFromContract({
      id: contract.id,
      contractNumber: contract.contractNumber,
      payload: contract.payload,
    });

    // Get all DocumentSigning records for this session
    const documentSignings = await (this.prisma as any).documentSigning.findMany({
      where: { sessionId: session.id },
    });

    for (const docSigning of documentSignings) {
      const documentType = String(docSigning.documentType || "").toUpperCase();

      if (documentType === "CONTRACT") {
        // Reconstruct CONTRACT artifact paths using fixed file names
        const pdfObjectKey = `${baseFolder}/contract.pdf`;
        const htmlObjectKey = `${baseFolder}/contract.html`;
        const pdfFileName = `${contract.contractNumber}.pdf`;

        // Validate both stored artifacts before persisting their metadata.
        const htmlBuffer = await this.storageService.downloadObject(htmlObjectKey);
        const pdfBuffer = await this.storageService.downloadObject(pdfObjectKey);
        if (!htmlBuffer.length || !pdfBuffer.length) {
          throw new InternalServerErrorException(
            `Los artefactos del documento ${docSigning.documentKey} estan incompletos.`,
          );
        }

        await (this.prisma as any).documentSigning.update({
          where: { id: docSigning.id },
          data: {
            pdfObjectKey,
            pdfFileName,
            pdfMimeType: "application/pdf",
            pdfSize: pdfBuffer.length,
            htmlObjectKey,
          },
        });
        this.logger.log(
          `[populate-artifacts] CONTRACT artifacts populated for docSigningId=${docSigning.id}`,
        );
      } else if (documentType === "MINOR_ANNEX") {
        // Find corresponding document definition from signing plan
        const documentDef = signingPlan.documents.find(
          (def) => def.key === docSigning.documentKey
        );

        if (!documentDef) {
          this.logger.warn(
            `[populate-artifacts] Document definition not found for key=${docSigning.documentKey}`,
          );
          continue;
        }

        // Reconstruct artifact paths
        const pdfObjectKey = `${baseFolder}/${docSigning.documentKey}.pdf`;
        const htmlObjectKey = `${baseFolder}/${docSigning.documentKey}.html`;
        const pdfFileName = `${documentDef.displayName}.pdf`;

        // Validate both stored artifacts before persisting their metadata.
        const htmlBuffer = await this.storageService.downloadObject(htmlObjectKey);
        const pdfBuffer = await this.storageService.downloadObject(pdfObjectKey);
        if (!htmlBuffer.length || !pdfBuffer.length) {
          throw new InternalServerErrorException(
            `Los artefactos del documento ${docSigning.documentKey} estan incompletos.`,
          );
        }

        await (this.prisma as any).documentSigning.update({
          where: { id: docSigning.id },
          data: {
            pdfObjectKey,
            pdfFileName,
            pdfMimeType: "application/pdf",
            pdfSize: pdfBuffer.length,
            htmlObjectKey,
          },
        });
        this.logger.log(
          `[populate-artifacts] MINOR_ANNEX artifacts populated for docSigningId=${docSigning.id} key=${docSigning.documentKey}`,
        );
      } else if (documentType === "LIABILITY_WAIVER") {
        // Find corresponding document definition from signing plan
        const documentDef = signingPlan.documents.find(
          (def) => def.key === docSigning.documentKey
        );

        if (!documentDef) {
          this.logger.warn(
            `[populate-artifacts] Document definition not found for key=${docSigning.documentKey}`,
          );
          continue;
        }

        // Reconstruct artifact paths
        const pdfObjectKey = `${baseFolder}/${docSigning.documentKey}.pdf`;
        const htmlObjectKey = `${baseFolder}/${docSigning.documentKey}.html`;
        const pdfFileName = `${documentDef.displayName}.pdf`;

        // Validate both stored artifacts before persisting their metadata.
        const htmlBuffer = await this.storageService.downloadObject(htmlObjectKey);
        const pdfBuffer = await this.storageService.downloadObject(pdfObjectKey);
        if (!htmlBuffer.length || !pdfBuffer.length) {
          throw new InternalServerErrorException(
            `Los artefactos del documento ${docSigning.documentKey} estan incompletos.`,
          );
        }

        await (this.prisma as any).documentSigning.update({
          where: { id: docSigning.id },
          data: {
            pdfObjectKey,
            pdfFileName,
            pdfMimeType: "application/pdf",
            pdfSize: pdfBuffer.length,
            htmlObjectKey,
          },
        });
        this.logger.log(
          `[populate-artifacts] LIABILITY_WAIVER artifacts populated for docSigningId=${docSigning.id} key=${docSigning.documentKey}`,
        );
      }
    }

    await this.documentSigningSessionService.assertArtifactsReady(contractId);
  }

  /**
   * Retrieves the CONTRACT DocumentSigning record for a given contract.
   * (Story 3 - Read Path Migration)
   */
  private async getContractDocumentSigning(contractId: string): Promise<any> {
    const session = await (this.prisma as any).documentSigningSession.findFirst({
      where: {
        contractId,
        status: {
          in: ["PENDING", "IN_PROGRESS", "COMPLETED", "SIGNED"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return null;
    }

    const contractDoc = await (this.prisma as any).documentSigning.findFirst({
      where: {
        sessionId: session.id,
        documentType: "CONTRACT",
      },
    });

    return contractDoc;
  }

  /**
   * Retrieves the DocumentSigning record for a specific document based on signerKey.
   * Determines whether to return CONTRACT or MINOR_ANNEX document.
   */
  private async getDocumentSigningForSigner(
    contractId: string,
    signerKey: string,
  ): Promise<{ document: any; documentType: string; documentKey: string } | null> {
    const session = await (this.prisma as any).documentSigningSession.findFirst({
      where: {
        contractId,
        status: {
          in: ["PENDING", "IN_PROGRESS", "COMPLETED", "SIGNED"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return null;
    }

    // Check if signerKey indicates a MINOR_ANNEX document
    const minorMatch = signerKey.match(/^minor-(\d+)-tutor$/);
    if (minorMatch) {
      const minorIndex = parseInt(minorMatch[1], 10);
      const documentKey = `minor-annex-${minorIndex}`;
      
      const minorDoc = await (this.prisma as any).documentSigning.findFirst({
        where: {
          sessionId: session.id,
          documentType: "MINOR_ANNEX",
          documentKey,
        },
      });

      if (minorDoc) {
        return {
          document: minorDoc,
          documentType: "MINOR_ANNEX",
          documentKey,
        };
      }
    }

    // Check if signerKey is a companion responsible for a MINOR_ANNEX
    const allMinorDocs = await (this.prisma as any).documentSigning.findMany({
      where: {
        sessionId: session.id,
        documentType: "MINOR_ANNEX",
      },
      include: {
        signers: true,
      },
    });

    for (const minorDoc of allMinorDocs) {
      const hasCompanion = minorDoc.signers.some(
        (s: any) => s.signerKey === signerKey && s.signerRole === "ACOMPANANTE_RESPONSABLE",
      );
      if (hasCompanion) {
        return {
          document: minorDoc,
          documentType: "MINOR_ANNEX",
          documentKey: minorDoc.documentKey,
        };
      }
    }

    // Default to CONTRACT
    const contractDoc = await (this.prisma as any).documentSigning.findFirst({
      where: {
        sessionId: session.id,
        documentType: "CONTRACT",
      },
    });

    if (!contractDoc) {
      return null;
    }

    return {
      document: contractDoc,
      documentType: "CONTRACT",
      documentKey: "contract",
    };
  }

  /**
   * Genera un código de pago único intentando hasta maxAttempts veces.
   * Retorna el código o lanza error si no puede generar uno único.
   */
  private async generateUniquePaymentReference(maxAttempts = 50): Promise<string> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const paymentRef = this.generatePaymentReference();
      
      // Verificar si ya existe
      const existing = await (this.prisma as any).contract.findUnique({
        where: { paymentReference: paymentRef },
      });

      if (!existing) {
        return paymentRef;
      }
    }

    throw new InternalServerErrorException(
      `No se pudo generar un código de pago único después de ${maxAttempts} intentos.`
    );
  }

  /**
   * Inyecta el código de pago en el HTML del contrato,
   * agregándolo en la tabla de metadata justo después del número de contrato.
   */
  private injectPaymentReferenceIntoHtml(html: string, paymentReference: string): string {
    // Buscar la tabla contract-meta y agregar una fila con el código de pago
    const searchPattern = /<tr><td>Numero de contrato:<\/td><td>[^<]+<\/td><\/tr>/i;
    
    if (!searchPattern.test(html)) {
      this.logger.warn('No se encontró la tabla contract-meta en el HTML, el código de pago no se inyectó');
      return html;
    }

    // Inyectar justo después de la fila "Numero de contrato"
    return html.replace(
      searchPattern,
      (match) => `${match}\n  <tr><td>Código de pago:</td><td><strong>${this.escapeHtml(paymentReference)}</strong></td></tr>`
    );
  }

  /**
   * Escapa caracteres especiales HTML para evitar inyección
   */
  private escapeHtml(text: string): string {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Determines CustomerDocumentCategory from filename
   * Maps wizard upload prefixes to document categories
   * Returns null if the file is not a customer document
   */
  private getCategoryFromFilename(filename: string): CustomerDocumentCategory | null {
    const lower = filename.toLowerCase();
    
    // Map common prefixes used in the wizard to categories
    if (lower.includes('cedula-frente') || lower.includes('id-front') || lower.includes('identificacion-frente')) {
      return CustomerDocumentCategory.ID_FRONT;
    }
    if (lower.includes('cedula-reverso') || lower.includes('id-back') || lower.includes('identificacion-reverso')) {
      return CustomerDocumentCategory.ID_BACK;
    }
    if (lower.includes('pasaporte') || lower.includes('passport')) {
      return CustomerDocumentCategory.PASSPORT;
    }
    if (lower.includes('foto') || lower.includes('photo') || lower.includes('perfil') || lower.includes('profile')) {
      return CustomerDocumentCategory.PROFILE_PHOTO;
    }
    
    // Skip files that are clearly not customer documents
    if (lower.includes('recibo') || lower.includes('receipt') || 
        lower.includes('comprobante') || lower.includes('voucher') ||
        lower.includes('reserva') || lower.includes('reservation')) {
      return null;
    }
    
    // Default to OTHER for unrecognized customer documents
    return CustomerDocumentCategory.OTHER;
  }

  /**
   * Determine which customer a document belongs to based on filename prefix
   * @param filename Original filename (e.g., "titular-cedula-frente", "acompanante1-cedula-frente")
   * @param holderId Holder customer ID
   * @param companions Array of registered companion clients
   * @returns Customer ID or null if cannot determine
   */
  private getCustomerIdFromFilename(
    filename: string,
    holderId: string,
    companions: Array<{ id: string }>
  ): string | null {
    const lower = filename.toLowerCase();

    // Check if it's a holder document
    if (lower.includes('titular-')) {
      return holderId;
    }

    // Check if it's a companion document (e.g., "acompanante1-", "acompanante2-")
    const companionMatch = lower.match(/acompanante(\d+)-/);
    if (companionMatch) {
      const companionIndex = parseInt(companionMatch[1], 10) - 1; // Convert to 0-based index
      if (companionIndex >= 0 && companionIndex < companions.length) {
        return companions[companionIndex].id;
      }
    }

    return null;
  }

  private getTenantBasePath(tenantSubdomain: string): string {
    const appEnv = this.configService.get<string>("APP_ENV", "dev").trim();
    return `${appEnv}/${tenantSubdomain}/`;
  }

  /**
   * Construye la ruta completa para un archivo en Spaces
   * @param tenantSubdomain - Subdomain del tenant (ej: "almanova")
   * @param category - Categoría del archivo (ej: "logos", "firmas", "contracts", "documents", "receipts")
   * @param filename - Nombre del archivo
   */
  private getSpacesObjectKey(tenantSubdomain: string, category: string, filename: string): string {
    const basePath = this.getTenantBasePath(tenantSubdomain);
    return `${basePath}${category}/${filename}`;
  }

  /**
   * Construye la URL pública para un asset del tenant usando CDN
   * Ejemplo: https://agencia-viajes-saas.sfo3.cdn.digitaloceanspaces.com/dev-agencias-saas/almanova/logos/logo.png
   */
  private getTenantAssetUrl(tenantSubdomain: string, category: string, assetFilename: string): string {
    const cfg = this.storageService.getConfig();
    const objectKey = this.getSpacesObjectKey(tenantSubdomain, category, assetFilename);
    // Usar CDN endpoint para mejor performance
    return `https://${cfg.bucket}.${cfg.region}.cdn.digitaloceanspaces.com/${objectKey}`;
  }

  private sanitizeSegment(value: string) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || "file";
  }

  private toDateOrNull(value?: string) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseSigningToken(token: string, callerIp?: string | null) {
    const parsed = this.documentSigningService.parseSigningToken(token, callerIp);
    // Map generic documentId back to contractId for backward compatibility
    return {
      contractId: parsed.documentId,
      documentSigningId: parsed.documentSigningId, // NEW: Include documentSigningId if present
      expiresAt: parsed.expiresAt,
      signerKey: parsed.signerKey,
      signerRole: parsed.signerRole.toUpperCase() === "ACOMPANANTE" ? "ACOMPANANTE" : "CLIENTE",
      signerName: parsed.signerName,
    };
  }

  /**
   * Extract signing participants from a contract using SigningSessionPlan.
   * The builder is the single source of truth for participant resolution.
   */
  private getSigningParticipantsFromPlan(contract: any): SigningParticipant[] {
    const plan = this.contractSigningSessionBuilder.buildFromContract(contract);
    // For contracts, there's always exactly one document
    return plan.documents[0]?.signers || [];
  }



  private async uploadToSpaces(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }) {
    await this.storageService.uploadObject(params);
  }

  private async convertImageToWebP(params: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }): Promise<{
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }> {
    // Si es PDF, retornar sin cambios
    if (params.mimetype === "application/pdf") {
      return params;
    }

    // Si ya es WebP, retornar sin cambios
    if (params.mimetype === "image/webp") {
      return params;
    }

    // Convertir JPEG/PNG a WebP
    if (params.mimetype === "image/jpeg" || params.mimetype === "image/png") {
      try {
        // Dynamic import para evitar error de TypeScript con namespace
        const sharpModule = await import('sharp');
        const sharp = sharpModule.default || sharpModule;
        
        const webpBuffer = await sharp(params.buffer)
          .webp({ quality: 85 }) // 85% calidad para balance entre tamaño y calidad
          .toBuffer();

        // Cambiar la extensión del nombre del archivo
        const nameWithoutExt = params.originalname.replace(/\.(jpe?g|png)$/i, "");
        const newName = `${nameWithoutExt}.webp`;

        return {
          buffer: webpBuffer,
          mimetype: "image/webp",
          originalname: newName,
          size: webpBuffer.length,
        };
      } catch (error) {
        // Si falla la conversión, retornar el archivo original
        console.error("Error convirtiendo imagen a WebP:", error);
        return params;
      }
    }

    // Para otros tipos, retornar sin cambios
    return params;
  }

  private async buildSignedObjectUrl(objectKey: string | null | undefined, expiresInSeconds = 900): Promise<string | null> {
    if (!objectKey) {
      return null;
    }
    return this.storageService.generateSignedUrl(objectKey, expiresInSeconds);
  }

  private async downloadObjectBuffer(objectKey: string) {
    return this.storageService.downloadObject(objectKey);
  }

  async reserveNextNumber(
    user: { id: string; email: string; fullName: string },
    tenant: { id: string; name: string; contractPrefix: string },
  ) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const contractNumber = this.buildContractNumber(tenant.contractPrefix);

      try {
        await (this.prisma as any).contractNumber.create({
          data: {
            number: contractNumber,
            createdByUserId: user.id,
            createdByEmail: user.email,
            createdByName: user.fullName,
            tenantId: tenant.id,
          },
        });

        return {
          contractNumber,
          createdBy: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
          },
        };
      } catch (error) {
        const isUniqueConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          String((error as { code?: string }).code) === "P2002";

        if (isUniqueConflict) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("No se pudo generar un numero de contrato unico.");
  }

  async sendContractEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendContractEmailDto,
    pdfBuffer: Buffer,
    tenant?: ResolvedTenant | null,
  ) {
    // Delegado a ContractsEmailsService (migrado a EmailService centralizado)
    return this.contractsEmailsService.sendContractEmail(user, dto, pdfBuffer, tenant);

    /* CÓDIGO ANTIGUO COMENTADO PARA ROLLBACK:
    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim();
    const resend = new Resend(apiKey);
    const logoSrc = await this.loadCompanyLogoEmailSrc(tenant);
    const tenantName = tenant?.name || "Sistema de Viajes";
    const pdfBase64 = pdfBuffer.toString("base64");
    const subject = `📄 Contrato para Firma - ${dto.contractNumber} | ${tenantName}`;
    const html = `... (Ver templates/contract-pdf-attachment.template.ts para HTML completo) ...`;
    await resend.emails.send({ from: fromEmail, to: [dto.toEmail], subject, html, attachments: [{ filename: dto.fileName, content: pdfBase64 }] });
    return { ok: true, emailId: result.data?.id || null, sentTo: dto.toEmail, contractNumber: dto.contractNumber, sentBy: { id: user.id, email: user.email, fullName: user.fullName }};
    FIN CÓDIGO ANTIGUO */
  }

  async sendContractSigningEmail(
    user: { id: string; email: string; fullName: string },
    dto: SendSigningEmailDto,
    tenant?: ResolvedTenant | null,
  ) {
    // Delegado a ContractsEmailsService (migrado a EmailService centralizado)
    return this.contractsEmailsService.sendContractSigningEmail(user, dto, tenant);

    /* CÓDIGO ANTIGUO COMENTADO PARA ROLLBACK:
    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim() || this.configService.get<string>("AUTH_FROM_EMAIL", "").trim();
    const resend = new Resend(apiKey);
    const logoSrc = await this.loadCompanyLogoEmailSrc(tenant);
    const tenantName = tenant?.name || "Sistema de Viajes";
    const html = `... (Ver templates/contract-signing-link.template.ts para HTML completo con signingUrl=${dto.signingUrl}) ...`;
    await resend.emails.send({ from: fromEmail, to: [dto.toEmail], subject: `✍️ Firma tu Contrato - ${dto.contractNumber} | ${tenantName}`, html });
    return { ok: true, emailId: result.data?.id || null, sentTo: dto.toEmail, contractNumber: dto.contractNumber, sentBy: { id: user.id, email: user.email, fullName: user.fullName }};
    FIN CÓDIGO ANTIGUO */
  }

  async resendSignedContractEmailToParties(
    user: { id: string; email: string; fullName: string },
    contractId: string,
    tenant?: ResolvedTenant | null,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
      },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    // Validate signing session completion using DocumentSigningSession framework
    const isSessionCompleted = await this.documentSigningSessionService.isSigningSessionCompleted(contract.id);
    const contractDoc = await this.getContractDocumentSigning(contract.id);
    if (!isSessionCompleted || !contractDoc?.signedPdfObjectKey) {
      throw new BadRequestException("El contrato aun no esta firmado por todas las partes.");
    }

    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService
      .get<string>("CONTRACTS_FROM_EMAIL", "")
      .trim();

    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException(
        "Falta configurar RESEND_API_KEY o CONTRACTS_FROM_EMAIL.",
      );
    }

    // Reenvío manual: solo se envía al titular (cliente principal del contrato)
    if (!contract.client?.email) {
      throw new BadRequestException("El contrato no tiene un email de titular para reenviar.");
    }

    const recipients: Array<{ email: string; name: string; role: SigningRole }> = [{
      email: contract.client.email.trim().toLowerCase(),
      name: contract.client.fullName || "Cliente",
      role: "CLIENT" as SigningRole,
    }];

    const payload = this.documentSigningService.getPayloadRecord(contract.payload);

    // Read signedPdfObjectKey from DocumentSigning (Story 3)
    const signedPdfBuffer = await this.downloadObjectBuffer(contractDoc.signedPdfObjectKey);
    if (!signedPdfBuffer.length) {
      throw new InternalServerErrorException("No se pudo leer el contrato firmado para reenviar.");
    }

    const pdfBase64 = signedPdfBuffer.toString("base64");
    // Read signedPdfFileName from DocumentSigning (Story 3)
    const fileName =
      String(contractDoc.signedPdfFileName || "").trim() || `${String(contract.contractNumber || "contrato").trim()}-signed.pdf`;

    // Delegado a ContractsEmailsService (migrado a EmailService centralizado)
    const { sentTo, failedTo } = await this.contractsEmailsService.sendSignedContractToRecipients(
      user,
      contract.contractNumber,
      fileName,
      pdfBase64,
      recipients,
      tenant,
    );

    /* CÓDIGO ANTIGUO COMENTADO PARA ROLLBACK:
    const resend = new Resend(apiKey);
    const logoSrc = await this.loadCompanyLogoEmailSrc(tenant);
    const tenantName = tenant?.name || "Sistema de Viajes";
    const sentTo: string[] = [];
    const failedTo: string[] = [];
    for (const recipient of recipients) {
      const html = `... (Ver templates/contract-signed-confirmation.template.ts para HTML completo) ...`;
      try {
        await resend.emails.send({ from: fromEmail, to: [recipient.email], subject: `✅ Contrato Firmado - ${contract.contractNumber} | ${tenantName}`, html, attachments: [{ filename: fileName, content: pdfBase64 }] });
        sentTo.push(recipient.email);
      } catch {
        failedTo.push(recipient.email);
      }
    }
    FIN CÓDIGO ANTIGUO */

    const existingDispatchLog = Array.isArray(payload?.emailDispatchLog)
      ? payload.emailDispatchLog.filter((item: any) => item && typeof item === "object")
      : [];
    const dispatchLogEntry = {
      type: "SIGNED_RESEND_MANUAL",
      createdAt: new Date().toISOString(),
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      requestedBy: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      sentCount: sentTo.length,
      failedCount: failedTo.length,
      sentTo,
      failedTo,
    };

    await (this.prisma as any).contract.update({
      where: { id: contract.id },
      data: {
        payload: {
          ...payload,
          emailDispatchLog: [...existingDispatchLog, dispatchLogEntry],
        },
      },
    });

    if (!sentTo.length) {
      throw new InternalServerErrorException("No se pudo reenviar el contrato firmado a ningun destinatario.");
    }

    return {
      ok: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      sentCount: sentTo.length,
      failedCount: failedTo.length,
      sentTo,
      failedTo,
      requestedBy: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      signedAt: contract.signedAt || null,
      dispatchLogEntry,
      signerSummary: Array.isArray(payload?.signedParticipants)
        ? payload.signedParticipants
        : null,
    };
  }

  async createContractSigningLink(
    _user: { id: string; email: string; fullName: string },
    contractId: string,
    ttlMinutes = 60 * 24,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: {
        client: true,
        tenant: true,
      },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    if (contract.status === CONTRACT_STATUS_SIGNED) {
      throw new BadRequestException("Este contrato ya esta firmado.");
    }

    if (!contract.tenant) {
      throw new InternalServerErrorException(
        "Tenant no encontrado para preparar los documentos de firma.",
      );
    }

    const safeTtlMinutes = Math.min(
      Math.max(Number(ttlMinutes) || 0, 15),
      60 * 24 * 7,
    );
    const baseUrl = getPublicAppBaseUrl(this.configService, contract.tenant);
    const signingPlan = this.contractSigningSessionBuilder.buildFromContract(contract);
    const prepared = await this.documentSigningSessionService.prepareSigningSession(
      signingPlan,
      {
        baseUrl,
        ttlMinutes: safeTtlMinutes,
        tenant: {
          id: contract.tenant.id,
          name: contract.tenant.name,
          subdomain: contract.tenant.subdomain,
          emailLogoUrl: contract.tenant.emailLogoUrl,
          logoUrl: contract.tenant.logoUrl,
        },
      },
    );

    await this.populateDocumentSigningArtifacts(contract.id);

    const signingLinks = prepared.signingLinks;

    const clientLink = signingLinks.find((item) => item.signerKey === "client") || signingLinks[0];

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      clientName: contract.client?.fullName || null,
      clientEmail: contract.client?.email || null,
      signingUrl: clientLink?.signingUrl || "",
      signingLinks,
      expiresAt: clientLink?.expiresAt || null,
    };
  }

  async sendSigningLinksForContract(
    user: { id: string; email: string; fullName: string },
    contractId: string,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: { client: true, tenant: true },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    const status = String(contract.status || "").toUpperCase();
    if (status !== CONTRACT_STATUS_PENDING_SIGNATURE) {
      throw new BadRequestException(
        "El contrato no esta listo para enviar a firma. El pago de reserva debe estar aprobado primero.",
      );
    }

    const tenant = contract.tenant || null;
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    // Build signing session plan
    const signingPlan = this.contractSigningSessionBuilder.buildFromContract(contract);

    // Prepare the persisted session and links without sending invitations yet.
    const baseUrl = getPublicAppBaseUrl(this.configService, tenant);
    const signingContext = {
      baseUrl,
      ttlMinutes: 1440, // 1 day TTL
      documentDisplayName: contract.contractNumber,
      actor: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        subdomain: tenant.subdomain,
        emailLogoUrl: tenant.emailLogoUrl,
        logoUrl: tenant.logoUrl,
      } : null,
    };
    const session = await this.documentSigningSessionService.prepareSigningSession(
      signingPlan,
      signingContext,
    );

    // No invitation can be sent until every required HTML/PDF artifact is ready.
    await this.populateDocumentSigningArtifacts(contract.id);

    // Atomically claim invitation delivery so concurrent requests cannot send duplicates.
    const claimed = await (this.prisma as any).contract.updateMany({
      where: {
        id: contractId,
        status: CONTRACT_STATUS_PENDING_SIGNATURE,
      },
      data: { status: "SIGNING_SENT" },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException(
        "Los enlaces de firma ya fueron enviados o el contrato cambio de estado.",
      );
    }

    const invitationResult =
      await this.documentSigningSessionService.sendSigningInvitations(
        signingPlan,
        signingContext,
        session.signingLinks,
      );

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      emailsSent: invitationResult.emailsSent,
      signingLinks: session.signingLinks,
    };
  }

  async archiveContract(
    user: { id: string; email: string; fullName: string; tenantId: string },
    dto: ArchiveContractDto,
    documents: ArchiveDocument[] = [],
  ) {
    // Detectar si es viaje interno (no requiere PDF)
    const isInternalTrip = Boolean(dto.internalTripId?.trim());
    
    // Validar contractHtml solo si NO es viaje interno
    if (!isInternalTrip && !dto.contractHtml?.trim()) {
      throw new BadRequestException("Se requiere contractHtml para generar el PDF del contrato.");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(dto.payloadJson);
    } catch {
      throw new InternalServerErrorException("payloadJson no tiene un JSON valido.");
    }

    if (documents.length > this.maxDocumentCount) {
      throw new BadRequestException(`Solo se permiten ${this.maxDocumentCount} adjuntos por contrato.`);
    }

    let documentTotalBytes = 0;
    for (const doc of documents) {
      if (!doc?.buffer?.length) {
        continue;
      }

      const mime = String(doc.mimetype || "").toLowerCase();
      if (!this.allowedDocumentMimeTypes.has(mime)) {
        throw new BadRequestException("Adjunto invalido. Solo se permiten PDF, JPG, PNG o WEBP.");
      }

      const size = doc.size || doc.buffer.length;
      if (size > this.maxDocumentSizeBytes) {
        throw new BadRequestException("Un adjunto supera el limite de 5 MB por archivo.");
      }

      documentTotalBytes += size;
      if (documentTotalBytes > this.maxDocumentTotalBytes) {
        throw new BadRequestException("El total de adjuntos supera el limite de 25 MB.");
      }
    }

    const contractNumber = dto.contractNumber.trim();
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};

    // Delegate customer management to CustomersService
    const client = await this.customersService.upsertClient({
      fullName: dto.clientFullName,
      idNumber: dto.clientIdNumber,
      email: dto.clientEmail,
      phone: (payloadRecord as Record<string, unknown>).clientPhone as string | null,
      emergencyContactName: (payloadRecord as Record<string, unknown>).emergencyContactName as string | null,
      emergencyContactPhone: (payloadRecord as Record<string, unknown>).emergencyContactPhone as string | null,
      tenantId: user.tenantId,
    });

    // Register adult companions as clients
    const registeredCompanions = await this.customersService.registerCompanionsAsClients(
      Array.isArray(payloadRecord.companions) ? payloadRecord.companions : [],
      user.tenantId
    );

    // Obtener tenant para organizar archivos
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { subdomain: true },
    });
    const tenantSubdomain = tenant?.subdomain || 'unknown';
    const appEnv = this.configService.get<string>('APP_ENV', 'dev');

    const now = new Date();
    const y = now.getFullYear();
    const m = this.pad(now.getMonth() + 1);
    const d = this.pad(now.getDate());
    const baseFolder = `${appEnv}/${tenantSubdomain}/contracts/${y}/${m}/${d}/${this.sanitizeSegment(contractNumber)}`;
    
    // Generar código de pago único al aceptar el contrato.
    const paymentReference = await this.generateUniquePaymentReference();

    // Persist the original request artifacts so later processing can reconstruct
    // the archive without keeping HTML or file buffers in the HTTP request.
    const pdfKey: string | null = null;
    const signatureAnchors = null;
    const htmlKey = !isInternalTrip
      ? `${baseFolder}/staging/contract.html`
      : null;

    if (htmlKey) {
      await this.uploadToSpaces({
        objectKey: htmlKey,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from(dto.contractHtml!, "utf-8"),
      });
    }

    // =================================================================
    // 📋 Enrich companions with Customer references (selectedCustomerId)
    // =================================================================
    const companionsArray = Array.isArray(payloadRecord.companions) 
      ? payloadRecord.companions 
      : [];
    
    const enrichedCompanions = companionsArray.map((companion: any, index: number) => {
      // Only enrich companions that were successfully registered as clients
      const hasValidId = 
        companion &&
        String(companion.fullName || "").trim() &&
        String(companion.idNumber || "").trim();
      
      if (!hasValidId) {
        // Keep original companion data if not valid for registration
        return companion;
      }

      // Find matching registered client
      // registeredCompanions are in same order as valid companions in payload
      const validCompanionIndex = companionsArray
        .slice(0, index)
        .filter((c: any) => 
          c &&
          String(c.fullName || "").trim() &&
          String(c.idNumber || "").trim()
        ).length;

      const registeredClient = registeredCompanions[validCompanionIndex];
      
      if (registeredClient?.id) {
        // Preserve Customer reference using same convention as holder
        return {
          ...companion,
          selectedCustomerId: registeredClient.id,
        };
      }

      return companion;
    });

    const enrichedPayload = {
      ...payloadRecord,
      companions: enrichedCompanions,
      signatureAnchors,
      signatureAnchor: signatureAnchors?.["client"] ?? null,
    };

    // Calcular participantCount: titular + acompañantes válidos + menores válidos
    // Solo cuentan quienes tengan nombre/ID completo (no pueden viajar sin identificación)
    const holderCount = 1; // Titular siempre cuenta

    const companions = Array.isArray(payloadRecord.companions) 
      ? payloadRecord.companions 
      : [];
    const companionsWithId = companions.filter(
      (c: any) => 
        c && 
        String(c.fullName || "").trim() && 
        String(c.idNumber || "").trim()
    );

    const minors = Array.isArray(payloadRecord.minors) 
      ? payloadRecord.minors 
      : [];
    const minorsWithId = minors.filter(
      (m: any) => 
        m && 
        String(m.minorId || "").trim()
    );

    const participantCount = holderCount + companionsWithId.length + minorsWithId.length;

    console.log('🔢 [participantCount] Cálculo de participantes:');
    console.log(`  Titular: ${holderCount}`);
    console.log(`  Acompañantes válidos: ${companionsWithId.length} de ${companions.length}`);
    console.log(`  Menores válidos: ${minorsWithId.length} de ${minors.length}`);
    console.log(`  TOTAL: ${participantCount} personas`);

    // Obtener travelPackageId si viene del payload (contratos desde paquetes programados)
    const travelPackageId = String(payloadRecord.travelPackageId || "").trim() || null;

    // ✅ VALIDACIÓN DE CAPACIDAD (Capa 2 - Backend)
    // Valida ANTES de crear el contrato para evitar reservas imposibles
    await this.billingService.validateTripCapacity(
      travelPackageId,
      isInternalTrip ? (dto.internalTripId || null) : null,
      participantCount,
      'archiveContract'
    );

    const uploadedDocuments: UploadedArchiveDocument[] = [];
    for (let index = 0; index < documents.length; index += 1) {
      const doc = documents[index];
      if (!doc?.buffer?.length) {
        continue;
      }

      const originalFileName = doc.originalname || `document-${index + 1}`;
      const safeName = this.sanitizeSegment(originalFileName);
      const objectKey = `${baseFolder}/staging/docs/${index + 1}-${safeName}`;
      const mimeType = doc.mimetype || "application/octet-stream";

      await this.uploadToSpaces({
        objectKey,
        contentType: mimeType,
        body: doc.buffer,
      });

      uploadedDocuments.push({
        originalFileName,
        objectKey,
        mimeType,
        size: doc.size || doc.buffer.length,
      });
    }

    // =================================================================
    // 🔍 DEBUG: Log de tamaños ANTES de insertar en base de datos
    // =================================================================
    console.log('====================================');
    console.log(`🔍 [archiveContract] ${isInternalTrip ? 'VIAJE INTERNO' : 'VIAJE INTERNACIONAL'} - Verificando tamaños de campos`);
    console.log('====================================');
    console.log(`contractNumber: "${contractNumber}" (${contractNumber.length} chars)`);
    console.log(`paymentReference: "${paymentReference}" (${paymentReference.length} chars)`);
    console.log(`destination: "${dto.destination.trim()}" (${dto.destination.trim().length} chars)`);
    console.log(`clientFullName: "${dto.clientFullName.trim()}" (${dto.clientFullName.trim().length} chars)`);
    console.log(`clientIdNumber: "${dto.clientIdNumber.trim()}" (${dto.clientIdNumber.trim().length} chars)`);
    console.log(`generatedByEmail: "${user.email}" (${user.email.length} chars)`);
    console.log(`generatedByName: "${user.fullName}" (${user.fullName.length} chars)`);
    if (!isInternalTrip) {
      console.log(`pdfObjectKey: "${pdfKey}" (0 chars)`);
      console.log(`pdfFileName: "${contractNumber}.pdf" (${(contractNumber + '.pdf').length} chars)`);
      console.log(`htmlObjectKey: "${htmlKey}" (${htmlKey?.length || 0} chars)`);
    } else {
      console.log(`internalTripId: "${dto.internalTripId}" (${dto.internalTripId?.length || 0} chars)`);
      console.log('⚠️ Viaje interno: Sin PDF ni HTML');
    }
    console.log(`payload JSON: ${JSON.stringify(enrichedPayload).length} chars total`);
    console.log('====================================');

    let archived: any;
    try {
      // Mapear el source del DTO al enum de Prisma
      const sourceValue = dto.source?.trim().toUpperCase() || 'SCHEDULED_TRIP';
      const validSources = ['SCHEDULED_TRIP', 'MIGRATION', 'CUSTOM_TRIP', 'QUOTE', 'INTERNAL_TRIP'];
      const contractSource = validSources.includes(sourceValue) ? sourceValue : 'SCHEDULED_TRIP';

      archived = await (this.prisma as any).contract.create({
        data: {
          contractNumber,
          paymentReference,
          clientId: client.id,
          tenantId: user.tenantId,
          destination: dto.destination.trim(),
          status: CONTRACT_STATUS_PENDING_PAYMENT_RESERVE,
          generatedByUserId: user.id,
          generatedByEmail: user.email,
          generatedByName: user.fullName,
          issuedAt: this.toDateOrNull(dto.issuedAt),
          startDate: this.toDateOrNull(dto.startDate),
          endDate: this.toDateOrNull(dto.endDate),
          payload: enrichedPayload as any,
          htmlObjectKey: htmlKey,
          source: contractSource,
          participantCount: participantCount,
          travelPackageId: travelPackageId, // Para viajes internacionales programados
          internalTripId: isInternalTrip ? dto.internalTripId : null, // Para viajes internos
          documents: {
            create: uploadedDocuments.map((doc) => ({
              kind: null,
              originalFileName: doc.originalFileName,
              objectKey: doc.objectKey,
              mimeType: doc.mimeType,
              size: doc.size,
            })),
          },
        },
        include: {
          documents: true,
        },
      });
    } catch (error) {
      console.log('====================================');
      console.log('❌ [archiveContract] ERROR EN BASE DE DATOS');
      console.log('====================================');
      console.log('Error completo:', error);
      console.log('Error message:', error instanceof Error ? error.message : String(error));
      
      if (error && typeof error === 'object') {
        console.log('Error keys:', Object.keys(error));
        if ('code' in error) console.log('Prisma code:', (error as any).code);
        if ('meta' in error) console.log('Prisma meta:', JSON.stringify((error as any).meta, null, 2));
      }
      console.log('====================================');
      
      this.logger.error('[archiveContract] Error al crear contrato en la base de datos:');
      this.logger.error(`  Error message: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`  Error details:`, error);
      
      // Si es un error de Prisma, intentar extraer más detalles
      if (error && typeof error === 'object' && 'code' in error) {
        this.logger.error(`  Prisma error code: ${(error as any).code}`);
        this.logger.error(`  Prisma meta:`, (error as any).meta);
      }
      
      // Relanzar con mensaje más útil
      if (error instanceof Error && error.message.toLowerCase().includes('too long')) {
        throw new BadRequestException(
          `Error: Uno de los campos excede el límite permitido. Revisa los logs del servidor para más detalles. ` +
          `Mensaje original: ${error.message}`
        );
      }
      
      throw error;
    }

    if (dto.notes?.trim()) {
      try {
        const notesArray = JSON.parse(dto.notes);
        if (Array.isArray(notesArray) && notesArray.length > 0) {
          this.logger.log(`📝 Creating ${notesArray.length} operational notes for contract ${archived.contractNumber}...`);

          for (const noteDto of notesArray) {
            if (!noteDto.passengerType || !noteDto.passengerName || !noteDto.note?.trim()) {
              this.logger.warn(`Skipping invalid note: ${JSON.stringify(noteDto)}`);
              continue;
            }

            await this.prisma.contractNote.create({
              data: {
                contractId: archived.id,
                tenantId: user.tenantId,
                passengerType: noteDto.passengerType,
                passengerIndex: noteDto.passengerIndex ?? null,
                passengerName: noteDto.passengerName,
                note: noteDto.note.trim(),
                status: 'ACTIVE',
                createdByUserId: user.id,
                createdByName: user.fullName,
              },
            });
          }

          this.logger.log(`✅ Successfully created ${notesArray.length} operational notes`);
        }
      } catch (error) {
        this.logger.error('❌ Error parsing or creating operational notes:', error);
      }
    }

    try {
      await this.jobDispatcher.dispatch<ArchiveProcessingJobPayload>({
        queueKey: PLATFORM_QUEUE_KEYS.DOCUMENT,
        jobName: ARCHIVE_PROCESSING_JOB_NAME,
        payload: { contractId: archived.id },
        metadata: { tenantId: user.tenantId },
        options: {
          ...ARCHIVE_PROCESSING_JOB_OPTIONS,
          jobId: `contract-archive-processing-${archived.id}`,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to dispatch contract archive job contractId=${archived.id}: ${error instanceof Error ? error.message : String(error)}`,
      );

      try {
        await (this.prisma as any).contract.delete({
          where: { id: archived.id },
        });
      } catch (rollbackError) {
        this.logger.error(
          `Failed to roll back Contract after archive dispatch failure contractId=${archived.id}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        );
      }

      throw new InternalServerErrorException(
        "No se pudo enviar el contrato para procesamiento.",
      );
    }

    if (dto.draftId?.trim()) {
      await (this.prisma as any).contractDraft.deleteMany({
        where: {
          id: dto.draftId.trim(),
          generatedByUserId: user.id,
        },
      });
    }

    // Temporary synchronous acceptance boundary. The existing processing below
    // remains available for the BullMQ worker introduced by the next story.
    if (archived?.id) {
      return {
        id: archived.id,
        contractNumber: archived.contractNumber,
        customerId: archived.clientId,
        paymentReference: archived.paymentReference,
        status: archived.status,
        documentCount: archived.documents.length,
        createdAt: archived.createdAt,
        pdfUrl: null,
      };
    }

    // Generar URL del PDF solo si NO es viaje interno
    const pdfUrl = !isInternalTrip && pdfKey
      ? await this.buildSignedObjectUrl(pdfKey, 900)
      : null;

    if (dto.draftId?.trim()) {
      await (this.prisma as any).contractDraft.deleteMany({
        where: {
          id: dto.draftId.trim(),
          generatedByUserId: user.id,
        },
      });
    }

    // ========================================================================
    // 📝 Persist Operational Notes
    // ========================================================================
    if (dto.notes?.trim()) {
      try {
        const notesArray = JSON.parse(dto.notes);
        if (Array.isArray(notesArray) && notesArray.length > 0) {
          this.logger.log(`📝 Creating ${notesArray.length} operational notes for contract ${archived.contractNumber}...`);
          
          for (const noteDto of notesArray) {
            if (!noteDto.passengerType || !noteDto.passengerName || !noteDto.note?.trim()) {
              this.logger.warn(`Skipping invalid note: ${JSON.stringify(noteDto)}`);
              continue;
            }

            await this.prisma.contractNote.create({
              data: {
                contractId: archived.id,
                tenantId: user.tenantId,
                passengerType: noteDto.passengerType,
                passengerIndex: noteDto.passengerIndex ?? null,
                passengerName: noteDto.passengerName,
                note: noteDto.note.trim(),
                status: 'ACTIVE',
                createdByUserId: user.id,
                createdByName: user.fullName,
              },
            });
          }
          
          this.logger.log(`✅ Successfully created ${notesArray.length} operational notes`);
        }
      } catch (error) {
        this.logger.error('❌ Error parsing or creating operational notes:', error);
        // Don't fail the entire contract creation if notes fail
        // Notes can be added later via the CRUD endpoints
      }
    }

    return {
      id: archived.id,
      contractNumber: archived.contractNumber,
      customerId: archived.clientId,
      paymentReference: archived.paymentReference,
      status: archived.status,
      documentCount: archived.documents.length,
      createdAt: archived.createdAt,
      pdfUrl,
    };
  }

  private async processContractArchiveArtifacts(
    isInternalTrip: boolean,
    contractHtml: string | undefined,
    paymentReference: string,
    baseFolder: string,
  ): Promise<{
    pdfKey: string | null;
    htmlKey: string | null;
    signatureAnchors: any;
  }> {
    // Variables para PDF (solo si no es viaje interno)
    let pdfKey: string | null = null;
    let htmlKey: string | null = null;
    let pdfBuffer: Buffer | null = null;
    let signatureAnchors: any = null;

    // VIAJES INTERNACIONALES: Generar PDF + HTML
    if (!isInternalTrip) {
      // Inyectar el código de pago en el HTML del contrato
      const htmlWithPaymentRef = this.injectPaymentReferenceIntoHtml(
        contractHtml!,
        paymentReference
      );

      htmlKey = `${baseFolder}/contract.html`;
      await this.uploadToSpaces({
        objectKey: htmlKey,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from(htmlWithPaymentRef, "utf-8"),
      });

      const pdfResult = await this.pdfRenderService.renderContractToBuffer(htmlWithPaymentRef);
      pdfBuffer = pdfResult.pdfBuffer;
      signatureAnchors = pdfResult.signatureAnchors;
      pdfKey = `${baseFolder}/contract.pdf`;

      await this.uploadToSpaces({
        objectKey: pdfKey,
        contentType: "application/pdf",
        body: pdfBuffer,
      });
    }

    return {
      pdfKey,
      htmlKey,
      signatureAnchors,
    };
  }

  async processContractArchiveArtifactsForWorker(contract: {
    id: string;
    contractNumber: string;
    internalTripId: string | null;
    htmlObjectKey: string | null;
    paymentReference: string;
    payload: unknown;
  }): Promise<string> {
    const isInternalTrip = Boolean(contract.internalTripId?.trim());
    let contractHtml: string | undefined;
    let baseFolder = "";

    if (!isInternalTrip) {
      const persistedHtmlKey = contract.htmlObjectKey?.trim();
      const stagingSuffix = "/staging/contract.html";
      const finalSuffix = "/contract.html";
      if (!persistedHtmlKey) {
        throw new Error(
          `Staged contract HTML not found for contract ${contract.id}.`,
        );
      }

      if (persistedHtmlKey.endsWith(stagingSuffix)) {
        baseFolder = persistedHtmlKey.slice(0, -stagingSuffix.length);
      } else if (persistedHtmlKey.endsWith(finalSuffix)) {
        baseFolder = persistedHtmlKey.slice(0, -finalSuffix.length);
      } else {
        throw new Error(
          `Invalid contract HTML key for contract ${contract.id}.`,
        );
      }

      const stagedHtmlKey = `${baseFolder}${stagingSuffix}`;
      const htmlBuffer = await this.downloadObjectBuffer(stagedHtmlKey);
      contractHtml = htmlBuffer.toString("utf-8");
    }

    const {
      pdfKey,
      htmlKey,
      signatureAnchors,
    } = await this.processContractArchiveArtifacts(
      isInternalTrip,
      contractHtml,
      contract.paymentReference,
      baseFolder,
    );

    const payloadRecord =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, unknown>)
        : {};

    await (this.prisma as any).contract.update({
      where: { id: contract.id },
      data: {
        pdfObjectKey: pdfKey,
        pdfFileName: pdfKey ? `${contract.contractNumber}.pdf` : null,
        pdfMimeType: pdfKey ? "application/pdf" : null,
        htmlObjectKey: htmlKey,
        payload: {
          ...payloadRecord,
          signatureAnchors,
          signatureAnchor: signatureAnchors?.["client"] ?? null,
        },
      },
    });

    return baseFolder;
  }

  async processAdditionalArchiveDocumentsForWorker(
    contract: {
      contractNumber: string;
      internalTripId: string | null;
      payload: unknown;
      tenantId: string;
    },
    baseFolder: string,
  ): Promise<void> {
    const payloadRecord =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, unknown>)
        : {};

    await this.processAdditionalArchiveDocuments(
      Boolean(contract.internalTripId?.trim()),
      contract.contractNumber,
      payloadRecord,
      baseFolder,
      [],
      contract.tenantId,
    );
  }

  async registerContractCustomerDocumentsForWorker(contract: {
    clientId: string;
    tenantId: string;
    payload: unknown;
    documents: Array<{
      originalFileName: string;
      objectKey: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<void> {
    const payloadRecord =
      contract.payload &&
      typeof contract.payload === "object" &&
      !Array.isArray(contract.payload)
        ? (contract.payload as Record<string, unknown>)
        : {};
    const companions = Array.isArray(payloadRecord.companions)
      ? payloadRecord.companions
          .filter(
            (companion: any) =>
              companion &&
              String(companion.fullName || "").trim() &&
              String(companion.idNumber || "").trim(),
          )
          .map((companion: any) => ({
            id: String(companion.selectedCustomerId || "").trim(),
          }))
      : [];

    if (contract.documents.length > 0) {
      this.logger.log(
        `📄 Registering ${contract.documents.length} contract documents as customer documents...`,
      );
    }

    for (const doc of contract.documents) {
      const category = this.getCategoryFromFilename(doc.originalFileName);

      if (category === null) {
        this.logger.debug(
          `Skipping non-customer document: ${doc.originalFileName}`,
        );
        continue;
      }

      const customerId = this.getCustomerIdFromFilename(
        doc.originalFileName,
        contract.clientId,
        companions,
      );

      if (!customerId) {
        this.logger.debug(
          `Could not determine customer for document: ${doc.originalFileName}`,
        );
        continue;
      }

      await this.customerDocumentsService.registerExistingDocument(
        contract.tenantId,
        customerId,
        category,
        {
          originalFileName: doc.originalFileName,
          objectKey: doc.objectKey,
          mimeType: doc.mimeType,
          size: doc.size,
        },
      );

      this.logger.log(
        `✅ Registered: ${doc.originalFileName} → ${category} for customer ${customerId}`,
      );
    }
  }

  private async processAdditionalArchiveDocuments(
    isInternalTrip: boolean,
    contractNumber: string,
    payloadRecord: Record<string, unknown>,
    baseFolder: string,
    documents: ArchiveDocument[],
    tenantId: string,
  ): Promise<UploadedArchiveDocument[]> {
    const uploadedDocuments: UploadedArchiveDocument[] = [];

    // Generate additional documents (MINOR_ANNEX, etc.) for international trips
    if (!isInternalTrip) {
      await this.generateAdditionalDocuments(
        {
          id: contractNumber, // temporary ID for generation
          contractNumber,
          payload: payloadRecord,
        },
        baseFolder,
        uploadedDocuments,
        tenantId,
      );
    }

    for (let index = 0; index < documents.length; index += 1) {
      const doc = documents[index];
      if (!doc?.buffer?.length) {
        continue;
      }

      // Convertir imágenes a WebP automáticamente
      const processedDoc = await this.convertImageToWebP(doc);

      const safeName = this.sanitizeSegment(processedDoc.originalname || `document-${index + 1}`);
      const objectKey = `${baseFolder}/docs/${index + 1}-${safeName}`;
      await this.uploadToSpaces({
        objectKey,
        contentType: processedDoc.mimetype || "application/octet-stream",
        body: processedDoc.buffer,
      });

      uploadedDocuments.push({
        originalFileName: processedDoc.originalname || `document-${index + 1}`,
        objectKey,
        mimeType: processedDoc.mimetype || "application/octet-stream",
        size: processedDoc.size || processedDoc.buffer.length,
      });
    }

    return uploadedDocuments;
  }

  async saveContractDraft(
    user: { id: string; email: string; fullName: string; tenantId: string },
    dto: {
      id?: string;
      contractNumber: string;
      clientFullName?: string;
      clientIdNumber?: string;
      clientEmail?: string;
      clientPhone?: string;
      destination?: string;
      payloadJson: string;
    },
  ) {
    const contractNumber = String(dto.contractNumber || "").trim();
    if (!contractNumber) {
      throw new BadRequestException("Se requiere numero de contrato para guardar el borrador.");
    }

    const existingContract = await (this.prisma as any).contract.findUnique({
      where: { contractNumber },
      select: { id: true },
    });
    if (existingContract) {
      throw new BadRequestException("Ese numero ya fue usado en un contrato final y no puede guardarse como borrador.");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(dto.payloadJson);
    } catch {
      throw new BadRequestException("payloadJson no tiene un JSON valido.");
    }

    const normalized = {
      clientFullName: String(dto.clientFullName || "").trim() || null,
      clientIdNumber: String(dto.clientIdNumber || "").trim() || null,
      clientEmail: String(dto.clientEmail || "").trim().toLowerCase() || null,
      clientPhone: String(dto.clientPhone || "").trim() || null,
      destination: String(dto.destination || "").trim() || null,
    };

    const draftId = String(dto.id || "").trim();
    const existingByNumber = await (this.prisma as any).contractDraft.findUnique({
      where: { contractNumber },
    });

    let draft: any;
    if (draftId) {
      const found = await (this.prisma as any).contractDraft.findFirst({
        where: {
          id: draftId,
          generatedByUserId: user.id,
        },
      });

      if (!found) {
        throw new NotFoundException("Borrador no encontrado.");
      }

      if (existingByNumber && existingByNumber.id !== draftId) {
        throw new BadRequestException("Ya existe otro borrador con ese numero de contrato.");
      }

      draft = await (this.prisma as any).contractDraft.update({
        where: { id: draftId },
        data: {
          contractNumber,
          status: CONTRACT_STATUS_DRAFT,
          clientFullName: normalized.clientFullName,
          clientIdNumber: normalized.clientIdNumber,
          clientEmail: normalized.clientEmail,
          clientPhone: normalized.clientPhone,
          destination: normalized.destination,
          payload: payload as any,
        },
      });
    } else if (existingByNumber) {
      if (existingByNumber.generatedByUserId !== user.id) {
        throw new BadRequestException("Ese numero de contrato pertenece a un borrador de otro agente.");
      }

      draft = await (this.prisma as any).contractDraft.update({
        where: { id: existingByNumber.id },
        data: {
          status: CONTRACT_STATUS_DRAFT,
          clientFullName: normalized.clientFullName,
          clientIdNumber: normalized.clientIdNumber,
          clientEmail: normalized.clientEmail,
          clientPhone: normalized.clientPhone,
          destination: normalized.destination,
          payload: payload as any,
        },
      });
    } else {
      draft = await (this.prisma as any).contractDraft.create({
        data: {
          contractNumber,
          status: CONTRACT_STATUS_DRAFT,
          clientFullName: normalized.clientFullName,
          clientIdNumber: normalized.clientIdNumber,
          clientEmail: normalized.clientEmail,
          clientPhone: normalized.clientPhone,
          destination: normalized.destination,
          payload: payload as any,
          generatedByUserId: user.id,
          generatedByEmail: user.email,
          generatedByName: user.fullName,
          tenantId: user.tenantId,
        },
      });
    }

    return {
      id: draft.id,
      contractNumber: draft.contractNumber,
      status: draft.status || CONTRACT_STATUS_DRAFT,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
    };
  }

  async getContractDraft(
    user: { id: string; email: string; fullName: string; tenantId: string },
    draftId: string,
  ) {
    const normalizedId = String(draftId || "").trim();
    if (!normalizedId) {
      throw new BadRequestException("Se requiere el id del borrador.");
    }

    const draft = await (this.prisma as any).contractDraft.findFirst({
      where: {
        id: normalizedId,
        tenantId: user.tenantId, // 🔒 SEGURIDAD: Validar tenant
        generatedByUserId: user.id,
      },
    });

    if (!draft) {
      throw new NotFoundException("Borrador no encontrado.");
    }

    return {
      id: draft.id,
      contractNumber: draft.contractNumber,
      status: draft.status || CONTRACT_STATUS_DRAFT,
      payload: draft.payload,
      updatedAt: draft.updatedAt,
      createdAt: draft.createdAt,
    };
  }

  async deleteContractDraft(
    user: { id: string; email: string; fullName: string },
    draftId: string,
  ) {
    const normalizedId = String(draftId || "").trim();
    if (!normalizedId) {
      throw new BadRequestException("Se requiere el id del borrador.");
    }

    const deleted = await (this.prisma as any).contractDraft.deleteMany({
      where: {
        id: normalizedId,
        generatedByUserId: user.id,
      },
    });

    if (!deleted.count) {
      throw new NotFoundException("Borrador no encontrado.");
    }

    return { ok: true, id: normalizedId };
  }

  async finalizeContractSignatureByToken(
    token: string,
    signedByName: string,
    signatureImageBase64: string,
    signedClientIp: string | null,
    signedUserAgent: string | null,
  ) {
    const parsed = this.parseSigningToken(token, signedClientIp);
    if (!signatureImageBase64?.trim()) {
      throw new BadRequestException("Se requiere la imagen de la firma en base64.");
    }

    // SHA-256 of the raw token — stored in ContractUsedToken for atomic replay guard
    const tokenHash = this.documentSigningService.generateTokenHash(token);

    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: parsed.contractId },
      include: { client: true },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    

    // Determine which document is being signed
    let targetDoc: any;
    let documentType: string;
    let documentKey: string;

    if (parsed.documentSigningId) {
      // NEW: Use documentSigningId from token (multi-document sessions)
      targetDoc = await (this.prisma as any).documentSigning.findUnique({
        where: { id: parsed.documentSigningId },
      });

      if (!targetDoc) {
        throw new NotFoundException("Documento de firma no encontrado.");
      }

      documentType = targetDoc.documentType;
      documentKey = targetDoc.documentKey;

      this.logger.log(
        `[finalize-signature] Using documentSigningId=${parsed.documentSigningId} from token`,
      );
    } else {
      // LEGACY: Determine document based on signerKey
      const docResult = await this.getDocumentSigningForSigner(contract.id, parsed.signerKey);
      if (!docResult) {
        throw new NotFoundException("No se encontro el documento para este firmante.");
      }

      targetDoc = docResult.document;
      documentType = docResult.documentType;
      documentKey = docResult.documentKey;

      this.logger.log(
        `[finalize-signature] Using legacy signerKey lookup signerKey=${parsed.signerKey}`,
      );
    }

    // Validate signing session not already completed using DocumentSigningSession framework
    const isSessionCompleted = await this.documentSigningSessionService.isSigningSessionCompleted(contract.id);
    if (isSessionCompleted && targetDoc?.signedPdfObjectKey) {
      throw new BadRequestException("Este documento ya fue marcado como firmado.");
    }

    const participants = this.getSigningParticipantsFromPlan(contract);
    const signer = participants.find((item) => item.signerKey === parsed.signerKey) || participants[0];
    if (!signer) {
      throw new BadRequestException("No se pudo resolver el firmante de este enlace.");
    }

    // Check if signer already completed their signature using DocumentSigner
    const existingSigner = await (this.prisma as any).documentSigner.findFirst({
      where: {
        documentSigningId: targetDoc.id,
        signerKey: parsed.signerKey,
        status: {
          in: ["SIGNED", "COMPLETED"],
        },
      },
    });

    if (existingSigner) {
      throw new BadRequestException("Este firmante ya completo su firma.");
    }

    // Guard 2: DB-level atomic replay check — unique constraint on tokenHash
    // prevents two concurrent requests from both succeeding
    await this.documentSigningAuditService.ensureTokenNotUsed(tokenHash);

    // Read pdfObjectKey from DocumentSigning
    const pdfKeyPattern = documentType === "CONTRACT" ? /\/contract\.pdf$/i : new RegExp(`/${documentKey}\\.pdf$`, "i");
    const keyRoot = String(targetDoc?.pdfObjectKey || "").replace(pdfKeyPattern, "");
    
    // Fallback con estructura nueva (ambiente/tenant/...)
    let fallbackKeyRoot = `contracts/signed/${this.sanitizeSegment(contract.contractNumber)}`;
    if (contract.tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: contract.tenantId },
        select: { subdomain: true },
      });
      const tenantSubdomain = tenant?.subdomain || 'unknown';
      const appEnv = this.configService.get<string>('APP_ENV', 'dev');
      fallbackKeyRoot = `${appEnv}/${tenantSubdomain}/contracts/signed/${this.sanitizeSegment(contract.contractNumber)}`;
    }
    
    const baseFolder = keyRoot || fallbackKeyRoot;

    // Extract existing signature images from payload
    const payload = this.documentSigningService.getPayloadRecord(contract.payload);
    const existingSignatureImages =
      payload.signatureImagesBySigner &&
      typeof payload.signatureImagesBySigner === "object" &&
      !Array.isArray(payload.signatureImagesBySigner)
        ? (payload.signatureImagesBySigner as Record<string, string>)
        : {};

    // Download document HTML source
    if (!targetDoc?.htmlObjectKey) {
      throw new InternalServerErrorException("El documento no tiene HTML fuente para regenerar PDF firmado.");
    }
    const documentHtmlBuffer = await this.downloadObjectBuffer(targetDoc.htmlObjectKey);
    const documentHtml = documentHtmlBuffer.toString("utf8");

    // Generate all signature finalization artifacts
    const finalizationResult = await this.documentSignatureFinalizationService.finalizeSignature({
      contractHtml: documentHtml,
      documentType,
      signatureImageBase64,
      signerKey: signer.signerKey,
      existingSignatureImages,
    });

    // Upload signed PDF with document-specific naming
    const signedPdfName = documentType === "CONTRACT" ? "contract-signed.pdf" : `${documentKey}-signed.pdf`;
    const signedObjectKey = `${baseFolder}/signed/${signedPdfName}`;
    await this.uploadToSpaces({
      objectKey: signedObjectKey,
      contentType: "application/pdf",
      body: finalizationResult.signedPdfBuffer,
    });

    // Upload signature image
    const sigPngKey = `${baseFolder}/signatures/${finalizationResult.signatureImageFilename}`;
    await this.uploadToSpaces({
      objectKey: sigPngKey,
      contentType: finalizationResult.signatureImageMimeType,
      body: finalizationResult.signatureImageBuffer,
    });

    // Persist signed artifacts to DocumentSigning
    const signedPdfFileName = documentType === "CONTRACT" 
      ? `${contract.contractNumber}-signed.pdf`
      : `${contract.contractNumber}-${documentKey}-signed.pdf`;
    await (this.prisma as any).documentSigning.update({
      where: { id: targetDoc.id },
      data: {
        signedPdfObjectKey: signedObjectKey,
        signedPdfFileName,
        signedPdfMimeType: "application/pdf",
        signedPdfSize: finalizationResult.signedPdfBuffer.length,
        signaturePngObjectKey: sigPngKey,
      },
    });
    this.logger.log(
      `[signing] ${documentType} signed artifacts persisted docSigningId=${targetDoc.id} signedPdfKey=${signedObjectKey}`,
    );

    const now = new Date();
    const signerName = String(signer.name || signedByName || "").trim();

    // Update contract payload with signing event (backward compatibility)
    const signedParticipants = Array.isArray(payload.signedParticipants)
      ? payload.signedParticipants.filter((item: any) => item && typeof item === "object")
      : [];

    const nextSignedParticipants = [
      ...signedParticipants,
      {
        signerKey: signer.signerKey,
        signerRole: signer.role,
        signerName,
        signedAt: now.toISOString(),
        signedClientIp: signedClientIp || null,
        signedUserAgent: signedUserAgent || null,
      },
    ];

    // Synchronize signer completion with new persistence layer
    await this.documentSigningSessionService.recordSignerCompletion(
      contract.id,
      signer.signerKey,
      now,
      targetDoc.id, // Pass specific document ID
    );

    // Calculate signing progress using DocumentSigningSessionService
    const signingPlan = this.contractSigningSessionBuilder.buildFromContract(contract);
    const completedSignerKeys = nextSignedParticipants
      .map((item: any) => String(item?.signerKey || ""))
      .filter(Boolean);
    const progress = await this.documentSigningSessionService.calculateSigningProgress(
      signingPlan,
      completedSignerKeys,
    );

    // Synchronize document completion status
    await this.documentSigningSessionService.completeDocumentSigning(contract.id);

    // Synchronize session completion status
    await this.documentSigningSessionService.completeSigningSession(contract.id);

    // Evaluate package completion
    const sessionCompleted = await this.documentPackageService.documentCompleted(contract.id);

    // Atomic DB write: mark token spent + record evidence + update contract
    const auditOps = this.documentSigningAuditService.buildAuditOperations(
      {
        documentId: contract.id,
        tokenHash,
        signerKey: signer.signerKey,
        usedAt: now,
      },
      {
        documentId: contract.id,
        signerKey: signer.signerKey,
        signerRole: signer.role,
        signerName,
        signedAt: now,
        signedClientIp: signedClientIp || null,
        signedUserAgent: signedUserAgent || null,
        signaturePngKey: sigPngKey,
        signedPdfKey: signedObjectKey,
        signedPdfBytes: finalizationResult.signedPdfBuffer.length,
        signedPdfSha256: finalizationResult.signedPdfHash,
        tokenHash,
      },
    );

    const [, , updated] = await (this.prisma as any).$transaction([
      ...auditOps,
      // Update contract record
      (this.prisma as any).contract.update({
        where: { id: contract.id },
        data: {
          status: sessionCompleted ? CONTRACT_STATUS_SIGNED : (contract.status || CONTRACT_STATUS_PENDING_SIGNATURE),
          signedByName: signerName,
          signedAt: now,
          signedClientIp,
          signedUserAgent,
          payload: {
            ...payload,
            signedParticipants: nextSignedParticipants,
            signatureImagesBySigner: finalizationResult.nextSignatureImages,
          },
        },
      }),
    ]);

    this.logger.log(
      `[signing] Signature recorded contractId=${contract.id} signerKey=${signer.signerKey} ` +
      `allCompleted=${sessionCompleted} ip=${signedClientIp || "unknown"} sha256=${finalizationResult.signedPdfHash.slice(0, 16)}…`,
    );

    if (sessionCompleted) {
      const completedSession =
        await (this.prisma as any).documentSigningSession.findFirst({
          where: {
            contractId: contract.id,
            status: { in: ["SIGNED", "COMPLETED"] },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            tenantId: true,
            completedAt: true,
          },
        });

      if (!completedSession) {
        throw new InternalServerErrorException(
          "No se encontro la sesion de firma completada.",
        );
      }

      const correlationId = `package-completed-${completedSession.id}`;
      await this.packageCompletedDispatcher.dispatch({
        contractId: contract.id,
        documentSigningSessionId: completedSession.id,
        tenantId: completedSession.tenantId,
        correlationId,
        actorUserId: String(contract.generatedByUserId || "system"),
        completedAt: (
          completedSession.completedAt || now
        ).toISOString(),
        eventVersion: PACKAGE_COMPLETED_EVENT_VERSION,
      });
    }

    // Post-signing Billing and Delivery are handled by PackageCompletedWorker.
    let billingInvoiceAutoEmail: {
      ok: boolean;
      alreadySent?: boolean;
      sentToEmail?: string | null;
      invoiceNumber?: string;
      error?: string;
    } | null = null;

    return {
      id: updated.id,
      contractNumber: updated.contractNumber,
      status: updated.status,
      signedAt: updated.signedAt,
      signerName,
      signerRole: signer.role,
      signedCount: progress.signedCount,
      totalSigners: progress.totalSigners,
      pendingSigners: participants
        .filter((item) => progress.pendingSignerKeys.includes(item.signerKey))
        .map((item) => ({
          signerKey: item.signerKey,
          signerName: item.name,
          signerRole: item.role,
          signerEmail: item.email,
        })),
      billingInvoiceAutoEmail: null,
    };
  }

  async markContractViewed(token: string, callerIp?: string | null) {
    const parsed = this.parseSigningToken(token, callerIp);
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: parsed.contractId },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    const currentStatus = String(contract.status || "").toUpperCase();
    if (currentStatus === CONTRACT_STATUS_SIGNED) {
      return { ok: true, status: contract.status };
    }

    const updated = await (this.prisma as any).contract.update({
      where: { id: contract.id },
      data: {
        status: CONTRACT_STATUS_VIEWED,
        viewedAt: contract.viewedAt ?? new Date(),
      },
    });

    return { ok: true, status: updated.status };
  }

  async getPublicSigningSession(token: string, callerIp?: string | null) {
    const parsed = this.parseSigningToken(token, callerIp);
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: parsed.contractId },
      include: {
        client: true,
      },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    if (String(contract.status || "").toUpperCase() === CONTRACT_STATUS_SIGNED) {
      throw new BadRequestException("Este contrato ya esta cerrado o firmado.");
    }

    // If token includes documentSigningId, use it directly (multi-document sessions)
    // Otherwise, fall back to legacy signerKey-based lookup
    let targetDoc: any;
    let documentType: string;
    let documentKey: string;

    if (parsed.documentSigningId) {
      // NEW: Direct lookup using documentSigningId from token
      targetDoc = await (this.prisma as any).documentSigning.findUnique({
        where: { id: parsed.documentSigningId },
      });

      if (!targetDoc) {
        throw new NotFoundException(
          "No se encontro el documento especificado en el token.",
        );
      }

      documentType = targetDoc.documentType;
      documentKey = targetDoc.documentKey;

      this.logger.log(
        `[signing-session] Using documentSigningId=${parsed.documentSigningId} from token documentType=${documentType}`,
      );
    } else {
      // LEGACY: Determine which document this signer is signing based on signerKey
      const docResult = await this.getDocumentSigningForSigner(
        contract.id,
        parsed.signerKey,
      );
      if (!docResult) {
        throw new NotFoundException("No se encontro el documento para este firmante.");
      }

      targetDoc = docResult.document;
      documentType = docResult.documentType;
      documentKey = docResult.documentKey;

      this.logger.log(
        `[signing-session] Using legacy signerKey lookup signerKey=${parsed.signerKey} documentType=${documentType}`,
      );
    }
    const basePdfUrl = targetDoc?.pdfObjectKey 
      ? await this.buildSignedObjectUrl(targetDoc.pdfObjectKey, 1200)
      : null;
    const signedPdfUrl = targetDoc?.signedPdfObjectKey
      ? await this.buildSignedObjectUrl(targetDoc.signedPdfObjectKey, 1200)
      : null;
    const payload = this.documentSigningService.getPayloadRecord(contract.payload);
    const participants = this.getSigningParticipantsFromPlan(contract);
    const tokenSigner = participants.find((item) => item.signerKey === parsed.signerKey);
    const resolvedSigner =
      tokenSigner ||
      participants.find((item) => item.role === parsed.signerRole && item.name === parsed.signerName) ||
      participants.find((item) => item.signerKey === "client") ||
      participants[0];

    if (!resolvedSigner) {
      throw new BadRequestException("No se pudo resolver el firmante para este enlace.");
    }

    const rawSignatureAnchor = this.documentSigningService.getSignatureAnchorForSigner(payload, resolvedSigner.signerKey);
    const signatureAnchorCandidate =
      rawSignatureAnchor &&
      typeof rawSignatureAnchor === "object" &&
      !Array.isArray(rawSignatureAnchor) &&
      typeof rawSignatureAnchor.pageIndex === "number" &&
      rawSignatureAnchor.box &&
      typeof rawSignatureAnchor.box === "object"
        ? {
            pageIndex: Number(rawSignatureAnchor.pageIndex),
            box: {
              x: Number(rawSignatureAnchor.box.x),
              y: Number(rawSignatureAnchor.box.y),
              width: Number(rawSignatureAnchor.box.width),
              height: Number(rawSignatureAnchor.box.height),
            },
          }
        : null;
    const signatureAnchor =
      signatureAnchorCandidate &&
      Number.isFinite(signatureAnchorCandidate.pageIndex) &&
      Number.isFinite(signatureAnchorCandidate.box.x) &&
      Number.isFinite(signatureAnchorCandidate.box.y) &&
      Number.isFinite(signatureAnchorCandidate.box.width) &&
      Number.isFinite(signatureAnchorCandidate.box.height) &&
      signatureAnchorCandidate.pageIndex >= 0 &&
      signatureAnchorCandidate.box.width > 0 &&
      signatureAnchorCandidate.box.height > 0
        ? signatureAnchorCandidate
        : null;

    // Read htmlObjectKey from DocumentSigning
    const documentHtmlUrl = targetDoc?.htmlObjectKey
      ? await this.buildSignedObjectUrl(targetDoc.htmlObjectKey, 1200)
      : null;

    this.logger.log(`[signing-session] Contract ${contract.contractNumber} signerKey=${resolvedSigner.signerKey} documentType=${documentType} status=${contract.status}`);

    return {
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      destination: contract.destination,
      clientName: contract.client?.fullName || "",
      signerName: resolvedSigner.name,
      signerRole: resolvedSigner.role,
      signerKey: resolvedSigner.signerKey,
      status: contract.status || CONTRACT_STATUS_PENDING_SIGNATURE,
      pdfUrl: basePdfUrl,
      signedPdfUrl,
      signatureAnchor,
      contractHtmlUrl: documentHtmlUrl,
      documentType,
      expiresAt: parsed.expiresAt,
    };
  }

  async searchContracts(_user: { id: string; email: string; fullName: string; tenantId: string }, query: SearchContractsDto) {
    return this.findContractsForHistory(_user, query, false);
  }

  async getContractHistory(
    user: { id: string; email: string; fullName: string; tenantId: string },
    query: SearchContractsDto,
  ) {
    return this.findContractsForHistory(user, query, true);
  }

  private async findContractsForHistory(
    _user: { id: string; email: string; fullName: string; tenantId: string },
    query: SearchContractsDto,
    useHistoryProjection: boolean,
  ) {
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(query.limit || 20, 1), 100);
    const status = String(query.status || "").trim().toUpperCase();
    const datePreset = String(query.datePreset || "").trim();
    const dateFrom = String(query.dateFrom || "").trim();
    const dateTo = String(query.dateTo || "").trim();

    // Calcular rango de fechas según preset
    let dateRangeFilter: any = undefined;
    if (datePreset) {
      const now = new Date();
      const presetMap: Record<string, number> = {
        "7days": 7,
        "1week": 7,
        "2weeks": 14,
        "1month": 30,
        "3months": 90,
      };
      const days = presetMap[datePreset];
      if (days) {
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - days);
        dateRangeFilter = {
          createdAt: {
            gte: startDate,
            lte: now,
          },
        };
      }
    } else if (dateFrom || dateTo) {
      // Rango personalizado
      dateRangeFilter = { createdAt: {} };
      if (dateFrom) {
        dateRangeFilter.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // Incluir todo el día
        dateRangeFilter.createdAt.lte = endDate;
      }
    }

    const textFilter = q
      ? {
          OR: [
            { contractNumber: { contains: q, mode: "insensitive" as const } },
            { client: { is: { fullName: { contains: q, mode: "insensitive" as const } } } },
            { client: { is: { idNumber: { contains: q, mode: "insensitive" as const } } } },
            { client: { is: { email: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {};

    // Filtro de status para contratos
    const statusFilter = status ? { status: { equals: status } } : {};

    const where = {
      tenantId: _user.tenantId, // 🔒 SEGURIDAD: Filtrar por tenant
      ...textFilter,
      ...statusFilter,
      ...dateRangeFilter,
    };

    const items = await (this.prisma as any).contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(useHistoryProjection
        ? {
            select: {
              id: true,
              contractNumber: true,
              paymentReference: true,
              status: true,
              source: true,
              travelPackageId: true,
              internalTripId: true,
              destination: true,
              generatedByName: true,
              createdAt: true,
              payload: true,
              client: {
                select: {
                  fullName: true,
                  idNumber: true,
                  email: true,
                  phone: true,
                },
              },
              _count: {
                select: {
                  documents: true,
                },
              },
              signingSessions: {
                take: 1,
                select: {
                  documents: {
                    select: {
                      id: true,
                      documentKey: true,
                      documentType: true,
                      status: true,
                      signers: {
                        select: {
                          status: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          }
        : {
            include: {
              client: true,
              documents: {
                select: {
                  id: true,
                },
              },
            },
          }
      ),
    });

    // Filtros para drafts
    const draftTextFilter = q
      ? {
          tenantId: _user.tenantId, // 🔒 SEGURIDAD: Filtrar por tenant
          generatedByUserId: _user.id,
          OR: [
            { contractNumber: { contains: q, mode: "insensitive" as const } },
            { clientFullName: { contains: q, mode: "insensitive" as const } },
            { clientIdNumber: { contains: q, mode: "insensitive" as const } },
            { clientEmail: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : { tenantId: _user.tenantId, generatedByUserId: _user.id };

    const draftWhere = {
      ...draftTextFilter,
      ...dateRangeFilter,
    };

    // Solo incluir drafts si no hay filtro de status o si el status es DRAFT
    const drafts =
      !status || status === CONTRACT_STATUS_DRAFT
        ? await (this.prisma as any).contractDraft.findMany({
            where: draftWhere,
            orderBy: { createdAt: "desc" },
            take: limit,
            ...(useHistoryProjection
              ? {
                  select: {
                    id: true,
                    contractNumber: true,
                    source: true,
                    clientFullName: true,
                    clientIdNumber: true,
                    clientEmail: true,
                    clientPhone: true,
                    destination: true,
                    generatedByName: true,
                    createdAt: true,
                  },
                }
              : {}),
          })
        : [];

    const contractRows = items.map((item: any) =>
      HistoryContractItemDto.fromContract(
        item,
        this.documentSigningService.getPayloadRecord(item.payload),
        CONTRACT_STATUS_PENDING_SIGNATURE,
      ),
    );

    const draftRows = drafts.map((draft: any) =>
      HistoryContractItemDto.fromDraft(draft, CONTRACT_STATUS_DRAFT),
    );

    const merged = [...draftRows, ...contractRows]
      .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime())
      .slice(0, limit);

    return {
      items: merged,
    };
  }

  async getContractFiles(
    _user: { id: string; email: string; fullName: string; tenantId: string },
    contractId: string,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: { documents: true },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    // 🔒 SEGURIDAD: Validar que el contrato pertenece al tenant del usuario
    if (contract.tenantId !== _user.tenantId) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    // Read artifact keys from DocumentSigning (Story 3)
    const contractDoc = await this.getContractDocumentSigning(contract.id);
    const pdfUrl = contractDoc?.pdfObjectKey 
      ? await this.buildSignedObjectUrl(contractDoc.pdfObjectKey)
      : null;
    const signedPdfUrl = contractDoc?.signedPdfObjectKey
      ? await this.buildSignedObjectUrl(contractDoc.signedPdfObjectKey)
      : null;
    const documents = await Promise.all(
      contract.documents.map(async (doc: any) => ({
        id: doc.id,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        size: doc.size,
        url: doc.objectKey ? await this.buildSignedObjectUrl(doc.objectKey) : null,
      })),
    );

    // Get ALL documents in the signing package (CONTRACT, MINOR_ANNEX, LIABILITY_WAIVER)
    const session = await (this.prisma as any).documentSigningSession.findFirst({
      where: { contractId: contract.id },
      include: {
        documents: {
          include: {
            signers: true,
          },
        },
      },
    });

    const packageDocuments = session?.documents
      ? await Promise.all(
          session.documents.map(async (doc: any) => {
            const pdfUrl = doc.pdfObjectKey ? await this.buildSignedObjectUrl(doc.pdfObjectKey) : null;
            const signedPdfUrl = doc.signedPdfObjectKey ? await this.buildSignedObjectUrl(doc.signedPdfObjectKey) : null;
            
            const totalSigners = doc.signers.length;
            const signedCount = doc.signers.filter((s: any) => s.status === 'SIGNED').length;
            
            return {
              id: doc.id,
              documentKey: doc.documentKey,
              documentType: doc.documentType,
              status: doc.status,
              signedCount,
              totalSigners,
              pdfFileName: doc.pdfFileName,
              pdfUrl,
              signedPdfFileName: doc.signedPdfFileName,
              signedPdfUrl,
            };
          }),
        )
      : [];

    return {
      id: contract.id,
      contractNumber: contract.contractNumber,
      paymentReference: contract.paymentReference || null,
      status: contract.status || CONTRACT_STATUS_PENDING_SIGNATURE,
      pdf: {
        fileName: contractDoc?.pdfFileName,
        mimeType: contractDoc?.pdfMimeType,
        size: contractDoc?.pdfSize,
        url: pdfUrl,
      },
      signedPdf: signedPdfUrl
        ? {
            fileName: contractDoc?.signedPdfFileName || `${contract.contractNumber}-signed.pdf`,
            mimeType: contractDoc?.signedPdfMimeType || "application/pdf",
            size: contractDoc?.signedPdfSize || 0,
            url: signedPdfUrl,
            signedByName: contract.signedByName || null,
            signedAt: contract.signedAt || null,
          }
        : null,
      documents,
      packageDocuments, // Nuevo: todos los documentos del paquete con estado
    };
  }

  async sendContractToBillingSystem(
    _user: { id: string; email: string; fullName: string },
    contractId: string,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    if (contract.status !== CONTRACT_STATUS_SIGNED) {
      throw new BadRequestException("Solo se pueden enviar contratos firmados a facturación.");
    }

    // Preparar los datos completos del contrato para enviar a facturación
    const payload = contract.payload || {};
    const toNumber = (value: unknown, fallback = 0) => {
      const parsed = Number.parseFloat(String(value ?? "").trim());
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const toStringOrNull = (value: unknown) => {
      const text = String(value ?? "").trim();
      return text ? text : null;
    };
    const itineraryItemsRaw = Array.isArray(payload?.itineraryItems)
      ? payload.itineraryItems
      : Array.isArray(payload?.itinerary)
        ? payload.itinerary
        : [];
    
    const billingData = {
      // Información del sistema
      sourceSystem: "contratos-system",
      sourceSystemVersion: "1.0",
      
      // Información del contrato
      contract: {
        id: contract.id,
        number: contract.contractNumber,
        status: contract.status,
        destination: contract.destination,
        createdAt: contract.createdAt,
        signedAt: contract.signedAt,
        generatedByUserId: contract.generatedByUserId,
        generatedByEmail: contract.generatedByEmail,
        generatedByName: contract.generatedByName,
      },
      
      // Información del cliente
      client: {
        id: contract.client.id,
        fullName: contract.client.fullName,
        idNumber: contract.client.idNumber,
        idType: payload?.clientIdType || "CEDULA",
        email: contract.client.email,
        phone: contract.client.phone,
        address: payload?.clientAddress || null,
        nationality: payload?.clientNationality || null,
        civilStatus: payload?.civilStatus || null,
        profession: payload?.profession || null,
        emergencyContactName: contract.client.emergencyContactName,
        emergencyContactPhone: contract.client.emergencyContactPhone,
      },
      
      // Información de montos
      billing: {
        totalAmount: toNumber(payload?.totalAmount, 0),
        reservationAmount: toNumber(payload?.reservationAmount, 0),
        balanceAmount: toNumber(payload?.balanceAmount, 0),
        installmentCount: Math.max(1, Math.trunc(toNumber(payload?.installmentCount, 1))),
        monthlyInstallmentAmount: toNumber(payload?.monthlyInstallmentAmount, 0),
        paymentDueDate: toStringOrNull(payload?.paymentDueDate),
        currency: "CRC",
      },
      
      // Información del viaje
      travel: {
        destination: contract.destination,
        issuedAt: contract.issuedAt,
        startDate: contract.startDate,
        endDate: contract.endDate,
        accommodationType: payload?.accommodationType || null,
        lodgingType: payload?.lodgingType || null,
      },
      
      // Acompañantes
      companions: Array.isArray(payload?.companions) 
        ? payload.companions.map((p: any) => ({
            fullName: p.fullName,
            idNumber: p.idNumber,
            idType: p.idType,
            email: p.email,
            phone: p.phone,
            address: p.address,
            civilStatus: p.civilStatus,
            profession: p.profession,
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
          }))
        : [],
      
      // Menores de edad
      minors: Array.isArray(payload?.minors)
        ? payload.minors.map((m: any) => ({
            name: m.name || m.minorName || null,
            idNumber: m.idNumber || m.minorId || null,
            tutorName: m.tutorName || null,
            tutorIdNumber: m.tutorIdNumber || m.tutorId || null,
            tutorRelationship: m.tutorRelationship || null,
            tutorEmail: m.tutorEmail || null,
            tutorPhone: m.tutorPhone || null,
            travelingWith: m.travelingWith || null,
          }))
        : [],
      
      // Itinerario
      itinerary: itineraryItemsRaw
        ? itineraryItemsRaw.map((item: any) => ({
            date: item.date,
            detail: item.detail,
          }))
        : [],
      
      // Metadata
      generatedAt: new Date().toISOString(),
      agent: {
        id: _user.id,
        name: _user.fullName,
        email: _user.email,
      },
    };

    return billingData;
  }
}
