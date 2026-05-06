import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyBankAccountsService } from '../company-bank-accounts/company-bank-accounts.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { OpenAiVisionService } from './openai-vision.service';
import { ExtractedPaymentData } from './dto/process-receipt.dto';

@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(PaymentVerificationService.name);
  private s3Client: S3Client | null = null;
  private readonly maxReceiptSizeBytes = 10 * 1024 * 1024; // 10MB
  private readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'application/pdf',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly openAiVision: OpenAiVisionService,
    private readonly bankAccountsService: CompanyBankAccountsService,
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

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
        forcePathStyle: false,
      });
    }
    return this.s3Client;
  }

  private sanitizeSegment(s: string): string {
    return s.replace(/[^a-zA-Z0-9._-]/g, '_');
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
    // Si ya es WebP o es PDF, retornar sin cambios
    if (params.mimetype === 'image/webp' || params.mimetype === 'application/pdf') {
      this.logger.log(`📄 Archivo ${params.mimetype}, sin conversión necesaria`);
      return params;
    }

    // Convertir JPEG/PNG a WebP
    if (params.mimetype === 'image/jpeg' || params.mimetype === 'image/png' || params.mimetype === 'image/jpg') {
      try {
        this.logger.log(`🔄 Convirtiendo ${params.mimetype} a WebP...`);
        
        const webpBuffer = await sharp(params.buffer)
          .webp({ quality: 85 }) // 85% calidad para balance entre tamaño y calidad
          .toBuffer();

        // Cambiar la extensión del nombre del archivo
        const nameWithoutExt = params.originalname.replace(/\.(jpe?g|png)$/i, '');
        const newName = `${nameWithoutExt}.webp`;

        const originalSize = (params.size / 1024).toFixed(2);
        const newSize = (webpBuffer.length / 1024).toFixed(2);
        const savings = ((1 - webpBuffer.length / params.size) * 100).toFixed(1);
        
        this.logger.log(
          `✅ Conversión exitosa: ${originalSize}KB → ${newSize}KB (${savings}% reducción)`,
        );

        return {
          buffer: webpBuffer,
          mimetype: 'image/webp',
          originalname: newName,
          size: webpBuffer.length,
        };
      } catch (error) {
        // Si falla la conversión, retornar el archivo original
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `❌ Error convirtiendo imagen a WebP: ${errorMessage}. Usando archivo original.`,
        );
        return params;
      }
    }

    // Para otros tipos, retornar sin cambios
    this.logger.warn(`⚠️ Tipo ${params.mimetype} no se convierte, usando original`);
    return params;
  }

  async processReceipt(
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
    userId: string,
    userName: string,
    tenantId: string,
  ): Promise<{
    receiptId: string;
    extractedData: ExtractedPaymentData;
    warnings: string[];
  }> {
    // Validar archivo
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        `Tipo de archivo no permitido. Solo se aceptan: ${Array.from(this.allowedMimeTypes).join(', ')}`,
      );
    }

    if (file.size > this.maxReceiptSizeBytes) {
      throw new BadRequestException(
        `El archivo es demasiado grande. Máximo ${Math.floor(this.maxReceiptSizeBytes / (1024 * 1024))} MB`,
      );
    }

    const warnings: string[] = [];

    // Obtener subdomain del tenant
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subdomain: true },
    });
    const tenantSubdomain = tenant?.subdomain || 'unknown';
    const appEnv = this.configService.get<string>('APP_ENV', 'dev');

    // Convertir imagen a WebP automáticamente
    const processedFile = await this.convertImageToWebP(file);

    // 1. Subir imagen a Spaces
    const objectKey = [
      appEnv,
      tenantSubdomain,
      'payment-receipts',
      new Date().toISOString().split('T')[0], // YYYY-MM-DD
      `${Date.now()}-${this.sanitizeSegment(processedFile.originalname)}`,
    ].join('/');

    await this.uploadToSpaces({
      objectKey,
      contentType: processedFile.mimetype,
      body: processedFile.buffer,
    });

    // 2. Procesar con OpenAI Vision (usar archivo original para mejor OCR)
    const visionResult = await this.openAiVision.extractPaymentDataFromImage(
      file.buffer,
      file.mimetype,
    );

    if (!visionResult.success) {
      // Guardar el comprobante aunque falle el procesamiento
      const receipt = await this.prisma.paymentReceiptImage.create({
        data: {
          objectKey,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          extractedData: {},
          processingStatus: 'ERROR',
          processingError: visionResult.error,
          uploadedByUserId: userId,
          uploadedByName: userName,
        },
      });

      throw new BadRequestException(
        `Error procesando el comprobante: ${visionResult.error}. El comprobante se guardó pero no se pudo extraer información.`,
      );
    }

    const data = visionResult.data!;

    // 3. Convertir moneda si es necesario (CRC → USD)
    let convertedAmount = data.amount;
    const originalAmount = data.amount;
    const originalCurrency = data.currency;
    let usedExchangeRate: number | null = null;
    let conversionApplied = false;

    if (data.currency === 'CRC' && data.amount) {
      try {
        const exchangeRate = await this.exchangeRateService.getCurrentExchangeRate(tenantId);
        if (exchangeRate) {
          // Convertir CRC a USD usando TC de VENTA (la empresa compra dólares con los colones recibidos)
          convertedAmount = data.amount / exchangeRate.sellRate;
          // Redondear a 2 decimales
          convertedAmount = Math.round(convertedAmount * 100) / 100;
          usedExchangeRate = exchangeRate.sellRate;
          conversionApplied = true;
          data.currency = 'USD'; // Cambiar moneda a USD
          data.amount = convertedAmount; // Usar monto convertido
          
          this.logger.log(
            `Conversión automática: ₡${originalAmount!.toFixed(2)} CRC → $${convertedAmount.toFixed(2)} USD (TC Venta: ₡${usedExchangeRate})`,
          );
          
          warnings.push(
            `Conversión automática aplicada: ₡${originalAmount!.toFixed(2)} CRC → $${convertedAmount.toFixed(2)} USD usando TC de venta ₡${usedExchangeRate.toFixed(4)}`,
          );
        } else {
          warnings.push(
            'No hay tipo de cambio configurado para hoy. El monto en CRC no fue convertido automáticamente.',
          );
          this.logger.warn('No se pudo convertir CRC a USD: tipo de cambio no disponible');
        }
      } catch (error) {
        warnings.push(
          'Error al obtener tipo de cambio. El monto en CRC no fue convertido.',
        );
        this.logger.error('Error obteniendo tipo de cambio:', error);
      }
    }

    // 4. Validar cuenta destino si se detectó (REGLA DURA)
    let detectedBankAccount: any = null;
    if (data.destinationAccount) {
      const searchTerm = data.destinationAccount;
      this.logger.log(
        `🔍 Buscando cuenta destino: "${searchTerm}" (length: ${searchTerm.length})`,
      );
      
      detectedBankAccount = await this.bankAccountsService.findByAccountNumber(
        searchTerm,
      );

      if (!detectedBankAccount) {
        // Log adicional para debugging
        const allAccounts = await this.bankAccountsService.findAll({}, tenantId);
        this.logger.warn(
          `❌ Cuenta destino NO encontrada: "${searchTerm}"`,
        );
        this.logger.warn(
          `📋 Cuentas registradas (${allAccounts.length}): ${allAccounts.map(a => a.accountNumber).join(', ')}`,
        );
        
        throw new BadRequestException(
          `❌ CUENTA DESTINO NO REGISTRADA: La cuenta "${searchTerm}" no está registrada en el sistema. Por favor, registre esta cuenta bancaria antes de procesar el pago, o verifique que el número de cuenta sea correcto.`,
        );
      } else if (!detectedBankAccount.isActive) {
        throw new BadRequestException(
          `❌ CUENTA DESTINO INACTIVA: La cuenta "${searchTerm}" está marcada como inactiva en el sistema. Active la cuenta o use otra cuenta destino.`,
        );
      } else {
        // Usar el banco de la cuenta registrada
        data.destinationBank = detectedBankAccount.bankName;
        this.logger.log(
          `✅ Cuenta destino validada: ${searchTerm} → ${detectedBankAccount.bankName} (ID: ${detectedBankAccount.id})`,
        );
      }
    }

    // 5. Guardar comprobante procesado
    const receipt = await this.prisma.paymentReceiptImage.create({
      data: {
        objectKey,
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        extractedData: visionResult.rawResponse || {},
        extractedAmount: data.amount ? String(data.amount) : null,
        extractedCurrency: data.currency,
        extractedDate: data.date ? new Date(data.date) : null,
        extractedReference: data.reference,
        extractedOriginBank: data.originBank,
        extractedDestinationBank: data.destinationBank,
        extractedDestinationAccount: data.destinationAccount,
        extractedPayerName: data.payerName,
        extractedPaymentCode: data.paymentCode,
        extractedNotes: data.notes,
        confidenceScore: data.confidence ? String(data.confidence) : null,
        processingStatus: 'PROCESSED',
        processedAt: new Date(),
        uploadedByUserId: userId,
        uploadedByName: userName,
      },
    });

    // Agregar información de conversión a los datos extraídos
    const responseData: ExtractedPaymentData = {
      ...data,
      originalAmount,
      originalCurrency,
      conversionApplied,
      usedExchangeRate,
    };

    return {
      receiptId: receipt.id,
      extractedData: responseData,
      warnings,
    };
  }

  async getReceipt(id: string) {
    const receipt = await this.prisma.paymentReceiptImage.findUnique({
      where: { id },
      include: {
        payment: true,
      },
    });

    if (!receipt) {
      throw new NotFoundException(`Comprobante con ID ${id} no encontrado`);
    }

    return receipt;
  }

  async listReceipts(filters: { status?: string; limit?: number }) {
    const where: any = {};

    if (filters.status) {
      where.processingStatus = filters.status;
    }

    return this.prisma.paymentReceiptImage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      include: {
        payment: {
          include: {
            invoice: true,
            contract: true,
          },
        },
      },
    });
  }
}
