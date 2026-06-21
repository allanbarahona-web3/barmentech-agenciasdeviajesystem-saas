(() => {
  const normalizeBase = (value) => String(value || "").trim().replace(/\/+$/, "");
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isLocalHost = 
    hostname === "localhost" || 
    hostname === "127.0.0.1" || 
    hostname.endsWith(".localhost");
  const productionFallbackByHost = {
    "contratos.lucitour.com": "https://lucitourops-vww2w.ondigitalocean.app",
    "www.contratos.lucitour.com": "https://lucitourops-vww2w.ondigitalocean.app",
  };

  // Runtime sources:
  // 1) window.__APP_ENV__.API_BASE (injected at deploy/runtime)
  // 2) <meta name="api-base" content="..."> (optional per-page override)
  // 3) localStorage CONTRACTS_API_BASE (localhost only)
  // 4) production host fallback mapping
  // 5) localhost fallback for local dev
  const runtimeApiBase = normalizeBase(
    (window.__APP_ENV__ && window.__APP_ENV__.API_BASE) ||
    document.querySelector('meta[name="api-base"]')?.getAttribute("content") ||
    "",
  );
  const localStorageOverride = isLocalHost
    ? normalizeBase(window.localStorage.getItem("CONTRACTS_API_BASE") || "")
    : "";

  const hostFallback = normalizeBase(
    productionFallbackByHost[hostname] || "",
  );
  
  // En desarrollo con subdominios, preservar el subdominio en el API_BASE
  // Ejemplo: empresa.localhost:3000 → http://empresa.localhost:3001
  const localFallback = isLocalHost 
    ? `http://${hostname}:3001`
    : "";
  
  // Fallback automático para subdominios en producción
  // Ejemplo: almanova.dev.viajes.system.barmentech.com → api.dev.viajes.system.barmentech.com
  const productionFallback = !isLocalHost && hostname.includes('.')
    ? (() => {
        const parts = hostname.split('.');
        // Reemplazar primer segmento (tenant) con 'api'
        parts[0] = 'api';
        return `https://${parts.join('.')}`;
      })()
    : "";
  
  const apiBase = runtimeApiBase || localStorageOverride || hostFallback || localFallback || productionFallback;

  window.APP_CONFIG = {
    ...(window.APP_CONFIG || {}),
    API_BASE: apiBase,
    DEBUG: Boolean(window.__APP_ENV__?.DEBUG) || false,
    SIGNATURE_PLACEMENT: {
      ANCHOR_OFFSET_X: 8,
      ANCHOR_OFFSET_Y: 34,
      FALLBACK_X_RATIO: 0.1,
      FALLBACK_Y_RATIO: 0.085,
      WIDTH_RATIO: 0.34,
      MAX_WIDTH: 220,
      PAGE_PADDING: 24,
      BOX_SCALE: 0.9,
      BOX_INSET: 4,
      BOX_OFFSET_X: 0,
      BOX_OFFSET_Y: 0,
      ...(window.APP_CONFIG?.SIGNATURE_PLACEMENT || {}),
    },
  };
})();
