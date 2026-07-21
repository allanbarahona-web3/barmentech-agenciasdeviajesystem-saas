import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { randomUUID, randomBytes } from "crypto";
import { Resend } from "resend";
import { PrismaService } from "../prisma/prisma.service";
import {
  AUTH_EMAIL_JOB_NAMES,
  AUTH_EMAIL_JOB_OPTIONS,
  AuthEmailJobName,
  AuthEmailJobPayload,
} from "../email/jobs";
import { SendEmailOptions } from "../email/interfaces/email-options.interface";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { LoginDto } from "./dto/login.dto";
import { AdminCreateUserDto } from "./dto/admin-create-user.dto";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { RequestPasswordResetDto } from "./dto/request-password-reset.dto";
import { ConfirmPasswordResetDto } from "./dto/confirm-password-reset.dto";
import { AdminResetPasswordDto } from "./dto/admin-reset-password.dto";
import { ResolvedTenant } from "../tenant/tenant.service";
import { UserRole } from "@prisma/client";
import { getPublicAppBaseUrl } from "../common/utils/tenant-url.util";

type JwtSessionPayload = {
  sub: string;
  email: string;
  jti?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly jobDispatcher: JobDispatcherService,
  ) {}

  /**
   * Load company logo for email templates (returns URL or base64 data URI)
   */
  private async loadCompanyLogoEmailSrc(tenant?: { emailLogoUrl: string | null; logoUrl: string | null } | null): Promise<string | null> {
    // Prioridad 1: Usar emailLogoUrl del tenant, si no está, usar logoUrl del tenant
    const configuredUrl = tenant?.emailLogoUrl || tenant?.logoUrl || this.configService.get<string>("COMPANY_LOGO_EMAIL_URL", "").trim();
    if (configuredUrl) {
      return configuredUrl;
    }
    // Fallback: could load and convert to base64, but URL is preferred
    return null;
  }

  async login(dto: LoginDto, tenant: ResolvedTenant) {
    this.logger.warn(
  `🔥 AUTH LOGIN INVOCADO: ${dto.email} | Tenant: ${tenant.name}`,
);
    const honeypot = (dto.website || "").trim();
    if (honeypot) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ 
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      // 🔐 SECURITY LOG: Intento de login con email no existente
      this.logger.warn(
        `🚨 Login fallido - Usuario no encontrado: ${email} | Tenant: ${tenant.name} (${tenant.id})`,
      );
      throw new UnauthorizedException("Credenciales invalidas");
    }

    // ✅ Validar que el usuario pertenece al tenant del dominio
    // Super admins (tenantId = null) pueden hacer login desde cualquier dominio
    if (user.tenantId !== null && user.tenantId !== tenant.id) {
      this.logger.warn(
        `❌ Intento de login con usuario de otro tenant: ${email} (user.tenantId=${user.tenantId}, domain.tenantId=${tenant.id})`,
      );
      throw new UnauthorizedException("Credenciales invalidas");
    }

    // ✅ Validar que el tenant no esté suspendido
    if (user.tenant && user.tenant.suspendedAt) {
      this.logger.warn(
        `❌ Intento de login en tenant suspendido: ${email} (tenant: ${user.tenant.name}, razón: ${user.tenant.suspendReason || 'N/A'})`,
      );
      throw new UnauthorizedException({
        statusCode: 403,
        message: 'TENANT_SUSPENDED',
        details: {
          tenantName: user.tenant.name,
          suspendedAt: user.tenant.suspendedAt,
          reason: user.tenant.suspendReason || 'Su cuenta ha sido suspendida temporalmente. Contacte a soporte técnico.',
        },
      });
    }

    // Validar que el tenant esté activo (por si acaso)
    if (user.tenant && !user.tenant.isActive) {
      this.logger.warn(
        `❌ Intento de login en tenant inactivo: ${email} (tenant: ${user.tenant.name})`,
      );
      throw new UnauthorizedException(
        "El servicio no está disponible actualmente. Contacte a soporte técnico."
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException("Tu usuario ha sido suspendido. Contacta al administrador.");
    }

    const validPassword = await compare(dto.password, user.passwordHash);
    if (!validPassword) {
      // 🔐 SECURITY LOG: Intento de login con contraseña incorrecta
      this.logger.warn(
        `🚨 Login fallido - Contraseña incorrecta: ${email} (${user.fullName}) | Tenant: ${tenant.name}`,
      );
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const tokenId = randomUUID();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        activeJti: tokenId,
        activeAt: new Date(),
      },
    });

    const token = await this.jwtService.signAsync(
      {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      },
      { jwtid: tokenId },
    );

    // 🔐 SECURITY LOG: Login exitoso
    this.logger.log(
      `✅ Login exitoso: ${user.email} (${user.fullName}) | Rol: ${user.role} | Tenant: ${tenant.name} (${tenant.id})`,
    );

    return {
      accessToken: token,
      jti: tokenId,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        tenantName: user.tenant?.name || null,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        mustChangePassword: true,
        isActive: true,
        tenantId: true,
        tenant: {
          select: {
            name: true,
            contractPrefix: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Sesion invalida");
    }

    return user;
  }

  async checkTokenSessionState(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtSessionPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          isActive: true,
          activeJti: true,
        },
      });

      const isValid = Boolean(
        payload.jti && user && user.isActive && user.activeJti && payload.jti === user.activeJti,
      );

      return {
        isValid,
        userId: payload.sub,
      };
    } catch {
      return {
        isValid: false,
        userId: null,
      };
    }
  }

  async adminListUsers(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        activeAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return users;
  }

  async adminCreateUser(dto: AdminCreateUserDto, adminTenantId: string) {
    const email = String(dto.email || "").trim().toLowerCase();
    const fullName = String(dto.fullName || "").trim();
    const password = String(dto.password || "");
    const roleInput = String(dto.role || "AGENT").trim().toUpperCase();
    
    // Mapear string a enum UserRole
    const validRoles: Record<string, UserRole> = {
      'ADMIN': UserRole.ADMIN,
      'CONTADOR': UserRole.CONTADOR,
      'FACTURACION_COBROS': UserRole.FACTURACION_COBROS,
      'VENTAS': UserRole.VENTAS,
      'OPERACIONES': UserRole.OPERACIONES,
      'AGENT': UserRole.AGENT,
    };
    
    const role = validRoles[roleInput] || UserRole.AGENT;

    const passwordHash = await hash(password, 10);

    const created = await this.prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role,
        isActive: true,
        tenantId: adminTenantId,
        mustChangePassword: true,  // ⚠️ Forzar cambio de contraseña en primer login
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (dto.employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: {
          id: dto.employeeId,
        },
        select: {
          id: true,
          userId: true,
          tenantId: true,
          fullName: true,
        },
      });


      if (!employee) {
        throw new BadRequestException("Empleado no encontrado.");
    }
  
     if (employee.tenantId !== adminTenantId) {
      throw new BadRequestException( "El empleado no pertenece al tenant actual.");
    }

      if (employee.userId) {
      throw new BadRequestException(
      "El empleado ya está asociado a un usuario.");
    }

    await this.prisma.employee.update({
      where: {
        id: dto.employeeId,
    },
      data: {
        userId: created.id,
    },
  });
}
    // Obtener información del tenant para el email
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: adminTenantId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        logoUrl: true,
        emailLogoUrl: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
      },
    });

    // Enviar email de bienvenida con credenciales (no bloquear si falla)
    try {
      const emailResult = await this.sendWelcomeEmail(email, fullName, password, role, tenant);
      this.logger.log(`✅ Email de bienvenida encolado para ${email} (Usuario ID: ${created.id})`);
      this.logger.debug(`📧 Queue Response:`, JSON.stringify(emailResult, null, 2));
    } catch (emailError) {
      this.logger.error(`❌ Error al enviar email de bienvenida a ${email}:`);
      this.logger.error(`Error completo:`, emailError);
      if (emailError instanceof Error) {
        this.logger.error(`Mensaje: ${emailError.message}`);
        this.logger.error(`Stack: ${emailError.stack}`);
      }
      // No lanzar error - el usuario ya fue creado exitosamente
    }

    return created;
  }

  async adminUpdateUser(userId: string, dto: AdminUpdateUserDto, currentUserId: string, adminTenantId: string) {
    // Verificar que el usuario target pertenece al mismo tenant que el admin
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, tenantId: true },
    });

    if (!targetUser) {
      throw new NotFoundException("Usuario no encontrado");
    }

    if (targetUser.tenantId !== adminTenantId) {
      throw new BadRequestException("No tienes permiso para modificar este usuario");
    }

    // Rule 1: User cannot suspend themselves
    if (typeof dto.isActive === "boolean" && !dto.isActive && userId === currentUserId) {
      throw new BadRequestException("No puedes suspenderte a ti mismo.");
    }

    // Rule 2: Cannot suspend the last active ADMIN
    if (typeof dto.isActive === "boolean" && !dto.isActive) {
      if (targetUser?.role === "ADMIN" && targetUser.isActive) {
        // Count active admins WITHIN THE SAME TENANT
        const activeAdminCount = await this.prisma.user.count({
          where: {
            tenantId: adminTenantId,
            role: "ADMIN",
            isActive: true,
          },
        });

        // If this is the last active admin, prevent suspension
        if (activeAdminCount <= 1) {
          throw new BadRequestException(
            "No se puede suspender al único administrador activo del sistema. Activa otro administrador primero.",
          );
        }
      }
    }

    const data: Record<string, unknown> = {};

    if (typeof dto.role === "string") {
      const roleInput = String(dto.role).trim().toUpperCase();
      data.role = ["ADMIN", "CONTADOR", "FACTURACION_COBROS", "VENTAS", "OPERACIONES"].includes(roleInput) ? roleInput : "AGENT";
      // Invalidate session when role changes - forces re-login with new permissions
      data.activeJti = null;
    }

    if (typeof dto.fullName === "string") {
      data.fullName = dto.fullName.trim();
    }

    if (typeof dto.email === "string") {
      const newEmail = dto.email.trim().toLowerCase();
      
      // Check if email is already taken by another user
      const existingUser = await this.prisma.user.findUnique({
        where: { email: newEmail },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException("Este correo ya está registrado por otro usuario.");
      }

      data.email = newEmail;
      // Invalidate session when email changes - forces re-login with new credentials
      data.activeJti = null;
    }

    if (typeof dto.isActive === "boolean") {
      data.isActive = dto.isActive;
      if (!dto.isActive) {
        data.activeJti = null;
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        activeAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // 🔐 SECURITY LOG: Registrar cambios críticos de seguridad
    if (typeof dto.role === "string" && dto.role !== targetUser.role) {
      this.logger.warn(
        `🔑 Cambio de rol: Usuario ${updated.email} (${updated.fullName}) | ${targetUser.role} → ${updated.role} | Modificado por admin ID: ${currentUserId}`,
      );
    }

    if (typeof dto.isActive === "boolean" && dto.isActive !== targetUser.isActive) {
      const accion = dto.isActive ? "ACTIVADO" : "SUSPENDIDO";
      this.logger.warn(
        `🚫 Usuario ${accion}: ${updated.email} (${updated.fullName}) | Modificado por admin ID: ${currentUserId}`,
      );
    }

    if (typeof dto.email === "string" && dto.email !== updated.email) {
      this.logger.warn(
        `📧 Cambio de email: Usuario ${userId} | Email anterior → ${updated.email} | Modificado por admin ID: ${currentUserId}`,
      );
    }

    return updated;
  }

  /**
   * Request a password reset token
   * Always returns success to avoid email enumeration attacks
   */
  async requestPasswordReset(dto: RequestPasswordResetDto, tenant: ResolvedTenant) {
    // Check honeypot
    const honeypot = (dto.website || "").trim();
    if (honeypot) {
      // Pretend success but don't actually send email
      return { ok: true, message: "Si el correo existe, recibirás un enlace para resetear tu contraseña." };
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return success message to prevent email enumeration
    if (!user || !user.isActive) {
      return { ok: true, message: "Si el correo existe, recibirás un enlace para resetear tu contraseña." };
    }

    // Generate secure random token (64 characters hex)
    const token = randomBytes(32).toString("hex");
    
    // Token expires in 5 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Invalidate all previous tokens for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    // Create new reset token
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send password reset email
    try {
      await this.sendPasswordResetEmail(user.email, user.fullName, token, tenant);
      this.logger.log(`[PASSWORD RESET] Email queued for ${user.email}`);
    } catch (emailError) {
      this.logger.error(`[PASSWORD RESET] Failed to send email to ${user.email}:`, emailError);
      // Don't throw error to avoid revealing if email exists
    }

    return { ok: true, message: "Si el correo existe, recibirás un enlace para resetear tu contraseña." };
  }

  /**
   * Reset password using valid token
   */
  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    this.logger.log(`[PASSWORD RESET CONFIRM] Attempting with token length: ${dto.token?.length || 0}`);
    
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: dto.token },
      include: { user: true },
    });

    if (!resetToken) {
      this.logger.warn(`[PASSWORD RESET CONFIRM] Token not found in database`);
      throw new BadRequestException("Token inválido o expirado");
    }

    this.logger.log(`[PASSWORD RESET CONFIRM] Token found for user: ${resetToken.user.email}`);

    // Check if token is already used
    if (resetToken.usedAt) {
      this.logger.warn(`[PASSWORD RESET CONFIRM] Token already used at: ${resetToken.usedAt}`);
      throw new BadRequestException("Este token ya fue utilizado");
    }

    // Check if token is expired
    if (new Date() > resetToken.expiresAt) {
      this.logger.warn(`[PASSWORD RESET CONFIRM] Token expired at: ${resetToken.expiresAt}`);
      throw new BadRequestException("Token expirado. Solicita un nuevo enlace de reseteo");
    }

    // Check if user is active
    if (!resetToken.user.isActive) {
      this.logger.warn(`[PASSWORD RESET CONFIRM] User is inactive`);
      throw new BadRequestException("Usuario inactivo");
    }

    this.logger.log(`[PASSWORD RESET CONFIRM] All validations passed, updating password for: ${resetToken.user.email}`);

    // Hash new password
    const passwordHash = await hash(dto.newPassword, 10);

    // Update password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          activeJti: null, // Invalidate current session
          mustChangePassword: false, // User voluntarily reset their password
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`[PASSWORD RESET CONFIRM] Password successfully updated for: ${resetToken.user.email}`);

    return { ok: true, message: "Contraseña actualizada correctamente. Ahora puedes iniciar sesión." };
  }

  /**
   * Generate a secure random password
   * 8 characters: mix of uppercase, lowercase, numbers
   */
  private generateTemporaryPassword(): string {
    const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Removed I, O
    const lowercase = "abcdefghjkmnpqrstuvwxyz"; // Removed i, l, o
    const numbers = "23456789"; // Removed 0, 1
    const allChars = uppercase + lowercase + numbers;

    let password = "";
    
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    
    // Fill the rest randomly
    for (let i = 3; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Admin resets a user's password to a temporary one
   * User must change password on next login
   */
  async adminResetUserPassword(dto: AdminResetPasswordDto, adminTenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        tenantId: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Usuario no encontrado");
    }

    // Validar que el usuario pertenece al mismo tenant que el admin
    if (user.tenantId !== adminTenantId) {
      throw new BadRequestException("No tienes permiso para resetear la contraseña de este usuario");
    }

    // Cargar tenant completo para enviar email
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        logoUrl: true,
        emailLogoUrl: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
      },
    });

    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email.");
    }

    // Generate temporary password
    const temporaryPassword = this.generateTemporaryPassword();
    const passwordHash = await hash(temporaryPassword, 10);

    // Update user: new password + must change flag + invalidate session
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        activeJti: null, // Force re-login
      },
    });

    // Construir URL de login del tenant
    const baseDomain = this.configService.get<string>("FRONTEND_BASE_DOMAIN", "").trim();
    const loginUrl = tenant.customDomain
      ? `https://${tenant.customDomain}`
      : tenant.subdomain
      ? `https://${tenant.subdomain}.${baseDomain}`
      : baseDomain;

    // Enviar email con contraseña temporal usando EmailService
    try {
      await this.dispatchAuthEmail(AUTH_EMAIL_JOB_NAMES.ADMIN_PASSWORD_RESET, {
        tenantId: tenant.id,
        to: user.email,
        subject: `🔄 Tu contraseña ha sido restablecida - ${tenant.name}`,
        template: 'password-reset-by-admin',
        templateData: {
          userName: user.fullName,
          temporaryPassword,
          loginUrl,
          tenantName: tenant.name,
        },
      });

      this.logger.log(`✅ Email de reset de contraseña (admin) encolado para ${user.email}`);
    } catch (emailError) {
      this.logger.error(`❌ Error al enviar email de reset (admin) a ${user.email}:`, emailError);
      // No lanzamos error para que el admin al menos vea la contraseña temporal en respuesta
    }

    return {
      ok: true,
      message: `Contraseña temporal generada para ${user.fullName}`,
      temporaryPassword,
      email: user.email,
      fullName: user.fullName,
    };
  }

  /**
   * User changes their own password (when mustChangePassword=true or voluntary)
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        mustChangePassword: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Usuario no válido");
    }

    // Verify current password
    const validPassword = await compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      throw new BadRequestException("Contraseña actual incorrecta");
    }

    // Hash new password
    const passwordHash = await hash(newPassword, 10);

    // Update password and clear mustChangePassword flag
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    });

    return { ok: true, message: "Contraseña actualizada correctamente" };
  }

  async logout(userId: string, tenantId?: string) {
    // If user has no tenant or tenantId is not provided, allow logout
    if (!tenantId) {
      return { ok: true, message: "Sesión cerrada correctamente" };
    }

    // Check if user has an active attendance session (open entry) without OFF
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openEntry = await this.prisma.attendanceEntry.findFirst({
      where: {
        tenantId,
        userId,
        date: today,
        clockOut: null,
      },
      orderBy: { clockIn: 'desc' },
      select: { type: true },
    });

    // If there is no active open entry, allow logout
    if (!openEntry) {
      return { ok: true, message: "Sesión cerrada correctamente" };
    }

    // If open entry is OFF, allow logout (defensive fallback)
    if (openEntry.type === 'OFF') {
      return { ok: true, message: "Sesión cerrada correctamente" };
    }

    // If last entry is not OFF, prevent logout
    throw new BadRequestException('Debes marcar OFF antes de cerrar sesión');
  }

  /**
   * Send welcome email with credentials to new user
   */
  private async dispatchAuthEmail(
    jobName: AuthEmailJobName,
    options: SendEmailOptions,
  ): Promise<{ success: true; jobId: string | undefined }> {
    const job = await this.jobDispatcher.dispatch<AuthEmailJobPayload>({
      queueKey: PLATFORM_QUEUE_KEYS.EMAIL,
      jobName,
      payload: { options },
      metadata: { tenantId: options.tenantId },
      options: AUTH_EMAIL_JOB_OPTIONS,
    });

    return {
      success: true,
      jobId: job.id,
    };
  }

  /**
   * Enviar email de bienvenida con credenciales (usando EmailService centralizado)
   */
  private async sendWelcomeEmail(
    email: string,
    fullName: string,
    temporaryPassword: string,
    role: UserRole,
    tenant: { id: string; name: string; subdomain: string | null; customDomain: string | null; logoUrl: string | null; emailLogoUrl: string | null; fromEmail?: string | null; replyToEmail?: string | null; emailVerified?: boolean } | null
  ) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email de bienvenida.");
    }

    // Construir URL de login del tenant usando la utilidad compartida
    const loginUrl = getPublicAppBaseUrl(this.configService, tenant);

    // Mapear rol a español
    const roleLabels: Record<string, string> = {
      'ADMIN': 'Administrador',
      'CONTADOR': 'Contador',
      'FACTURACION_COBROS': 'Facturación y Cobros',
      'VENTAS': 'Ventas',
      'OPERACIONES': 'Operaciones',
      'AGENT': 'Agente',
    };
    const roleLabel = roleLabels[role] || role;

    // Enviar email usando el servicio centralizado
    const result = await this.dispatchAuthEmail(AUTH_EMAIL_JOB_NAMES.WELCOME, {
      tenantId: tenant.id,
      to: email,
      subject: `🎉 Bienvenido a ${tenant.name} - Credenciales de Acceso`,
      template: 'welcome-user',
      templateData: {
        userName: fullName,
        userEmail: email,
        temporaryPassword,
        roleLabel,
        loginUrl,
        tenantName: tenant.name,
      },
    });

    this.logger.log(`✅ Email de bienvenida encolado para ${email}`);
    return result;

    /* CÓDIGO ANTIGUO COMENTADO PARA ROLLBACK:
    ... (HTML inline omitido) ...
    this.logger.debug(\`📨 Email enviado exitosamente a \${email}. ID:\`, result.data?.id || 'N/A');
    return result;
    FIN CÓDIGO ANTIGUO */
  }

  /**
   * Enviar email de reset de contraseña (usando EmailService centralizado)
   */
  private async sendPasswordResetEmail(email: string, fullName: string, token: string, tenant?: ResolvedTenant | null) {
    if (!tenant) {
      throw new InternalServerErrorException("Tenant no encontrado para enviar email de reset de contraseña.");
    }

    // Construir URL de reset usando la utilidad compartida
    const baseUrl = getPublicAppBaseUrl(this.configService, tenant);
    const resetLink = `${baseUrl}/reset-password?token=${token}`;
    const expirationMinutes = 5; // Tokens expiran en 5 minutos

    // Enviar email usando el servicio centralizado
    await this.dispatchAuthEmail(AUTH_EMAIL_JOB_NAMES.PASSWORD_RESET, {
      tenantId: tenant.id,
      to: email,
      subject: `🔐 Restablece tu contraseña - ${tenant.name}`,
      template: 'password-reset',
      templateData: {
        userName: fullName,
        resetLink,
        expirationMinutes,
        tenantName: tenant.name,
      },
    });

    this.logger.log(`✅ Email de reset de contraseña encolado para ${email}`);

    /* CÓDIGO ANTIGUO COMENTADO PARA ROLLBACK:
    const apiKey = this.configService.get<string>("RESEND_API_KEY", "").trim();
    const fromEmail = this.configService.get<string>("AUTH_FROM_EMAIL", "").trim();
    const frontendUrl = this.configService.get<string>("FRONTEND_URL", "").trim();

    if (!apiKey || !fromEmail) {
      throw new InternalServerErrorException("Falta configurar RESEND_API_KEY o AUTH_FROM_EMAIL.");
    }

    const resetLink = \`\${frontendUrl}/reset-password?token=\${token}\`;
    const resend = new Resend(apiKey);
    const logoSrc = await this.loadCompanyLogoEmailSrc(tenant);
    ... (HTML inline omitido) ...
    await resend.emails.send({ ... });
    FIN CÓDIGO ANTIGUO */
  }

  /**
   * Actualizar información legal del tenant (solo ADMIN)
   */
  async updateTenantLegalInfo(
    tenantId: string,
    dto: {
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
    const updateData: Record<string, string | null> = {};

    if (dto.legalName !== undefined) updateData.legalName = dto.legalName?.trim() || null;
    if (dto.legalId !== undefined) updateData.legalId = dto.legalId?.trim() || null;
    if (dto.representativeName !== undefined) updateData.representativeName = dto.representativeName?.trim() || null;
    if (dto.representativeId !== undefined) updateData.representativeId = dto.representativeId?.trim() || null;
    if (dto.representativeTitle !== undefined) updateData.representativeTitle = dto.representativeTitle?.trim() || null;
    if (dto.representativeMaritalStatus !== undefined) updateData.representativeMaritalStatus = dto.representativeMaritalStatus?.trim() || null;
    if (dto.representativeAddress !== undefined) updateData.representativeAddress = dto.representativeAddress?.trim() || null;
    if (dto.representativePowers !== undefined) updateData.representativePowers = dto.representativePowers?.trim() || null;

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
    });

    return {
      message: "Información legal actualizada correctamente",
      tenant: {
        id: tenant.id,
        name: tenant.name,
        legalName: tenant.legalName,
        legalId: tenant.legalId,
        representativeName: tenant.representativeName,
        representativeId: tenant.representativeId,
        representativeTitle: tenant.representativeTitle,
        representativeMaritalStatus: tenant.representativeMaritalStatus,
        representativeAddress: tenant.representativeAddress,
        representativePowers: tenant.representativePowers,
      },
    };
  }
}
