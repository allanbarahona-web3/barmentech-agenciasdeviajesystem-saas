import countries from 'i18n-iso-countries';
import spanishLocale from 'i18n-iso-countries/langs/es.json';

countries.registerLocale(spanishLocale);

export interface CountryOption {
  code: string;
  name: string;
  searchableName: string;
}

const spanishCollator = new Intl.Collator('es', { sensitivity: 'base' });

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();
}

export const SPANISH_COUNTRY_OPTIONS: readonly CountryOption[] = Object.entries(
  countries.getNames('es', { select: 'official' }),
)
  .map(([code, name]) => ({
    code,
    name,
    searchableName: normalizeSearchValue(name),
  }))
  .sort((first, second) => spanishCollator.compare(first.name, second.name));

const SPANISH_COUNTRY_NAMES = new Map(
  SPANISH_COUNTRY_OPTIONS.map(({ code, name }) => [code, name]),
);

export function getSpanishCountryName(countryCode: string) {
  return SPANISH_COUNTRY_NAMES.get(countryCode.toUpperCase());
}

export function searchSpanishCountries(query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return SPANISH_COUNTRY_OPTIONS;
  }

  return SPANISH_COUNTRY_OPTIONS.filter(
    (country) =>
      country.searchableName.includes(normalizedQuery) ||
      country.code.toLocaleLowerCase('es').includes(normalizedQuery),
  );
}
