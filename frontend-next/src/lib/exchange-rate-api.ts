import { authenticatedFetch, getStoredToken } from "@/lib/auth-api";
import { resolveApiBase } from "@/lib/runtime-config";

export type ExchangeRate = {
  id: string;
  date: string;
  buyRate: number;
  sellRate: number;
  source: string;
  setByName: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CurrentExchangeRate = {
  id?: string;
  date: string;
  effectiveDate: string;
  source: 'MANUAL' | 'BCCR';
  buyRate: number;
  sellRate: number;
  retrievedAt?: string;
  setByName?: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CurrentExchangeRateResponse = {
  rate: CurrentExchangeRate | null;
  status: 'AVAILABLE' | 'INCOMPLETE' | 'MISSING';
};

export type ExchangeRateHistoryReportRow = {
  date: string;
  source: 'MANUAL' | 'BCCR';
  buyRate: number | null;
  sellRate: number | null;
  registeredAt: string;
};

export const CURRENT_EXCHANGE_RATE_CHANGED_EVENT = 'exchange-rate-current-changed';

export function notifyCurrentExchangeRateChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CURRENT_EXCHANGE_RATE_CHANGED_EVENT));
  }
}

export type OfficialExchangeRateObservation = {
  id: string;
  effectiveDate: string;
  rateType: 'REFERENCE_BUY' | 'REFERENCE_SELL';
  value: string;
  sourceAuthority: 'BCCR';
  sourceIndicatorCode: string;
  retrievedAt: string;
  sourcePublishedAt: string | null;
};

export type SetExchangeRateInput = {
  date: string; // YYYY-MM-DD
  buyRate: number;
  sellRate: number;
  notes?: string;
};

/**
 * Get current exchange rate (today's rate)
 */
export async function getCurrentExchangeRate(): Promise<CurrentExchangeRateResponse> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const res = await authenticatedFetch(`${base}/exchange-rate/current`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    if (res.status === 404) return { rate: null, status: 'MISSING' };
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    rate: data.rate || null,
    status: data.status === 'AVAILABLE' || data.status === 'INCOMPLETE' ? data.status : 'MISSING',
  };
}

/**
 * Get exchange rate for a specific date
 */
export async function getExchangeRateByDate(date: string): Promise<ExchangeRate | null> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const res = await authenticatedFetch(`${base}/exchange-rate?date=${encodeURIComponent(date)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.rate || null;
}

/**
 * Get exchange rate history
 */
export async function getExchangeRateHistory(days = 30): Promise<ExchangeRate[]> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const res = await authenticatedFetch(`${base}/exchange-rate/history?days=${days}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.rates || [];
}

/**
 * Set exchange rate for a specific date (admin only)
 */
export async function setExchangeRate(input: SetExchangeRateInput): Promise<ExchangeRate> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const res = await authenticatedFetch(`${base}/exchange-rate/set`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.rate;
}

/**
 * Get exchange rate history for a specific date range
 */
export async function getExchangeRateHistoryRange(
  startDate: string,
  endDate: string
): Promise<ExchangeRate[]> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const res = await authenticatedFetch(
    `${base}/exchange-rate/history-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.rates || [];
}

/** Reads persisted official observations only; it never calls BCCR from the browser. */
export async function getOfficialExchangeRateHistoryRange(
  startDate: string,
  endDate: string,
): Promise<OfficialExchangeRateObservation[]> {
  const token = getStoredToken();
  const base = await resolveApiBase();
  const res = await authenticatedFetch(
    `${base}/exchange-rate/official-history-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.rates || [];
}

/** Source-aware report rows, backed only by persisted manual/BCCR data. */
export async function getExchangeRateHistoryReportRange(
  startDate: string,
  endDate: string,
): Promise<ExchangeRateHistoryReportRow[]> {
  const token = getStoredToken();
  const base = await resolveApiBase();
  const res = await authenticatedFetch(
    `${base}/exchange-rate/history-report-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  );
  if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.rates || [];
}

/**
 * Download exchange rate history as PDF
 */
export async function downloadExchangeRateHistoryPdf(
  startDate: string,
  endDate: string,
  options?: { timeZone?: string; utcOffsetMinutes?: number }
): Promise<Blob> {
  const token = getStoredToken();
  const base = await resolveApiBase();
  const timeZone = String(options?.timeZone || "").trim();
  const utcOffsetMinutes =
    typeof options?.utcOffsetMinutes === "number" && Number.isFinite(options.utcOffsetMinutes)
      ? String(options.utcOffsetMinutes)
      : "";

  const query = new URLSearchParams({
    startDate,
    endDate,
  });

  if (timeZone) {
    query.set("timeZone", timeZone);
  }
  if (utcOffsetMinutes) {
    query.set("utcOffsetMinutes", utcOffsetMinutes);
  }

  const res = await authenticatedFetch(
    `${base}/exchange-rate/export-pdf?${query.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  return await res.blob();
}

/**
 * Send exchange rate history via email
 */
export async function emailExchangeRateHistory(
  startDate: string,
  endDate: string,
  email: string,
  options?: { timeZone?: string; utcOffsetMinutes?: number }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const token = getStoredToken();
  const base = await resolveApiBase();

  const payload: {
    startDate: string;
    endDate: string;
    email: string;
    timeZone?: string;
    utcOffsetMinutes?: number;
  } = { startDate, endDate, email };

  const timeZone = String(options?.timeZone || "").trim();
  if (timeZone) {
    payload.timeZone = timeZone;
  }

  if (typeof options?.utcOffsetMinutes === "number" && Number.isFinite(options.utcOffsetMinutes)) {
    payload.utcOffsetMinutes = options.utcOffsetMinutes;
  }

  const res = await authenticatedFetch(`${base}/exchange-rate/email-history`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${await res.text()}`);
  }

  return await res.json();
}
