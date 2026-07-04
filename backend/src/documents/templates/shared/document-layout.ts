/**
 * Base Document Layout
 * 
 * Core HTML document structure for PDF generation.
 * Provides the outer HTML shell with proper doctype, head, and body tags.
 */

import { documentStyles } from "./document-styles";
import { escapeHtml } from "./template-helpers";

export interface DocumentLayoutOptions {
  title: string;
  lang?: string;
  charset?: string;
  additionalStyles?: string;
}

/**
 * Wrap content in full HTML document structure
 */
export const documentLayout = (
  content: string,
  options: DocumentLayoutOptions,
): string => {
  const lang = options.lang || "es";
  const charset = options.charset || "UTF-8";
  const additionalStyles = options.additionalStyles || "";

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="${escapeHtml(charset)}" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
<style>
${documentStyles()}
${additionalStyles}
</style>
</head>
<body>
${content}
</body>
</html>`;
};
