export const ADDITIONAL_SERVICE_COST_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const ACCEPTED_COST_EVIDENCE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export type AdditionalServiceCostEvidenceFile = Pick<
  File,
  'name' | 'size' | 'type'
>;

export function isValidOptionalSupplierCostUrl(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) return true;

  try {
    const url = new URL(normalizedValue);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

    const hostname = url.hostname;
    const isIpv4 =
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) &&
      hostname.split('.').every((part) => Number(part) <= 255);
    const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']');
    const domainParts = hostname.split('.');
    const isDomain =
      domainParts.length >= 2 &&
      domainParts.every((part) =>
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(part),
      ) &&
      domainParts[domainParts.length - 1].length >= 2;

    return isIpv4 || isIpv6 || isDomain;
  } catch {
    return false;
  }
}

export function costEvidenceFileError(
  file: AdditionalServiceCostEvidenceFile,
): string | null {
  if (!ACCEPTED_COST_EVIDENCE_MIME_TYPES.has(file.type)) {
    return 'Solo se permiten imágenes JPEG, PNG o WebP.';
  }
  if (file.size < 1) return 'La evidencia seleccionada está vacía.';
  if (file.size > ADDITIONAL_SERVICE_COST_EVIDENCE_MAX_BYTES) {
    return 'La evidencia no puede superar 10 MiB.';
  }
  return null;
}

export function costSourceValidationMessage(
  supplierCostUrl: string,
  evidence: AdditionalServiceCostEvidenceFile | null,
): string | null {
  if (!isValidOptionalSupplierCostUrl(supplierCostUrl)) {
    return 'La URL del costo debe ser una dirección HTTP o HTTPS válida.';
  }
  if (!supplierCostUrl.trim() && !evidence) {
    return 'Debe indicar una URL del costo o adjuntar una evidencia.';
  }
  return null;
}

export function costSourceIndicator(
  supplierCostUrl: string,
  evidence: AdditionalServiceCostEvidenceFile | null,
) {
  const hasUrl = Boolean(supplierCostUrl.trim());
  if (hasUrl && evidence) return 'URL registrada · Evidencia adjunta';
  if (hasUrl) return 'URL registrada';
  if (evidence) return 'Evidencia adjunta';
  return 'Sin respaldo registrado';
}
