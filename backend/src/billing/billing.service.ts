import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFile } from "fs/promises";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { SendEmailOptions } from "../email/interfaces/email-options.interface";
import {
  BILLING_FINANCIAL_EMAIL_JOB_NAMES,
  BILLING_FINANCIAL_EMAIL_JOB_OPTIONS,
  BillingFinancialEmailJobName,
  BillingFinancialEmailJobPayload,
} from "../email/jobs";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { formatDateForClient, formatDateTimeForClient } from "../common/request-context";
import {
  RECEIPT_PROCESSING_JOB_NAME,
  RECEIPT_PROCESSING_JOB_OPTIONS,
} from "./jobs/receipt-processing-job.constants";
import type { ReceiptProcessingJobPayload } from "./jobs/receipt-processing-job.types";
import { ContractReservationApprovalService } from "../contracts/contract-reservation-approval.service";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jobDispatcher: JobDispatcherService,
    private readonly contractReservationApprovals: ContractReservationApprovalService,
    private readonly storageService: StorageService,
  ) {}

  private toNumber(value: unknown, fallback = 0): number {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toDecimalString(value: number): string {
    return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
  }

  private formatCurrency(value: unknown): string {
    return `USD ${this.toNumber(value).toFixed(2)}`;
  }

  private formatDateTime(value: Date | string | null | undefined): string {
    return formatDateTimeForClient(value, "es-CR");
  }

  private formatDate(value: Date | string | null | undefined): string {
    return formatDateForClient(value, "es-CR");
  }

  private toShortText(value: unknown, max = 88): string {
    const raw = String(value ?? "-").trim();
    if (!raw) return "-";
    return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
  }

  private async loadCompanyLogo(tenant?: { logoUrl: string | null } | null): Promise<{ bytes: Buffer; format: "png" | "jpg" } | null> {
    // Prioridad 1: Usar logoUrl del tenant si está disponible
    const logoUrl = tenant?.logoUrl || this.configService.get<string>("COMPANY_LOGO_URL", "").trim();
    if (logoUrl) {
      try {
        const response = await fetch(logoUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const bytes = Buffer.from(arrayBuffer);
          const lower = logoUrl.toLowerCase();
          
          // Detectar formato basado en extensión (PNG o JPG, sin conversión)
          const format: "png" | "jpg" =
            lower.includes('.jpg') || lower.includes('.jpeg') ? "jpg" : "png";
          return { bytes, format };
        } else {
          this.logger.warn(`[loadCompanyLogo] Error HTTP ${response.status} al descargar logo desde: ${logoUrl}`);
        }
      } catch (error) {
        this.logger.warn(`[loadCompanyLogo] No se pudo descargar logo desde URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Fallback: Buscar archivo local (solo para desarrollo sin .env configurado)
    const configuredPath = this.configService.get<string>("COMPANY_LOGO_PATH", "").trim();
    const fileCandidates = [configuredPath].filter(Boolean);

    for (const candidate of fileCandidates) {
      try {
        const bytes = await readFile(candidate);
        const lower = candidate.toLowerCase();
        const format: "png" | "jpg" =
          lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg" : "png";
        return { bytes, format };
      } catch {
        // Try next path candidate.
      }
    }

    return null;
  }

  private toDateOrNull(value: unknown): Date | null {
    const text = String(value || "").trim();
    if (!text) return null;
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private computeOverdueDays(paymentDueDate: Date | null | undefined, now = new Date()): number {
    if (!paymentDueDate) return 0;
    const diffMs = now.getTime() - new Date(paymentDueDate).getTime();
    return diffMs > 0 ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;
  }

  private getCompanyProfile(contract: any) {
    const payload = contract?.payload && typeof contract.payload === "object" ? contract.payload : {};
    const tenant = contract?.tenant && typeof contract.tenant === "object" ? contract.tenant : {};
    const payloadTenantInfo =
      (payload as any)?.tenantLegalInfo && typeof (payload as any).tenantLegalInfo === "object"
        ? (payload as any).tenantLegalInfo
        : {};
    const legalName =
      String((tenant as any)?.legalName || "").trim() ||
      String((payloadTenantInfo as any)?.legalName || "").trim() ||
      this.configService.get<string>("COMPANY_LEGAL_NAME", "").trim() ||
      "RAZON SOCIAL NO CONFIGURADA";
    const commercialName =
      String((tenant as any)?.name || "").trim() ||
      String((payloadTenantInfo as any)?.name || "").trim() ||
      this.configService.get<string>("COMPANY_COMMERCIAL_NAME", "").trim() ||
      "Agencia de Viajes";
    const legalId =
      String((tenant as any)?.legalId || "").trim() ||
      String((payloadTenantInfo as any)?.legalId || "").trim() ||
      this.configService.get<string>("COMPANY_LEGAL_ID", "").trim() ||
      "NO CONFIGURADO";
    const companyEmail =
      String((tenant as any)?.contactEmail || "").trim() ||
      String((tenant as any)?.fromEmail || "").trim() ||
      String((payloadTenantInfo as any)?.contactEmail || "").trim() ||
      this.configService.get<string>("COMPANY_BILLING_EMAIL", "").trim() ||
      "sin-correo@empresa.local";
    const companyContactNumber =
      String((tenant as any)?.contactWhatsApp || "").trim() ||
      String((tenant as any)?.contactPhone || "").trim() ||
      String((payloadTenantInfo as any)?.contactWhatsApp || "").trim() ||
      String((payloadTenantInfo as any)?.contactPhone || "").trim() ||
      this.configService.get<string>("COMPANY_CONTACT_NUMBER", "").trim() ||
      this.configService.get<string>("COMPANY_CONTACT", "").trim() ||
      companyEmail;
    const companyPhones =
      String((tenant as any)?.contactPhone || "").trim() ||
      String((tenant as any)?.contactWhatsApp || "").trim() ||
      String((payloadTenantInfo as any)?.contactPhone || "").trim() ||
      String((payloadTenantInfo as any)?.contactWhatsApp || "").trim() ||
      this.configService.get<string>("COMPANY_PHONE_NUMBERS", "").trim() ||
      this.configService.get<string>("COMPANY_PHONES", "").trim() ||
      "-";

    return {
      legalName,
      commercialName,
      legalId,
      companyEmail,
      companyContactNumber,
      companyPhones,
      representativeName:
        String(contract?.generatedByName || (payload as any)?.generatedByAgentName || "-").trim() || "-",
      representativeEmail:
        String(contract?.generatedByEmail || (payload as any)?.generatedByAgentEmail || companyEmail).trim() ||
        companyEmail,
      destination: String(contract?.destination || (payload as any)?.destination || "-").trim() || "-",
      contractIssuedAt: contract?.issuedAt || null,
      startDate: contract?.startDate || null,
      endDate: contract?.endDate || null,
    };
  }

  /**
   * Standard PDF colors for consistent branding
   */
  private getPdfColors() {
    return {
      ink: rgb(0.09, 0.14, 0.24),      // Dark text
      slate: rgb(0.34, 0.4, 0.5),       // Secondary text
      line: rgb(0.87, 0.9, 0.94),       // Divider lines
      brand: rgb(0.16, 0.24, 0.76),     // Brand blue
      lightBg: rgb(0.95, 0.97, 0.99),   // Light backgrounds
    };
  }

  /**
   * Draw standard PDF header with logo, company info, and title
   * Returns the Y position where content should start
   */
  private async drawStandardPdfHeader(params: {
    page: any; // PDFPage
    pdf: any;  // PDFDocument
    font: any;
    bold: any;
    logo: { bytes: Buffer; format: "png" | "jpg" } | null;
    documentTitle: string;
    contractNumber?: string;
    date?: Date | string | null;
    company: {
      legalName: string;
      commercialName: string;
      legalId: string;
    };
    contactInfo?: {
      email: string;
      phone: string;
    };
  }): Promise<number> {
    const { page, pdf, font, bold, logo, documentTitle, contractNumber, date, company, contactInfo } = params;
    const colors = this.getPdfColors();

    // Helper to place text right-aligned
    const placeRight = (text: string, size: number, y: number, useBold = false, color = colors.ink) => {
      const f = useBold ? bold : font;
      const textWidth = f.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: Math.max(40, 555 - textWidth),
        y,
        size,
        font: f,
        color,
      });
    };

    // Draw border around entire page
    page.drawRectangle({
      x: 24,
      y: 24,
      width: 547,
      height: 793,
      borderColor: rgb(0.92, 0.94, 0.97),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    // Draw logo (top left)
    if (logo) {
      const image = logo.format === "jpg" ? await pdf.embedJpg(logo.bytes) : await pdf.embedPng(logo.bytes);
      const maxWidth = 300;
      const maxHeight = 96;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.drawImage(image, {
        x: 42,
        y: 715,
        width: drawWidth,
        height: drawHeight,
      });
    }

    // Draw document title (top right)
    placeRight(documentTitle, 18, 778, true, colors.brand);

    // Draw contract number if provided (top right)
    if (contractNumber) {
      placeRight(`Contrato: ${this.toShortText(contractNumber, 30)}`, 9.8, 759);
    }

    // Draw date if provided (top right)
    if (date) {
      placeRight(`Fecha: ${this.formatDate(date)}`, 9.3, 744);
    }

    // Company info (left side)
    page.drawText(this.toShortText(company.legalName, 38), {
      x: 42,
      y: 706,
      size: 15,
      font: bold,
      color: colors.ink,
    });
    page.drawText(`ID fiscal: ${this.toShortText(company.legalId, 34)}`, {
      x: 42,
      y: 688,
      size: 10,
      font,
      color: colors.slate,
    });
    page.drawText(`País: Costa Rica`, {
      x: 42,
      y: 672,
      size: 10,
      font,
      color: colors.slate,
    });

    // Contact info (right side) if provided
    if (contactInfo) {
      page.drawText("Contacto", {
        x: 284,
        y: 706,
        size: 12,
        font: bold,
        color: colors.ink,
      });
      page.drawText(`Correo: ${this.toShortText(contactInfo.email, 30)}`, {
        x: 284,
        y: 688,
        size: 10,
        font,
        color: colors.slate,
      });
      page.drawText(`Teléfono: ${this.toShortText(contactInfo.phone, 30)}`, {
        x: 284,
        y: 672,
        size: 10,
        font,
        color: colors.slate,
      });
    }

    // Draw horizontal divider line
    page.drawLine({
      start: { x: 40, y: 648 },
      end: { x: 555, y: 648 },
      thickness: 2,
      color: colors.brand,
    });

    // Return Y position where content should start (below the divider)
    return 622;
  }

  private async createReceiptPdfBuffer(params: {
    receiptNumber: string;
    contractNumber: string;
    company: {
      legalName: string;
      commercialName: string;
      legalId: string;
      companyEmail: string;
      companyPhones: string;
    };
    clientName: string;
    paymentReference: string;
    amount: number;
    paymentMethod: string;
    bankReference: string;
    issuedAt: Date | string | null;
    approvedAt: Date | string | null;
    previousBalance: number;
    newBalance: number;
    tenant?: { logoUrl: string | null } | null;
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo(params.tenant);
    const colors = this.getPdfColors();

    // Draw standard header with logo and company info
    let y = await this.drawStandardPdfHeader({
      page,
      pdf,
      font,
      bold,
      logo,
      documentTitle: "RECIBO DE CAJA",
      contractNumber: params.contractNumber,
      date: params.approvedAt || params.issuedAt,
      company: {
        legalName: params.company.legalName,
        commercialName: params.company.commercialName,
        legalId: params.company.legalId,
      },
      contactInfo: {
        email: params.company.companyEmail,
        phone: params.company.companyPhones,
      },
    });

    // Receipt info section
    page.drawText("Recibo:", {
      x: 42,
      y,
      size: 12,
      font: bold,
      color: colors.ink,
    });
    page.drawText(this.toShortText(params.receiptNumber, 50), {
      x: 100,
      y,
      size: 12,
      font,
      color: colors.ink,
    });

    // Dates on right side
    page.drawText("Emisión:", {
      x: 284,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.formatDateTime(params.issuedAt), {
      x: 340,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    y -= 15;
    page.drawText("Aprobación:", {
      x: 284,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.formatDateTime(params.approvedAt), {
      x: 340,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    // Divider
    y -= 18;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 555, y },
      thickness: 1,
      color: colors.line,
    });

    // Client information section
    y -= 22;
    // Client information section
    y -= 22;
    page.drawText("INFORMACIÓN DEL CLIENTE", {
      x: 42,
      y,
      size: 12,
      font: bold,
      color: colors.ink,
    });

    y -= 18;
    page.drawText("Cliente:", {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.toShortText(params.clientName, 70), {
      x: 100,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    y -= 15;
    page.drawText("Código de Pago:", {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.toShortText(params.paymentReference, 70), {
      x: 140,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    // Divider
    y -= 18;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 555, y },
      thickness: 1,
      color: colors.line,
    });

    // Payment details section
    y -= 22;
    page.drawText("DETALLE DEL PAGO", {
      x: 42,
      y,
      size: 12,
      font: bold,
      color: colors.ink,
    });

    y -= 28;
    // Amount box - highlighted
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: 515,
      height: 28,
      color: colors.lightBg,
      borderColor: colors.brand,
      borderWidth: 1,
    });
    page.drawText("Monto Recibido:", {
      x: 50,
      y: y + 6,
      size: 11,
      font: bold,
      color: colors.ink,
    });
    page.drawText(this.formatCurrency(params.amount), {
      x: 440,
      y: y + 6,
      size: 14,
      font: bold,
      color: rgb(0.0, 0.5, 0.0),
    });

    y -= 30;
    page.drawText("Método de Pago:", {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.toShortText(params.paymentMethod, 50), {
      x: 160,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    y -= 15;
    page.drawText("Referencia Bancaria:", {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.toShortText(params.bankReference, 50), {
      x: 160,
      y,
      size: 10,
      font,
      color: colors.slate,
    });

    // Divider before balance section
    y -= 20;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 555, y },
      thickness: 1,
      color: colors.line,
    });

    // Balance Summary Section (Mini Estado de Cuenta)
    y -= 22;
    page.drawText("RESUMEN DE SALDO", {
      x: 42,
      y,
      size: 12,
      font: bold,
      color: colors.ink,
    });

    // Previous Balance
    y -= 24;
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: 515,
      height: 22,
      color: rgb(0.98, 0.98, 0.98),
      borderColor: colors.line,
      borderWidth: 0.5,
    });
    page.drawText("Saldo Anterior:", {
      x: 50,
      y: y + 4,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    page.drawText(this.formatCurrency(params.previousBalance), {
      x: 440,
      y: y + 4,
      size: 11,
      font: bold,
      color: colors.ink,
    });

    // Payment Applied (negative)
    y -= 22;
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: 515,
      height: 22,
      color: rgb(0.95, 1.0, 0.95),
      borderColor: rgb(0.0, 0.5, 0.0),
      borderWidth: 0.5,
    });
    page.drawText("Pago Aplicado:", {
      x: 50,
      y: y + 4,
      size: 10,
      font: bold,
      color: rgb(0.0, 0.4, 0.0),
    });
    page.drawText(`- ${this.formatCurrency(params.amount)}`, {
      x: 440,
      y: y + 4,
      size: 11,
      font: bold,
      color: rgb(0.0, 0.5, 0.0),
    });

    // Divider line
    y -= 22;
    page.drawLine({
      start: { x: 50, y: y + 4 },
      end: { x: 545, y: y + 4 },
      thickness: 1,
      color: colors.ink,
    });

    // New Balance (highlighted in brand color)
    y -= 18;
    page.drawRectangle({
      x: 40,
      y: y - 4,
      width: 515,
      height: 26,
      color: colors.lightBg,
      borderColor: colors.brand,
      borderWidth: 1.5,
    });
    page.drawText("Saldo Pendiente:", {
      x: 50,
      y: y + 5,
      size: 11,
      font: bold,
      color: colors.ink,
    });
    page.drawText(this.formatCurrency(params.newBalance), {
      x: 440,
      y: y + 5,
      size: 13,
      font: bold,
      color: params.newBalance > 0 ? rgb(0.8, 0.0, 0.0) : rgb(0.0, 0.5, 0.0),
    });

    // Footer note
    y -= 35;
    page.drawText("NOTA:", {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: colors.slate,
    });
    y -= 14;
    page.drawText("Este recibo certifica que el pago fue recibido y aprobado correctamente.", {
      x: 42,
      y,
      size: 9,
      font,
      color: colors.slate,
    });
    y -= 12;
    page.drawText("El monto indicado ha sido aplicado a su contrato de servicios.", {
      x: 42,
      y,
      size: 9,
      font,
      color: colors.slate,
    });

    // Footer line and text
    page.drawLine({
      start: { x: 40, y: 74 },
      end: { x: 555, y: 74 },
      thickness: 1,
      color: colors.line,
    });
    page.drawText("Documento generado electrónicamente - Sistema de Facturación", {
      x: 42,
      y: 58,
      size: 8,
      font,
      color: colors.slate,
    });
    page.drawText(`Email: ${params.company.companyEmail}`, {
      x: 42,
      y: 46,
      size: 8,
      font,
      color: colors.slate,
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  private async createAccountStatementPdfBuffer(params: {
    contractNumber: string;
    paymentReference: string;
    generatedAt: Date | string | null;
    company: {
      legalName: string;
      commercialName: string;
      legalId: string;
      companyContactNumber: string;
      companyPhones: string;
      destination: string;
    };
    client: {
      fullName: string;
      idNumber: string;
      email: string;
      phone: string;
    };
    summary: {
      total: number;
      verified: number;
      pending: number;
      balance: number;
      currency: string;
    };
    movements: Array<{
      at: Date | string | null;
      movement: string;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      actor: string;
      status: string;
    }>;
    tenant?: { logoUrl: string | null } | null;
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo(params.tenant);

    const ink = rgb(0.09, 0.14, 0.24);
    const slate = rgb(0.34, 0.4, 0.5);
    const line = rgb(0.87, 0.9, 0.94);
    const brand = rgb(0.16, 0.24, 0.76);
    const currency = String(params.summary.currency || "USD").trim().toUpperCase() || "USD";
    const formatMoney = (value: number) => `${currency} ${this.toNumber(value, 0).toFixed(2)}`;

    const placeRight = (text: string, size: number, y: number, useBold = false, color = ink) => {
      const f = useBold ? bold : font;
      const textWidth = f.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: Math.max(40, 555 - textWidth),
        y,
        size,
        font: f,
        color,
      });
    };

    page.drawRectangle({
      x: 24,
      y: 24,
      width: 547,
      height: 793,
      borderColor: rgb(0.92, 0.94, 0.97),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    if (logo) {
      const image = logo.format === "jpg" ? await pdf.embedJpg(logo.bytes) : await pdf.embedPng(logo.bytes);
      const maxWidth = 300;
      const maxHeight = 96;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.drawImage(image, {
        x: 42,
        y: 715,
        width: drawWidth,
        height: drawHeight,
      });
    }

    placeRight("Estado de cuenta", 18, 778, true, brand);
    placeRight(`Contrato: ${this.toShortText(params.contractNumber, 30)}`, 9.8, 759);
    placeRight(`Fecha: ${this.formatDate(params.generatedAt)}`, 9.3, 744);

    page.drawText(this.toShortText(params.company.legalName, 38), {
      x: 42,
      y: 706,
      size: 15,
      font: bold,
      color: ink,
    });
    page.drawText(`ID fiscal: ${this.toShortText(params.company.legalId, 34)}`, {
      x: 42,
      y: 688,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Pais: Costa Rica`, {
      x: 42,
      y: 672,
      size: 10,
      font,
      color: slate,
    });

    page.drawText("Contacto", {
      x: 284,
      y: 706,
      size: 12,
      font: bold,
      color: ink,
    });
    page.drawText(`Correo: ${this.toShortText(params.company.companyContactNumber, 30)}`, {
      x: 284,
      y: 688,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Telefono: ${this.toShortText(params.company.companyPhones, 30)}`, {
      x: 284,
      y: 672,
      size: 10,
      font,
      color: slate,
    });

    page.drawLine({
      start: { x: 40, y: 648 },
      end: { x: 555, y: 648 },
      thickness: 2,
      color: brand,
    });

    // Payment code inline (no box)
    const labelText = "CÓDIGO DE PAGO (úsalo en tus transferencias):";
    const labelWidth = bold.widthOfTextAtSize(labelText, 9);
    page.drawText(labelText, {
      x: 42,
      y: 620,
      size: 9,
      font: bold,
      color: rgb(0.6, 0.1, 0.1),
    });
    const paymentCode = this.toShortText(params.paymentReference, 20);
    page.drawText(paymentCode, {
      x: 42 + labelWidth + 8,
      y: 620,
      size: 11,
      font: bold,
      color: rgb(0.8, 0.0, 0.0),
    });

    page.drawText("Contratado por", {
      x: 42,
      y: 580,
      size: 12,
      font: bold,
      color: ink,
    });
    page.drawText(`Titular: ${this.toShortText(params.client.fullName, 42)}`, {
      x: 42,
      y: 562,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`ID: ${this.toShortText(params.client.idNumber, 36)}`, {
      x: 42,
      y: 547,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Email: ${this.toShortText(params.client.email, 42)}`, {
      x: 42,
      y: 532,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Telefono: ${this.toShortText(params.client.phone, 36)}`, {
      x: 42,
      y: 517,
      size: 10,
      font,
      color: slate,
    });

    page.drawText("Resumen", {
      x: 284,
      y: 580,
      size: 12,
      font: bold,
      color: ink,
    });
    page.drawText(`Total contratado: ${formatMoney(params.summary.total)}`, {
      x: 284,
      y: 562,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Total verificado: ${formatMoney(params.summary.verified)}`, {
      x: 284,
      y: 547,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Total en revision bancaria: ${formatMoney(params.summary.pending)}`, {
      x: 284,
      y: 532,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Saldo por cobrar: ${formatMoney(params.summary.balance)}`, {
      x: 284,
      y: 517,
      size: 10,
      font,
      color: slate,
    });

    const statementStatusLabels: Record<string, string> = {
      ABONO_REPORTADO: "Reportado",
      ABONO_EN_REVISION: "Revision",
      ABONO_VERIFICADO: "Verificado",
      ABONO_RECHAZADO: "Rechazado",
      FACTURA_EMITIDA: "Emitida",
      FACTURA_PARCIAL: "Parcial",
      FACTURA_PAGADA: "Pagada",
      FACTURA_VENCIDA: "Vencida",
      NC_PENDIENTE_APROBACION: "NC Pend.",
      NC_APLICADA: "NC Aplicada",
      NC_RECHAZADA: "NC Rechazada",
    };

    page.drawRectangle({
      x: 40,
      y: 445,
      width: 515,
      height: 22,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 1,
    });
    page.drawText("Fecha/Hora", { x: 46, y: 453, size: 8.8, font: bold, color: ink });
    page.drawText("Movimiento", { x: 152, y: 453, size: 8.8, font: bold, color: ink });
    page.drawText("Monto", { x: 332, y: 453, size: 8.8, font: bold, color: ink });
    page.drawText("Saldo", { x: 400, y: 453, size: 8.8, font: bold, color: ink });
    page.drawText("Usuario", { x: 462, y: 453, size: 8.8, font: bold, color: ink });
    page.drawText("Estado", { x: 507, y: 453, size: 8.8, font: bold, color: ink });

    let y = 429;
    const maxRows = 16;
    for (const row of params.movements.slice(0, maxRows)) {
      page.drawRectangle({
        x: 40,
        y: y - 6,
        width: 515,
        height: 22,
        color: rgb(1, 1, 1),
        borderColor: line,
        borderWidth: 1,
      });

      const rowDate = row.at ? new Date(row.at) : null;
      const shortDateTime = rowDate && !Number.isNaN(rowDate.getTime())
        ? `${rowDate.toLocaleDateString("es-CR")} ${rowDate.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}`
        : "-";
      const rawStatus = String(row.status || "").trim().toUpperCase();
      const statusLabel = statementStatusLabels[rawStatus] || this.toShortText(rawStatus || "-", 9);

      page.drawText(this.toShortText(shortDateTime, 20), { x: 46, y, size: 8.2, font, color: ink });
      page.drawText(this.toShortText(row.movement, 30), { x: 152, y, size: 8.2, font, color: ink });
      page.drawText(this.toShortText(formatMoney(row.amount), 13), { x: 332, y, size: 8.2, font, color: ink });
      page.drawText(this.toShortText(formatMoney(row.balanceAfter), 13), { x: 400, y, size: 8.2, font, color: ink });
      page.drawText(this.toShortText(row.actor || "-", 9), { x: 462, y, size: 8.2, font, color: ink });
      page.drawText(this.toShortText(statusLabel, 9), { x: 507, y, size: 8.2, font, color: ink });
      y -= 22;
      if (y < 94) break;
    }

    page.drawLine({
      start: { x: 40, y: 84 },
      end: { x: 555, y: 84 },
      thickness: 1,
      color: line,
    });
    page.drawText(this.toShortText(params.company.commercialName, 60), {
      x: 42,
      y: 68,
      size: 9,
      font,
      color: slate,
    });
    page.drawText("Documento de estado de cuenta vinculado al contrato.", {
      x: 42,
      y: 55,
      size: 9,
      font,
      color: slate,
    });

    return Buffer.from(await pdf.save());
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

  private async uploadToSpaces(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }) {
    await this.storageService.uploadObject(params);
  }

  private async buildSignedObjectUrl(objectKey: string, expiresInSeconds = 900) {
    return this.storageService.generateSignedUrl(objectKey, expiresInSeconds);
  }

  private async logAudit(input: {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  actorUserId: string;
  actorName: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  sourceIp?: string | null;
  userAgent?: string | null;
  }) {
    await (this.prisma as any).billingAuditLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        beforeJson: input.beforeJson,
        afterJson: input.afterJson,
        sourceIp: input.sourceIp || null,
        userAgent: input.userAgent || null,
      },
    });
  }

  private async recalcInvoiceAmounts(invoiceId: string, tx?: any) {
    const prismaClient = tx || (this.prisma as any);

    const invoice = await prismaClient.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (!invoice) return null;

    const verifiedAmount = (invoice.payments || [])
      .filter((p: any) => p.status === "ABONO_VERIFICADO")
      .reduce((sum: number, p: any) => sum + this.toNumber(p.amount), 0);

    const pendingAmount = (invoice.payments || [])
      .filter((p: any) => p.status === "ABONO_REPORTADO" || p.status === "ABONO_EN_REVISION")
      .reduce((sum: number, p: any) => sum + this.toNumber(p.amount), 0);

    const totalAmount = this.toNumber(invoice.totalAmount);
    const balanceAmount = Math.max(0, totalAmount - verifiedAmount);

    const overdueDays = this.computeOverdueDays(invoice.paymentDueDate);
    const nextStatus = balanceAmount <= 0
      ? "FACTURA_PAGADA"
      : overdueDays > 0
        ? "FACTURA_VENCIDA"
        : verifiedAmount > 0
          ? "FACTURA_PARCIAL"
          : "FACTURA_EMITIDA";

    return prismaClient.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        verifiedAmount: this.toDecimalString(verifiedAmount),
        pendingAmount: this.toDecimalString(pendingAmount),
        balanceAmount: this.toDecimalString(balanceAmount),
        status: nextStatus,
        closedAt: nextStatus === "FACTURA_PAGADA" ? new Date() : null,
      },
    });
  }

  private async ensureReceiptPdf(receiptId: string) {
    const receipt = await (this.prisma as any).billingReceipt.findUnique({
      where: { id: receiptId },
      include: {
        invoice: { include: { client: true } },
        payment: true,
        contract: {
          include: {
            tenant: {
              select: {
                subdomain: true,
                logoUrl: true,
                name: true,
                legalName: true,
                legalId: true,
                contactEmail: true,
                contactPhone: true,
                contactWhatsApp: true,
                fromEmail: true,
              },
            },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException("Recibo no encontrado.");
    }

    const company = this.getCompanyProfile(receipt.contract);

    // Obtener payment reference del contrato (código único de pago)
    const paymentReference = String(receipt.contract?.paymentReference || "-");

    // Método de pago humanizado
    const paymentMethod = String(receipt.payment?.paymentMethod || "")
      .replace("TRANSFERENCIA_BANCARIA", "Transferencia Bancaria")
      .replace("SINPE_MOVIL", "SINPE Móvil")
      .replace("EFECTIVO", "Efectivo")
      .replace("TARJETA", "Tarjeta")
      || "-";

    // Calcular saldos para el mini estado de cuenta
    const paymentAmount = this.toNumber(receipt.amount, 0);
    const previousBalance = this.toNumber(receipt.invoice?.balanceAmount, 0) + paymentAmount;
    const newBalance = this.toNumber(receipt.invoice?.balanceAmount, 0);

    const tenant = receipt.contract?.tenant || null;
    const pdfBuffer = await this.createReceiptPdfBuffer({
      receiptNumber: String(receipt.receiptNumber),
      contractNumber: String(receipt.contractNumber),
      company,
      clientName: String(receipt.invoice?.client?.fullName || "-"),
      paymentReference,
      amount: receipt.amount,
      paymentMethod,
      bankReference: String(receipt.payment?.bankReference || "-"),
      issuedAt: receipt.issuedAt,
      approvedAt: receipt.approvedAt,
      previousBalance,
      newBalance,
      tenant,
    });

    const appEnv = this.configService.get<string>('APP_ENV', 'dev');
    const tenantSubdomain = tenant.subdomain || 'unknown';
    const objectKey = [
      appEnv,
      tenantSubdomain,
      "billing",
      this.sanitizeSegment(receipt.contractNumber),
      "receipts",
      `${receipt.id}.pdf`,
    ].join("/");

    await this.uploadToSpaces({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });

    const updated = await (this.prisma as any).billingReceipt.update({
      where: { id: receipt.id },
      data: { objectKeyPdf: objectKey },
    });

    return {
      objectKeyPdf: updated.objectKeyPdf,
      fileName: `recibo-${updated.receiptNumber}.pdf`,
    };
  }

  async getAccountStatementPdfUrl(
    _user: { id: string; email: string; fullName: string },
    contractId: string,
    expiresInSeconds = 900,
  ) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      include: {
        client: true,
        contract: {
          include: {
            tenant: {
              select: {
                subdomain: true,
                logoUrl: true,
                name: true,
                legalName: true,
                legalId: true,
                contactEmail: true,
                contactPhone: true,
                contactWhatsApp: true,
                fromEmail: true,
              },
            },
          },
        },
        payments: { orderBy: { reportedAt: "asc" } },
        creditNotes: { orderBy: { issuedAt: "asc" } },
      },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    const company = this.getCompanyProfile(invoice.contract);
    const tenant = invoice.contract?.tenant || null;
    const appliedNotes = (invoice.creditNotes || []).filter((n: any) => String(n?.status || "") === "NC_APLICADA");
    const grossInvoiced = this.toNumber(invoice.totalAmount, 0) +
      appliedNotes.reduce((sum: number, n: any) => sum + this.toNumber(n.amount, 0), 0);

    const rows = [] as Array<{
      at: Date | string | null;
      movement: string;
      amount: number;
      actor: string;
      status: string;
      effectAmount: number;
    }>;

    rows.push({
      at: invoice.issuedAt,
      movement: `Contrato ${invoice.contractNumber}`,
      amount: this.toNumber(invoice.totalAmount, 0),
      actor: "Sistema",
      status: String(invoice.status || ""),
      effectAmount: 0,
    });

    (invoice.payments || []).forEach((payment: any) => {
      const verifiedEffect = String(payment.status || "") === "ABONO_VERIFICADO" ? this.toNumber(payment.amount, 0) : 0;
      const label = String(payment.type || "") === "RESERVATION"
        ? "Pago de reserva"
        : String(payment.type || "") === "INSTALLMENT"
          ? "Abono"
          : "Pago";

      rows.push({
        at: payment.reportedAt,
        movement: label,
        amount: this.toNumber(payment.amount, 0),
        actor: String(payment.createdByName || payment.verifiedByName || "-"),
        status: String(payment.status || "-"),
        effectAmount: verifiedEffect,
      });
    });

    (invoice.creditNotes || []).forEach((note: any) => {
      const appliedEffect = String(note.status || "") === "NC_APLICADA" ? this.toNumber(note.amount, 0) : 0;
      rows.push({
        at: note.appliedAt || note.issuedAt,
        movement: `Nota de credito ${String(note.creditNoteNumber || "")}`,
        amount: this.toNumber(note.amount, 0),
        actor: String(note.appliedByName || note.issuedByName || "-"),
        status: String(note.status || "-"),
        effectAmount: appliedEffect,
      });
    });

    rows.sort((a, b) => new Date(String(a.at || 0)).getTime() - new Date(String(b.at || 0)).getTime());

    let runningBalance = grossInvoiced;
    const movements = rows
      .map((row) => {
        const before = runningBalance;
        runningBalance = Math.max(0, runningBalance - this.toNumber(row.effectAmount, 0));
        return {
          at: row.at,
          movement: row.movement,
          amount: row.amount,
          balanceBefore: before,
          balanceAfter: runningBalance,
          actor: row.actor,
          status: row.status,
        };
      })
      .reverse();

    const pdfBuffer = await this.createAccountStatementPdfBuffer({
      contractNumber: String(invoice.contractNumber),
      paymentReference: String(invoice.contract?.paymentReference || "N/A"),
      generatedAt: new Date(),
      company,
      client: {
        fullName: String(invoice.client?.fullName || "-"),
        idNumber: String(invoice.client?.idNumber || "-"),
        email: String(invoice.client?.email || "-"),
        phone: String(invoice.client?.phone || "-") || "-",
      },
      summary: {
        total: this.toNumber(invoice.totalAmount, 0),
        verified: this.toNumber(invoice.verifiedAmount, 0),
        pending: this.toNumber(invoice.pendingAmount, 0),
        balance: this.toNumber(invoice.balanceAmount, 0),
        currency: String(invoice.currency || "USD"),
      },
      movements,
      tenant,
    });

    const appEnv = this.configService.get<string>('APP_ENV', 'dev');
    const tenantSubdomain = tenant.subdomain || 'unknown';
    const objectKey = [
      appEnv,
      tenantSubdomain,
      "billing",
      this.sanitizeSegment(invoice.contractNumber),
      "account-statements",
      `${invoice.id}.pdf`,
    ].join("/");

    await this.uploadToSpaces({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });

    return {
      fileName: `estado-cuenta-${invoice.contractNumber}.pdf`,
      url: await this.buildSignedObjectUrl(objectKey, expiresInSeconds),
    };
  }

  async listAudit(
    _user: { id: string; email: string; fullName: string },
    query: {
      contractId?: string;
      entityType?: string;
      q?: string;
      limit?: number;
    },
  ) {
    const where: Record<string, unknown> = {};
    const q = String(query.q || "").trim();
    const entityType = String(query.entityType || "").trim();
    const contractId = String(query.contractId || "").trim();
    const limit = Math.min(Math.max(Number(query.limit || 80), 1), 200);

    if (entityType) {
      where.entityType = entityType;
    }

    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { actorName: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
      ];
    }

    if (contractId) {
      const invoice = await (this.prisma as any).billingInvoice.findUnique({
        where: { contractId },
        include: {
          payments: { select: { id: true } },
          receipts: { select: { id: true } },
          creditNotes: { select: { id: true } },
        },
      });

      if (!invoice) {
        return { items: [] };
      }

      const ids = [
        invoice.id,
        ...(invoice.payments || []).map((item: any) => item.id),
        ...(invoice.receipts || []).map((item: any) => item.id),
        ...(invoice.creditNotes || []).map((item: any) => item.id),
      ];

      const currentOr = Array.isArray(where.OR) ? (where.OR as Array<Record<string, unknown>>) : [];
      where.AND = [
        { entityId: { in: ids } },
        ...(currentOr.length ? [{ OR: currentOr }] : []),
      ];
      delete where.OR;
    }

    const items = await (this.prisma as any).billingAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return {
      items: (items || []).map((item: any) => ({
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        action: item.action,
        actorUserId: item.actorUserId,
        actorName: item.actorName,
        beforeJson: item.beforeJson,
        afterJson: item.afterJson,
        sourceIp: item.sourceIp,
        userAgent: item.userAgent,
        createdAt: item.createdAt,
      })),
    };
  }

  async verifyPayment(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const paymentSnapshot = await this.loadPaymentVerificationSnapshot(paymentId);
    const updated = await this.executePaymentVerificationTransaction(
      user,
      paymentId,
    );

    await this.recordPaymentVerificationAudit(
      user,
      paymentId,
      paymentSnapshot,
      updated,
      sourceIp,
      userAgent,
    );
    await this.dispatchVerifiedPaymentReceiptJob(
      user,
      paymentId,
      sourceIp,
      userAgent,
    );

    return { ok: true, paymentId: updated.id, status: updated.status };
  }

  private async loadPaymentVerificationSnapshot(paymentId: string): Promise<any> {
    const paymentSnapshot = await (this.prisma as any).billingPayment.findUnique({
      where: { id: paymentId },
      include: {
        receipt: true,
        invoice: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!paymentSnapshot) {
      throw new NotFoundException("Abono no encontrado.");
    }

    return paymentSnapshot;
  }

  private async executePaymentVerificationTransaction(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
  ): Promise<any> {
    const now = new Date();
    let updated: any;

    // ✅ TRANSACCIÓN ATÓMICA: Garantiza consistencia de datos y previene race conditions
    try {
      await (this.prisma as any).$transaction(async (tx: any) => {
        // 1. Re-fetch payment con lock implícito (READ COMMITTED + row lock)
        const payment = await tx.billingPayment.findUnique({
          where: { id: paymentId },
          include: {
            invoice: {
              include: {
                contract: {
                  select: {
                    id: true,
                    status: true,
                    travelPackageId: true,
                    internalTripId: true,
                    participantCount: true,
                    tenantId: true,
                    clientId: true,
                    payload: true,
                  },
                },
              },
            },
          },
        });

        if (!payment) {
          throw new NotFoundException("Abono no encontrado.");
        }

        // 2. Validar que el pago esté en estado correcto
        if (!["ABONO_REPORTADO", "ABONO_EN_REVISION"].includes(String(payment.status || ""))) {
          throw new BadRequestException("Solo se pueden verificar abonos reportados o en revision.");
        }

        const contract = payment.invoice?.contract;

        // 4. Actualizar payment a ABONO_VERIFICADO
        updated = await tx.billingPayment.update({
          where: { id: paymentId },
          data: {
            status: "ABONO_VERIFICADO",
            verifiedAt: now,
            verifiedByUserId: user.id,
            verifiedByName: user.fullName,
            rejectionReason: null,
          },
        });

        // 5. Recalcular montos del invoice
        await this.recalcInvoiceAmounts(updated.invoiceId, tx);

        if (String(payment.type || "") === "RESERVATION" && contract) {
          await this.contractReservationApprovals.approveInTransaction(tx, {
            tenantId: contract.tenantId,
            contractId: contract.id,
            actor: { userId: user.id, name: user.fullName },
          });
        }

        // 7. Si es pago de viaje interno (booking), incrementar cuando esté completamente pagado
        if (String(payment.type || "") === "INTERNAL_TOUR" && payment.internalTourBookingId) {
          const booking = await tx.internalTourBooking.findUnique({
            where: { id: payment.internalTourBookingId },
            select: {
              id: true,
              internalTripId: true,
              participantCount: true,
              totalAmount: true,
              paidAmount: true,
              status: true,
              tenantId: true,
            },
          });

          if (booking) {
            // Recalcular monto pagado sumando este pago recién aprobado
            const newPaidAmount = this.toNumber(booking.paidAmount) + this.toNumber(payment.amount);
            const totalAmount = this.toNumber(booking.totalAmount);

            // Si ahora está completamente pagado y antes no lo estaba, validar e incrementar
            if (newPaidAmount >= totalAmount && booking.status !== "PAID") {
              // Validar capacidad antes de incrementar
              const internalTrip = await tx.internalTrip.findUnique({
                where: { id: booking.internalTripId },
                select: { capacity: true, occupiedSlots: true, name: true },
              });

              if (!internalTrip) {
                throw new NotFoundException(`Viaje interno ${booking.internalTripId} no encontrado.`);
              }

              const participantCount = booking.participantCount || 1;
              const availableSlots = internalTrip.capacity - internalTrip.occupiedSlots;

              if (participantCount > availableSlots) {
                this.logger.warn(
                  `[verifyPayment] ⚠️ Capacidad insuficiente para booking: ${internalTrip.name} tiene ${availableSlots} cupos, se solicitan ${participantCount}`
                );
                throw new BadRequestException(
                  `Capacidad insuficiente. El viaje "${internalTrip.name}" solo tiene ${availableSlots} cupos disponibles de ${internalTrip.capacity} totales. Se solicitan ${participantCount} cupos.`
                );
              }

              // Incrementar occupiedSlots
              const internalTripUpdated = await tx.internalTrip.update({
  where: { id: booking.internalTripId },
  data: {
    occupiedSlots: { increment: participantCount },
  },
  select: {
    occupiedSlots: true,
    capacity: true,
    status: true,
  },
});

if (
  internalTripUpdated.occupiedSlots >= internalTripUpdated.capacity &&
  internalTripUpdated.status !== "CLOSED"
) {
  await tx.internalTrip.update({
    where: { id: booking.internalTripId },
    data: {
      status: "CLOSED",
    },
  });

  this.logger.log(
    `[verifyPayment] 🔒 Viaje interno ${booking.internalTripId} cerrado automáticamente por capacidad completa.`
  );
}

this.logger.log(
  `[verifyPayment] ✅ Incrementados ${participantCount} cupos en viaje interno ${booking.internalTripId} (booking completamente pagado)`
);
            }
          }
        }
      });

      this.logger.log(
        `[verifyPayment] ✅ Transacción completada exitosamente para payment ${paymentId}`
      );
    } catch (transactionError) {
      this.logger.error(
        `[verifyPayment] ❌ Transacción fallida: ${transactionError instanceof Error ? transactionError.message : String(transactionError)}`
      );
      // Re-lanzar el error para que el caller lo maneje
      throw transactionError;
    }
    return updated;
  }

  private async recordPaymentVerificationAudit(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
    paymentSnapshot: any,
    updated: any,
    sourceIp?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    try {
      await this.logAudit({
        tenantId: paymentSnapshot.invoice.tenantId,
        entityType: "PAYMENT",
        entityId: paymentId,
        action: "VERIFY",
        actorUserId: user.id,
        actorName: user.fullName,
        beforeJson: { status: paymentSnapshot.status },
        afterJson: {
          status: updated.status,
          verifiedAt: updated.verifiedAt,
          verifiedByUserId: updated.verifiedByUserId,
        },
        sourceIp,
        userAgent,
      });
    } catch (auditError) {
      this.logger.error(
        `[verifyPayment] ⚠️ No se pudo registrar auditoría: ${auditError instanceof Error ? auditError.message : String(auditError)}`,
      );
    }
  }

  private async dispatchVerifiedPaymentReceiptJob(
    actor: { id: string; email: string; fullName: string },
    paymentId: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    await this.jobDispatcher.dispatch<ReceiptProcessingJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.BILLING,
      jobName: RECEIPT_PROCESSING_JOB_NAME,
      payload: {
        paymentId,
        actor,
        sourceIp,
        userAgent,
      },
      options: {
        ...RECEIPT_PROCESSING_JOB_OPTIONS,
        jobId: `billing-payment-receipt-processing-${paymentId}`,
      },
    });
  }

  async processVerifiedPaymentReceiptJob(
    payload: ReceiptProcessingJobPayload,
  ): Promise<void> {
    const paymentSnapshot = await this.loadPaymentVerificationSnapshot(
      payload.paymentId,
    );

    if (paymentSnapshot.receipt && paymentSnapshot.invoice?.client?.email) {
      const clientEmail = String(paymentSnapshot.invoice.client.email).trim();
      this.logger.log("[verifyPayment] Encolando recibo automático al cliente.");

      await this.approveAndSendReceipt(
        { ...payload.actor, role: "ADMIN" },
        paymentSnapshot.receipt.id,
        clientEmail,
        undefined,
        payload.sourceIp,
        payload.userAgent,
        "AUTOMATIC",
      );

      this.logger.log("[verifyPayment] ✅ Recibo automático encolado.");
      return;
    }

    this.logger.warn(
      `[verifyPayment] ⚠️ No se pudo encolar recibo: receiptId=${paymentSnapshot.receipt?.id || "N/A"}, clientEmailAvailable=${Boolean(paymentSnapshot.invoice?.client?.email)}`,
    );
  }
  async rejectPayment(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
    reason: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      throw new BadRequestException("Debes indicar motivo de rechazo.");
    }

    const payment = await (this.prisma as any).billingPayment.findUnique({
      where: { id: paymentId },
      include: { receipt: true, invoice: true },
    });

    if (!payment) {
      throw new NotFoundException("Abono no encontrado.");
    }

    if (!["ABONO_REPORTADO", "ABONO_EN_REVISION"].includes(String(payment.status || ""))) {
      throw new BadRequestException("Solo se pueden rechazar abonos reportados o en revision.");
    }

    const updated = await (this.prisma as any).billingPayment.update({
      where: { id: paymentId },
      data: {
        status: "ABONO_RECHAZADO",
        rejectionReason: normalizedReason,
        verifiedAt: null,
        verifiedByUserId: null,
        verifiedByName: null,
      },
    });

    if (payment.receipt && payment.receipt.status !== "RECIBO_ANULADO") {
      await (this.prisma as any).billingReceipt.update({
        where: { id: payment.receipt.id },
        data: { status: "RECIBO_ANULADO" },
      });

      await this.logAudit({
        tenantId: payment.invoice.tenantId,
        entityType: "RECEIPT",
        entityId: payment.receipt.id,
        action: "VOID",
        actorUserId: user.id,
        actorName: user.fullName,
        beforeJson: { status: payment.receipt.status },
        afterJson: { status: "RECIBO_ANULADO" },
        sourceIp,
        userAgent,
      });
    }

    await this.recalcInvoiceAmounts(updated.invoiceId);

    await this.logAudit({
      tenantId: payment.invoice.tenantId,
      entityType: "PAYMENT",
      entityId: paymentId,
      action: "REJECT",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: payment.status },
      afterJson: { status: updated.status, reason: updated.rejectionReason },
      sourceIp,
      userAgent,
    });

    return { ok: true, paymentId: updated.id, status: updated.status };
  }

  async approveAndSendReceipt(
    user: { id: string; email: string; fullName: string; role?: string },
    receiptId: string,
    toEmail?: string,
    ccEmail?: string,
    sourceIp?: string | null,
    userAgent?: string | null,
    deliveryMode: "AUTOMATIC" | "MANUAL" = "MANUAL",
  ) {
    const receipt = await (this.prisma as any).billingReceipt.findUnique({
      where: { id: receiptId },
      include: {
        payment: true,
        invoice: {
          include: {
            client: true,
            contract: { include: { tenant: true } },
          },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException("Recibo no encontrado.");
    }

    if (String(receipt.payment?.status || "") !== "ABONO_VERIFICADO") {
      throw new BadRequestException("Solo se puede aprobar recibo cuando el abono este verificado.");
    }

    const currentStatus = String(receipt.status || "");
    const canSend = currentStatus === "RECIBO_PENDIENTE_VERIFICACION" || currentStatus === "RECIBO_APROBADO_ENVIADO";
    if (!canSend) {
      throw new BadRequestException("Este recibo no admite envio por correo en su estado actual.");
    }

    const isFirstApproval = currentStatus === "RECIBO_PENDIENTE_VERIFICACION";
    const normalizedRole = String(user.role || "").trim().toUpperCase();
    if (isFirstApproval && normalizedRole !== "ADMIN") {
      throw new ForbiddenException("Solo Admin puede aprobar y realizar el primer envio del recibo.");
    }

    const targetEmail = String(toEmail || receipt.invoice?.client?.email || "").trim();
    if (!targetEmail) {
      throw new BadRequestException("No hay correo destino para enviar el recibo.");
    }
    const normalizedCc = String(ccEmail || "").trim();

    const tenant = receipt.invoice?.contract?.tenant || null;
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    const amount = this.toNumber(receipt.amount, 0);
    const receiptPdf = await this.ensureReceiptPdf(receipt.id);
    const receiptPdfUrl = await this.buildSignedObjectUrl(String(receiptPdf.objectKeyPdf || ""), 86_400);
    
    // Calcular saldos para mostrar en el email
    const previousBalance = this.toNumber(receipt.invoice?.balanceAmount, 0) + amount;
    const newBalance = this.toNumber(receipt.invoice?.balanceAmount, 0);
    
    // Generar URL del estado de cuenta
    const accountStatementUrl = await this.getAccountStatementPdfUrl(
      { id: user.id, email: user.email, fullName: user.fullName },
      receipt.invoice?.contractId,
      86_400, // 24 horas
    ).then(result => result.url).catch(() => '');
    
    const clientName = String(receipt.invoice?.client?.fullName || "Cliente");
    const amountFormatted = `USD ${amount.toFixed(2)}`;
    const previousBalanceFormatted = `USD ${previousBalance.toFixed(2)}`;
    const newBalanceFormatted = `USD ${newBalance.toFixed(2)}`;
    const paymentRef = String(receipt.invoice?.contract?.paymentReference || "N/A");

    // Enviar email usando EmailService centralizado
    const isReservationPayment =
      String(receipt.payment?.type || "").toUpperCase() === "RESERVATION";
    const jobName = deliveryMode === "AUTOMATIC"
      ? isReservationPayment
        ? BILLING_FINANCIAL_EMAIL_JOB_NAMES.AUTOMATIC_RESERVATION_RECEIPT
        : BILLING_FINANCIAL_EMAIL_JOB_NAMES.AUTOMATIC_PAYMENT_RECEIPT
      : isReservationPayment
        ? BILLING_FINANCIAL_EMAIL_JOB_NAMES.MANUAL_RESERVATION_RECEIPT
        : BILLING_FINANCIAL_EMAIL_JOB_NAMES.MANUAL_PAYMENT_RECEIPT;
    const jobId = deliveryMode === "AUTOMATIC"
      ? `billing-payment-approved-${receipt.payment.id}`
      : undefined;

    await this.dispatchBillingFinancialEmail(
      jobName,
      {
        tenantId: tenant.id,
        to: targetEmail,
        ...(normalizedCc ? { cc: normalizedCc } : {}),
        subject: `✅ Recibo Aprobado ${receipt.receiptNumber} - ${tenant.name}`,
        template: 'receipt-approved',
        templateData: {
          clientName,
          contractNumber: String(receipt.contractNumber || "-"),
          receiptNumber: String(receipt.receiptNumber || "-"),
          paymentReference: paymentRef,
          amount: amountFormatted,
          previousBalance: previousBalanceFormatted,
          newBalance: newBalanceFormatted,
          receiptPdfUrl,
          accountStatementUrl: accountStatementUrl || undefined,
          tenantName: tenant.name,
        },
        triggeredBy: {
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
        },
      },
      jobId,
    );

    const now = new Date();
    const updated = await (this.prisma as any).billingReceipt.update({
      where: { id: receiptId },
      data: {
        status: "RECIBO_APROBADO_ENVIADO",
        approvedAt: isFirstApproval ? now : receipt.approvedAt,
        approvedByUserId: isFirstApproval ? user.id : receipt.approvedByUserId,
        approvedByName: isFirstApproval ? user.fullName : receipt.approvedByName,
        sentAt: now,
        sentToEmail: targetEmail,
      },
    });

    await this.logAudit({
      tenantId: receipt.invoice.tenantId,
      entityType: "RECEIPT",
      entityId: receiptId,
      action: isFirstApproval ? "APPROVE_SEND" : "RESEND_EMAIL",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: receipt.status, sentAt: receipt.sentAt, sentToEmail: receipt.sentToEmail },
      afterJson: {
        status: updated.status,
        approvedAt: updated.approvedAt,
        sentAt: updated.sentAt,
        sentToEmail: updated.sentToEmail,
        ccEmail: normalizedCc || null,
      },
      sourceIp,
      userAgent,
    });

    return {
      ok: true,
      receiptId: updated.id,
      receiptNumber: updated.receiptNumber,
      status: updated.status,
      sentToEmail: updated.sentToEmail,
      ccEmail: normalizedCc || null,
    };

  }

  private async dispatchBillingFinancialEmail(
    jobName: BillingFinancialEmailJobName,
    options: SendEmailOptions,
    jobId?: string,
  ): Promise<void> {
    await this.jobDispatcher.dispatch<BillingFinancialEmailJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.EMAIL,
      jobName,
      payload: { options },
      metadata: { tenantId: options.tenantId },
      options: {
        ...BILLING_FINANCIAL_EMAIL_JOB_OPTIONS,
        ...(jobId ? { jobId } : {}),
      },
    });
  }
}
