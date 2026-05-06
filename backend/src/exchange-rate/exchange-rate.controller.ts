import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ExchangeRateService } from "./exchange-rate.service";
import { SetExchangeRateDto } from "./dto/set-exchange-rate.dto";

@Controller("exchange-rate")
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  /**
   * Get current exchange rate (available to all authenticated users)
   */
  @Get("current")
  async getCurrentRate(@Request() req: { user: { tenantId: string } }) {
    const rate = await this.exchangeRateService.getCurrentExchangeRate(req.user.tenantId);
    return { rate };
  }

  /**
   * Get exchange rate for a specific date (available to all authenticated users)
   */
  @Get()
  async getRate(@Request() req: { user: { tenantId: string } }, @Query("date") date?: string) {
    const rate = await this.exchangeRateService.getExchangeRate(req.user.tenantId, date);
    return { rate };
  }

  /**
   * Get exchange rate history (available to all authenticated users)
   */
  @Get("history")
  async getHistory(@Request() req: { user: { tenantId: string } }, @Query("days") days?: string) {
    const daysNum = days ? parseInt(days, 10) : 30;
    const rates = await this.exchangeRateService.getExchangeRateHistory(req.user.tenantId, daysNum);
    return { rates };
  }

  /**
   * Set exchange rate for a specific date (admin only)
   */
  @Post("set")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  async setRate(@Body() dto: SetExchangeRateDto, @Request() req: any) {
    const user = req.user;
    const rate = await this.exchangeRateService.setExchangeRate(dto, user, user.tenantId);
    return { rate };
  }

  /**
   * Get exchange rate history for a specific date range (available to all authenticated users)
   */
  @Get("history-range")
  async getHistoryRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Request() req: { user: { tenantId: string } },
  ) {
    if (!startDate || !endDate) {
      return { error: "startDate and endDate are required", rates: [] };
    }
    const rates = await this.exchangeRateService.getExchangeRateHistoryRange(req.user.tenantId, startDate, endDate);
    return { rates };
  }

  /**
   * Export exchange rate history as PDF (available to all authenticated users)
   */
  @Get("export-pdf")
  async exportPdf(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Res() res: Response,
    @Request() req: { user: { tenantId: string } },
  ) {
    if (!startDate || !endDate) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: "startDate and endDate are required" });
    }

    const pdfBuffer = await this.exchangeRateService.generateHistoryPdf(req.user.tenantId, startDate, endDate);
    
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="historial-tipo-cambio-${startDate}-${endDate}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });

    res.end(pdfBuffer);
  }

  /**
   * Send exchange rate history via email (admin, contador, facturacion)
   */
  @Post("email-history")
  @Roles("ADMIN", "CONTADOR", "FACTURACION_COBROS")
  @UseGuards(RolesGuard)
  async emailHistory(
    @Body() body: { startDate: string; endDate: string; email: string },
    @Request() req: any,
  ) {
    console.log("[ExchangeRate Controller] Email history request received:", {
      startDate: body.startDate,
      endDate: body.endDate,
      email: body.email,
      user: req.user?.fullName,
    });

    const { startDate, endDate, email } = body;

    if (!startDate || !endDate || !email) {
      console.log("[ExchangeRate Controller] Missing required fields");
      return { success: false, error: "startDate, endDate, and email are required" };
    }

    const user = req.user;
    const userName = String(user?.fullName || "Usuario");

    try {
      await this.exchangeRateService.sendHistoryEmail(user.tenantId, startDate, endDate, email, userName);
      console.log("[ExchangeRate Controller] Email sent successfully to:", email);
      return { success: true, message: "Historial enviado por correo exitosamente" };
    } catch (error: any) {
      console.error("[ExchangeRate Controller] Error sending email:", error.message);
      throw error;
    }
  }
}
