export interface Airport {
  /** Canonical business identifier used by airline and GDS integrations. */
  iata: string;
  icao?: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
}

export interface AirportSearchOptions {
  limit?: number;
}

const DEFAULT_RESULT_LIMIT = 20;
let airportDatasetPromise: Promise<readonly Airport[]> | undefined;

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function loadAirportDataset(): Promise<readonly Airport[]> {
  airportDatasetPromise ??= import("./data/airports.min.json").then(
    ({ default: airports }) => airports as Airport[],
  );

  return airportDatasetPromise;
}

function matchPriority(airport: Airport, query: string): number {
  const iata = airport.iata.toLocaleLowerCase();
  const name = normalizeSearchValue(airport.name);
  const city = normalizeSearchValue(airport.city);
  const country = normalizeSearchValue(airport.country);

  if (iata === query) return 0;
  if (iata.startsWith(query)) return 1;
  if (city === query) return 2;
  if (city.startsWith(query)) return 3;
  if (name.startsWith(query)) return 4;
  if (country.startsWith(query)) return 5;
  if (name.includes(query)) return 6;
  if (city.includes(query)) return 7;
  if (country.includes(query)) return 8;
  return Number.POSITIVE_INFINITY;
}

/**
 * Searches the lazy-loaded local airport snapshot by IATA code, airport name,
 * city, or country. An empty query intentionally returns no results.
 */
export async function searchAirports(
  query: string,
  options: AirportSearchOptions = {},
): Promise<Airport[]> {
  const normalizedQuery = normalizeSearchValue(query.trim());
  if (!normalizedQuery) {
    return [];
  }

  const limit = Math.max(0, options.limit ?? DEFAULT_RESULT_LIMIT);
  if (limit === 0) {
    return [];
  }

  const airports = await loadAirportDataset();

  return airports
    .map((airport) => ({
      airport,
      priority: matchPriority(airport, normalizedQuery),
    }))
    .filter(({ priority }) => Number.isFinite(priority))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.airport.iata.localeCompare(right.airport.iata),
    )
    .slice(0, limit)
    .map(({ airport }) => airport);
}
