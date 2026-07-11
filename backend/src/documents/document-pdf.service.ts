import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";

const CSS_PX_TO_PT = 0.75 as const; // 96 DPI → 72 DPI
const A4_HEIGHT_PX = 841.89 / CSS_PX_TO_PT; // ≈ 1122.52 CSS px per page
const A4_HEIGHT_PT = 841.89;
const MM_TO_PT = 72 / 25.4;

// Must match @page margins from frontend/app.js PDF template.
const PAGE_MARGIN_TOP_PT = 22 * MM_TO_PT;
const PAGE_MARGIN_RIGHT_PT = 18 * MM_TO_PT;
const PAGE_MARGIN_BOTTOM_PT = 24 * MM_TO_PT;
const PAGE_MARGIN_LEFT_PT = 20 * MM_TO_PT;
const PAGE_CONTENT_HEIGHT_PT = A4_HEIGHT_PT - PAGE_MARGIN_TOP_PT - PAGE_MARGIN_BOTTOM_PT;
const PAGE_CONTENT_HEIGHT_PX = PAGE_CONTENT_HEIGHT_PT / CSS_PX_TO_PT;

export interface SignatureAnchor {
  pageIndex: number;
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Template handler for a specific document type
 * 
 * Pluggable interface for registering document type renderers.
 * Each handler validates and processes its document type.
 */
interface TemplateHandler {
  /** Document type identifier */
  documentType: string;
  /** Validate HTML contains required structure for this document type */
  validateHtml(html: string): boolean;
  /** Get renderer configuration for this document type */
  getConfig(): {
    format: "A4";
    printBackground: boolean;
    preferCSSPageSize: boolean;
  };
}

/**
 * Template resolver for document types
 * 
 * Maps documentType to pluggable template handlers.
 * Supports extensible registration of new document types.
 */
class TemplateResolver {
  private handlers: Map<string, TemplateHandler> = new Map();

  /**
   * Register a template handler for a document type
   * @param documentType Type identifier
   * @param handler Handler implementation
   */
  register(documentType: string, handler: TemplateHandler): void {
    this.handlers.set(documentType.toUpperCase(), handler);
  }

  /**
   * Resolve handler for a document type
   * Falls back to generic handler if specific handler not found
   * @param documentType Type identifier
   * @returns Handler for rendering this document type
   */
  resolve(documentType: string): TemplateHandler {
    const type = documentType.toUpperCase();
    return this.handlers.get(type) || this.getDefaultHandler();
  }

  /**
   * Get default handler (generic for any document type)
   * Used as fallback when specific handler not registered
   */
  private getDefaultHandler(): TemplateHandler {
    return {
      documentType: "DEFAULT",
      validateHtml(): boolean {
        // All HTML is valid for generic rendering
        return true;
      },
      getConfig(): { format: "A4"; printBackground: boolean; preferCSSPageSize: boolean } {
        return {
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        };
      },
    };
  }
}

/**
 * DocumentPdfService
 * 
 * Generic service for rendering HTML documents to PDF using Puppeteer.
 * 
 * Purpose:
 * - Centralize PDF generation logic for all document types
 * - Support contracts, authorizations, waivers, and future documents
 * - Handle signature placeholder detection and signed document rendering
 * 
 * Current State:
 * - Extracted from PdfRenderService in ContractsModule
 * - Supports unsigned and signed document rendering
 * - Calculates signature anchor positions for digital signing
 * 
 * Capabilities:
 * - Render HTML to PDF with signature placeholders
 * - Render signed HTML with signature images embedded
 * - Calculate signature box coordinates for PDF signing
 * - Puppeteer configuration and browser lifecycle management
 */
@Injectable()
export class DocumentPdfService {
  private readonly logger = new Logger(DocumentPdfService.name);
  private readonly templateResolver: TemplateResolver;

  constructor() {
    this.templateResolver = new TemplateResolver();
    this.registerTemplateHandlers();
  }

  /**
   * Register built-in template handlers
   * 
   * Current support:
   * - CONTRACT: Standard contract with signatures
   * - MINOR_ANNEX: Minor authorization annex
   * - LIABILITY_WAIVER: Liability waiver document
   * 
   * Future document types plug into the same resolver.
   */
  private registerTemplateHandlers(): void {
    // CONTRACT handler
    this.templateResolver.register("CONTRACT", {
      documentType: "CONTRACT",
      validateHtml(html: string): boolean {
        // Minimal validation: HTML should not be empty
        return typeof html === "string" && html.trim().length > 0;
      },
      getConfig(): { format: "A4"; printBackground: boolean; preferCSSPageSize: boolean } {
        return {
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        };
      },
    });

    // MINOR_ANNEX handler
    this.templateResolver.register("MINOR_ANNEX", {
      documentType: "MINOR_ANNEX",
      validateHtml(html: string): boolean {
        // Minimal validation: HTML should not be empty
        return typeof html === "string" && html.trim().length > 0;
      },
      getConfig(): { format: "A4"; printBackground: boolean; preferCSSPageSize: boolean } {
        return {
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        };
      },
    });

    // LIABILITY_WAIVER handler
    this.templateResolver.register("LIABILITY_WAIVER", {
      documentType: "LIABILITY_WAIVER",
      validateHtml(html: string): boolean {
        // Minimal validation: HTML should not be empty
        return typeof html === "string" && html.trim().length > 0;
      },
      getConfig(): { format: "A4"; printBackground: boolean; preferCSSPageSize: boolean } {
        return {
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
        };
      },
    });
  }

  /**
   * Render a signed document with signature images embedded
   * 
   * Supports all document types:
   * - CONTRACT: Standard contract with signatures
   * - MINOR_ANNEX: Minor authorization annex
   * - LIABILITY_WAIVER: Liability waiver document
   * - Future types plug into the same pipeline
   * 
   * @param standaloneHtml Complete HTML document ready for rendering
   * @param signaturesBySigner Map of signer keys to signature image data URLs
   * @param documentType Document type (defaults to CONTRACT for backward compatibility)
   * @returns PDF buffer with signatures embedded
   */
  async renderSignedDocumentToBuffer(
    standaloneHtml: string,
    signaturesBySigner: Record<string, string>,
    documentType?: string,
  ): Promise<Buffer> {
    // Log document type for debugging (useful for multi-document sessions)
    const type = documentType || "CONTRACT";
    this.logger.log(`[pdf] renderSignedDocumentToBuffer documentType=${type}`);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer-core") as {
      launch: (opts: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          setViewport: (opts: Record<string, unknown>) => Promise<void>;
          setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
          emulateMediaType: (type: string) => Promise<void>;
          evaluate: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T>;
          pdf: (opts: Record<string, unknown>) => Promise<Uint8Array>;
        }>;
        close: () => Promise<void>;
      }>;
    };

    const executablePath =
      process.env["PUPPETEER_EXECUTABLE_PATH"] ?? "/usr/bin/chromium";
    const disableSandbox = process.env["PUPPETEER_DISABLE_SANDBOX"] === "true";
    const args = [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ];
    if (disableSandbox) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    const browser = await puppeteer.launch({
      executablePath,
      args,
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123 });
      await page.setContent(standaloneHtml, { waitUntil: "networkidle0", timeout: 30_000 });
      await page.emulateMediaType("print");

      await page.evaluate((signatureMap: unknown) => {
        const signatures =
          signatureMap && typeof signatureMap === "object" && !Array.isArray(signatureMap)
            ? (signatureMap as Record<string, string>)
            : {};

        const toSelector = (key: string) => {
          const esc =
            typeof (window as any).CSS !== "undefined" && typeof (window as any).CSS.escape === "function"
              ? (window as any).CSS.escape(key)
              : key.replace(/([\\"#.:\[\](),=+~*>| ])/g, "\\$1");
          return `[data-signer-key="${esc}"]`;
        };

        Object.entries(signatures).forEach(([signerKey, dataUrl]) => {
          if (!signerKey || !dataUrl) return;
          const target = document.querySelector<HTMLElement>(toSelector(signerKey));
          if (!target) return;

          target.style.position = "relative";

          const labels = target.querySelectorAll<HTMLElement>(".sig-label, .signature-sign-label");
          labels.forEach((label) => {
            label.style.opacity = "0";
          });

          const oldImg = target.querySelector<HTMLImageElement>("img.runtime-signed-image");
          if (oldImg) oldImg.remove();

          const img = document.createElement("img");
          img.className = "runtime-signed-image";
          img.alt = `Firma ${signerKey}`;
          img.src = dataUrl;
          img.style.position = "absolute";
          img.style.left = "4px";
          img.style.right = "4px";
          img.style.top = "4px";
          img.style.bottom = "4px";
          img.style.width = "calc(100% - 8px)";
          img.style.height = "calc(100% - 8px)";
          img.style.objectFit = "contain";
          img.style.pointerEvents = "none";
          target.appendChild(img);
        });
      }, signaturesBySigner);

      // Resolve template handler for this document type
      const templateHandler = this.templateResolver.resolve(documentType || "CONTRACT");
      const pdfConfig = templateHandler.getConfig();

      const pdfBytes = await page.pdf({
        format: pdfConfig.format,
        printBackground: pdfConfig.printBackground,
        preferCSSPageSize: pdfConfig.preferCSSPageSize,
      });

      return Buffer.from(pdfBytes);
    } finally {
      await browser.close();
    }
  }

  /**
   * Render an unsigned document and calculate signature anchor positions
   * 
   * @param standaloneHtml Complete HTML document with signature placeholders marked by [data-signer-key]
   * @returns Object containing PDF buffer and signature anchor coordinates
   */
  async renderDocumentToBuffer(standaloneHtml: string): Promise<{
    pdfBuffer: Buffer;
    signatureAnchors: Record<string, SignatureAnchor>;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require("puppeteer-core") as {
      launch: (opts: Record<string, unknown>) => Promise<{
        newPage: () => Promise<{
          setViewport: (opts: Record<string, unknown>) => Promise<void>;
          setContent: (html: string, opts: Record<string, unknown>) => Promise<void>;
          emulateMediaType: (type: string) => Promise<void>;
          evaluate: <T>(fn: (...args: unknown[]) => T, ...args: unknown[]) => Promise<T>;
          pdf: (opts: Record<string, unknown>) => Promise<Uint8Array>;
        }>;
        close: () => Promise<void>;
      }>;
    };

    const executablePath =
      process.env["PUPPETEER_EXECUTABLE_PATH"] ?? "/usr/bin/chromium";
    const disableSandbox = process.env["PUPPETEER_DISABLE_SANDBOX"] === "true";

    this.logger.log(`[pdf] executablePath=${executablePath} disableSandbox=${disableSandbox}`);

    const args = [
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
    ];
    if (disableSandbox) {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    this.logger.log(`[pdf] launching browser with args: ${args.join(" ")}`);

    const browser = await puppeteer.launch({
      executablePath,
      args,
      headless: true,
    });
    this.logger.log("[pdf] browser launched");

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123 });
      this.logger.log("[pdf] setContent start");
      await page.setContent(standaloneHtml, { waitUntil: "networkidle0", timeout: 30_000 });
      this.logger.log("[pdf] setContent done, emulating print");
      await page.emulateMediaType("print");

      this.logger.log("[pdf] generating PDF first to determine page count...");
      
      // Resolve template handler for unsigned documents (defaults to CONTRACT)
      const templateHandler = this.templateResolver.resolve("CONTRACT");
      const pdfConfig = templateHandler.getConfig();
      
      const pdfBytes = await page.pdf({
        format: pdfConfig.format,
        printBackground: pdfConfig.printBackground,
        preferCSSPageSize: pdfConfig.preferCSSPageSize,
      });
      this.logger.log(`[pdf] pdf generated, size=${pdfBytes.length} bytes`);

      // Read the PDF to get total page count
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFDocument } = require("pdf-lib") as typeof import("pdf-lib");
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      const lastPageIndex = totalPages - 1;
      this.logger.log(`[pdf] PDF has ${totalPages} pages, last page index: ${lastPageIndex}`);

      // Calculate signature anchors using print content height/margins.
      // This keeps page index and Y aligned with actual paginated PDF output.
      const signatureAnchors = await page.evaluate(
        (
          finalPageIndex: unknown,
          a4HeightPt: unknown,
          pxToPt: unknown,
          contentHeightPx: unknown,
          marginTopPt: unknown,
          marginLeftPt: unknown,
        ): Record<string, SignatureAnchor> => {
          const elems = document.querySelectorAll<HTMLElement>("[data-signer-key]");
          const anchors: Record<string, SignatureAnchor> = {};
          
          elems.forEach((el) => {
            const signerKey = el.getAttribute("data-signer-key");
            if (!signerKey) return;
            
            const rect = el.getBoundingClientRect();

            const absoluteTopPx = rect.top + window.scrollY;
            const rawPageIndex = Math.floor(absoluteTopPx / (contentHeightPx as number));
            const yLocalPx = absoluteTopPx - rawPageIndex * (contentHeightPx as number);

            // Clamp page index to available PDF pages for safety.
            const pageIndex = Math.max(0, Math.min(rawPageIndex, finalPageIndex as number));

            const heightPt = rect.height * (pxToPt as number);
            const widthPt = rect.width * (pxToPt as number);
            const xPt = (marginLeftPt as number) + rect.left * (pxToPt as number);

            // Convert from top-based content coordinates to PDF bottom-left coordinates.
            const yTopPt = (marginTopPt as number) + yLocalPx * (pxToPt as number);
            const yPt = (a4HeightPt as number) - (yTopPt + heightPt);
            
            anchors[signerKey] = {
              pageIndex,
              box: {
                x: Number(xPt.toFixed(2)),
                y: Number(yPt.toFixed(2)),
                width: Number(widthPt.toFixed(2)),
                height: Number(heightPt.toFixed(2)),
              },
            };
          });
          return anchors;
        },
        lastPageIndex,
        A4_HEIGHT_PT,
        CSS_PX_TO_PT,
        PAGE_CONTENT_HEIGHT_PX,
        PAGE_MARGIN_TOP_PT,
        PAGE_MARGIN_LEFT_PT,
      );

      this.logger.log(`[pdf] signature anchors on page ${lastPageIndex}:`, signatureAnchors);

      return {
        pdfBuffer: Buffer.from(pdfBytes),
        signatureAnchors,
      };
    } catch (error) {
      this.logger.error("[pdf] render failed", error instanceof Error ? error.stack : String(error));
      throw new InternalServerErrorException("No se pudo generar el PDF del contrato.");
    } finally {
      await browser.close();
      this.logger.log("[pdf] browser closed");
    }
  }
}
