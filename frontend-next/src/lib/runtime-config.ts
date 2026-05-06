export const AUTH_TOKEN_KEY = "contractsTempAuthToken";
export const AUTH_SESSION_KEY = "contractsTempAuthSession";

const normalizeBase = (value: string | undefined | null): string =>
  String(value || "").trim().replace(/\/+$/, "");

const isLocalHost = (hostname: string): boolean =>
  hostname === "localhost" || 
  hostname === "127.0.0.1" || 
  hostname.endsWith(".localhost");

export const resolveApiBase = (): string => {
  if (typeof window === "undefined") {
    return normalizeBase(process.env.NEXT_PUBLIC_API_BASE);
  }

  const host = String(window.location.hostname || "").toLowerCase();
  const local = isLocalHost(host);

  const envBase = normalizeBase(process.env.NEXT_PUBLIC_API_BASE);
  const metaBase = normalizeBase(
    document
      .querySelector('meta[name="api-base"]')
      ?.getAttribute("content") || "",
  );

  // Only allow localStorage override in local dev to avoid stale prod overrides.
  const localStorageOverride = local
    ? normalizeBase(window.localStorage.getItem("CONTRACTS_API_BASE"))
    : "";

  const hostFallbackByDomain: Record<string, string> = {
    "contratos.lucitour.com": "https://lucitourops-vww2w.ondigitalocean.app",
    "www.contratos.lucitour.com": "https://lucitourops-vww2w.ondigitalocean.app",
  };

  const hostFallback = normalizeBase(hostFallbackByDomain[host] || "");
  
  // En desarrollo con subdominios, preservar el subdominio en el API_BASE
  // Ejemplo: empresa.localhost:3000 → http://empresa.localhost:3001
  const localFallback = local 
    ? `http://${window.location.hostname}:3001` 
    : "";

  return envBase || metaBase || localStorageOverride || hostFallback || localFallback;
};
