import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";
import * as sharp from "sharp";
import * as path from "path";
import { readFile } from "fs/promises";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyCreditNoteDto } from "./dto/apply-credit-note.dto";
import { CreateCreditNoteDto } from "./dto/create-credit-note.dto";
import { ListBillingContractsDto } from "./dto/list-billing-contracts.dto";
import { ReportPaymentDto } from "./dto/report-payment.dto";

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private s3Client: S3Client | null = null;
  private readonly maxAttachmentCount = 10;
  private readonly maxAttachmentSizeBytes = 6 * 1024 * 1024;
  private readonly allowedAttachmentMimeTypes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("es-CR");
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return "-";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("es-CR");
  }

  private toShortText(value: unknown, max = 88): string {
    const raw = String(value ?? "-").trim();
    if (!raw) return "-";
    return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
  }

  private extractVoucherDateFromNotes(notes: unknown): string | null {
    const text = String(notes || "");
    if (!text) return null;
    const match = text.match(/Fecha comprobante:\s*(\d{4}-\d{2}-\d{2})/i);
    return match?.[1] || null;
  }

  private async loadCompanyLogo(): Promise<{ bytes: Buffer; format: "png" | "jpg" } | null> {
    // Prioridad 1: Descargar desde URL (producción y desarrollo)
    const logoUrl = this.configService.get<string>("COMPANY_LOGO_URL", "").trim();
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
    const fileCandidates = [
      configuredPath,
      path.resolve(process.cwd(), "../frontend-next/public/assets/LOGO ALMANOVA.png"),
      path.resolve(process.cwd(), "../../frontend-next/public/assets/LOGO ALMANOVA.png"),
      path.resolve(process.cwd(), "frontend-next/public/assets/LOGO ALMANOVA.png"),
    ].filter(Boolean);

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

  private async loadCompanyLogoEmailSrc(): Promise<string | null> {
    const configuredUrl = this.configService.get<string>("COMPANY_LOGO_EMAIL_URL", "").trim();
    if (configuredUrl) {
      return configuredUrl;
    }

    const logo = await this.loadCompanyLogo();
    if (!logo) {
      return null;
    }

    // Logo ya está convertido a PNG o JPG por loadCompanyLogo()
    const mime = logo.format === "jpg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${logo.bytes.toString("base64")}`;
  }

  private toDateOrNull(value: unknown): Date | null {
    const text = String(value || "").trim();
    if (!text) return null;
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private computeOverdueDays(paymentDueDate: Date | null | undefined, now = new Date()): number {
    if (!paymentDueDate) return 0;
    const end = new Date(paymentDueDate);
    const diffMs = now.getTime() - end.getTime();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }

  private async buildReceiptNumber(): Promise<string> {
    // Contar recibos existentes para generar número consecutivo
    const count = await (this.prisma as any).billingReceipt.count();
    const nextNumber = count + 1;
    const paddedNumber = String(nextNumber).padStart(8, "0");
    return `RCPT-${paddedNumber}`;
  }

  private buildCreditNoteNumber(contractNumber: string) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    const ms = String(now.getMilliseconds()).padStart(3, "0");
    return `NC-${contractNumber}-${yyyy}${mm}${dd}${hh}${min}${ss}${ms}`;
  }

  private getCompanyProfile(contract: any) {
    const payload = contract?.payload && typeof contract.payload === "object" ? contract.payload : {};
    const legalName =
      this.configService.get<string>("COMPANY_LEGAL_NAME", "").trim() ||
      "VIAJES ALMA NOVA";
    const commercialName =
      this.configService.get<string>("COMPANY_COMMERCIAL_NAME", "").trim() ||
      "Viajes Alma Nova";
    const legalId =
      this.configService.get<string>("COMPANY_LEGAL_ID", "").trim() ||
      "3-101-960028";
    const companyEmail =
      this.configService.get<string>("COMPANY_BILLING_EMAIL", "").trim() ||
      "contratos@viajesalmanova.com";
    const companyContactNumber =
      this.configService.get<string>("COMPANY_CONTACT_NUMBER", "").trim() ||
      this.configService.get<string>("COMPANY_CONTACT", "").trim() ||
      companyEmail;
    const companyPhones =
      this.configService.get<string>("COMPANY_PHONE_NUMBERS", "").trim() ||
      this.configService.get<string>("COMPANY_PHONES", "").trim() ||
      "+50670067572";

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

  private async createCorporatePdfBuffer(params: {
    documentTitle: string;
    documentNumber: string;
    contractNumber: string;
    company: {
      legalName: string;
      commercialName: string;
      legalId: string;
      companyEmail: string;
      representativeName: string;
      representativeEmail: string;
      destination: string;
      contractIssuedAt: Date | string | null;
      startDate: Date | string | null;
      endDate: Date | string | null;
    };
    detailRows: Array<{ label: string; value: string }>;
    note?: string;
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo();

    page.drawRectangle({
      x: 36,
      y: 768,
      width: 523,
      height: 56,
      color: rgb(0.07, 0.26, 0.41),
    });

    page.drawText(params.company.commercialName, {
      x: 50,
      y: 804,
      size: 16,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(this.toShortText(params.company.legalName, 62), {
      x: 50,
      y: 788,
      size: 9,
      font,
      color: rgb(0.9, 0.95, 1),
    });

    if (logo) {
      const image = logo.format === "jpg" ? await pdf.embedJpg(logo.bytes) : await pdf.embedPng(logo.bytes);
      const scaled = image.scale(0.2);
      const maxWidth = 148;
      const ratio = scaled.width > maxWidth ? maxWidth / scaled.width : 1;
      const drawWidth = scaled.width * ratio;
      const drawHeight = scaled.height * ratio;

      page.drawRectangle({
        x: 392,
        y: 776,
        width: 152,
        height: 40,
        color: rgb(1, 1, 1),
      });
      page.drawImage(image, {
        x: 394,
        y: 778,
        width: drawWidth,
        height: drawHeight,
      });
    }

    page.drawText(this.toShortText(params.documentTitle, 48), {
      x: 50,
      y: 738,
      size: 18,
      font: bold,
      color: rgb(0.08, 0.11, 0.16),
    });
    page.drawText(`Numero: ${this.toShortText(params.documentNumber, 48)}`, {
      x: 50,
      y: 721,
      size: 10,
      font,
      color: rgb(0.23, 0.25, 0.31),
    });
    page.drawText(`Contrato: ${this.toShortText(params.contractNumber, 42)}`, {
      x: 300,
      y: 721,
      size: 10,
      font,
      color: rgb(0.23, 0.25, 0.31),
    });

    const companyRows = [
      `Cedula juridica: ${params.company.legalId}`,
      `Correo facturacion: ${params.company.companyEmail}`,
      `Asesor: ${params.company.representativeName}`,
      `Correo asesor: ${params.company.representativeEmail}`,
      `Destino: ${params.company.destination}`,
      `Emitido contrato: ${this.formatDateTime(params.company.contractIssuedAt)}`,
      `Vigencia viaje: ${this.formatDateTime(params.company.startDate)} - ${this.formatDateTime(params.company.endDate)}`,
    ];

    let y = 690;
    page.drawText("Datos de la empresa y contrato", {
      x: 50,
      y,
      size: 11,
      font: bold,
      color: rgb(0.08, 0.11, 0.16),
    });
    y -= 18;
    for (const row of companyRows) {
      page.drawText(this.toShortText(row, 90), {
        x: 56,
        y,
        size: 9.5,
        font,
        color: rgb(0.15, 0.16, 0.18),
      });
      y -= 14;
    }

    y -= 6;
    page.drawText("Detalle financiero", {
      x: 50,
      y,
      size: 11,
      font: bold,
      color: rgb(0.08, 0.11, 0.16),
    });
    y -= 18;

    for (const row of params.detailRows) {
      page.drawText(this.toShortText(`${row.label}:`, 32), {
        x: 56,
        y,
        size: 9.5,
        font: bold,
        color: rgb(0.12, 0.2, 0.31),
      });
      page.drawText(this.toShortText(row.value, 64), {
        x: 190,
        y,
        size: 9.5,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });
      y -= 14;
      if (y < 120) break;
    }

    if (params.note) {
      y -= 8;
      page.drawText("Nota:", {
        x: 56,
        y,
        size: 9,
        font: bold,
        color: rgb(0.23, 0.25, 0.31),
      });
      y -= 12;
      page.drawText(this.toShortText(params.note, 94), {
        x: 56,
        y,
        size: 9,
        font,
        color: rgb(0.23, 0.25, 0.31),
      });
    }

    page.drawLine({
      start: { x: 36, y: 74 },
      end: { x: 559, y: 74 },
      thickness: 1,
      color: rgb(0.82, 0.84, 0.87),
    });
    page.drawText("Documento emitido por el modulo de facturacion corporativa.", {
      x: 50,
      y: 58,
      size: 8.5,
      font,
      color: rgb(0.35, 0.37, 0.42),
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
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
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo();
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
        phone: "+506 7006-7572",
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

  private async createInvoicePdfBuffer(params: {
    invoiceNumber: string;
    contractNumber: string;
    paymentReference: string;
    invoiceDate: Date | string | null;
    contractIssuedAt: Date | string | null;
    contractStartDate: Date | string | null;
    contractEndDate: Date | string | null;
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
      address: string;
    };
    amounts: {
      subtotal: number;
      taxAmount: number;
      total: number;
      taxRatePercent: number;
    };
    peopleCount: number;
    paymentPlan: {
      modeLabel: string;
      termLabel: string;
      maxPaymentDateLabel: string;
      installmentsLabel: string;
    };
    paymentAccountNote: string;
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo();

    const colors = this.getPdfColors();
    const ink = colors.ink;
    const slate = colors.slate;
    const line = colors.line;
    const brand = colors.brand;
    const rightEdge = 555;
    const placeRight = (text: string, size: number, y: number, useBold = false, color = ink) => {
      const f = useBold ? bold : font;
      const textWidth = f.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: Math.max(40, rightEdge - textWidth),
        y,
        size,
        font: f,
        color,
      });
    };
    const placeRightWithin = (
      text: string,
      size: number,
      y: number,
      right: number,
      minX: number,
      useBold = false,
      color = ink,
    ) => {
      const f = useBold ? bold : font;
      const textWidth = f.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: Math.max(minX, right - textWidth),
        y,
        size,
        font: f,
        color,
      });
    };
    const formatInvoiceCurrency = (value: number) => `USD ${this.toNumber(value, 0).toFixed(2)}`;
    const wrapTextByWidth = (text: string, maxWidth: number, size: number, maxLines = 2): string[] => {
      const words = String(text || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return ["-"];

      const lines: string[] = [];
      let current = "";

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        const width = font.widthOfTextAtSize(candidate, size);
        if (width <= maxWidth) {
          current = candidate;
          continue;
        }

        if (current) {
          lines.push(current);
          if (lines.length >= maxLines - 1) {
            const rest = [word, ...words.slice(words.indexOf(word) + 1)].join(" ");
            const clipped = this.toShortText(rest, 86);
            lines.push(clipped);
            return lines;
          }
          current = word;
        } else {
          lines.push(this.toShortText(word, 20));
          if (lines.length >= maxLines) return lines;
          current = "";
        }
      }

      if (current) lines.push(current);
      return lines.slice(0, maxLines);
    };

    // Draw standard header with logo and company info
    await this.drawStandardPdfHeader({
      page,
      pdf,
      font,
      bold,
      logo,
      documentTitle: "Contrato",
      contractNumber: params.contractNumber,
      date: params.contractIssuedAt || params.invoiceDate,
      company: {
        legalName: params.company.legalName,
        commercialName: params.company.commercialName,
        legalId: params.company.legalId,
      },
      contactInfo: {
        email: params.company.companyContactNumber,
        phone: params.company.companyPhones,
      },
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

    let y = 590;

    page.drawText("Contratado por", {
      x: 42,
      y,
      size: 12,
      font: bold,
      color: ink,
    });
    page.drawText(`Titular: ${this.toShortText(params.client.fullName, 42)}`, {
      x: 42,
      y: y - 17,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`ID: ${this.toShortText(params.client.idNumber, 36)}`, {
      x: 42,
      y: y - 32,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Email: ${this.toShortText(params.client.email, 44)}`, {
      x: 42,
      y: y - 47,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Telefono: ${this.toShortText(params.client.phone, 36)}`, {
      x: 42,
      y: y - 62,
      size: 10,
      font,
      color: slate,
    });

    page.drawText("Detalle del servicio", {
      x: 284,
      y,
      size: 12,
      font: bold,
      color: ink,
    });
    page.drawText(
      `Viaje: ${this.formatDate(params.contractStartDate)} al ${this.formatDate(params.contractEndDate)}`,
      {
        x: 284,
        y: y - 17,
        size: 10,
        font,
        color: slate,
      },
    );
    page.drawText(`Modalidad: ${params.paymentPlan.modeLabel}`, {
      x: 284,
      y: y - 32,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Plazo: ${params.paymentPlan.termLabel}`, {
      x: 284,
      y: y - 47,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Fecha maxima: ${params.paymentPlan.maxPaymentDateLabel}`, {
      x: 284,
      y: y - 62,
      size: 10,
      font,
      color: slate,
    });
    page.drawText(`Cuotas: ${params.paymentPlan.installmentsLabel}`, {
      x: 284,
      y: y - 77,
      size: 10,
      font,
      color: slate,
    });

    page.drawRectangle({
      x: 40,
      y: 434,
      width: 515,
      height: 50,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 1,
    });
    page.drawText("Direccion titular", {
      x: 46,
      y: 467,
      size: 9.5,
      font: bold,
      color: ink,
    });
    const addressLines = wrapTextByWidth(params.client.address || "-", 460, 10, 2);
    page.drawText(this.toShortText(addressLines[0] || "-", 110), {
      x: 46,
      y: 454,
      size: 10,
      font,
      color: slate,
    });
    if (addressLines[1]) {
      page.drawText(this.toShortText(addressLines[1], 110), {
        x: 46,
        y: 442,
        size: 10,
        font,
        color: slate,
      });
    }

    page.drawRectangle({
      x: 40,
      y: 395,
      width: 515,
      height: 36,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 1,
    });
    page.drawText("Description", { x: 46, y: 410, size: 10, font: bold, color: ink });
    page.drawText("Cant.", { x: 360, y: 410, size: 10, font: bold, color: ink });
    page.drawText("Precio Unit.", { x: 412, y: 410, size: 10, font: bold, color: ink });
    page.drawText("Importe", { x: 496, y: 410, size: 10, font: bold, color: ink });

    page.drawRectangle({
      x: 40,
      y: 349,
      width: 515,
      height: 46,
      color: rgb(1, 1, 1),
      borderColor: line,
      borderWidth: 1,
    });
    page.drawText(
      this.toShortText(
        `Viaje a ${params.company.destination} | Personas: ${Math.max(1, params.peopleCount)}`,
        76,
      ),
      {
      x: 46,
      y: 375,
      size: 10,
      font,
      color: ink,
    });
    page.drawText("1", { x: 374, y: 375, size: 10, font, color: ink });
    const unitAmount = formatInvoiceCurrency(params.amounts.subtotal);
    const rowAmount = formatInvoiceCurrency(params.amounts.subtotal);
    placeRightWithin(unitAmount, 9.2, 375, 485, 412, false, ink);
    placeRightWithin(rowAmount, 9.2, 375, 548, 496, false, ink);

    page.drawLine({
      start: { x: 356, y: 325 },
      end: { x: 555, y: 325 },
      thickness: 1,
      color: line,
    });
    placeRightWithin("Subtotal:", 12, 310, 470, 360, false, ink);
    placeRightWithin(formatInvoiceCurrency(params.amounts.subtotal), 12, 310, 548, 476);
    page.drawLine({
      start: { x: 356, y: 299 },
      end: { x: 555, y: 299 },
      thickness: 1,
      color: line,
    });
    placeRightWithin(`Impuesto (${params.amounts.taxRatePercent}%):`, 12, 283, 470, 356, false, ink);
    placeRightWithin(formatInvoiceCurrency(params.amounts.taxAmount), 12, 283, 548, 476);
    page.drawLine({
      start: { x: 356, y: 273 },
      end: { x: 555, y: 273 },
      thickness: 1.2,
      color: brand,
    });
    page.drawText("Total:", {
      x: 386,
      y: 253,
      size: 14.5,
      font: bold,
      color: ink,
    });
    placeRightWithin(formatInvoiceCurrency(params.amounts.total), 14.5, 253, 548, 476, true, ink);

    page.drawText("Notas", {
      x: 42,
      y: 220,
      size: 11,
      font: bold,
      color: ink,
    });
    page.drawText(this.toShortText(params.paymentAccountNote, 100), {
      x: 42,
      y: 204,
      size: 9.8,
      font,
      color: slate,
    });
    page.drawText("Datos provenientes del contrato firmado del cliente titular.", {
      x: 42,
      y: 187,
      size: 9.8,
      font,
      color: slate,
    });

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
    page.drawText(this.toShortText(params.company.legalName, 60), {
      x: 42,
      y: 55,
      size: 9,
      font,
      color: slate,
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
  }) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const logo = await this.loadCompanyLogo();

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

  private isReservationDocumentCandidate(doc: any): boolean {
    const kind = String(doc?.kind || "").trim().toUpperCase();
    if (kind === "RESERVATION" || kind === "PAYMENT_RESERVATION" || kind === "OTHER" || kind === "OTROS") {
      return true;
    }

    const fileName = String(doc?.originalFileName || "").toLowerCase();
    return fileName.includes("reserva") || fileName.includes("comprobante") || fileName.includes("pago");
  }

  private normalizeContractReservationDocuments(contract: any) {
    const documents = Array.isArray(contract?.documents) ? contract.documents : [];
    const candidates = documents.filter((doc: any) => this.isReservationDocumentCandidate(doc));
    const source = candidates.length ? candidates : documents;

    return source
      .filter((doc: any) => String(doc?.objectKey || "").trim())
      .map((doc: any) => ({
        id: String(doc.id || ""),
        originalFileName: String(doc.originalFileName || "documento"),
        mimeType: String(doc.mimeType || "application/octet-stream"),
        size: Number(doc.size || 0),
        objectKey: String(doc.objectKey),
      }));
  }

  private getSpacesConfig() {
    const region = this.configService.get<string>("DO_SPACES_REGION", "").trim();
    const endpoint = this.configService.get<string>("DO_SPACES_ENDPOINT", "").trim();
    const bucket = this.configService.get<string>("DO_SPACES_BUCKET", "").trim();
    const key = this.configService.get<string>("DO_SPACES_KEY", "").trim();
    const secret = this.configService.get<string>("DO_SPACES_SECRET", "").trim();

    if (!region || !endpoint || !bucket || !key || !secret) {
      throw new InternalServerErrorException(
        "Faltan variables DO_SPACES_REGION, DO_SPACES_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_KEY o DO_SPACES_SECRET.",
      );
    }

    return { region, endpoint, bucket, key, secret };
  }

  private getSpacesClient() {
    if (this.s3Client) {
      return this.s3Client;
    }

    const cfg = this.getSpacesConfig();
    this.s3Client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: false,
      credentials: {
        accessKeyId: cfg.key,
        secretAccessKey: cfg.secret,
      },
    });

    return this.s3Client;
  }

  private async uploadToSpaces(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }) {
    const cfg = this.getSpacesConfig();
    const client = this.getSpacesClient();

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
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

  private async buildSignedObjectUrl(objectKey: string, expiresInSeconds = 900) {
    const cfg = this.getSpacesConfig();
    const client = this.getSpacesClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  private async logAudit(input: {
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

  private async recalcInvoiceAmounts(invoiceId: string) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
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

    return (this.prisma as any).billingInvoice.update({
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

  private async ensureInvoicePdf(invoiceId: string) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { client: true, contract: true },
    });
    if (!invoice) {
      throw new NotFoundException("Factura no encontrada.");
    }

    const fileName = `factura-${invoice.invoiceNumber}.pdf`;
    const company = this.getCompanyProfile(invoice.contract);
    const payload =
      invoice.contract?.payload && typeof invoice.contract.payload === "object"
        ? (invoice.contract.payload as Record<string, unknown>)
        : {};
    const taxRatePercent = 13;
    const totalAmount = this.toNumber(invoice.totalAmount);
    const payloadSubtotal = this.toNumber(payload.subtotalAmount, NaN);
    const payloadTax = this.toNumber(payload.taxAmount, NaN);
    const subtotal = Number.isFinite(payloadSubtotal)
      ? payloadSubtotal
      : Number((totalAmount / (1 + taxRatePercent / 100)).toFixed(2));
    const taxAmount = Number.isFinite(payloadTax)
      ? payloadTax
      : Number((totalAmount - subtotal).toFixed(2));
    const paymentAccountNote =
      this.configService.get<string>("COMPANY_PAYMENT_ACCOUNT", "").trim() ||
      this.configService.get<string>("PAYMENT_ACCOUNT_NUMBER", "").trim() ||
      "Cuenta para pago: solicitar datos bancarios al area de facturacion.";
    const companionsCount = Array.isArray((payload as any)?.companions)
      ? (payload as any).companions.filter((item: any) => item && typeof item === "object").length
      : 0;
    const peopleCount = Math.max(1, companionsCount + 1);
    const reservationAmount = this.toNumber((payload as any)?.reservationAmount, 0);
    const installmentCount = Math.max(1, Math.trunc(this.toNumber((payload as any)?.installmentCount, 1)));
    const dueDate = this.toDateOrNull((payload as any)?.paymentDueDate) || invoice.paymentDueDate || null;
    const isCredit = reservationAmount > 0;
    const referenceDate = invoice.issuedAt instanceof Date ? invoice.issuedAt : new Date(invoice.issuedAt);
    const termDays =
      dueDate && !Number.isNaN(referenceDate.getTime())
        ? Math.max(0, Math.ceil((dueDate.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000)))
        : null;

    const pdfBuffer = await this.createInvoicePdfBuffer({
      invoiceNumber: String(invoice.invoiceNumber),
      contractNumber: String(invoice.contractNumber),
      paymentReference: String(invoice.contract?.paymentReference || "N/A"),
      invoiceDate: invoice.issuedAt,
      contractIssuedAt: invoice.contract?.issuedAt,
      contractStartDate: invoice.contract?.startDate,
      contractEndDate: invoice.contract?.endDate,
      company,
      client: {
        fullName: String(invoice.client?.fullName || "-"),
        idNumber: String(invoice.client?.idNumber || "-"),
        email: String(invoice.client?.email || "-"),
        phone: String(invoice.client?.phone || "-").trim() || "-",
        address: String(payload.clientAddress || "-").trim() || "-",
      },
      amounts: {
        subtotal,
        taxAmount,
        total: totalAmount,
        taxRatePercent,
      },
      peopleCount,
      paymentPlan: {
        modeLabel: isCredit ? "Credito" : "Contado",
        termLabel: isCredit ? (termDays !== null ? `${termDays} dias` : "-") : "Pago inmediato",
        maxPaymentDateLabel: dueDate ? this.formatDate(dueDate) : "-",
        installmentsLabel: isCredit ? String(installmentCount) : "1",
      },
      paymentAccountNote,
    });

    const objectKey = [
      "billing",
      this.sanitizeSegment(invoice.contractNumber),
      "invoice",
      `${invoice.id}.pdf`,
    ].join("/");

    await this.uploadToSpaces({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });

    const updated = await (this.prisma as any).billingInvoice.update({
      where: { id: invoice.id },
      data: {
        objectKeyPdf: objectKey,
        pdfFileName: fileName,
        pdfMimeType: "application/pdf",
        pdfSize: pdfBuffer.length,
      },
    });

    return {
      objectKeyPdf: updated.objectKeyPdf,
      fileName: updated.pdfFileName || fileName,
    };
  }

  private async ensureReceiptPdf(receiptId: string) {
    const receipt = await (this.prisma as any).billingReceipt.findUnique({
      where: { id: receiptId },
      include: {
        invoice: { include: { client: true } },
        payment: true,
        contract: true,
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
    });

    const objectKey = [
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

  private async ensureCreditNotePdf(creditNoteId: string) {
    const creditNote = await (this.prisma as any).billingCreditNote.findUnique({
      where: { id: creditNoteId },
      include: {
        invoice: { include: { client: true } },
        contract: true,
      },
    });

    if (!creditNote) {
      throw new NotFoundException("Nota de credito no encontrada.");
    }

    const company = this.getCompanyProfile(creditNote.contract);
    const pdfBuffer = await this.createCorporatePdfBuffer({
      documentTitle: "Nota de Credito",
      documentNumber: String(creditNote.creditNoteNumber),
      contractNumber: String(creditNote.contractNumber),
      company,
      detailRows: [
        { label: "Factura", value: String(creditNote.invoice?.invoiceNumber || "-") },
        { label: "Cliente", value: String(creditNote.invoice?.client?.fullName || "-") },
        { label: "Motivo", value: String(creditNote.reason || "-") },
        { label: "Documento origen", value: `${creditNote.sourceDocumentType} / ${creditNote.sourceDocumentId}` },
        { label: "Monto acreditado", value: this.formatCurrency(creditNote.amount) },
        { label: "Estado", value: String(creditNote.status || "-") },
        { label: "Emitida", value: this.formatDateTime(creditNote.issuedAt) },
        { label: "Aplicada", value: this.formatDateTime(creditNote.appliedAt) },
      ],
      note: "La aplicacion de la nota de credito se gestiona bajo flujo de aprobacion administrativa.",
    });

    const objectKey = [
      "billing",
      this.sanitizeSegment(creditNote.contractNumber),
      "credit-notes",
      `${creditNote.id}.pdf`,
    ].join("/");

    await this.uploadToSpaces({
      objectKey,
      contentType: "application/pdf",
      body: pdfBuffer,
    });

    const updated = await (this.prisma as any).billingCreditNote.update({
      where: { id: creditNote.id },
      data: { objectKeyPdf: objectKey },
    });

    return {
      objectKeyPdf: updated.objectKeyPdf,
      fileName: `nota-credito-${updated.creditNoteNumber}.pdf`,
    };
  }

  async getInvoicePdfUrl(
    _user: { id: string; email: string; fullName: string },
    contractId: string,
  ) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    const pdf = await this.ensureInvoicePdf(invoice.id);
    return {
      fileName: pdf.fileName,
      url: await this.buildSignedObjectUrl(String(pdf.objectKeyPdf || "")),
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
        contract: true,
        payments: { orderBy: { reportedAt: "asc" } },
        creditNotes: { orderBy: { issuedAt: "asc" } },
      },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    const company = this.getCompanyProfile(invoice.contract);
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
    });

    const objectKey = [
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

  async autoIssueAndSendInvoiceToTitular(input: {
    contractId: string;
    actorUserId: string;
    actorEmail: string;
    actorName: string;
  }) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: input.contractId },
      include: {
        client: true,
        billingInvoice: true,
      },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado para auto-facturacion.");
    }

    if (String(contract.status || "").toUpperCase() !== "SIGNED") {
      throw new BadRequestException("Solo se puede auto-facturar cuando el contrato esta firmado.");
    }

    if (!contract.billingInvoice) {
      await this.bootstrapContractBilling(
        {
          id: input.actorUserId,
          email: input.actorEmail,
          fullName: input.actorName,
        },
        contract.id,
      );
    }

    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId: contract.id },
      include: { client: true },
    });

    if (!invoice) {
      throw new InternalServerErrorException("No fue posible generar factura para el contrato firmado.");
    }

    const alreadySent = await (this.prisma as any).billingAuditLog.findFirst({
      where: {
        entityType: "INVOICE",
        entityId: invoice.id,
        action: "AUTO_SEND_TO_TITULAR",
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (alreadySent) {
      return {
        ok: true,
        alreadySent: true,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        sentAt: alreadySent.createdAt,
        sentToEmail: String(invoice.client?.email || "").trim() || null,
      };
    }

    const targetEmail = String(invoice.client?.email || "").trim();
    if (!targetEmail) {
      throw new BadRequestException("El titular no tiene correo para enviar la factura.");
    }

    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim();
    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException("Falta configurar RESEND_API_KEY o CONTRACTS_FROM_EMAIL.");
    }

    const pdf = await this.ensureInvoicePdf(invoice.id);
    const invoicePdfUrl = await this.buildSignedObjectUrl(String(pdf.objectKeyPdf || ""), 86_400);
    const logoSrc = await this.loadCompanyLogoEmailSrc();
    const currency = String(invoice.currency || "USD").trim().toUpperCase() || "USD";
    const amount = (value: unknown) => `${currency} ${this.toNumber(value, 0).toFixed(2)}`;
    const paymentRef = String(contract.paymentReference || "N/A");
    
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: fromEmail,
      to: [targetEmail],
      subject: `Contrato ${invoice.contractNumber} - Estado de cuenta inicial - Viajes Alma Nova`,
      text: `
ESTADO DE CUENTA INICIAL

Estimado(a) ${String(invoice.client?.fullName || "Cliente")},

Tu contrato ha sido procesado exitosamente y se ha generado tu estado de cuenta inicial.

DETALLES DEL CONTRATO
• Número de contrato: ${String(invoice.contractNumber || "-")}
• CÓDIGO DE PAGO (úsalo en comprobantes): ${paymentRef}
• Monto total del viaje: ${amount(invoice.totalAmount)}

IMPORTANTE: Cuando hagas transferencias o depósitos, SIEMPRE incluye tu código de pago: ${paymentRef}
Esto nos ayuda a identificar tus pagos de forma inmediata.

Descarga tu estado de cuenta inicial aquí:
${invoicePdfUrl}

IMPORTANTE: Este correo se envió únicamente al titular del contrato. El estado de cuenta incluye el desglose completo de pagos y saldos.

¿Tienes preguntas?
Contáctanos en contratos@viajesalmanova.com o llámanos al +506 7006-7572

---
Viajes Alma Nova
Cédula jurídica 3-101-960028
Costa Rica · +506 7006-7572
contratos@viajesalmanova.com

© ${new Date().getFullYear()} Viajes Alma Nova. Todos los derechos reservados.
      `,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0; padding:0; background-color:#f5f7fb;">
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background:#f5f7fb; padding:40px 20px;">
            <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding:32px 24px; text-align:center;">
                ${logoSrc ? `<img src="${logoSrc}" alt="Viajes Alma Nova" style="display:block; max-width:180px; height:auto; margin:0 auto 16px; filter: brightness(0) invert(1);" />` : ""}
                <h1 style="margin:0; color:#ffffff; font-size:28px; font-weight:700; line-height:1.2;">
                  📊 Estado de Cuenta Inicial
                </h1>
                <p style="margin:12px 0 0; color:#e0e7ff; font-size:15px;">
                  Resumen de pagos de tu contrato
                </p>
              </div>

              <!-- Content -->
              <div style="padding:32px 24px;">
                <p style="margin:0 0 20px; font-size:16px; color:#1e293b; line-height:1.6;">
                  Estimado(a) <strong style="color:#1e3a8a;">${String(invoice.client?.fullName || "Cliente")}</strong>,
                </p>
                
                <p style="margin:0 0 24px; font-size:15px; color:#334155; line-height:1.7;">
                  Tu contrato ha sido procesado exitosamente y se ha generado tu <strong>estado de cuenta inicial</strong>. 
                  A continuación encontrarás los detalles de tu viaje y el resumen de pagos.
                </p>

                <!-- Info Box -->
                <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border:2px solid #3b82f6; border-radius:12px; padding:20px; margin:0 0 24px;">
                  <table style="width:100%; border-collapse:collapse;">
                    <tr>
                      <td style="padding:8px 0; font-size:14px; color:#475569;">
                        <strong>Número de contrato:</strong>
                      </td>
                      <td style="padding:8px 0; text-align:right; font-size:14px; color:#1e293b; font-weight:600;">
                        ${String(invoice.contractNumber || "-")}
                      </td>
                    </tr>
                    <tr style="border-top:1px solid #bfdbfe;">
                      <td style="padding:12px 0 8px; font-size:15px; color:#1e293b;">
                        <strong style="font-size:16px;">Monto total del viaje:</strong>
                      </td>
                      <td style="padding:12px 0 8px; text-align:right;">
                        <span style="font-size:22px; font-weight:700; color:#1e3a8a;">${amount(invoice.totalAmount)}</span>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Payment Reference Box - DESTACADO -->
                <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border:3px solid #f59e0b; border-radius:12px; padding:20px; margin:0 0 24px; text-align:center;">
                  <p style="margin:0 0 8px; font-size:14px; color:#78350f; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">
                    ⚠️ Tu Código de Pago Personal
                  </p>
                  <p style="margin:0 0 12px; font-size:38px; font-weight:900; color:#92400e; letter-spacing:2px; font-family:Monaco,Consolas,monospace;">
                    ${paymentRef}
                  </p>
                  <p style="margin:0; font-size:13px; color:#78350f; line-height:1.6;">
                    <strong>Úsalo en TODOS tus pagos</strong> (transferencias, SINPE, depósitos)<br/>
                    para que identifiquemos tu pago de inmediato.
                  </p>
                </div>

                <!-- CTA Button -->
                <div style="text-align:center; margin:0 0 28px;">
                  <a href="${invoicePdfUrl}" style="display:inline-block; background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:8px; font-weight:700; font-size:16px; box-shadow:0 4px 6px rgba(37,99,235,0.3);">
                    📄 Ver Estado de Cuenta Inicial
                  </a>
                </div>

                <!-- Info Notice -->
                <div style="background:#fef3c7; border-left:4px solid #f59e0b; padding:14px 16px; border-radius:6px; margin:0 0 24px;">
                  <p style="margin:0; font-size:14px; color:#78350f; line-height:1.5;">
                    <strong>📌 Importante:</strong> Este correo se envió únicamente al titular del contrato. 
                    El estado de cuenta incluye el desglose completo de pagos.
                  </p>
                </div>

                <!-- Support -->
                <div style="background:#f8fafc; border-radius:8px; padding:18px; margin:0 0 0;">
                  <p style="margin:0 0 8px; font-size:14px; color:#475569; line-height:1.6;">
                    <strong style="color:#1e293b;">¿Tienes preguntas?</strong>
                  </p>
                  <p style="margin:0; font-size:14px; color:#64748b; line-height:1.6;">
                    Contáctanos en 
                    <a href="mailto:contratos@viajesalmanova.com" style="color:#2563eb; text-decoration:none; font-weight:600;">contratos@viajesalmanova.com</a>
                    o llámanos al <strong style="color:#1e293b;">+506 7006-7572</strong>
                  </p>
                </div>
              </div>

              <!-- Footer -->
              <div style="background:#f1f5f9; padding:24px; text-align:center; border-top:1px solid #e2e8f0;">
                <p style="margin:0 0 8px; font-size:15px; color:#1e293b; font-weight:600;">
                  Viajes Alma Nova
                </p>
                <p style="margin:0; font-size:13px; color:#64748b; line-height:1.5;">
                  Cédula jurídica 3-101-960028<br/>
                  Costa Rica · +506 7006-7572<br/>
                  <a href="mailto:contratos@viajesalmanova.com" style="color:#2563eb; text-decoration:none;">contratos@viajesalmanova.com</a>
                </p>
              </div>

            </div>
            
            <!-- Copyright -->
            <p style="text-align:center; margin:20px 0 0; font-size:12px; color:#94a3b8;">
              © ${new Date().getFullYear()} Viajes Alma Nova. Todos los derechos reservados.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    await this.logAudit({
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "AUTO_SEND_TO_TITULAR",
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      afterJson: {
        contractId: contract.id,
        contractNumber: invoice.contractNumber,
        invoiceNumber: invoice.invoiceNumber,
        sentToEmail: targetEmail,
      },
    });

    return {
      ok: true,
      alreadySent: false,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      sentToEmail: targetEmail,
    };
  }

  async getReceiptPdfUrl(
    _user: { id: string; email: string; fullName: string },
    receiptId: string,
  ) {
    const pdf = await this.ensureReceiptPdf(receiptId);
    return {
      fileName: pdf.fileName,
      url: await this.buildSignedObjectUrl(String(pdf.objectKeyPdf || "")),
    };
  }

  async getCreditNotePdfUrl(
    _user: { id: string; email: string; fullName: string },
    creditNoteId: string,
  ) {
    const pdf = await this.ensureCreditNotePdf(creditNoteId);
    return {
      fileName: pdf.fileName,
      url: await this.buildSignedObjectUrl(String(pdf.objectKeyPdf || "")),
    };
  }

  async sendCreditNoteEmail(
    user: { id: string; email: string; fullName: string; role?: string },
    creditNoteId: string,
    toEmail?: string,
    ccEmail?: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const creditNote = await (this.prisma as any).billingCreditNote.findUnique({
      where: { id: creditNoteId },
      include: {
        invoice: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!creditNote) {
      throw new NotFoundException("Nota de credito no encontrada.");
    }

    if (String(creditNote.status || "") !== "NC_APLICADA") {
      throw new BadRequestException("Solo se puede enviar por correo cuando la nota de credito esta aprobada.");
    }

    const targetEmail = String(toEmail || creditNote.invoice?.client?.email || "").trim();
    if (!targetEmail) {
      throw new BadRequestException("No hay correo destino para enviar la nota de credito.");
    }
    const normalizedCc = String(ccEmail || "").trim();

    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim();
    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException("Falta configurar RESEND_API_KEY o CONTRACTS_FROM_EMAIL.");
    }

    const pdf = await this.ensureCreditNotePdf(creditNote.id);
    const pdfUrl = await this.buildSignedObjectUrl(String(pdf.objectKeyPdf || ""), 86_400);

    const clientName = String(creditNote.invoice?.client?.fullName || "Cliente");
    const amountFormatted = `USD ${this.toNumber(creditNote.amount, 0).toFixed(2)}`;
    const reason = String(creditNote.reason || "-");
    const logoSrc = await this.loadCompanyLogoEmailSrc();

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: [targetEmail],
      ...(normalizedCc ? { cc: [normalizedCc] } : {}),
      subject: `💳 Nota de Crédito ${creditNote.creditNoteNumber} - Viajes Alma Nova`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nota de Crédito - Viajes Alma Nova</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              ${logoSrc ? `<img src="${logoSrc}" alt="Viajes Alma Nova" style="max-width: 180px; height: auto; margin-bottom: 16px;" />` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                Viajes Alma Nova
              </h1>
              <p style="margin: 8px 0 0 0; color: #e9d5ff; font-size: 14px; font-weight: 500;">
                Experiencias inolvidables, destinos únicos
              </p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 0 30px; text-align: center;">
              <div style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 50px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                💳 Nota de Crédito Aprobada
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                Hola ${clientName},
              </h2>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Se ha aplicado una nota de crédito a tu contrato. Este ajuste se verá reflejado en tu saldo actual.
              </p>

              <!-- Info Card -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${String(creditNote.contractNumber || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Nota de Crédito:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${String(creditNote.creditNoteNumber || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Monto:</td>
                    <td style="padding: 8px 0; color: #10b981; font-weight: 700; font-size: 18px; text-align: right;">${amountFormatted}</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 12px 0 8px 0; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Motivo:</strong></p>
                      <p style="margin: 4px 0 0 0; color: #1f2937; font-size: 14px; line-height: 1.5;">${reason}</p>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Action Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${pdfUrl}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  📄 Descargar Nota de Crédito PDF
                </a>
              </div>

              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Este documento ha sido generado automáticamente. Guárdalo para tus registros.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px; font-weight: 600;">
                Atentamente,
              </p>
              <p style="margin: 0 0 20px 0; color: #667eea; font-size: 18px; font-weight: 700;">
                Equipo Viajes Alma Nova
              </p>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                  <strong>Cédula Jurídica:</strong> 3-101-960028<br>
                  <strong>Teléfono:</strong> +506 7006-7572<br>
                  <strong>Email:</strong> contratos@viajesalmanova.com
                </p>
              </div>
            </td>
          </tr>

        </table>
        
        <!-- Bottom Spacer -->
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
          © ${new Date().getFullYear()} Viajes Alma Nova. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `Nota de Crédito Aprobada\n\nCliente: ${clientName}\nContrato: ${String(creditNote.contractNumber || "-")}\nNota de Crédito: ${String(creditNote.creditNoteNumber || "-")}\nMonto: ${amountFormatted}\nMotivo: ${reason}\n\nDescarga el PDF aquí: ${pdfUrl}\n\nViajes Alma Nova\nCédula Jurídica: 3-101-960028\nTeléfono: +506 7006-7572\nEmail: contratos@viajesalmanova.com`,
    });

    await this.logAudit({
      entityType: "CREDIT_NOTE",
      entityId: creditNote.id,
      action: "SEND_EMAIL",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        status: creditNote.status,
        sentToEmail: targetEmail,
        ccEmail: normalizedCc || null,
      },
      sourceIp,
      userAgent,
    });

    return {
      ok: true,
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.creditNoteNumber,
      status: creditNote.status,
      sentToEmail: targetEmail,
      ccEmail: normalizedCc || null,
    };
  }

  async sendContractAccountStatementEmail(
    user: { id: string; email: string; fullName: string },
    contractId: string,
    toEmail?: string,
    ccEmail?: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      include: {
        client: true,
        contract: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    const targetEmail = String(toEmail || invoice.client?.email || "").trim();
    if (!targetEmail) {
      throw new BadRequestException("No hay correo del titular para enviar el estado de cuenta.");
    }

    const normalizedCc = String(ccEmail || "").trim();

    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim();
    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException("Falta configurar RESEND_API_KEY o CONTRACTS_FROM_EMAIL.");
    }

    const statementPdf = await this.getAccountStatementPdfUrl(user, contractId, 86_400);
    const documentUrl = statementPdf.url;
    const clientName = String(invoice.client?.fullName || "Cliente");
    const paymentRef = String(invoice.contract?.paymentReference || "N/A");
    const logoSrc = await this.loadCompanyLogoEmailSrc();
    const statusLabels: Record<string, string> = {
      FACTURA_EMITIDA: "Emitida",
      FACTURA_PARCIAL: "Parcial",
      FACTURA_PAGADA: "Pagada",
      FACTURA_VENCIDA: "Vencida",
      FACTURA_ANULADA: "Anulada",
    };
    const statusText = statusLabels[String(invoice.status || "").trim().toUpperCase()] || "En gestión";
    const currency = String(invoice.currency || "USD").trim().toUpperCase();
    const formatAmount = (value: unknown) => `${currency} ${this.toNumber(value, 0).toFixed(2)}`;
    const totalAmount = formatAmount(invoice.totalAmount);
    const verifiedAmount = formatAmount(invoice.verifiedAmount);
    const pendingAmount = formatAmount(invoice.pendingAmount);
    const balanceAmount = formatAmount(invoice.balanceAmount);

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromEmail,
      to: [targetEmail],
      ...(normalizedCc ? { cc: [normalizedCc] } : {}),
      subject: `📄 Estado de Cuenta - Contrato ${invoice.contractNumber}`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Estado de Cuenta - Viajes Alma Nova</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              ${logoSrc ? `<img src="${logoSrc}" alt="Viajes Alma Nova" style="max-width: 180px; height: auto; margin-bottom: 16px;" />` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                Viajes Alma Nova
              </h1>
              <p style="margin: 8px 0 0 0; color: #e9d5ff; font-size: 14px; font-weight: 500;">
                Experiencias inolvidables, destinos únicos
              </p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 0 30px; text-align: center;">
              <div style="display: inline-block; background-color: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 50px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                📄 Estado de Cuenta
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                Hola ${clientName},
              </h2>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Aquí tienes el estado de cuenta actualizado de tu contrato con Viajes Alma Nova.
              </p>

              <!-- Contract Info -->
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Contrato:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${String(invoice.contractNumber || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Código de pago:</td>
                    <td style="padding: 8px 0; color: #dc2626; font-weight: 700; font-size: 16px; text-align: right; font-family: monospace;">${paymentRef}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Estado:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${statusText}</td>
                  </tr>
                </table>
              </div>

              <!-- Payment Code Notice -->
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
                  <strong>⚠️ IMPORTANTE:</strong> Al realizar transferencias o depósitos, SIEMPRE incluye tu código de pago <strong>${paymentRef}</strong> para identificar tu abono automáticamente.
                </p>
              </div>

              <!-- Amounts Summary -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">Total del contrato:</td>
                    <td style="padding: 10px 0; color: #ffffff; font-weight: 700; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${totalAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">Total verificado:</td>
                    <td style="padding: 10px 0; color: #10b981; font-weight: 600; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${verifiedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px 0; color: #e9d5ff; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.2);">En revisión bancaria:</td>
                    <td style="padding: 10px 0; color: #fbbf24; font-weight: 600; font-size: 16px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">${pendingAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0 0 0; color: #ffffff; font-size: 16px; font-weight: 600;">Saldo por cobrar:</td>
                    <td style="padding: 12px 0 0 0; color: #ffffff; font-weight: 700; font-size: 20px; text-align: right;">${balanceAmount}</td>
                  </tr>
                </table>
              </div>

              <!-- Action Button -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${documentUrl}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  📄 Ver Estado de Cuenta Completo (PDF)
                </a>
              </div>

              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Este documento incluye el detalle completo de pagos, abonos y saldos. Si tienes alguna pregunta, no dudes en contactarnos.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px; font-weight: 600;">
                Atentamente,
              </p>
              <p style="margin: 0 0 20px 0; color: #667eea; font-size: 18px; font-weight: 700;">
                Equipo Viajes Alma Nova
              </p>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                  <strong>Cédula Jurídica:</strong> 3-101-960028<br>
                  <strong>Teléfono:</strong> +506 7006-7572<br>
                  <strong>Email:</strong> contratos@viajesalmanova.com
                </p>
              </div>
            </td>
          </tr>

        </table>
        
        <!-- Bottom Spacer -->
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
          © ${new Date().getFullYear()} Viajes Alma Nova. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `Estado de Cuenta del Contrato\n\nCliente: ${clientName}\nContrato: ${String(invoice.contractNumber || "-")}\nEstado: ${statusText}\n\nRESUMEN DE MONTOS:\nTotal del contrato: ${totalAmount}\nTotal verificado: ${verifiedAmount}\nEn revisión bancaria: ${pendingAmount}\nSaldo por cobrar: ${balanceAmount}\n\nVer estado de cuenta completo (PDF): ${documentUrl}\n\nViajes Alma Nova\nCédula Jurídica: 3-101-960028\nTeléfono: +506 7006-7572\nEmail: contratos@viajesalmanova.com`,
    });

    await this.logAudit({
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "SEND_ACCOUNT_STATEMENT",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        contractId,
        contractNumber: invoice.contractNumber,
        invoiceNumber: invoice.invoiceNumber,
        sentToEmail: targetEmail,
        ccEmail: normalizedCc || null,
      },
      sourceIp,
      userAgent,
    });

    return {
      ok: true,
      contractId,
      invoiceId: invoice.id,
      sentToEmail: targetEmail,
      ccEmail: normalizedCc || null,
    };
  }

  async bootstrapContractBilling(
    user: { id: string; email: string; fullName: string },
    contractId: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const contract = await (this.prisma as any).contract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });

    if (!contract) {
      throw new NotFoundException("Contrato no encontrado.");
    }

    const existing = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
    });

    if (existing) {
      return {
        created: false,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
      };
    }

    const payload = contract.payload && typeof contract.payload === "object" ? contract.payload : {};
    const totalAmount = this.toNumber((payload as any)?.totalAmount, 0);
    const reservationAmount = this.toNumber((payload as any)?.reservationAmount, 0);
    const paymentDueDate = this.toDateOrNull((payload as any)?.paymentDueDate);

    const invoice = await (this.prisma as any).billingInvoice.create({
      data: {
        contractId: contract.id,
        clientId: contract.clientId,
        contractNumber: contract.contractNumber,
        invoiceNumber: `FAC-${contract.contractNumber}`,
        currency: "USD",
        totalAmount: this.toDecimalString(totalAmount),
        verifiedAmount: this.toDecimalString(0),
        pendingAmount: this.toDecimalString(0),
        balanceAmount: this.toDecimalString(totalAmount),
        status: "FACTURA_EMITIDA",
        paymentDueDate,
        createdByUserId: user.id,
        createdByName: user.fullName,
      },
    });

    await this.logAudit({
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "CREATE",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        contractNumber: invoice.contractNumber,
        paymentDueDate: invoice.paymentDueDate,
      },
      sourceIp,
      userAgent,
    });

    await this.ensureInvoicePdf(invoice.id);

    let reservationPaymentId: string | null = null;

    if (reservationAmount > 0) {
      const payment = await (this.prisma as any).billingPayment.create({
        data: {
          invoiceId: invoice.id,
          contractId: contract.id,
          type: "RESERVATION",
          amount: this.toDecimalString(reservationAmount),
          currency: "USD",
          status: "ABONO_REPORTADO",
          notes: "Abono inicial de reserva generado desde contrato.",
          createdByUserId: user.id,
          createdByName: user.fullName,
        },
      });

      reservationPaymentId = payment.id;

      const receipt = await (this.prisma as any).billingReceipt.create({
        data: {
          paymentId: payment.id,
          invoiceId: invoice.id,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          receiptNumber: await this.buildReceiptNumber(),
          amount: this.toDecimalString(reservationAmount),
          issuedByUserId: user.id,
          issuedByName: user.fullName,
          status: "RECIBO_PENDIENTE_VERIFICACION",
        },
      });

      await this.logAudit({
        entityType: "PAYMENT",
        entityId: payment.id,
        action: "REPORT",
        actorUserId: user.id,
        actorName: user.fullName,
        afterJson: {
          amount: payment.amount,
          type: payment.type,
          status: payment.status,
        },
        sourceIp,
        userAgent,
      });

      await this.logAudit({
        entityType: "RECEIPT",
        entityId: receipt.id,
        action: "CREATE_PENDING",
        actorUserId: user.id,
        actorName: user.fullName,
        afterJson: {
          receiptNumber: receipt.receiptNumber,
          status: receipt.status,
          paymentId: payment.id,
        },
        sourceIp,
        userAgent,
      });

      await this.ensureReceiptPdf(receipt.id);

      await this.recalcInvoiceAmounts(invoice.id);

      // Vincular documentos de reserva del contrato como adjuntos del pago
      try {
        const contractWithDocs = await (this.prisma as any).contract.findUnique({
          where: { id: contract.id },
          include: { documents: true },
        });
        const reservationDocs = this.normalizeContractReservationDocuments(contractWithDocs);
        for (const doc of reservationDocs) {
          await (this.prisma as any).billingPaymentAttachment.create({
            data: {
              paymentId: payment.id,
              objectKey: doc.objectKey,
              originalFileName: doc.originalFileName,
              mimeType: doc.mimeType,
              size: doc.size,
            },
          });
        }
        if (reservationDocs.length) {
          this.logger.log(`[bootstrapContractBilling] Vinculados ${reservationDocs.length} comprobante(s) de reserva al pago ${payment.id}`);
        }
      } catch (docError) {
        this.logger.warn(`[bootstrapContractBilling] No se pudieron vincular comprobantes: ${docError instanceof Error ? docError.message : String(docError)}`);
      }
    }

    return {
      created: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      reservationPaymentId,
    };
  }

  async listBillingContracts(
    _user: { id: string; email: string; fullName: string },
    query: ListBillingContractsDto,
  ) {
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(query.limit || 30, 1), 100);
    const status = String(query.status || "").trim();

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }

    // Filtros de fecha
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;

    // Si hay preset, calculamos el rango
    if (query.datePreset) {
      const now = new Date();
      dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      
      switch (query.datePreset) {
        case "7days":
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "1week":
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "2weeks":
          dateFrom = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
          break;
        case "1month":
          dateFrom = new Date(now);
          dateFrom.setMonth(dateFrom.getMonth() - 1);
          break;
        case "3months":
          dateFrom = new Date(now);
          dateFrom.setMonth(dateFrom.getMonth() - 3);
          break;
      }
      
      if (dateFrom) {
        dateFrom.setHours(0, 0, 0, 0);
      }
    }
    
    // Si hay fechas específicas, las usamos (sobrescriben preset)
    if (query.dateFrom) {
      const parsed = new Date(query.dateFrom);
      if (!Number.isNaN(parsed.getTime())) {
        dateFrom = parsed;
        dateFrom.setHours(0, 0, 0, 0);
      }
    }
    
    if (query.dateTo) {
      const parsed = new Date(query.dateTo);
      if (!Number.isNaN(parsed.getTime())) {
        dateTo = parsed;
        dateTo.setHours(23, 59, 59, 999);
      }
    }

    // Aplicar filtros de fecha sobre createdAt (cuando se emitió la factura)
    if (dateFrom && dateTo) {
      where.createdAt = {
        gte: dateFrom,
        lte: dateTo,
      };
    } else if (dateFrom) {
      where.createdAt = {
        gte: dateFrom,
      };
    } else if (dateTo) {
      where.createdAt = {
        lte: dateTo,
      };
    }

    if (q) {
      where.OR = [
        { contractNumber: { contains: q, mode: "insensitive" } },
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { client: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { client: { is: { idNumber: { contains: q, mode: "insensitive" } } } },
        { client: { is: { email: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const items = await (this.prisma as any).billingInvoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        client: true,
        contract: {
          select: {
            id: true,
            paymentReference: true,
          },
        },
        creditNotes: {
          where: { status: "NC_APLICADA" },
          select: { amount: true },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            reportedAt: true,
          },
        },
      },
    });

    return {
      items: items.map((item: any) => {
        const ncAppliedAmount = (item.creditNotes || []).reduce(
          (sum: number, note: any) => sum + this.toNumber(note.amount, 0),
          0,
        );
        const grossInvoicedAmount = this.toNumber(item.totalAmount) + ncAppliedAmount;
        const overdueDays = this.computeOverdueDays(item.paymentDueDate);
        const balance = this.toNumber(item.balanceAmount);
        const effectiveStatus = overdueDays > 0 && balance > 0 ? "FACTURA_VENCIDA" : item.status;

        return {
        id: item.id,
        contractId: item.contractId,
        contractNumber: item.contractNumber,
        paymentReference: item.contract?.paymentReference || null,
        invoiceNumber: item.invoiceNumber,
        status: effectiveStatus,
        paymentDueDate: item.paymentDueDate,
        isOverdue: overdueDays > 0,
        overdueDays,
        client: {
          id: item.client?.id,
          fullName: item.client?.fullName || "-",
          idNumber: item.client?.idNumber || "-",
          email: item.client?.email || "-",
          phone: item.client?.phone || "-",
        },
        amounts: {
          grossInvoiced: grossInvoicedAmount,
          creditNotesApplied: ncAppliedAmount,
          total: this.toNumber(item.totalAmount),
          verified: this.toNumber(item.verifiedAmount),
          pending: this.toNumber(item.pendingAmount),
          balance: this.toNumber(item.balanceAmount),
          currency: item.currency,
        },
        lastMovement: item.payments?.[0]
          ? {
              paymentId: item.payments[0].id,
              status: item.payments[0].status,
              at: item.payments[0].reportedAt,
            }
          : null,
        };
      }),
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

  async getAdminReports(
    _user: { id: string; email: string; fullName: string },
    query: {
      from?: string;
      to?: string;
      q?: string;
      invoiceStatus?: string;
      paymentStatus?: string;
      limitInvoices?: number;
      limitPayments?: number;
    },
  ) {
    const from = String(query.from || "").trim();
    const to = String(query.to || "").trim();
    const q = String(query.q || "").trim();
    const invoiceStatus = String(query.invoiceStatus || "").trim();
    const paymentStatus = String(query.paymentStatus || "").trim();
    const limitInvoices = Math.min(Math.max(Number(query.limitInvoices || 200), 1), 1000);
    const limitPayments = Math.min(Math.max(Number(query.limitPayments || 400), 1), 2000);

    const invoiceWhere: Record<string, unknown> = {};
    const paymentWhere: Record<string, unknown> = {};

    if (from || to) {
      const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
      const toDate = to ? new Date(`${to}T23:59:59.999Z`) : null;

      if (fromDate || toDate) {
        invoiceWhere.issuedAt = {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        };
        paymentWhere.reportedAt = {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        };
      }
    }

    if (invoiceStatus) {
      const invoiceStatuses = invoiceStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (invoiceStatuses.length === 1) {
        invoiceWhere.status = invoiceStatuses[0];
      } else if (invoiceStatuses.length > 1) {
        invoiceWhere.status = { in: invoiceStatuses };
      }
    }

    if (paymentStatus) {
      const paymentStatuses = paymentStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (paymentStatuses.length === 1) {
        paymentWhere.status = paymentStatuses[0];
      } else if (paymentStatuses.length > 1) {
        paymentWhere.status = { in: paymentStatuses };
      }
    }

    if (q) {
      invoiceWhere.OR = [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { contractNumber: { contains: q, mode: "insensitive" } },
        { client: { is: { fullName: { contains: q, mode: "insensitive" } } } },
        { client: { is: { idNumber: { contains: q, mode: "insensitive" } } } },
        { client: { is: { email: { contains: q, mode: "insensitive" } } } },
      ];

      paymentWhere.OR = [
        { invoice: { is: { invoiceNumber: { contains: q, mode: "insensitive" } } } },
        { invoice: { is: { contractNumber: { contains: q, mode: "insensitive" } } } },
        { invoice: { is: { client: { is: { fullName: { contains: q, mode: "insensitive" } } } } } },
        { payerName: { contains: q, mode: "insensitive" } },
        { bankReference: { contains: q, mode: "insensitive" } },
      ];
    }

    const [
      invoiceAggregate,
      paymentAggregate,
      appliedCreditNoteAggregate,
      invoiceStatusCounts,
      paymentStatusCounts,
      invoices,
      payments,
    ] = await Promise.all([
      (this.prisma as any).billingInvoice.aggregate({
        where: invoiceWhere,
        _count: { _all: true },
        _sum: {
          totalAmount: true,
          verifiedAmount: true,
          pendingAmount: true,
          balanceAmount: true,
        },
      }),
      (this.prisma as any).billingPayment.aggregate({
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      (this.prisma as any).billingCreditNote.aggregate({
        where: {
          status: "NC_APLICADA",
          ...(q
            ? {
                OR: [
                  { creditNoteNumber: { contains: q, mode: "insensitive" } },
                  { contractNumber: { contains: q, mode: "insensitive" } },
                  { reason: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
          ...(from || to
            ? {
                issuedAt: {
                  ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                  ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
                },
              }
            : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      (this.prisma as any).billingInvoice.groupBy({
        by: ["status"],
        where: invoiceWhere,
        _count: { _all: true },
      }),
      (this.prisma as any).billingPayment.groupBy({
        by: ["status"],
        where: paymentWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      (this.prisma as any).billingInvoice.findMany({
        where: invoiceWhere,
        orderBy: { issuedAt: "desc" },
        take: limitInvoices,
        include: {
          client: true,
          creditNotes: {
            where: { status: "NC_APLICADA" },
            select: { amount: true },
          },
        },
      }),
      (this.prisma as any).billingPayment.findMany({
        where: paymentWhere,
        orderBy: { reportedAt: "desc" },
        take: limitPayments,
        include: {
          invoice: {
            include: {
              client: true,
            },
          },
          attachments: {
            select: {
              id: true,
              objectKey: true,
              originalFileName: true,
              size: true,
              mimeType: true,
            },
          },
        },
      }),
    ]);

    const salesByStatus: Record<string, number> = {};
    for (const row of invoiceStatusCounts || []) {
      salesByStatus[String(row.status)] = Number(row?._count?._all || 0);
    }

    const collectionsByStatus: Record<string, { count: number; amount: number }> = {};
    for (const row of paymentStatusCounts || []) {
      collectionsByStatus[String(row.status)] = {
        count: Number(row?._count?._all || 0),
        amount: this.toNumber(row?._sum?.amount, 0),
      };
    }

    const overdueInvoices = (invoices || []).filter((item: any) => {
      const balance = this.toNumber(item.balanceAmount, 0);
      return balance > 0 && this.computeOverdueDays(item.paymentDueDate) > 0;
    });
    const overdueInvoicesCount = overdueInvoices.length;
    const overdueBalanceAmount = overdueInvoices.reduce(
      (sum: number, item: any) => sum + this.toNumber(item.balanceAmount, 0),
      0,
    );

    return {
      filters: {
        from: from || null,
        to: to || null,
        q: q || null,
        invoiceStatus: invoiceStatus || null,
        paymentStatus: paymentStatus || null,
      },
      summary: {
        sales: {
          invoicesCount: Number(invoiceAggregate?._count?._all || 0),
          totalInvoicedAmount: this.toNumber(invoiceAggregate?._sum?.totalAmount, 0),
          totalCreditNotesAppliedAmount: this.toNumber(appliedCreditNoteAggregate?._sum?.amount, 0),
          creditNotesAppliedCount: Number(appliedCreditNoteAggregate?._count?._all || 0),
          totalVerifiedAmount: this.toNumber(invoiceAggregate?._sum?.verifiedAmount, 0),
          totalPendingAmount: this.toNumber(invoiceAggregate?._sum?.pendingAmount, 0),
          totalBalanceAmount: this.toNumber(invoiceAggregate?._sum?.balanceAmount, 0),
          overdueInvoicesCount,
          overdueBalanceAmount,
          byStatus: salesByStatus,
        },
        collections: {
          paymentsCount: Number(paymentAggregate?._count?._all || 0),
          totalPaymentsAmount: this.toNumber(paymentAggregate?._sum?.amount, 0),
          byStatus: collectionsByStatus,
        },
      },
      invoices: (invoices || []).map((item: any) => {
        const ncAppliedAmount = (item.creditNotes || []).reduce(
          (sum: number, note: any) => sum + this.toNumber(note.amount, 0),
          0,
        );
        const grossInvoicedAmount = this.toNumber(item.totalAmount) + ncAppliedAmount;
        const overdueDays = this.computeOverdueDays(item.paymentDueDate);
        const balance = this.toNumber(item.balanceAmount);
        const effectiveStatus = overdueDays > 0 && balance > 0 ? "FACTURA_VENCIDA" : item.status;

        return {
          id: item.id,
          contractId: item.contractId,
          contractNumber: item.contractNumber,
          invoiceNumber: item.invoiceNumber,
          status: effectiveStatus,
          issuedAt: item.issuedAt,
          paymentDueDate: item.paymentDueDate,
          isOverdue: overdueDays > 0,
          overdueDays,
          amounts: {
          grossInvoiced: grossInvoicedAmount,
          creditNotesApplied: ncAppliedAmount,
          total: this.toNumber(item.totalAmount),
          verified: this.toNumber(item.verifiedAmount),
          pending: this.toNumber(item.pendingAmount),
          balance: this.toNumber(item.balanceAmount),
          currency: item.currency,
        },
        client: {
          id: item.client?.id,
          fullName: item.client?.fullName || "-",
          idNumber: item.client?.idNumber || "-",
          email: item.client?.email || "-",
        },
        };
      }),
      payments: await Promise.all((payments || []).map(async (item: any) => {
        // Generar URLs firmadas para attachments
        const attachmentsWithUrls = await Promise.all(
          (item.attachments || []).map(async (att: any) => ({
            id: att.id,
            originalFileName: att.originalFileName,
            size: att.size,
            mimeType: att.mimeType,
            url: await this.buildSignedObjectUrl(att.objectKey, 3600), // 1 hora de validez
          }))
        );

        return {
          id: item.id,
          invoiceId: item.invoiceId,
          contractId: item.contractId,
          type: item.type,
          status: item.status,
          amount: this.toNumber(item.amount),
          currency: item.currency,
          reportedAt: item.reportedAt,
          verifiedAt: item.verifiedAt,
          bankReference: item.bankReference,
          payerName: item.payerName,
          voucherDate: this.extractVoucherDateFromNotes(item.notes),
          createdByName: item.createdByName,
          verifiedByName: item.verifiedByName,
          rejectionReason: item.rejectionReason,
          attachments: attachmentsWithUrls,
          invoice: {
            invoiceNumber: item.invoice?.invoiceNumber || "-",
            contractNumber: item.invoice?.contractNumber || "-",
            status: item.invoice?.status || "-",
          },
          client: {
            id: item.invoice?.client?.id,
            fullName: item.invoice?.client?.fullName || "-",
            idNumber: item.invoice?.client?.idNumber || "-",
            email: item.invoice?.client?.email || "-",
          },
        };
      })),
      overdueAlerts: overdueInvoices.slice(0, 200).map((item: any) => ({
        invoiceId: item.id,
        contractId: item.contractId,
        invoiceNumber: item.invoiceNumber,
        contractNumber: item.contractNumber,
        dueDate: item.paymentDueDate,
        overdueDays: this.computeOverdueDays(item.paymentDueDate),
        balanceAmount: this.toNumber(item.balanceAmount),
        client: {
          id: item.client?.id,
          fullName: item.client?.fullName || "-",
          idNumber: item.client?.idNumber || "-",
          email: item.client?.email || "-",
        },
      })),
    };
  }

  async getContractAccount(
    _user: { id: string; email: string; fullName: string },
    contractId: string,
  ) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      include: {
        client: true,
        contract: {
          include: {
            documents: true,
          },
        },
        creditNotes: {
          orderBy: { createdAt: "desc" },
        },
        payments: {
          orderBy: { createdAt: "desc" },
          include: {
            attachments: true,
            receipt: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    const clientBalance = await (this.prisma as any).billingClientBalance.findUnique({
      where: { clientId: invoice.clientId },
    });

    const creditNotesAppliedAmount = (invoice.creditNotes || [])
      .filter((note: any) => String(note.status || "") === "NC_APLICADA")
      .reduce((sum: number, note: any) => sum + this.toNumber(note.amount, 0), 0);
    const grossInvoicedAmount = this.toNumber(invoice.totalAmount) + creditNotesAppliedAmount;
    const overdueDays = this.computeOverdueDays(invoice.paymentDueDate);
    const invoiceBalance = this.toNumber(invoice.balanceAmount);
    const effectiveInvoiceStatus = overdueDays > 0 && invoiceBalance > 0 ? "FACTURA_VENCIDA" : invoice.status;

    const payments = await Promise.all(
      (invoice.payments || []).map(async (payment: any) => {
        const attachments = await Promise.all(
          (payment.attachments || []).map(async (file: any) => ({
            id: file.id,
            originalFileName: file.originalFileName,
            mimeType: file.mimeType,
            size: file.size,
            url: await this.buildSignedObjectUrl(file.objectKey),
          })),
        );

        return {
          id: payment.id,
          type: payment.type,
          status: payment.status,
          amount: this.toNumber(payment.amount),
          currency: payment.currency,
          reportedAt: payment.reportedAt,
          voucherDate: this.extractVoucherDateFromNotes(payment.notes),
          createdByName: payment.createdByName,
          bankReference: payment.bankReference,
          payerName: payment.payerName,
          originBank: payment.originBank,
          destinationBank: payment.destinationBank,
          destinationAccount: payment.destinationAccount,
          notes: payment.notes,
          verifiedAt: payment.verifiedAt,
          verifiedByName: payment.verifiedByName,
          rejectionReason: payment.rejectionReason,
          receipt: payment.receipt
            ? {
                id: payment.receipt.id,
                receiptNumber: payment.receipt.receiptNumber,
                status: payment.receipt.status,
                issuedAt: payment.receipt.issuedAt,
                sentToEmail: payment.receipt.sentToEmail,
                hasPdf: Boolean(payment.receipt.objectKeyPdf),
              }
            : null,
          attachments,
        };
      }),
    );

    const reservationProofCandidates = await Promise.all(
      this.normalizeContractReservationDocuments(invoice.contract).map(async (doc: {
        id: string;
        originalFileName: string;
        mimeType: string;
        size: number;
        objectKey: string;
      }) => ({
        id: doc.id,
        originalFileName: doc.originalFileName,
        mimeType: doc.mimeType,
        size: doc.size,
        url: await this.buildSignedObjectUrl(doc.objectKey),
      })),
    );

    return {
      invoice: {
        id: invoice.id,
        contractId: invoice.contractId,
        contractNumber: invoice.contractNumber,
        invoiceNumber: invoice.invoiceNumber,
        paymentReference: invoice.contract?.paymentReference || null,
        status: effectiveInvoiceStatus,
        issuedAt: invoice.issuedAt,
        paymentDueDate: invoice.paymentDueDate,
        isOverdue: overdueDays > 0,
        overdueDays,
        hasPdf: Boolean(invoice.objectKeyPdf),
        source: invoice.contract?.source || null, // Agregar source del contrato
        amounts: {
          grossInvoiced: grossInvoicedAmount,
          creditNotesApplied: creditNotesAppliedAmount,
          total: this.toNumber(invoice.totalAmount),
          verified: this.toNumber(invoice.verifiedAmount),
          pending: this.toNumber(invoice.pendingAmount),
          balance: this.toNumber(invoice.balanceAmount),
          currency: invoice.currency,
        },
      },
      client: {
        id: invoice.client?.id,
        fullName: invoice.client?.fullName || "-",
        idNumber: invoice.client?.idNumber || "-",
        email: invoice.client?.email || "-",
        phone: invoice.client?.phone || "-",
        availableCreditAmount: this.toNumber(clientBalance?.availableCreditAmount, 0),
      },
      creditNotes: (invoice.creditNotes || []).map((note: any) => ({
        id: note.id,
        creditNoteNumber: note.creditNoteNumber,
        status: note.status,
        reason: note.reason,
        amount: this.toNumber(note.amount),
        issuedAt: note.issuedAt,
        issuedByName: note.issuedByName,
        appliedAt: note.appliedAt,
        appliedByName: note.appliedByName,
        hasPdf: Boolean(note.objectKeyPdf),
      })),
      payments,
      reservationProofCandidates,
    };
  }

  async reportPayment(
    user: { id: string; email: string; fullName: string },
    contractId: string,
    dto: ReportPaymentDto,
    attachments: Array<{
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    }>,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    if (attachments.length > this.maxAttachmentCount) {
      throw new BadRequestException(`Maximo ${this.maxAttachmentCount} adjuntos por abono.`);
    }

    const amount = this.toNumber(dto.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("El monto del abono debe ser mayor a 0.");
    }

    const normalizedPaymentDate = String(dto.paymentDate || "").trim();
    let receiptDateObject: Date | null = null;
    if (normalizedPaymentDate) {
      const parsed = new Date(`${normalizedPaymentDate}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException("La fecha del abono no es valida.");
      }
      receiptDateObject = parsed;
    }

    for (const file of attachments) {
      if (!this.allowedAttachmentMimeTypes.has(file.mimetype)) {
        throw new BadRequestException(`Tipo de archivo no permitido: ${file.mimetype}`);
      }
      if (!file.size || file.size > this.maxAttachmentSizeBytes) {
        throw new BadRequestException(
          `Cada archivo debe ser <= ${Math.floor(this.maxAttachmentSizeBytes / (1024 * 1024))} MB.`,
        );
      }
    }

    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      include: {
        client: true,
        contract: {
          include: {
            documents: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    // Validar paymentReference si fue proporcionado
    if (dto.paymentReference) {
      const providedRef = String(dto.paymentReference || "").trim().toUpperCase();
      const contractRef = String(invoice.contract?.paymentReference || "").trim().toUpperCase();
      
      if (!contractRef) {
        throw new BadRequestException(
          "Este contrato no tiene un código de pago asignado. Contacta a soporte."
        );
      }
      
      if (providedRef !== contractRef) {
        throw new BadRequestException(
          `El código de pago "${dto.paymentReference}" no coincide con el código del contrato "${invoice.contract.paymentReference}". Verifica e intenta nuevamente.`
        );
      }
    }

    if (invoice.status === "FACTURA_ANULADA") {
      throw new BadRequestException("La factura esta anulada y no acepta abonos.");
    }

    const pendingBalance = this.toNumber(invoice.balanceAmount, 0);
    if (amount > pendingBalance) {
      throw new BadRequestException("El abono no puede ser mayor al saldo pendiente del contrato.");
    }

    if (dto.type === "RESERVATION") {
      const existingReservation = await (this.prisma as any).billingPayment.findFirst({
        where: {
          contractId,
          type: "RESERVATION",
          status: { not: "ABONO_RECHAZADO" },
        },
        select: { id: true },
      });

      if (existingReservation) {
        throw new BadRequestException("La reserva ya fue aplicada para este contrato.");
      }
    }

    // Validar cuenta destino si fue proporcionada (REGLA DURA)
    if (dto.destinationAccount) {
      const accountNumber = String(dto.destinationAccount).trim();
      const detectedAccount = await (this.prisma as any).companyBankAccount.findFirst({
        where: {
          OR: [
            { accountNumber },
            { sinpeNumber: accountNumber },
          ],
        },
      });

      if (!detectedAccount) {
        throw new BadRequestException(
          `❌ CUENTA DESTINO NO REGISTRADA: La cuenta "${accountNumber}" no está registrada en el sistema. Por favor, registre esta cuenta bancaria antes de procesar el pago, o verifique que el número de cuenta sea correcto.`,
        );
      }

      if (!detectedAccount.isActive) {
        throw new BadRequestException(
          `❌ CUENTA DESTINO INACTIVA: La cuenta "${accountNumber}" (${detectedAccount.bankName}) está marcada como inactiva. Active la cuenta o use otra cuenta destino.`,
        );
      }

      // Si la cuenta es válida, usar su banco registrado
      if (!dto.destinationBank || dto.destinationBank.trim() === '') {
        dto.destinationBank = detectedAccount.bankName;
      }
    }

    // Validar duplicados: buscar pagos idénticos
    if (dto.bankReference) {
      const duplicatePayment = await (this.prisma as any).billingPayment.findFirst({
        where: {
          contractId,
          bankReference: dto.bankReference,
          amount: this.toDecimalString(amount),
          status: { not: "ABONO_RECHAZADO" },
        },
        select: {
          id: true,
          reportedAt: true,
          createdByName: true,
          amount: true,
        },
      });

      if (duplicatePayment) {
        throw new BadRequestException(
          `⚠️ PAGO DUPLICADO DETECTADO: Ya existe un pago con la misma referencia bancaria "${dto.bankReference}" por $${duplicatePayment.amount} USD registrado el ${this.formatDateTime(duplicatePayment.reportedAt)} por ${duplicatePayment.createdByName}. Por favor verifica que no sea un duplicado.`,
        );
      }
    }

    const metadataNotes = [
      normalizedPaymentDate ? `Fecha comprobante: ${normalizedPaymentDate}` : "",
      dto.paymentReference ? `Codigo de pago usado: ${dto.paymentReference}` : "",
      dto.destinationAccount ? `Cuenta destino: ${dto.destinationAccount}` : "",
      `Registro sistema: ${this.formatDateTime(new Date())}`,
      `Registrado por: ${user.fullName}`,
      String(dto.notes || "").trim(),
    ]
      .filter(Boolean)
      .join("\n");

    const payment = await (this.prisma as any).billingPayment.create({
      data: {
        invoiceId: invoice.id,
        contractId,
        type: dto.type,
        amount: this.toDecimalString(amount),
        currency: invoice.currency,
        status: "ABONO_REPORTADO",
        bankReference: dto.bankReference || null,
        payerName: dto.payerName || null,
        originBank: dto.originBank || null,
        destinationBank: dto.destinationBank || null,
        paymentCode: dto.paymentReference || null,
        receiptDate: receiptDateObject || null,
        notes: metadataNotes || null,
        createdByUserId: user.id,
        createdByName: user.fullName,
      },
    });

    const receipt = await (this.prisma as any).billingReceipt.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        contractId,
        contractNumber: invoice.contractNumber,
        receiptNumber: await this.buildReceiptNumber(),
        amount: this.toDecimalString(amount),
        issuedByUserId: user.id,
        issuedByName: user.fullName,
        status: "RECIBO_PENDIENTE_VERIFICACION",
      },
    });

    const savedAttachments = [] as Array<{ id: string; originalFileName: string }>;
    const reservationDocCandidates = this.normalizeContractReservationDocuments(invoice.contract);
    const shouldPreloadReservationDocs = dto.type === "RESERVATION" && !attachments.length;

    if (shouldPreloadReservationDocs && !reservationDocCandidates.length) {
      throw new BadRequestException(
        "No hay comprobante de reserva precargado en el contrato. Adjunta un comprobante para continuar.",
      );
    }

    if (shouldPreloadReservationDocs) {
      for (const doc of reservationDocCandidates) {
        const row = await (this.prisma as any).billingPaymentAttachment.create({
          data: {
            paymentId: payment.id,
            objectKey: doc.objectKey,
            originalFileName: doc.originalFileName,
            mimeType: doc.mimeType,
            size: doc.size,
          },
        });
        savedAttachments.push({ id: row.id, originalFileName: row.originalFileName });
      }
    } else {
      for (const file of attachments) {
        // Convertir imágenes a WebP automáticamente
        const processedFile = await this.convertImageToWebP(file);

        const objectKey = [
          "billing",
          this.sanitizeSegment(invoice.contractNumber),
          "payments",
          payment.id,
          `${Date.now()}-${this.sanitizeSegment(processedFile.originalname)}`,
        ].join("/");

        await this.uploadToSpaces({
          objectKey,
          contentType: processedFile.mimetype,
          body: processedFile.buffer,
        });

        const row = await (this.prisma as any).billingPaymentAttachment.create({
          data: {
            paymentId: payment.id,
            objectKey,
            originalFileName: processedFile.originalname,
            mimeType: processedFile.mimetype,
            size: processedFile.size,
          },
        });

        savedAttachments.push({ id: row.id, originalFileName: row.originalFileName });
      }
    }

    await this.recalcInvoiceAmounts(invoice.id);

    await this.logAudit({
      entityType: "PAYMENT",
      entityId: payment.id,
      action: "REPORT",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        amount: payment.amount,
        status: payment.status,
        type: payment.type,
        attachments: savedAttachments.length,
      },
      sourceIp,
      userAgent,
    });

    await this.logAudit({
      entityType: "RECEIPT",
      entityId: receipt.id,
      action: "CREATE_PENDING",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        receiptNumber: receipt.receiptNumber,
        status: receipt.status,
        paymentId: payment.id,
      },
      sourceIp,
      userAgent,
    });

    await this.ensureReceiptPdf(receipt.id);

    return {
      paymentId: payment.id,
      receiptId: receipt.id,
      receiptNumber: receipt.receiptNumber,
      status: payment.status,
      amount,
      attachments: savedAttachments,
    };
  }

  async markPaymentInReview(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const payment = await (this.prisma as any).billingPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException("Abono no encontrado.");
    }

    if (!["ABONO_REPORTADO", "ABONO_EN_REVISION"].includes(String(payment.status || ""))) {
      throw new BadRequestException("Solo se pueden pasar a revision abonos reportados.");
    }

    const updated = await (this.prisma as any).billingPayment.update({
      where: { id: paymentId },
      data: { status: "ABONO_EN_REVISION" },
    });

    await this.recalcInvoiceAmounts(updated.invoiceId);

    await this.logAudit({
      entityType: "PAYMENT",
      entityId: paymentId,
      action: "REVIEW",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: payment.status },
      afterJson: { status: updated.status },
      sourceIp,
      userAgent,
    });

    return { ok: true, paymentId: updated.id, status: updated.status };
  }

  async verifyPayment(
    user: { id: string; email: string; fullName: string },
    paymentId: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const payment = await (this.prisma as any).billingPayment.findUnique({
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

    if (!payment) {
      throw new NotFoundException("Abono no encontrado.");
    }

    if (!["ABONO_REPORTADO", "ABONO_EN_REVISION"].includes(String(payment.status || ""))) {
      throw new BadRequestException("Solo se pueden verificar abonos reportados o en revision.");
    }

    const now = new Date();
    const updated = await (this.prisma as any).billingPayment.update({
      where: { id: paymentId },
      data: {
        status: "ABONO_VERIFICADO",
        verifiedAt: now,
        verifiedByUserId: user.id,
        verifiedByName: user.fullName,
        rejectionReason: null,
      },
    });

    await this.recalcInvoiceAmounts(updated.invoiceId);

    await this.logAudit({
      entityType: "PAYMENT",
      entityId: paymentId,
      action: "VERIFY",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: payment.status },
      afterJson: {
        status: updated.status,
        verifiedAt: updated.verifiedAt,
        verifiedByUserId: updated.verifiedByUserId,
      },
      sourceIp,
      userAgent,
    });

    // Envío automático del recibo al cliente
    if (payment.receipt && payment.invoice?.client?.email) {
      try {
        const clientEmail = String(payment.invoice.client.email).trim();
        this.logger.log(`[verifyPayment] Enviando recibo automático al cliente: ${clientEmail}`);
        
        await this.approveAndSendReceipt(
          { ...user, role: "ADMIN" }, // Forzar rol ADMIN para permitir el primer envío
          payment.receipt.id,
          clientEmail,
          undefined,
          sourceIp,
          userAgent,
        );
        
        this.logger.log(`[verifyPayment] ✅ Recibo enviado automáticamente a ${clientEmail}`);
      } catch (emailError) {
        // No revertir la aprobación si falla el email, solo registrar el error
        this.logger.error(
          `[verifyPayment] ⚠️ No se pudo enviar el recibo automáticamente: ${emailError instanceof Error ? emailError.message : String(emailError)}`,
        );
      }
    } else {
      this.logger.warn(
        `[verifyPayment] ⚠️ No se pudo enviar recibo: receiptId=${payment.receipt?.id || "N/A"}, clientEmail=${payment.invoice?.client?.email || "N/A"}`,
      );
    }

    // Si el pago aprobado es la reserva inicial, habilitar el contrato para firma
    if (String(payment.type || "") === "RESERVATION" && payment.invoice?.contractId) {
      try {
        const contract = await (this.prisma as any).contract.findUnique({
          where: { id: payment.invoice.contractId },
          select: { id: true, status: true },
        });

        if (contract && ["PENDING_PAYMENT_RESERVE", "RESERVE_IN_REVIEW"].includes(String(contract.status || ""))) {
          await (this.prisma as any).contract.update({
            where: { id: contract.id },
            data: { status: "PENDING_SIGNATURE" },
          });
          this.logger.log(`[verifyPayment] ✅ Contrato ${contract.id} habilitado para firma tras pago de reserva aprobado.`);
        }
      } catch (contractUpdateError) {
        this.logger.error(
          `[verifyPayment] ⚠️ No se pudo actualizar el status del contrato: ${contractUpdateError instanceof Error ? contractUpdateError.message : String(contractUpdateError)}`,
        );
      }
    }

    return { ok: true, paymentId: updated.id, status: updated.status };
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
      include: { receipt: true },
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

  async getPaymentAttachment(
    user: { id: string; email: string; fullName: string; role?: string },
    paymentId: string,
    attachmentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    // Verificar que el attachment existe y pertenece al payment
    const attachment = await (this.prisma as any).billingPaymentAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        payment: {
          include: {
            invoice: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException("Archivo adjunto no encontrado.");
    }

    if (attachment.paymentId !== paymentId) {
      throw new BadRequestException("El archivo no pertenece a este pago.");
    }

    // Solo Admin/Contador pueden ver todos los attachments
    // Agentes solo pueden ver attachments de sus propios reportes
    const role = String(user.role || "").toUpperCase();
    if (!["ADMIN", "CONTADOR"].includes(role)) {
      // Si es agente, verificar que sea el creador del payment
      if (attachment.payment.createdByUserId !== user.id) {
        throw new BadRequestException("No tienes permiso para ver este archivo.");
      }
    }

    // Descargar archivo de S3
    try {
      const cfg = this.getSpacesConfig();
      const client = this.getSpacesClient();
      
      const command = new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: attachment.objectKey,
      });

      const response = await client.send(command);
      const stream = response.Body as any;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      return {
        buffer,
        mimeType: attachment.mimeType,
        fileName: attachment.originalFileName,
      };
    } catch (s3Error) {
      console.error("[getPaymentAttachment] S3 error:", s3Error);
      throw new BadRequestException("No se pudo descargar el archivo.");
    }
  }

  async createCreditNote(
    user: { id: string; email: string; fullName: string },
    contractId: string,
    dto: CreateCreditNoteDto,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const invoice = await (this.prisma as any).billingInvoice.findUnique({
      where: { contractId },
      include: { client: true },
    });

    if (!invoice) {
      throw new NotFoundException("No existe expediente de cobro para este contrato.");
    }

    if (String(invoice.status || "") === "FACTURA_ANULADA") {
      throw new BadRequestException("No se pueden emitir notas de credito para facturas anuladas.");
    }

    const amount = this.toNumber(dto.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("El monto de la nota de credito debe ser mayor a 0.");
    }

    const pendingBalance = this.toNumber(invoice.balanceAmount, 0);
    if (amount > pendingBalance) {
      throw new BadRequestException("La nota de credito no puede ser mayor al saldo pendiente del contrato.");
    }

    const normalizedReason = String(dto.reason || "").trim();
    if (!normalizedReason) {
      throw new BadRequestException("Debes indicar el motivo de la nota de credito.");
    }

    const creditNote = await (this.prisma as any).billingCreditNote.create({
      data: {
        creditNoteNumber: this.buildCreditNoteNumber(invoice.contractNumber),
        contractId,
        invoiceId: invoice.id,
        contractNumber: invoice.contractNumber,
        reason: normalizedReason,
        amount: this.toDecimalString(amount),
        status: "NC_PENDIENTE_APROBACION",
        sourceDocumentType: String(dto.sourceDocumentType || "INVOICE"),
        sourceDocumentId: String(dto.sourceDocumentId || invoice.id),
        issuedByUserId: user.id,
        issuedByName: user.fullName,
      },
    });

    await this.ensureCreditNotePdf(creditNote.id);

    await this.logAudit({
      entityType: "CREDIT_NOTE",
      entityId: creditNote.id,
      action: "CREATE",
      actorUserId: user.id,
      actorName: user.fullName,
      afterJson: {
        creditNoteNumber: creditNote.creditNoteNumber,
        amount: creditNote.amount,
        reason: creditNote.reason,
        status: creditNote.status,
      },
      sourceIp,
      userAgent,
    });

    return {
      ok: true,
      creditNoteId: creditNote.id,
      creditNoteNumber: creditNote.creditNoteNumber,
      status: creditNote.status,
    };
  }

  async applyCreditNote(
    user: { id: string; email: string; fullName: string },
    creditNoteId: string,
    dto: ApplyCreditNoteDto,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    return this.approveCreditNote(user, creditNoteId, dto, sourceIp, userAgent);
  }

  async listPendingCreditNotes(
    _user: { id: string; email: string; fullName: string },
    query: { q?: string; limit?: number } = {},
  ) {
    const q = String(query.q || "").trim();
    const limit = Math.min(Math.max(Number(query.limit || 80), 1), 200);

    const where: Record<string, unknown> = {
      status: "NC_PENDIENTE_APROBACION",
    };

    if (q) {
      where.OR = [
        { creditNoteNumber: { contains: q, mode: "insensitive" } },
        { contractNumber: { contains: q, mode: "insensitive" } },
        { reason: { contains: q, mode: "insensitive" } },
        { invoice: { is: { client: { is: { fullName: { contains: q, mode: "insensitive" } } } } } },
      ];
    }

    const items = await (this.prisma as any).billingCreditNote.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: limit,
      include: {
        invoice: {
          include: {
            client: true,
          },
        },
      },
    });

    return {
      items: (items || []).map((item: any) => ({
        id: item.id,
        creditNoteNumber: item.creditNoteNumber,
        contractId: item.contractId,
        invoiceId: item.invoiceId,
        contractNumber: item.contractNumber,
        status: item.status,
        reason: item.reason,
        amount: this.toNumber(item.amount),
        issuedAt: item.issuedAt,
        requestedBy: {
          id: item.issuedByUserId,
          name: item.issuedByName,
        },
        client: {
          id: item.invoice?.client?.id,
          fullName: item.invoice?.client?.fullName || "-",
          idNumber: item.invoice?.client?.idNumber || "-",
          email: item.invoice?.client?.email || "-",
        },
      })),
    };
  }

  async approveCreditNote(
    user: { id: string; email: string; fullName: string },
    creditNoteId: string,
    dto: ApplyCreditNoteDto,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const creditNote = await (this.prisma as any).billingCreditNote.findUnique({
      where: { id: creditNoteId },
      include: { invoice: true },
    });

    if (!creditNote) {
      throw new NotFoundException("Nota de credito no encontrada.");
    }

    if (String(creditNote.status || "") !== "NC_PENDIENTE_APROBACION") {
      throw new BadRequestException("Solo se pueden aprobar notas de credito pendientes de aprobacion.");
    }

    const creditAmount = this.toNumber(creditNote.amount, 0);
    const invoiceTotal = this.toNumber(creditNote.invoice?.totalAmount, 0);
    const nextTotal = Math.max(0, invoiceTotal - creditAmount);

    const now = new Date();

    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.billingCreditNote.update({
        where: { id: creditNote.id },
        data: {
          status: "NC_APLICADA",
          appliedAt: now,
          appliedByUserId: user.id,
          appliedByName: user.fullName,
        },
      });

      await tx.billingInvoice.update({
        where: { id: creditNote.invoiceId },
        data: {
          totalAmount: this.toDecimalString(nextTotal),
        },
      });

      const existingBalance = await tx.billingClientBalance.findUnique({
        where: { clientId: creditNote.invoice.clientId },
      });

      const nextCredit = this.toNumber(existingBalance?.availableCreditAmount, 0) + creditAmount;
      await tx.billingClientBalance.upsert({
        where: { clientId: creditNote.invoice.clientId },
        create: {
          clientId: creditNote.invoice.clientId,
          availableCreditAmount: this.toDecimalString(nextCredit),
          currency: creditNote.invoice.currency,
        },
        update: {
          availableCreditAmount: this.toDecimalString(nextCredit),
        },
      });
    });

    const updatedInvoice = await this.recalcInvoiceAmounts(creditNote.invoiceId);

    await this.logAudit({
      entityType: "CREDIT_NOTE",
      entityId: creditNote.id,
      action: "APPROVE_AND_APPLY",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: creditNote.status },
      afterJson: {
        status: "NC_APLICADA",
        notes: String(dto.notes || ""),
        invoiceTotalBefore: invoiceTotal,
        invoiceTotalAfter: nextTotal,
      },
      sourceIp,
      userAgent,
    });

    if (updatedInvoice) {
      await this.logAudit({
        entityType: "INVOICE",
        entityId: updatedInvoice.id,
        action: "UPDATE_TOTAL_BY_CREDIT_NOTE",
        actorUserId: user.id,
        actorName: user.fullName,
        beforeJson: { totalAmount: this.toDecimalString(invoiceTotal) },
        afterJson: {
          totalAmount: updatedInvoice.totalAmount,
          status: updatedInvoice.status,
          balanceAmount: updatedInvoice.balanceAmount,
        },
        sourceIp,
        userAgent,
      });
    }

    return {
      ok: true,
      creditNoteId: creditNote.id,
      status: "NC_APLICADA",
      invoiceId: creditNote.invoiceId,
    };
  }

  async rejectCreditNote(
    user: { id: string; email: string; fullName: string },
    creditNoteId: string,
    reason: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      throw new BadRequestException("Debes indicar motivo de rechazo.");
    }

    const creditNote = await (this.prisma as any).billingCreditNote.findUnique({
      where: { id: creditNoteId },
    });

    if (!creditNote) {
      throw new NotFoundException("Nota de credito no encontrada.");
    }

    if (String(creditNote.status || "") !== "NC_PENDIENTE_APROBACION") {
      throw new BadRequestException("Solo se pueden rechazar notas de credito pendientes.");
    }

    const updated = await (this.prisma as any).billingCreditNote.update({
      where: { id: creditNoteId },
      data: {
        status: "NC_RECHAZADA",
      },
    });

    await this.logAudit({
      entityType: "CREDIT_NOTE",
      entityId: creditNoteId,
      action: "REJECT",
      actorUserId: user.id,
      actorName: user.fullName,
      beforeJson: { status: creditNote.status },
      afterJson: { status: updated.status, reason: normalizedReason },
      sourceIp,
      userAgent,
    });

    return {
      ok: true,
      creditNoteId: updated.id,
      status: updated.status,
    };
  }

  async approveAndSendReceipt(
    user: { id: string; email: string; fullName: string; role?: string },
    receiptId: string,
    toEmail?: string,
    ccEmail?: string,
    sourceIp?: string | null,
    userAgent?: string | null,
  ) {
    const receipt = await (this.prisma as any).billingReceipt.findUnique({
      where: { id: receiptId },
      include: {
        payment: true,
        invoice: {
          include: {
            client: true,
            contract: true,
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

    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("CONTRACTS_FROM_EMAIL", "").trim();
    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException("Falta configurar RESEND_API_KEY o CONTRACTS_FROM_EMAIL.");
    }

    const resend = new Resend(apiKey);
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
    const logoSrc = await this.loadCompanyLogoEmailSrc();

    await resend.emails.send({
      from: fromEmail,
      to: [targetEmail],
      ...(normalizedCc ? { cc: [normalizedCc] } : {}),
      subject: `✅ Recibo Aprobado ${receipt.receiptNumber} - Viajes Alma Nova`,
      html: `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recibo Aprobado - Viajes Alma Nova</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6; line-height: 1.6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              ${logoSrc ? `<img src="${logoSrc}" alt="Viajes Alma Nova" style="max-width: 180px; height: auto; margin-bottom: 16px;" />` : ''}
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
                Viajes Alma Nova
              </h1>
              <p style="margin: 8px 0 0 0; color: #e9d5ff; font-size: 14px; font-weight: 500;">
                Experiencias inolvidables, destinos únicos
              </p>
            </td>
          </tr>

          <!-- Status Badge -->
          <tr>
            <td style="padding: 30px 30px 0 30px; text-align: center;">
              <div style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 12px 24px; border-radius: 50px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ✅ Recibo Aprobado
              </div>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 24px; font-weight: 600;">
                Hola ${clientName},
              </h2>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                ¡Excelentes noticias! Tu pago ha sido verificado y aprobado. El monto ha sido aplicado a tu contrato.
              </p>

              <!-- Payment Info Card -->
              <div style="background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Contrato:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${String(receipt.contractNumber || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Código de pago:</td>
                    <td style="padding: 8px 0; color: #dc2626; font-weight: 700; font-size: 16px; text-align: right; font-family: monospace;">${paymentRef}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Recibo:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-weight: 600; text-align: right;">${String(receipt.receiptNumber || "-")}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Monto pagado:</td>
                    <td style="padding: 8px 0; color: #10b981; font-weight: 700; font-size: 18px; text-align: right;">${amountFormatted}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #065f46; font-size: 14px;">Estado:</td>
                    <td style="padding: 8px 0; color: #10b981; font-weight: 600; text-align: right;">✅ Verificado y Aprobado</td>
                  </tr>
                </table>
              </div>

              <!-- Balance Summary Card -->
              <div style="background-color: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <h3 style="margin: 0 0 16px 0; color: #1e40af; font-size: 16px; font-weight: 600;">💰 Resumen de Saldo</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr style="border-bottom: 1px solid #cbd5e1;">
                    <td style="padding: 10px 0; color: #1e293b; font-size: 14px;">Saldo Anterior:</td>
                    <td style="padding: 10px 0; color: #1e293b; font-weight: 600; text-align: right; font-size: 15px;">${previousBalanceFormatted}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #cbd5e1;">
                    <td style="padding: 10px 0; color: #059669; font-size: 14px;">Pago Aplicado:</td>
                    <td style="padding: 10px 0; color: #059669; font-weight: 700; text-align: right; font-size: 15px;">- ${amountFormatted}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 0 0 0; color: #1e40af; font-size: 15px; font-weight: 700;">Saldo Pendiente:</td>
                    <td style="padding: 12px 0 0 0; color: ${newBalance > 0 ? '#dc2626' : '#059669'}; font-weight: 700; text-align: right; font-size: 18px;">${newBalanceFormatted}</td>
                  </tr>
                </table>
              </div>

              <!-- Payment Code Notice -->
              <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
                  <strong>⚠️ Recuerda:</strong> Para futuros pagos, SIEMPRE incluye tu código <strong>${paymentRef}</strong> al hacer transferencias o depósitos.
                </p>
              </div>

              <!-- Action Buttons -->
              <div style="text-align: center; margin: 30px 0;">
                <a href="${receiptPdfUrl}" style="display: inline-block; background-color: #667eea; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 0 8px 12px 8px;">
                  📄 Ver Recibo
                </a>
                ${accountStatementUrl ? `
                <a href="${accountStatementUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; margin: 0 8px 12px 8px;">
                  📊 Ver Estado de Cuenta
                </a>
                ` : ''}
              </div>

              <p style="margin: 20px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                Este recibo confirma que tu pago ha sido verificado contra nuestros registros bancarios. El estado de cuenta muestra el historial completo de movimientos.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px; font-weight: 600;">
                Atentamente,
              </p>
              <p style="margin: 0 0 20px 0; color: #667eea; font-size: 18px; font-weight: 700;">
                Equipo Viajes Alma Nova
              </p>
              
              <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 1.5;">
                  <strong>Cédula Jurídica:</strong> 3-101-960028<br>
                  <strong>Teléfono:</strong> +506 7006-7572<br>
                  <strong>Email:</strong> contratos@viajesalmanova.com
                </p>
              </div>
            </td>
          </tr>

        </table>
        
        <!-- Bottom Spacer -->
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; text-align: center;">
          © ${new Date().getFullYear()} Viajes Alma Nova. Todos los derechos reservados.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
      text: `Recibo Aprobado\n\nCliente: ${clientName}\nContrato: ${String(receipt.contractNumber || "-")}\nRecibo: ${String(receipt.receiptNumber || "-")}\nMonto pagado: ${amountFormatted}\nEstado: Verificado y Aprobado\n\nTu pago ha sido verificado contra nuestros registros bancarios y aplicado a tu contrato.\n\nDescarga el recibo PDF aquí: ${receiptPdfUrl}\n\nViajes Alma Nova\nCédula Jurídica: 3-101-960028\nTeléfono: +506 7006-7572\nEmail: contratos@viajesalmanova.com`,
    });

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

  async getPendingPaymentsCount(): Promise<number> {
    return this.prisma.billingPayment.count({
      where: {
        status: {
          in: ["ABONO_REPORTADO", "ABONO_EN_REVISION"],
        },
      },
    });
  }

  async getPendingCreditNotesCount(): Promise<number> {
    return this.prisma.billingCreditNote.count({
      where: {
        status: "NC_PENDIENTE_APROBACION",
      },
    });
  }

  async getPendingSignatureContractsCount(): Promise<number> {
    return (this.prisma as any).contract.count({
      where: {
        status: "PENDING_SIGNATURE",
      },
    });
  }

  async getDashboardMetrics(
    _user: { id: string; email: string; fullName: string },
    params: { period?: string; from?: string; to?: string },
  ) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    // Si se proporcionan fechas personalizadas, usarlas
    if (params.from || params.to) {
      if (params.from) {
        startDate = new Date(params.from);
        startDate.setHours(0, 0, 0, 0);
      } else {
        // Si no hay 'from', usar el inicio del año
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      if (params.to) {
        endDate = new Date(params.to);
        endDate.setHours(23, 59, 59, 999);
      }
    } else {
      // Usar período predefinido
      switch (params.period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          break;
        case "year":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        case "all":
          // Sin filtro de fecha - tomar todo
          startDate = new Date(2000, 0, 1);
          break;
        case "month":
        default:
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
      }
    }

    // Contar facturas por estado
    const invoicesByStatus = await (this.prisma as any).billingInvoice.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    // Contar pagos pendientes
    const pendingPayments = await (this.prisma as any).billingPayment.count({
      where: {
        status: { in: ["ABONO_REPORTADO", "ABONO_EN_REVISION"] },
      },
    });

    // Contar recibos pendientes de envío
    const pendingReceipts = await (this.prisma as any).billingReceipt.count({
      where: {
        status: "RECIBO_PENDIENTE_VERIFICACION",
      },
    });

    // Contar notas de crédito pendientes
    const pendingCreditNotes = await (this.prisma as any).billingCreditNote.count({
      where: {
        status: "NC_PENDIENTE_APROBACION",
      },
    });

    // Contar cuentas vencidas
    const overdueInvoices = await (this.prisma as any).billingInvoice.count({
      where: {
        paymentDueDate: { lt: now },
        balanceAmount: { gt: 0 },
        status: { notIn: ["FACTURA_PAGADA", "FACTURA_ANULADA"] },
      },
    });

    // Calcular montos del período
    const invoicesInPeriod = await (this.prisma as any).billingInvoice.aggregate({
      where: {
        issuedAt: { 
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        totalAmount: true,
        verifiedAmount: true,
        balanceAmount: true,
      },
      _count: { id: true },
    });

    // Pagos del período
    const paymentsInPeriod = await (this.prisma as any).billingPayment.aggregate({
      where: {
        reportedAt: { 
          gte: startDate,
          lte: endDate,
        },
        status: "ABONO_VERIFICADO",
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Gráfico de cobros por día (últimos 30 días)
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const dailyPayments = await (this.prisma as any).$queryRaw`
      SELECT 
        DATE("reportedAt") as day,
        SUM(amount) as total,
        COUNT(*) as count
      FROM "BillingPayment"
      WHERE "reportedAt" >= ${thirtyDaysAgo}
        AND status = 'ABONO_VERIFICADO'
      GROUP BY DATE("reportedAt")
      ORDER BY day ASC
    `;

    // Top clientes por saldo pendiente
    const topOverdueClients = await (this.prisma as any).$queryRaw`
      SELECT 
        c.id,
        c."fullName" as full_name,
        c.email,
        SUM(bi."balanceAmount") as total_balance,
        COUNT(bi.id) as invoice_count
      FROM "BillingInvoice" bi
      INNER JOIN "Client" c ON c.id = bi."clientId"
      WHERE bi."balanceAmount" > 0
        AND bi."paymentDueDate" < ${now}
      GROUP BY c.id, c."fullName", c.email
      ORDER BY total_balance DESC
      LIMIT 10
    `;

    return {
      period: params.period || "custom",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currentDate: now.toISOString(),
      summary: {
        invoices: {
          byStatus: invoicesByStatus.map((item: any) => ({
            status: item.status,
            count: item._count.id,
          })),
          overdue: overdueInvoices,
        },
        pendingTasks: {
          payments: pendingPayments,
          receipts: pendingReceipts,
          creditNotes: pendingCreditNotes,
          total: pendingPayments + pendingReceipts + pendingCreditNotes,
        },
        period: {
          invoicesCount: invoicesInPeriod._count.id || 0,
          invoicedAmount: this.toNumber(invoicesInPeriod._sum.totalAmount, 0),
          collectedAmount: this.toNumber(invoicesInPeriod._sum.verifiedAmount, 0),
          balanceAmount: this.toNumber(invoicesInPeriod._sum.balanceAmount, 0),
          paymentsCount: paymentsInPeriod._count.id || 0,
          paymentsAmount: this.toNumber(paymentsInPeriod._sum.amount, 0),
        },
      },
      charts: {
        dailyPayments: dailyPayments.map((item: any) => ({
          day: item.day,
          total: this.toNumber(item.total, 0),
          count: Number(item.count || 0),
        })),
      },
      alerts: {
        topOverdueClients: topOverdueClients.map((item: any) => ({
          id: item.id,
          fullName: item.full_name,
          email: item.email,
          totalBalance: this.toNumber(item.total_balance, 0),
          invoiceCount: Number(item.invoice_count || 0),
        })),
      },
    };
  }
}
