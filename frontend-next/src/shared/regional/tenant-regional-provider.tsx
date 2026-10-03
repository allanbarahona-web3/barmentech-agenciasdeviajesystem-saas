"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_SESSION_CHANGED_EVENT,
  getAuthenticatedSessionProfile,
  getStoredToken,
} from "@/lib/auth-api";
import {
  DEFAULT_TENANT_TIMEZONE,
  formatBusinessDateTime,
  normalizeTenantTimeZone,
} from "./business-date";

type TenantRegionalState = {
  timeZone: string;
  preferredCurrency: string;
  isConfigured: boolean;
};

const DEFAULT_TENANT_CURRENCY = "CRC";

const TenantRegionalContext = createContext<TenantRegionalState>({
  timeZone: DEFAULT_TENANT_TIMEZONE,
  preferredCurrency: DEFAULT_TENANT_CURRENCY,
  isConfigured: false,
});

export function TenantRegionalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TenantRegionalState>({
    timeZone: DEFAULT_TENANT_TIMEZONE,
    preferredCurrency: DEFAULT_TENANT_CURRENCY,
    isConfigured: false,
  });

  useEffect(() => {
    let controller: AbortController | null = null;

    const load = () => {
      controller?.abort();
      if (!getStoredToken()) {
        setState({ timeZone: DEFAULT_TENANT_TIMEZONE, preferredCurrency: DEFAULT_TENANT_CURRENCY, isConfigured: false });
        return;
      }

      const request = new AbortController();
      controller = request;
      void getAuthenticatedSessionProfile(request.signal)
        .then((profile) => {
          if (!request.signal.aborted) {
            setState({
              timeZone: normalizeTenantTimeZone(profile.tenant?.fiscalTimezone),
              preferredCurrency: normalizeTenantCurrency(profile.tenant?.preferredCurrency),
              isConfigured: true,
            });
          }
        })
        .catch(() => {
          if (!request.signal.aborted) {
            setState({ timeZone: DEFAULT_TENANT_TIMEZONE, preferredCurrency: DEFAULT_TENANT_CURRENCY, isConfigured: false });
          }
        });
    };

    load();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, load);
    return () => {
      controller?.abort();
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, load);
    };
  }, []);

  return (
    <TenantRegionalContext.Provider value={state}>
      {children}
    </TenantRegionalContext.Provider>
  );
}

export function useTenantRegional(): TenantRegionalState {
  return useContext(TenantRegionalContext);
}

function normalizeTenantCurrency(value: string | null | undefined): string {
  const currency = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_TENANT_CURRENCY;
}

/** Returns the shared instant formatter bound to the current tenant timezone. */
export function useTenantDateTimeFormatter(): (value: string) => string {
  const { timeZone } = useTenantRegional();
  return useCallback(
    (value: string) => formatBusinessDateTime(value, timeZone),
    [timeZone],
  );
}
