import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { RejectPaymentDto } from "./dto/reject-payment.dto";
import { BillingService } from "./billing.service";

const LEGACY_BILLING_ACCESS_ROLES = ["SUPER_ADMIN", "ADMIN", "VENTAS", "OPERACIONES", "AGENT"] as const;

@Controller("billing")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...LEGACY_BILLING_ACCESS_ROLES)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("audit")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  listAudit(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
    },
    @Query("contractId") contractId?: string,
    @Query("entityType") entityType?: string,
    @Query("q") q?: string,
    @Query("limit") limit?: string,
  ) {
    return this.billingService.listAudit(req.user, {
      contractId: String(contractId || "").trim() || undefined,
      entityType: String(entityType || "").trim() || undefined,
      q: String(q || "").trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("payments/:paymentId/verify")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  verifyPayment(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("paymentId") paymentId: string,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.verifyPayment(req.user, paymentId, req.ip || null, userAgent || null);
  }

  @Post("payments/:paymentId/reject")
  @Roles("ADMIN")
  @UseGuards(RolesGuard)
  rejectPayment(
    @Req()
    req: {
      user: { id: string; email: string; fullName: string };
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    },
    @Param("paymentId") paymentId: string,
    @Body() dto: RejectPaymentDto,
  ) {
    const userAgentHeader = req.headers?.["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

    return this.billingService.rejectPayment(req.user, paymentId, dto.reason, req.ip || null, userAgent || null);
  }

}
