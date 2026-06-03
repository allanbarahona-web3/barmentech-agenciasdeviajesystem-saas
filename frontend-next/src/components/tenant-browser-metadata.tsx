"use client";

import { useEffect } from "react";
import { getTenantConfig } from "@/lib/auth-api";

const DEFAULT_TITLE = "Sistema de Contratos";
const DEFAULT_DESCRIPTION = "Sistema de gestion de contratos y cobros";
const DEFAULT_FAVICON = "/favicon.ico";

const upsertMetaByName = (name: string, content: string) => {
  let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("name", name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
};

const upsertMetaByProperty = (property: string, content: string) => {
  let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute("property", property);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
};

const removeMetaByProperty = (property: string) => {
  const element = document.querySelector(`meta[property="${property}"]`);
  if (element) {
    element.remove();
  }
};

const removeMetaByName = (name: string) => {
  const element = document.querySelector(`meta[name="${name}"]`);
  if (element) {
    element.remove();
  }
};

const upsertLink = (rel: string, href: string) => {
  let element = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
};

export function TenantBrowserMetadata() {
  useEffect(() => {
    let mounted = true;

    const applyHead = (params: { title: string; description: string; logoUrl?: string | null }) => {
      const title = String(params.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
      const description = String(params.description || DEFAULT_DESCRIPTION).trim() || DEFAULT_DESCRIPTION;
      const logoUrl = String(params.logoUrl || "").trim();

      document.title = title;

      upsertMetaByName("description", description);
      upsertMetaByProperty("og:title", title);
      upsertMetaByProperty("og:description", description);
      upsertMetaByProperty("og:type", "website");
      upsertMetaByName("twitter:title", title);
      upsertMetaByName("twitter:description", description);

      if (logoUrl) {
        upsertMetaByProperty("og:image", logoUrl);
        upsertMetaByName("twitter:image", logoUrl);
        upsertMetaByName("twitter:card", "summary_large_image");
      } else {
        removeMetaByProperty("og:image");
        removeMetaByName("twitter:image");
        upsertMetaByName("twitter:card", "summary");
      }

      const faviconUrl = logoUrl || DEFAULT_FAVICON;
      upsertLink("icon", faviconUrl);
      upsertLink("shortcut icon", faviconUrl);
      upsertLink("apple-touch-icon", faviconUrl);
    };

    const applyMetadata = async () => {
      try {
        const tenantConfig = await getTenantConfig();
        if (!mounted) return;

        const tenantName = String(tenantConfig?.name || "").trim();
        const dynamicTitle = tenantName ? `${tenantName} | Sistema de Contratos` : DEFAULT_TITLE;
        const dynamicDescription = tenantName
          ? `Sistema de gestion de contratos y cobros de ${tenantName}`
          : DEFAULT_DESCRIPTION;

        applyHead({
          title: dynamicTitle,
          description: dynamicDescription,
          logoUrl: tenantConfig?.logoUrl || null,
        });
      } catch {
        if (!mounted) return;

        applyHead({
          title: DEFAULT_TITLE,
          description: DEFAULT_DESCRIPTION,
          logoUrl: null,
        });
      }
    };

    void applyMetadata();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
