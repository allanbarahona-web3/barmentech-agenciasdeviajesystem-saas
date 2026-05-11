import { Body, Controller, Get, MessageEvent, Param, Patch, Post, Query, Req, Request, Sse, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Observable } from "rxjs";
import { RolesGuard } from "./roles.guard";
import { Roles } from "./roles.decorator";
import { AdminCreateUserDto } from "./dto/admin-create-user.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { AdminResetPasswordDto } from "./dto/admin-reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { Tenant } from "../tenant/tenant.decorator";
import { ResolvedTenant } from "../tenant/tenant.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Endpoint público para obtener la configuración del tenant (logo, colores, etc.)
   * NO requiere autenticación - necesario para mostrar branding en página de login
   */
  @Get("tenant-config")
  getTenantConfig(@Tenant() tenant: ResolvedTenant) {
    return {
      name: tenant.name,
      subdomain: tenant.subdomain,
      logoUrl: tenant.logoUrl || null,
      signatureUrl: tenant.signatureUrl || null,
      primaryColor: tenant.primaryColor || null,
      secondaryColor: tenant.secondaryColor || null,
      contactPhone: tenant.contactPhone || null,
      contactWhatsApp: tenant.contactWhatsApp || null,
      contactEmail: tenant.contactEmail || null,
      businessAddress: tenant.businessAddress || null,
    };
  }

  // Strict rate limiting: only 5 login attempts per minute per IP
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("login")
  login(@Body() dto: LoginDto, @Tenant() tenant: ResolvedTenant) {
    return this.authService.login(dto, tenant);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user: { id: string } }) {
    return this.authService.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("verify")
  verify(@Req() req: { user: { id: string } }) {
    return this.authService.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Get("users")
  adminUsers(@Req() req: { user: { tenantId: string } }) {
    return this.authService.adminListUsers(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("users")
  adminCreateUser(
    @Body() dto: AdminCreateUserDto,
    @Request() req: { user: { id: string; tenantId: string } },
  ) {
    return this.authService.adminCreateUser(dto, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Patch("users/:userId")
  adminUpdateUser(
    @Param("userId") userId: string,
    @Body() dto: AdminUpdateUserDto,
    @Request() req: { user: { id: string; tenantId: string } },
  ) {
    return this.authService.adminUpdateUser(userId, dto, req.user.id, req.user.tenantId);
  }

  @Sse("session-stream")
  sessionStream(@Query("token") token = ""): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const streamToken = String(token || "").trim();

      if (!streamToken) {
        subscriber.next({
          type: "session-invalid",
          data: { reason: "missing-token" },
        });
        subscriber.complete();
        return;
      }

      const emitState = async () => {
        const state = await this.authService.checkTokenSessionState(streamToken);

        if (!state.isValid) {
          subscriber.next({
            type: "session-replaced",
            data: { reason: "session-replaced" },
          });
          subscriber.complete();
          return;
        }

        subscriber.next({
          type: "heartbeat",
          data: { ok: true, userId: state.userId },
        });
      };

      void emitState();
      const timer = setInterval(() => {
        void emitState();
      }, 1000);

      return () => {
        clearInterval(timer);
      };
    });
  }

  // Rate limit password reset: 3 attempts per 5 minutes
  @Throttle({ default: { ttl: 300000, limit: 3 } })
  @Post("request-password-reset")
  requestPasswordReset(@Body() dto: RequestPasswordResetDto, @Tenant() tenant: ResolvedTenant) {
    return this.authService.requestPasswordReset(dto, tenant);
  }

  // Rate limit password reset confirmation: 5 attempts per 5 minutes
  @Throttle({ default: { ttl: 300000, limit: 5 } })
  @Post("confirm-password-reset")
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("users/reset-password")
  adminResetPassword(@Body() dto: AdminResetPasswordDto, @Request() req: { user: { tenantId: string } }) {
    return this.authService.adminResetUserPassword(dto, req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(@Req() req: { user: { id: string } }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }

  /**
   * Endpoint público para obtener la configuración legal del tenant
   * (usado para construir contratos en frontend)
   */
  @Get("tenant-config/legal")
  getTenantLegalConfig(@Tenant() tenant: ResolvedTenant) {
    return {
      name: tenant.name,
      contactPhone: tenant.contactPhone,
      contactWhatsApp: tenant.contactWhatsApp,
      contactEmail: tenant.contactEmail,
      businessAddress: tenant.businessAddress,
      legalName: tenant.legalName,
      legalId: tenant.legalId,
      representativeName: tenant.representativeName,
      representativeId: tenant.representativeId,
      representativeTitle: tenant.representativeTitle,
      representativeMaritalStatus: tenant.representativeMaritalStatus,
      representativeAddress: tenant.representativeAddress,
      representativePowers: tenant.representativePowers,
    };
  }

  /**
   * Endpoint admin para actualizar información legal del tenant
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Patch("tenant-config/legal")
  updateTenantLegalConfig(
    @Tenant() tenant: ResolvedTenant,
    @Body() dto: {
      legalName?: string;
      legalId?: string;
      representativeName?: string;
      representativeId?: string;
      representativeTitle?: string;
      representativeMaritalStatus?: string;
      representativeAddress?: string;
      representativePowers?: string;
    },
  ) {
    return this.authService.updateTenantLegalInfo(tenant.id, dto);
  }
}
