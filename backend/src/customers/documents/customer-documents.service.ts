import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CustomerDocumentCategory } from '@prisma/client';

@Injectable()
export class CustomerDocumentsService {
  private readonly logger = new Logger(CustomerDocumentsService.name);
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
    private readonly storageService: StorageService,
  ) {}

  /**
   * Upload a new document for a customer
   */
  async uploadCustomerDocument(
    tenantId: string,
    customerId: string,
    category: CustomerDocumentCategory,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    // Verify customer exists and belongs to tenant
    await this.validateCustomer(tenantId, customerId);

    // Validate file size
    if (file.size > this.maxDocumentSizeBytes) {
      throw new BadRequestException('El archivo excede el tamaño máximo de 10MB');
    }

    // Validate file type
    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Tipo de archivo no permitido');
    }

    // Convert images to WebP for optimization
    const processedFile = await this.convertImageToWebP(file);

    // Build object key following the pattern: appEnv/tenantId/customers/customerId/documents/timestamp-filename
    const appEnv = this.configService.get('APP_ENV') || 'dev';
    const objectKey = [
      appEnv,
      tenantId,
      'customers',
      customerId,
      'documents',
      `${Date.now()}-${this.sanitizeSegment(processedFile.originalname)}`,
    ].join('/');

    // Upload to storage
    await this.uploadToSpaces({
      objectKey,
      contentType: processedFile.mimetype,
      body: processedFile.buffer,
    });

    // Save metadata to database
    const document = await this.prisma.customerDocument.create({
      data: {
        customerId,
        tenantId,
        category,
        originalFileName: processedFile.originalname,
        objectKey,
        mimeType: processedFile.mimetype,
        size: processedFile.size,
      },
    });

    return document;
  }

  /**
   * List all documents for a customer
   */
  async listCustomerDocuments(tenantId: string, customerId: string) {
    // Verify customer exists and belongs to tenant
    await this.validateCustomer(tenantId, customerId);

    return this.prisma.customerDocument.findMany({
      where: {
        tenantId,
        customerId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get a specific customer document by ID
   */
  async getCustomerDocument(tenantId: string, customerId: string, documentId: string) {
    const document = await this.prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        customerId,
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    return document;
  }

  /**
   * Delete a customer document
   */
  async deleteCustomerDocument(tenantId: string, customerId: string, documentId: string) {
    const document = await this.prisma.customerDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        customerId,
      },
    });

    if (!document) {
      throw new NotFoundException('Documento no encontrado');
    }

    // Delete from storage
    try {
      await this.deleteFromSpaces(document.objectKey);
    } catch (error) {
      this.logger.error(`Error deleting from Spaces: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Delete from database
    await this.prisma.customerDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Documento eliminado correctamente' };
  }

  /**
   * Generate a signed download URL for a customer document
   */
  async generateDownloadUrl(tenantId: string, customerId: string, documentId: string) {
    const document = await this.getCustomerDocument(tenantId, customerId, documentId);

    const url = await this.buildSignedUrl(document.objectKey, 3600); // 1 hour expiration
    return {
      url,
      fileName: document.originalFileName,
      mimeType: document.mimeType,
      size: document.size,
    };
  }

  /**
   * Register an existing document (already uploaded) as a customer document
   * Used when archiving contracts to link contract documents to customer profile
   * Does NOT upload the file - reuses existing objectKey
   */
  async registerExistingDocument(
    tenantId: string,
    customerId: string,
    category: CustomerDocumentCategory,
    documentData: {
      originalFileName: string;
      objectKey: string;
      mimeType: string;
      size: number;
    },
  ) {
    // Verify customer exists and belongs to tenant
    await this.validateCustomer(tenantId, customerId);

    // Check if this objectKey is already registered for this customer
    const existing = await this.prisma.customerDocument.findFirst({
      where: {
        customerId,
        tenantId,
        objectKey: documentData.objectKey,
      },
    });

    if (existing) {
      // Already registered, skip
      this.logger.debug(`Document ${documentData.objectKey} already registered for customer ${customerId}`);
      return existing;
    }

    // Create customer document record without uploading
    const document = await this.prisma.customerDocument.create({
      data: {
        customerId,
        tenantId,
        category,
        originalFileName: documentData.originalFileName,
        objectKey: documentData.objectKey,
        mimeType: documentData.mimeType,
        size: documentData.size,
      },
    });

    this.logger.log(`✅ Registered customer document: ${documentData.originalFileName} (${category})`);
    return document;
  }

  // ========== Private Helper Methods ==========

  /**
   * Validate that customer exists and belongs to tenant
   */
  private async validateCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.client.findFirst({
      where: {
        id: customerId,
        tenantId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  /**
   * Sanitize filename segment for storage
   */
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

  /**
   * Upload file to storage (delegates to StorageService)
   */
  private async uploadToSpaces(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }) {
    await this.storageService.uploadObject(params);
  }

  /**
   * Delete file from storage (delegates to StorageService)
   */
  private async deleteFromSpaces(objectKey: string) {
    await this.storageService.deleteObject(objectKey);
  }

  /**
   * Generate signed URL for file download (delegates to StorageService)
   */
  private async buildSignedUrl(objectKey: string, expiresInSeconds = 900) {
    return this.storageService.generateSignedUrl(objectKey, expiresInSeconds);
  }

  /**
   * Convert JPEG/PNG images to WebP for optimization
   */
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
    // If PDF or already WebP, return unchanged
    if (params.mimetype === 'application/pdf' || params.mimetype === 'image/webp') {
      return params;
    }

    // Convert JPEG/PNG to WebP
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

    // Unsupported type, return unchanged
    return params;
  }
}
