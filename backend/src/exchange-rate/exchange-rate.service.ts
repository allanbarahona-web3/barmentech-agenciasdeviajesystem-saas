import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SetExchangeRateDto } from "./dto/set-exchange-rate.dto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";

@Injectable()
export class ExchangeRateService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get the exchange rate for a specific date (or today if not provided)
   */
  async getExchangeRate(tenantId: string, date?: string) {
    // Super admins don't have a tenant, return null
    if (!tenantId) {
      return null;
    }

    let targetDate: Date;
    if (date) {
      // Parse YYYY-MM-DD as local date to avoid timezone issues
      const [year, month, day] = date.split('-').map(Number);
      targetDate = new Date(year, month - 1, day);
    } else {
      targetDate = new Date();
    }
    targetDate.setHours(0, 0, 0, 0);

    const rate = await (this.prisma as any).exchangeRate.findUnique({
      where: {
        date_tenantId: {
          date: targetDate,
          tenantId: tenantId,
        },
      },
    });

    if (!rate) {
      return null;
    }

    return {
      id: rate.id,
      date: rate.date,
      buyRate: Number(rate.buyRate),
      sellRate: Number(rate.sellRate),
      source: rate.source,
      setByName: rate.setByName,
      notes: rate.notes,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    };
  }

  /**
   * Get current (today's) exchange rate
   */
  async getCurrentExchangeRate(tenantId: string) {
    return this.getExchangeRate(tenantId);
  }

  /**
   * Get exchange rate history (last N days)
   */
  async getExchangeRateHistory(tenantId: string, days = 30) {
    const rates = await (this.prisma as any).exchangeRate.findMany({
      where: { tenantId },
      orderBy: { date: "desc" },
      take: days,
    });

    return rates.map((rate: any) => ({
      id: rate.id,
      date: rate.date,
      buyRate: Number(rate.buyRate),
      sellRate: Number(rate.sellRate),
      source: rate.source,
      setByName: rate.setByName,
      notes: rate.notes,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    }));
  }

  /**
   * Get exchange rate history for a specific date range
   */
  async getExchangeRateHistoryRange(tenantId: string, startDate: string, endDate: string) {
    // Parse YYYY-MM-DD as local dates
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const start = new Date(startYear, startMonth - 1, startDay);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endYear, endMonth - 1, endDay);
    end.setHours(23, 59, 59, 999);

    const rates = await (this.prisma as any).exchangeRate.findMany({
      where: {
        tenantId,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { date: "desc" },
    });

    return rates.map((rate: any) => ({
      id: rate.id,
      date: rate.date,
      buyRate: Number(rate.buyRate),
      sellRate: Number(rate.sellRate),
      source: rate.source,
      setByName: rate.setByName,
      notes: rate.notes,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    }));
  }

  /**
   * Set exchange rate for a specific date (admin only)
   */
  async setExchangeRate(
    dto: SetExchangeRateDto,
    user: { id: string; fullName: string; tenantId: string },
    tenantId: string,
  ) {
    // Parse YYYY-MM-DD as local date to avoid timezone issues
    const [year, month, day] = dto.date.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    targetDate.setHours(0, 0, 0, 0);

    const existing = await (this.prisma as any).exchangeRate.findUnique({
      where: {
        date_tenantId: {
          date: targetDate,
          tenantId: tenantId,
        },
      },
    });

    let rate;

    if (existing) {
      // Update existing rate
      rate = await (this.prisma as any).exchangeRate.update({
        where: { id: existing.id },
        data: {
          buyRate: dto.buyRate.toFixed(4),
          sellRate: dto.sellRate.toFixed(4),
          notes: dto.notes || null,
          setByUserId: user.id,
          setByName: user.fullName,
        },
      });
    } else {
      // Create new rate
      rate = await (this.prisma as any).exchangeRate.create({
        data: {
          date: targetDate,
          buyRate: dto.buyRate.toFixed(4),
          sellRate: dto.sellRate.toFixed(4),
          source: "MANUAL",
          tenantId: tenantId,
          setByUserId: user.id,
          setByName: user.fullName,
          notes: dto.notes || null,
        },
      });
    }

    return {
      id: rate.id,
      date: rate.date,
      buyRate: Number(rate.buyRate),
      sellRate: Number(rate.sellRate),
      source: rate.source,
      setByName: rate.setByName,
      notes: rate.notes,
      createdAt: rate.createdAt,
      updatedAt: rate.updatedAt,
    };
  }

  /**
   * Generate PDF report of exchange rate history for a date range
   */
  async generateHistoryPdf(tenantId: string, startDate: string, endDate: string): Promise<Buffer> {
    const rates = await this.getExchangeRateHistoryRange(tenantId, startDate, endDate);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const page = pdf.addPage([595.28, 841.89]); // A4 size
    let y = 780;

    const colors = {
      ink: rgb(0.1, 0.1, 0.1),
      brand: rgb(0.4, 0.49, 0.91),
      slate: rgb(0.4, 0.45, 0.5),
      green: rgb(0.06, 0.72, 0.5),
      blue: rgb(0.23, 0.51, 0.96),
    };

    // Header
    page.drawText("HISTORIAL DE TIPOS DE CAMBIO", {
      x: 50,
      y,
      size: 18,
      font: bold,
      color: colors.brand,
    });

    y -= 25;
    page.drawText("Viajes Alma Nova", {
      x: 50,
      y,
      size: 12,
      font,
      color: colors.slate,
    });

    y -= 20;
    const formatDateDisplay = (dateStr: string) => {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    page.drawText(`Período: ${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`, {
      x: 50,
      y,
      size: 11,
      font,
      color: colors.slate,
    });

    y -= 15;
    page.drawText(`Total de registros: ${rates.length}`, {
      x: 50,
      y,
      size: 11,
      font,
      color: colors.slate,
    });

    y -= 15;
    const now = new Date();
    page.drawText(`Generado: ${formatDateDisplay(now.toISOString())} ${now.toLocaleTimeString('es-CR')}`, {
      x: 50,
      y,
      size: 9,
      font,
      color: colors.slate,
    });

    y -= 30;

    // Divider line
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 1,
      color: colors.slate,
    });

    y -= 25;

    // Table headers
    page.drawText("Fecha", { x: 60, y, size: 10, font: bold, color: colors.ink });
    page.drawText("TC Compra", { x: 180, y, size: 10, font: bold, color: colors.ink });
    page.drawText("TC Venta", { x: 280, y, size: 10, font: bold, color: colors.ink });
    page.drawText("Configurado por", { x: 380, y, size: 10, font: bold, color: colors.ink });

    y -= 5;
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 0.5,
      color: colors.slate,
    });

    y -= 18;

    // Table rows
    for (const rate of rates) {
      if (y < 80) {
        // Add new page if needed
        const newPage = pdf.addPage([595.28, 841.89]);
        y = 780;
        
        // Repeat headers on new page
        newPage.drawText("Fecha", { x: 60, y, size: 10, font: bold, color: colors.ink });
        newPage.drawText("TC Compra", { x: 180, y, size: 10, font: bold, color: colors.ink });
        newPage.drawText("TC Venta", { x: 280, y, size: 10, font: bold, color: colors.ink });
        newPage.drawText("Configurado por", { x: 380, y, size: 10, font: bold, color: colors.ink });
        
        y -= 5;
        newPage.drawLine({
          start: { x: 50, y },
          end: { x: 545, y },
          thickness: 0.5,
          color: colors.slate,
        });
        y -= 18;
      }

      const currentPage = pdf.getPages()[pdf.getPageCount() - 1];

      currentPage.drawText(formatDateDisplay(rate.date), {
        x: 60,
        y,
        size: 9,
        font,
        color: colors.ink,
      });

      currentPage.drawText(`CRC ${rate.buyRate.toFixed(4)}`, {
        x: 180,
        y,
        size: 9,
        font,
        color: colors.green,
      });

      currentPage.drawText(`CRC ${rate.sellRate.toFixed(4)}`, {
        x: 280,
        y,
        size: 9,
        font,
        color: colors.blue,
      });

      const setByName = String(rate.setByName || "-").substring(0, 20);
      currentPage.drawText(setByName, {
        x: 380,
        y,
        size: 9,
        font,
        color: colors.slate,
      });

      y -= 15;
    }

    // Footer
    const lastPage = pdf.getPages()[pdf.getPageCount() - 1];
    lastPage.drawText("Viajes Alma Nova - Sistema de Contratos", {
      x: 50,
      y: 50,
      size: 8,
      font,
      color: colors.slate,
    });

    const pdfBytes = await pdf.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Send exchange rate history via email
   */
  async sendHistoryEmail(
    tenantId: string,
    startDate: string,
    endDate: string,
    recipientEmail: string,
    userName: string,
  ): Promise<void> {
    console.log("[ExchangeRate Service] Preparing to send email to:", recipientEmail);
    
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[ExchangeRate Service] RESEND_API_KEY not configured");
      throw new Error("RESEND_API_KEY no configurado");
    }

    console.log("[ExchangeRate Service] Generating PDF for range:", { startDate, endDate });
    const pdfBuffer = await this.generateHistoryPdf(tenantId, startDate, endDate);
    const rates = await this.getExchangeRateHistoryRange(tenantId, startDate, endDate);
    console.log("[ExchangeRate Service] PDF generated. Size:", pdfBuffer.length, "bytes. Records:", rates.length);

    const formatDateDisplay = (dateStr: string) => {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const fromEmail = String(process.env.RESEND_FROM_EMAIL || process.env.CONTRACTS_FROM_EMAIL || "onboarding@resend.dev");
    console.log("[ExchangeRate Service] Sending from:", fromEmail);
    
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: fromEmail,
      to: [recipientEmail],
      subject: `📊 Historial de Tipos de Cambio - ${formatDateDisplay(startDate)} a ${formatDateDisplay(endDate)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; }
            .content { background: #f9fafb; padding: 30px; border-radius: 8px; margin-top: 20px; }
            .info-row { margin: 15px 0; }
            .label { font-weight: bold; color: #4b5563; }
            .value { color: #1f2937; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0 0 10px 0; font-size: 24px;">📊 Historial de Tipos de Cambio</h1>
              <p style="margin: 0; opacity: 0.9;">Viajes Alma Nova</p>
            </div>
            
            <div class="content">
              <p>Hola <strong>${userName}</strong>,</p>
              
              <p>Adjunto encontrarás el historial de tipos de cambio solicitado.</p>
              
              <div class="info-row">
                <span class="label">📅 Período:</span>
                <span class="value">${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}</span>
              </div>
              
              <div class="info-row">
                <span class="label">📋 Total de registros:</span>
                <span class="value">${rates.length}</span>
              </div>
              
              <div class="info-row">
                <span class="label">📎 Archivo adjunto:</span>
                <span class="value">historial-tipo-cambio.pdf</span>
              </div>
              
              <p style="margin-top: 30px;">El PDF adjunto contiene el detalle completo de todos los tipos de cambio configurados en el período seleccionado.</p>
            </div>
            
            <div class="footer">
              <p style="margin: 0;">Viajes Alma Nova - Sistema de Contratos</p>
              <p style="margin: 5px 0 0 0;">📧 viajes@almanova.cr | ☎️ +506 7006-7572</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `historial-tipo-cambio-${startDate}-${endDate}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    console.log("[ExchangeRate Service] Email sent successfully to:", recipientEmail);
  }
}
