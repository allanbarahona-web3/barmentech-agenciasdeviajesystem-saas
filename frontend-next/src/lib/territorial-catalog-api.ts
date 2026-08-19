import { fetchApi } from '@/lib/api-client';

export type TerritorialSubdivision = {
  id: string;
  administrativeLevel: number;
  subdivisionTypeCode: string;
  code: string;
  fullCode: string;
  name: string;
};

export type TerritorialSubdivisionResponse = {
  countryCode: string;
  release: { version: string };
  parent: TerritorialSubdivision | null;
  subdivisions: TerritorialSubdivision[];
};

const SAFE_MESSAGES: Record<string, string> = {
  TERRITORIAL_CATALOG_NOT_READY:
    'El catálogo territorial de este país todavía no está disponible.',
  TERRITORIAL_SUBDIVISION_NOT_FOUND:
    'La división territorial seleccionada ya no está disponible. Seleccione una opción vigente.',
};

export class TerritorialCatalogApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'TerritorialCatalogApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function listTerritorialSubdivisions(
  countryCode: string,
  parentFullCode?: string,
  signal?: AbortSignal,
): Promise<TerritorialSubdivisionResponse> {
  const params = parentFullCode ? { parentFullCode } : undefined;
  const response = await fetchApi(
    `/territorial-catalogs/${encodeURIComponent(countryCode)}/subdivisions`,
    { method: 'GET', params, signal },
  );
  const payload: unknown = await response.json().catch(() => null);

  if (response.ok) return payload as TerritorialSubdivisionResponse;

  const record = isRecord(payload) ? payload : {};
  const code =
    typeof record.code === 'string'
      ? record.code
      : 'TERRITORIAL_CATALOG_REQUEST_FAILED';
  throw new TerritorialCatalogApiError(
    code,
    SAFE_MESSAGES[code] ??
      'No se pudo cargar el catálogo territorial. Intente nuevamente.',
  );
}
