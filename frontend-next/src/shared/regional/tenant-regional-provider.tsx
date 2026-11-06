"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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

type TenantRegionalContextValue = TenantRegionalState & {
  /** Re-fetches the authenticated tenant configuration without changing session state. */
  refreshRegionalConfiguration: () => Promise<void>;
};

const DEFAULT_TENANT_CURRENCY = "CRC";

const initialState: TenantRegionalState = {
  timeZone: DEFAULT_TENANT_TIMEZONE,
  preferredCurrency: DEFAULT_TENANT_CURRENCY,
  isConfigured: false,
};

const TenantRegionalContext = createContext<TenantRegionalContextValue>({
  ...initialState,
  refreshRegionalConfiguration: async () => undefined,
});

export function TenantRegionalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TenantRegionalState>(initialState);
  const requestSequence = useRef(0);
  const mounted = useRef(false);

  const refreshRegionalConfiguration = useCallback(async () => {
    const token = getStoredToken();
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;

    if (!token) {
      if (mounted.current && requestId === requestSequence.current) {
        setState(initialState);
      }
      return;
    }

    const profile = await getAuthenticatedSessionProfile();
    if (
      !mounted.current ||
      requestId !== requestSequence.current ||
      token !== getStoredToken()
    ) {
      return;
    }

    setState({
      timeZone: normalizeTenantTimeZone(profile.tenant?.fiscalTimezone),
      preferredCurrency: normalizeTenantCurrency(profile.tenant?.preferredCurrency),
      isConfigured: true,
    });
  }, []);

  useEffect(() => {
    mounted.current = true;

    const loadForSession = () => {
      const token = getStoredToken();
      const requestId = requestSequence.current + 1;
      requestSequence.current = requestId;
      if (!getStoredToken()) {
        setState(initialState);
        return;
      }

      void getAuthenticatedSessionProfile()
        .then((profile) => {
          if (
            mounted.current &&
            requestId === requestSequence.current &&
            token === getStoredToken()
          ) {
            setState({
              timeZone: normalizeTenantTimeZone(profile.tenant?.fiscalTimezone),
              preferredCurrency: normalizeTenantCurrency(profile.tenant?.preferredCurrency),
              isConfigured: true,
            });
          }
        })
        .catch(() => {
          if (
            mounted.current &&
            requestId === requestSequence.current &&
            token === getStoredToken()
          ) {
            setState(initialState);
          }
        });
    };

    loadForSession();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, loadForSession);
    return () => {
      mounted.current = false;
      requestSequence.current += 1;
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, loadForSession);
    };
  }, []);

  return (
    <TenantRegionalContext.Provider value={{ ...state, refreshRegionalConfiguration }}>
      {children}
    </TenantRegionalContext.Provider>
  );
}

export function useTenantRegional(): TenantRegionalContextValue {
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
