import { BadRequestException } from "@nestjs/common";
import * as sharp from "sharp";
import { processUploadedDocument } from "./uploaded-document-processor";

describe("processUploadedDocument", () => {
  it.each([
    ["image/png", "cotizacion-hotel.png", "png"],
    ["image/jpeg", "cotizacion-vuelo.jpg", "jpeg"],
    ["image/jpeg", "cotizacion-vuelo.jpeg", "jpeg"],
  ] as const)("converts valid %s uploads to WebP", async (mimeType, originalFileName, format) => {
    const bytes = await image(format);

    const processed = await processUploadedDocument({ bytes, mimeType, originalFileName });

    expect(processed).toMatchObject({ mimeType: "image/webp", fileName: originalFileName.replace(/\.[^.]+$/, ".webp"), converted: true });
    await expect(sharp(processed.bytes).metadata()).resolves.toMatchObject({ format: "webp" });
  });

  it("preserves valid WebP bytes and PDF bytes", async () => {
    const webpBytes = await image("webp");
    const pdfBytes = Buffer.from("%PDF-1.7 quote");

    await expect(processUploadedDocument({ bytes: webpBytes, mimeType: "image/webp", originalFileName: "quote.webp" })).resolves.toEqual({ bytes: webpBytes, mimeType: "image/webp", fileName: "quote.webp", converted: false });
    await expect(processUploadedDocument({ bytes: pdfBytes, mimeType: "application/pdf", originalFileName: "quote.pdf" })).resolves.toEqual({ bytes: pdfBytes, mimeType: "application/pdf", fileName: "quote.pdf", converted: false });
  });

  it("rejects corrupt or declared-mime-mismatched image bytes", async () => {
    await expect(processUploadedDocument({ bytes: Buffer.from("not-an-image"), mimeType: "image/png", originalFileName: "bad.png" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(processUploadedDocument({ bytes: await image("jpeg"), mimeType: "image/png", originalFileName: "wrong.png" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

async function image(format: "png" | "jpeg" | "webp") {
  const source = sharp({ create: { width: 2, height: 2, channels: 3, background: "#2563eb" } });
  if (format === "png") return source.png().toBuffer();
  if (format === "jpeg") return source.jpeg().toBuffer();
  return source.webp().toBuffer();
}
