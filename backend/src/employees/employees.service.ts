import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { EmployeeStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);
  private s3Client: S3Client | null = null;
  private readonly maxDocumentSizeBytes = 10 * 1024 * 1024; // 10MB
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getSpacesConfig() {
    const region = this.configService.get<string>('DO_SPACES_REGION', '').trim();
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT', '').trim();
    const bucket = this.configService.get<string>('DO_SPACES_BUCKET', '').trim();
    const key = this.configService.get<string>('DO_SPACES_KEY', '').trim();
    const secret = this.configService.get<string>('DO_SPACES_SECRET', '').trim();
    const cdnEndpoint = this.configService.get<string>('DO_SPACES_CDN_ENDPOINT', '').trim();

    if (!region || !endpoint || !bucket || !key || !secret) {
      throw new Error(
        'Faltan variables DO_SPACES_REGION, DO_SPACES_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_KEY o DO_SPACES_SECRET.',
      );
    }

    return { region, endpoint, bucket, key, secret, cdnEndpoint };
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

  private sanitizeSegment(value: string) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || 'file';
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

  private async deleteFromSpaces(objectKey: string) {
    const cfg = this.getSpacesConfig();
    const client = this.getSpacesClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );
  }

  private async buildSignedUrl(objectKey: string, expiresInSeconds = 900) {
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
    // Si es PDF o ya es WebP, retornar sin cambios
    if (params.mimetype === 'application/pdf' || params.mimetype === 'image/webp') {
      return params;
    }

    // Convertir JPEG/PNG a WebP
    if (params.mimetype === 'image/jpeg' || params.mimetype === 'image/png') {
      try {
        const sharpModule = await import('sharp');
        const sharp = sharpModule.default || sharpModule;

        const webpBuffer = await sharp(params.buffer)
          .webp({ quality: 85 })
          .toBuffer();

        const nameWithoutExt = params.originalname.replace(/\.(jpe?g|png)$/i, '');
        const newName = `${nameWithoutExt}.webp`;

        this.logger.log(
          `✅ Converted ${params.originalname}: ${(params.size / 1024).toFixed(2)}KB → ${(webpBuffer.length / 1024).toFixed(2)}KB`,
        );

        return {
          buffer: webpBuffer,
          mimetype: 'image/webp',
          originalname: newName,
          size: webpBuffer.length,
        };
      } catch (error) {
        this.logger.error(`Error converting to WebP: ${error instanceof Error ? error.message : String(error)}`);
        return params;
      }
    }

    return params;
  }

  private calculateDailySalary(monthlySalary: number): Decimal {
    // Salario diario = Salario mensual / 30
    return new Decimal(monthlySalary).dividedBy(30).toDecimalPlaces(2);
  }

  /**
   * Calcula la edad de un empleado basado en su fecha de nacimiento
   */
  calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    
    // Si aún no ha cumplido años este año, restar 1
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }
    
    return age;
  }

  async create(
    tenantId: string,
    dto: CreateEmployeeDto,
    createdByUserId: string,
    createdByName: string,
  ) {
    // Verificar que no exista otro empleado con la misma cédula en este tenant
    const existing = await this.prisma.employee.findUnique({
      where: {
        tenantId_documentId: {
          tenantId,
          documentId: dto.documentId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Ya existe un empleado con esta cédula');
    }

    const dailySalary = this.calculateDailySalary(dto.monthlySalary);

    return this.prisma.employee.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        documentId: dto.documentId,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        hireDate: new Date(dto.hireDate),
        position: dto.position,
        department: dto.department,
        monthlySalary: dto.monthlySalary,
        dailySalary,
        status: dto.status || EmployeeStatus.ACTIVO,
        createdByUserId,
        createdByName,
      },
      include: {
        user: true,
        documents: true,
      },
    });
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: EmployeeStatus;
      position?: string;
      department?: string;
      search?: string;
    },
  ) {
    const where: any = { tenantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.position) {
      where.position = filters.position;
    }

    if (filters?.department) {
      where.department = filters.department;
    }

    if (filters?.search) {
      where.OR = [
        { fullName: { contains: filters.search, mode: 'insensitive' } },
        { documentId: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.employee.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        documents: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
        documents: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return employee;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateEmployeeDto,
  ) {
    await this.findOne(tenantId, id);

    const data: any = {};

    if (dto.fullName) data.fullName = dto.fullName;
    if (dto.documentId) data.documentId = dto.documentId;
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.email) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.hireDate) data.hireDate = new Date(dto.hireDate);
    if (dto.position) data.position = dto.position;
    if (dto.department !== undefined) data.department = dto.department;
    if (dto.status) data.status = dto.status;
    if (dto.terminationDate) data.terminationDate = new Date(dto.terminationDate);

    // Recalcular salario diario si cambia el mensual
    if (dto.monthlySalary !== undefined) {
      data.monthlySalary = dto.monthlySalary;
      data.dailySalary = this.calculateDailySalary(dto.monthlySalary);
    }

    return this.prisma.employee.update({
      where: { id },
      data,
      include: {
        user: true,
        documents: true,
      },
    });
  }

  async uploadDocument(
    tenantId: string,
    employeeId: string,
    dto: UploadDocumentDto,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
    uploadedByUserId: string,
    uploadedByName: string,
  ) {
    // Verificar empleado
    await this.findOne(tenantId, employeeId);

    // Validar tamaño
    if (file.size > this.maxDocumentSizeBytes) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 10MB');
    }

    // Validar tipo
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    // Convertir imágenes a WebP
    const processedFile = await this.convertImageToWebP(file);

    // Subir a Spaces
    const appEnv = this.configService.get('APP_ENV') || 'dev';
    const objectKey = [
      appEnv,
      tenantId,
      'employees',
      employeeId,
      'documents',
      `${Date.now()}-${this.sanitizeSegment(processedFile.originalname)}`,
    ].join('/');

    await this.uploadToSpaces({
      objectKey,
      contentType: processedFile.mimetype,
      body: processedFile.buffer,
    });

    // Guardar en DB
    const document = await this.prisma.employeeDocument.create({
      data: {
        employeeId,
        tenantId,
        documentType: dto.documentType,
        fileName: processedFile.originalname,
        fileUrl: `https://${this.getSpacesConfig().cdnEndpoint}/${objectKey}`,
        objectKey,
        mimeType: processedFile.mimetype,
        size: processedFile.size,
        notes: dto.notes,
        uploadedByUserId,
        uploadedByName,
      },
    });

    return document;
  }

  async deleteDocument(tenantId: string, documentId: string) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Eliminar de Spaces
    try {
      await this.deleteFromSpaces(document.objectKey);
    } catch (error) {
      this.logger.error(`Error deleting from Spaces: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Eliminar de DB
    await this.prisma.employeeDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Documento eliminado correctamente' };
  }

  async getDocumentUrl(tenantId: string, documentId: string) {
    const document = await this.prisma.employeeDocument.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    const url = await this.buildSignedUrl(document.objectKey, 3600); // 1 hora
    return { url, fileName: document.fileName };
  }

  async getAvailableUsers(tenantId: string) {
  return this.prisma.user.findMany({
    where: {
      tenantId,
      employee: null,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
    },
    orderBy: {
      fullName: 'asc',
    },
  });
}

  async linkUser(
  tenantId: string,
  employeeId: string,
  userId: string,
) {
  const employee = await this.prisma.employee.findFirst({
    where: {
      id: employeeId,
      tenantId,
    },
  });

  if (!employee) {
    throw new NotFoundException('Empleado no encontrado');
  }

  if (employee.userId) {
    throw new BadRequestException(
      'El empleado ya tiene un usuario asociado.',
    );
  }

  const user = await this.prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      tenantId: true,
      employee: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundException('Usuario no encontrado');
  }

  if (user.tenantId !== tenantId) {
    throw new BadRequestException(
      'El usuario no pertenece al tenant actual.',
    );
  }

  if (user.employee) {
    throw new BadRequestException(
      'Este usuario ya está asociado a otro empleado.',
    );
  }

  return this.prisma.employee.update({
    where: {
      id: employeeId,
    },
    data: {
      userId,
    },
    include: {
      user: true,
    },
  });
}

  async getStats(tenantId: string) {
    const [total, activos, suspendidos, inactivos] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId, status: EmployeeStatus.ACTIVO } }),
      this.prisma.employee.count({ where: { tenantId, status: EmployeeStatus.SUSPENDIDO } }),
      this.prisma.employee.count({ where: { tenantId, status: EmployeeStatus.INACTIVO } }),
    ]);

    return { total, activos, suspendidos, inactivos };
  }
}
