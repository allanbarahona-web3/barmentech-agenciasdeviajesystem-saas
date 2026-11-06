/** The established fallback used when no tenant billing configuration exists. */
export const DEFAULT_TENANT_TIME_ZONE = "America/Costa_Rica";

/**
 * Resolves only an absent tenant configuration to the agreed default.
 *
 * Stored values deliberately pass through unchanged, including invalid legacy
 * values, so readers retain their existing invalid-value behavior and do not
 * silently repair configuration.
 */
export const resolveTenantTimeZone = (
  value: string | null | undefined,
): string => value ?? DEFAULT_TENANT_TIME_ZONE;

/**
 * Returns the whitespace-normalized timezone only when the current runtime
 * supports it through Intl. It intentionally does not canonicalize aliases or
 * repair values read from persistence.
 */
export const normalizeTenantTimeZone = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const timeZone = value.trim();
  if (!timeZone || timeZone.length > 100) return null;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return null;
  }
};

export const isSupportedTenantTimeZone = (value: unknown): boolean =>
  normalizeTenantTimeZone(value) !== null;
