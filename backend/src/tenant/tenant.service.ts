import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import * as sharp from 'sharp';

export interface ResolvedTenant {
  id: string;
  name: string;
  subdomain: string | null;
  customDomain: string | null;
  contractPrefix: string;
  isActive: boolean;
  // Suspension info
  suspendedAt: Date | null;
  suspendReason: string | null;
  // Branding assets
  logoUrl: string | null;
  signatureUrl: string | null;
  emailLogoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  // Contact information
  contactPhone: string | null;
  contactWhatsApp: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
  // Legal information
  legalName: string | null;
  legalId: string | null;
  representativeName: string | null;
  representativeId: string | null;
  representativeTitle: string | null;
  representativeMaritalStatus: string | null;
  representativeAddress: string | null;
  representativePowers: string | null;
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);
  private s3Client: S3Client | null = null;
  private readonly allowedImageMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
  ]);
  private readonly maxImageSizeBytes = 5 * 1024 * 1024; // 5MB

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Resuelve el tenant basándose en el host de la solicitud.
   * Prioridad:
   * 1. customDomain (ej: system.viajesalmanova.com)
   * 2. subdomain (ej: almanova.app.com)
   * 3. localhost:3001 → almanova (fallback para desarrollo)
   */
  async resolveTenant(host: string): Promise<ResolvedTenant> {
    this.logger.debug(`Resolviendo tenant para host: ${host}`);

    // Extraer dominio limpio (sin puerto)
    const cleanHost = host.split(':')[0].toLowerCase();

    // 1. Intentar por customDomain exacto
    let tenant = await this.prisma.tenant.findUnique({
      where: { customDomain: cleanHost },
    });

    if (tenant) {
      this.logger.debug(`✅ Tenant resuelto por customDomain: ${tenant.name}`);
      return tenant;
    }

    // 2. Intentar por subdomain (extraer primera parte)
    const subdomainMatch = cleanHost.match(/^([^.]+)\./);
    if (subdomainMatch) {
      const subdomain = subdomainMatch[1];
      tenant = await this.prisma.tenant.findUnique({
        where: { subdomain },
      });

      if (tenant) {
        this.logger.debug(`✅ Tenant resuelto por subdomain: ${tenant.name}`);
        return tenant;
      }
    }

    // 3. Fallback para localhost en desarrollo → almanova
    if (cleanHost === 'localhost' || cleanHost.startsWith('127.0.0.1')) {
      this.logger.warn(
        `⚠️  Localhost detectado, usando tenant por defecto: almanova`,
      );
      tenant = await this.prisma.tenant.findUnique({
        where: { subdomain: 'almanova' },
      });

      if (tenant) {
        return tenant;
      }
    }

    // No se pudo resolver
    this.logger.error(`❌ No se pudo resolver tenant para host: ${host}`);
    throw new NotFoundException(
      `No se encontró un tenant para el dominio: ${cleanHost}`,
    );
  }

  /**
   * Obtiene un tenant por ID (usado por guards para validar JWT)
   */
  async getTenantById(tenantId: string): Promise<ResolvedTenant | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return tenant;
  }

  /**
   * 🚫 Lista de dominios genéricos no permitidos para emails empresariales
   */
  private readonly GENERIC_EMAIL_DOMAINS = [
    'gmail.com',
    'hotmail.com',
    'outlook.com',
    'yahoo.com',
    'live.com',
    'icloud.com',
    'protonmail.com',
    'aol.com',
    'mail.com',
    'zoho.com',
    'yandex.com',
    'gmx.com',
  ];

  /**
   * Valida que un email NO use un dominio genérico
   */
  private validateBusinessEmail(email: string | null | undefined): void {
    if (!email) {
      return; // Emails opcionales, no validar si está vacío
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes('@')) {
      throw new BadRequestException('Email inválido');
    }

    const domain = normalizedEmail.split('@')[1];
    
    if (this.GENERIC_EMAIL_DOMAINS.includes(domain)) {
      throw new BadRequestException({
        message: 'No se permiten emails con dominios genéricos',
        code: 'GENERIC_EMAIL_BLOCKED',
        domain: domain,
        hint: 'Usa un email con dominio empresarial propio (ej: info@tuempresa.com)',
      });
    }
  }

  /**
   * Verifica que un tenant esté activo
   */
  async validateTenantIsActive(tenantId: string): Promise<void> {
    const tenant = await this.getTenantById(tenantId);

    if (!tenant) {
      throw new NotFoundException(`Tenant no encontrado: ${tenantId}`);
    }

    if (!tenant.isActive) {
      throw new NotFoundException(
        `El tenant ${tenant.name} está desactivado`,
      );
    }
  }

  /**
   * 📋 Obtener configuración del tenant (para ADMIN)
   */
  async getTenantConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        contractPrefix: true,
        logoUrl: true,
        signatureUrl: true,
        emailLogoUrl: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
        primaryColor: true,
        secondaryColor: true,
        contactPhone: true,
        contactWhatsApp: true,
        contactEmail: true,
        businessAddress: true,
        legalName: true,
        legalId: true,
        representativeName: true,
        representativeId: true,
        representativeTitle: true,
        representativeMaritalStatus: true,
        representativeAddress: true,
        representativePowers: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    return tenant;
  }

  /**
   * 🎨 Actualizar configuración del tenant (colores y datos legales)
   */
  async updateTenantConfig(tenantId: string, dto: UpdateTenantConfigDto) {
    // Extraer campos de email
    const { fromEmail, replyToEmail, ...otherFields } = dto;

    // � Validar que no sean emails genéricos
    this.validateBusinessEmail(fromEmail);
    this.validateBusinessEmail(replyToEmail);

    // �🔍 Obtener tenant actual para detectar cambios en emails
    const currentTenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
      },
    });

    if (!currentTenant) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // 🔐 Detectar cambios en los emails
    const fromEmailChanged =
      fromEmail !== undefined && fromEmail !== currentTenant.fromEmail;
    const replyToEmailChanged =
      replyToEmail !== undefined &&
      replyToEmail !== currentTenant.replyToEmail;

    const emailsChanged = fromEmailChanged || replyToEmailChanged;

    // 📧 Si cambiaron los emails, invalidar verificación
    let shouldInvalidateVerification = false;
    if (emailsChanged && currentTenant.emailVerified) {
      shouldInvalidateVerification = true;
      this.logger.warn(
        `⚠️ Emails modificados para tenant ${currentTenant.name}. Requiere nueva verificación.`,
      );
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        primaryColor: dto.primaryColor,
        secondaryColor: dto.secondaryColor,
        // Actualizar emails solo si están presentes (undefined = no cambiar, null = borrar)
        ...(fromEmail !== undefined && { fromEmail: fromEmail }),
        ...(replyToEmail !== undefined && { replyToEmail: replyToEmail }),
        // 🔓 Invalidar verificación si cambiaron los emails
        emailVerified: shouldInvalidateVerification
          ? false
          : currentTenant.emailVerified,
        legalName: dto.legalName,
        legalId: dto.legalId,
        representativeName: dto.representativeName,
        representativeId: dto.representativeId,
        representativeTitle: dto.representativeTitle,
        representativeMaritalStatus: dto.representativeMaritalStatus,
        representativeAddress: dto.representativeAddress,
        representativePowers: dto.representativePowers,
      },
      select: {
        id: true,
        name: true,
        primaryColor: true,
        secondaryColor: true,
        fromEmail: true,
        replyToEmail: true,
        emailVerified: true,
        legalName: true,
      },
    });

    if (shouldInvalidateVerification) {
      this.logger.log(
        `🔓 Verificación invalidada para tenant: ${updated.name}. Requiere nueva aprobación del super admin.`,
      );
    }

    this.logger.log(`✅ Configuración actualizada para tenant: ${updated.name}`);
    return updated;
  }

  /**
   * 🖼️ Subir asset del tenant (logo o firma)
   */
  async uploadTenantAsset(
    tenantId: string,
    assetType: 'logo' | 'signature',
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    // Validaciones
    if (!this.allowedImageMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido. Solo se aceptan: ${Array.from(this.allowedImageMimeTypes).join(', ')}`,
      );
    }

    if (file.size > this.maxImageSizeBytes) {
      throw new BadRequestException(
        `El archivo es demasiado grande. Máximo ${Math.floor(this.maxImageSizeBytes / (1024 * 1024))} MB`,
      );
    }

    // Obtener tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, subdomain: true, name: true },
    });

    if (!tenant || !tenant.subdomain) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Convertir a WebP para optimizar
    const processedFile = await this.convertImageToWebP(file);

    // Construir ruta en Spaces
    const appEnv = this.configService.get<string>('APP_ENV', 'dev');
    const category = assetType === 'logo' ? 'logos' : 'signatures';
    const filename = `${assetType}.webp`;
    const objectKey = `${appEnv}/${tenant.subdomain}/${category}/${filename}`;

    // Subir a Spaces
    await this.uploadToSpaces({
      objectKey,
      contentType: processedFile.mimetype,
      body: processedFile.buffer,
    });

    // Construir URL pública con CDN
    const cfg = this.getSpacesConfig();
    const assetUrl = `https://${cfg.bucket}.${cfg.region}.cdn.digitaloceanspaces.com/${objectKey}`;

    // Actualizar en BD
    const fieldName = assetType === 'logo' ? 'logoUrl' : 'signatureUrl';
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        [fieldName]: assetUrl,
        // Si subimos logo, también usarlo como emailLogoUrl si no existe
        ...(assetType === 'logo' ? { emailLogoUrl: assetUrl } : {}),
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        signatureUrl: true,
        emailLogoUrl: true,
      },
    });

    this.logger.log(`✅ ${assetType} subido para tenant: ${tenant.name} → ${assetUrl}`);

    return {
      success: true,
      assetType,
      url: assetUrl,
      tenant: updated,
    };
  }

  /**
   * 🗑️ Eliminar asset del tenant (logo o firma)
   */
  async deleteTenantAsset(tenantId: string, assetType: 'logo' | 'signature') {
    // Obtener tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        subdomain: true,
        name: true,
        logoUrl: true,
        signatureUrl: true,
      },
    });

    if (!tenant || !tenant.subdomain) {
      throw new NotFoundException('Tenant no encontrado');
    }

    // Verificar si existe el asset
    const currentUrl = assetType === 'logo' ? tenant.logoUrl : tenant.signatureUrl;
    if (!currentUrl) {
      throw new BadRequestException(`No hay ${assetType} configurado para eliminar`);
    }

    // Construir ruta en Spaces (misma lógica que al subir)
    const appEnv = this.configService.get<string>('APP_ENV', 'dev');
    const category = assetType === 'logo' ? 'logos' : 'signatures';
    const filename = `${assetType}.webp`;
    const objectKey = `${appEnv}/${tenant.subdomain}/${category}/${filename}`;

    // Eliminar de Spaces
    try {
      await this.deleteFromSpaces(objectKey);
      this.logger.log(`🗑️ Archivo eliminado de Spaces: ${objectKey}`);
    } catch (error) {
      this.logger.warn(`⚠️ No se pudo eliminar de Spaces (puede no existir): ${error instanceof Error ? error.message : String(error)}`);
      // Continuar para limpiar la BD de todas formas
    }

    // Actualizar en BD (set null)
    const fieldName = assetType === 'logo' ? 'logoUrl' : 'signatureUrl';
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        [fieldName]: null,
        // Si eliminamos logo, también limpiar emailLogoUrl
        ...(assetType === 'logo' ? { emailLogoUrl: null } : {}),
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        signatureUrl: true,
        emailLogoUrl: true,
      },
    });

    this.logger.log(`✅ ${assetType} eliminado para tenant: ${tenant.name}`);

    return {
      success: true,
      message: `${assetType} eliminado exitosamente`,
      tenant: updated,
    };
  }

  // Helpers privados

  private getSpacesConfig() {
    return {
      endpoint: this.configService.get<string>('DO_SPACES_ENDPOINT', ''),
      region: this.configService.get<string>('DO_SPACES_REGION', 'us-east-1'),
      accessKeyId: this.configService.get<string>('DO_SPACES_KEY', ''),
      secretAccessKey: this.configService.get<string>('DO_SPACES_SECRET', ''),
      bucket: this.configService.get<string>('DO_SPACES_BUCKET', ''),
    };
  }

  private getSpacesClient(): S3Client {
    if (!this.s3Client) {
      const cfg = this.getSpacesConfig();
      this.s3Client = new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
      });
    }
    return this.s3Client;
  }

  private async uploadToSpaces(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }): Promise<void> {
    const cfg = this.getSpacesConfig();
    const client = this.getSpacesClient();

    const command = new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: params.objectKey,
      Body: params.body,
      ContentType: params.contentType,
      ACL: 'public-read',
    });

    await client.send(command);
  }

  private async deleteFromSpaces(objectKey: string): Promise<void> {
    const cfg = this.getSpacesConfig();
    const client = this.getSpacesClient();

    const command = new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
    });

    await client.send(command);
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
    // Si ya es PDF o WebP, no convertir
    if (params.mimetype === 'application/pdf' || params.mimetype === 'image/webp') {
      return params;
    }

    // Si es imagen JPEG/PNG, convertir a WebP
    if (params.mimetype === 'image/jpeg' || params.mimetype === 'image/png' || params.mimetype === 'image/jpg') {
      try {
        const webpBuffer = await sharp(params.buffer)
          .webp({ quality: 85 })
          .toBuffer();

        const newName = params.originalname.replace(/\.(jpe?g|png)$/i, '.webp');

        this.logger.debug(
          `✅ Imagen convertida a WebP: ${params.originalname} (${params.size} bytes) → ${newName} (${webpBuffer.length} bytes)`,
        );

        return {
          buffer: webpBuffer,
          mimetype: 'image/webp',
          originalname: newName,
          size: webpBuffer.length,
        };
      } catch (error) {
        this.logger.error('❌ Error al convertir imagen a WebP', error);
        throw new BadRequestException('Error al procesar la imagen');
      }
    }

    // Tipo no soportado
    this.logger.warn(`⚠️ Tipo ${params.mimetype} no se convierte, usando original`);
    return params;
  }
}
