import { BadRequestException } from "@nestjs/common";
import * as sharp from "sharp";

export type SupportedDocumentMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export type UploadedDocumentInput = {
  bytes: Buffer;
  mimeType: string;
  originalFileName: string;
};

export type ProcessedUploadedDocument = {
  bytes: Buffer;
  mimeType: SupportedDocumentMimeType;
  fileName: string;
  converted: boolean;
};

/**
 * Processes supported upload formats without assigning domain-specific storage
 * or authorization behavior. Image inputs are verified against decoded content.
 */
export async function processUploadedDocument(input: UploadedDocumentInput): Promise<ProcessedUploadedDocument> {
  if (!isSupportedDocumentMimeType(input.mimeType)) {
    throw new BadRequestException("Unsupported document file.");
  }
  if (input.mimeType === "application/pdf") {
    return { bytes: input.bytes, mimeType: input.mimeType, fileName: input.originalFileName, converted: false };
  }

  const expectedFormat = input.mimeType === "image/jpeg" ? "jpeg" : input.mimeType.slice("image/".length);
  const metadata = await decodedImageMetadata(input.bytes);
  if (metadata.format !== expectedFormat) {
    throw new BadRequestException("Invalid image file.");
  }

  if (input.mimeType === "image/webp") {
    await decodeImage(input.bytes);
    return { bytes: input.bytes, mimeType: input.mimeType, fileName: input.originalFileName, converted: false };
  }

  try {
    const bytes = await sharp(input.bytes).webp({ quality: 85 }).toBuffer();
    return { bytes, mimeType: "image/webp", fileName: withExtension(input.originalFileName, "webp"), converted: true };
  } catch {
    throw new BadRequestException("Invalid image file.");
  }
}

function isSupportedDocumentMimeType(value: string): value is SupportedDocumentMimeType {
  return value === "application/pdf" || value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

async function decodedImageMetadata(bytes: Buffer) {
  try {
    return await sharp(bytes).metadata();
  } catch {
    throw new BadRequestException("Invalid image file.");
  }
}

async function decodeImage(bytes: Buffer) {
  try {
    await sharp(bytes).toBuffer();
  } catch {
    throw new BadRequestException("Invalid image file.");
  }
}

function withExtension(fileName: string, extension: string): string {
  const leafName = String(fileName).split(/[\\/]/).pop() || "document";
  const baseName = leafName.replace(/\.[^.]+$/, "") || "document";
  return `${baseName}.${extension}`;
}
