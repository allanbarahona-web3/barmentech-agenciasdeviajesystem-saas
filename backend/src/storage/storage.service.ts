import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class StorageObjectAlreadyExistsError extends Error {
  constructor() {
    super('Storage object already exists.');
  }
}

export class StorageObjectCapacityError extends Error {
  constructor() {
    super('Storage object exceeds the allowed size.');
  }
}

export interface StorageObjectWithMetadata {
  body: Buffer;
  contentType: string | null;
  eTag: string | null;
  lastModified: Date | null;
}

@Injectable()
export class StorageService {
  private s3Client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get DigitalOcean Spaces configuration from environment variables
   */
  getConfig() {
    const region = this.configService.get<string>('DO_SPACES_REGION', '').trim();
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT', '').trim();
    const bucket = this.configService.get<string>('DO_SPACES_BUCKET', '').trim();
    const key = this.configService.get<string>('DO_SPACES_KEY', '').trim();
    const secret = this.configService.get<string>('DO_SPACES_SECRET', '').trim();
    const cdnEndpoint = this.configService.get<string>('DO_SPACES_CDN_ENDPOINT', '').trim();

    if (!region || !endpoint || !bucket || !key || !secret) {
      throw new InternalServerErrorException(
        'Faltan variables DO_SPACES_REGION, DO_SPACES_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_KEY o DO_SPACES_SECRET.',
      );
    }

    return { region, endpoint, bucket, key, secret, cdnEndpoint };
  }

  /**
   * Get or create S3Client instance (singleton)
   */
  getClient(): S3Client {
    if (this.s3Client) {
      return this.s3Client;
    }

    const cfg = this.getConfig();
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

  /**
   * Upload an object to Spaces
   */
  async uploadObject(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }): Promise<void> {
    const cfg = this.getConfig();
    const client = this.getClient();

    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: params.objectKey,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  /**
   * Atomically creates an object only when its key is absent. It deliberately
   * does not set an ACL: the bucket's private policy remains authoritative.
   */
  async putObjectIfAbsent(params: {
    objectKey: string;
    contentType: string;
    body: Buffer;
  }): Promise<{ eTag: string | null }> {
    const cfg = this.getConfig();
    const client = this.getClient();

    try {
      const response = await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: params.objectKey,
          Body: params.body,
          ContentType: params.contentType,
          IfNoneMatch: '*',
        }),
      );

      return { eTag: response.ETag ?? null };
    } catch (error) {
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (statusCode === 409 || statusCode === 412) {
        throw new StorageObjectAlreadyExistsError();
      }
      throw error;
    }
  }

  /**
   * Delete an object from Spaces
   */
  async deleteObject(objectKey: string): Promise<void> {
    const cfg = this.getConfig();
    const client = this.getClient();

    await client.send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );
  }

  /**
   * Download an object from Spaces as Buffer
   */
  async downloadObject(objectKey: string): Promise<Buffer> {
    const cfg = this.getConfig();
    const client = this.getClient();

    const response = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
    );

    const body = response.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body?.transformToByteArray) {
      throw new InternalServerErrorException('No se pudo leer el archivo.');
    }

    const uint8Array = await body.transformToByteArray();
    return Buffer.from(uint8Array);
  }

  /**
   * Downloads private object data with metadata while enforcing a byte limit.
   */
  async readObjectWithMetadata(params: {
    objectKey: string;
    maximumBytes: number;
  }): Promise<StorageObjectWithMetadata> {
    const cfg = this.getConfig();
    const client = this.getClient();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: params.objectKey,
      }),
    );

    if (response.ContentLength !== undefined && response.ContentLength > params.maximumBytes) {
      throw new StorageObjectCapacityError();
    }

    const body = response.Body as AsyncIterable<Uint8Array> | { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
    if (!body) {
      throw new InternalServerErrorException('No se pudo leer el archivo.');
    }

    const chunks: Buffer[] = [];
    let length = 0;
    if (Symbol.asyncIterator in Object(body)) {
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk);
        length += buffer.length;
        if (length > params.maximumBytes) {
          throw new StorageObjectCapacityError();
        }
        chunks.push(buffer);
      }
    } else if ('transformToByteArray' in body && body.transformToByteArray) {
      const bytes = await body.transformToByteArray();
      if (bytes.length > params.maximumBytes) {
        throw new StorageObjectCapacityError();
      }
      chunks.push(Buffer.from(bytes));
    } else {
      throw new InternalServerErrorException('No se pudo leer el archivo.');
    }

    return {
      body: Buffer.concat(chunks),
      contentType: response.ContentType ?? null,
      eTag: response.ETag ?? null,
      lastModified: response.LastModified ?? null,
    };
  }

  /**
   * Generate a signed URL for downloading an object
   */
  async generateSignedUrl(objectKey: string, expiresInSeconds = 900): Promise<string> {
    const cfg = this.getConfig();
    const client = this.getClient();

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}
