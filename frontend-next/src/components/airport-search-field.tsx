'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  searchAirports,
  type Airport,
} from '@/shared/airports';
import styles from './airport-search-field.module.css';

interface AirportSearchFieldProps {
  label: string;
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
  error?: string;
}

function formatAirport(airport: Airport) {
  return `${airport.iata} — ${airport.name}, ${airport.city}, ${airport.country}`;
}

export function AirportSearchField({
  label,
  value,
  onChange,
  error,
}: AirportSearchFieldProps) {
  const inputId = useId();
  const listboxId = useId();
  const requestId = useRef(0);
  const [query, setQuery] = useState(() => (value ? formatAirport(value) : ''));
  const [results, setResults] = useState<Airport[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!query.trim() || value) {
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;

    const timeout = window.setTimeout(() => {
      searchAirports(query, { limit: 10 })
        .then((airports) => {
          if (requestId.current === currentRequest) {
            setResults(airports);
            setIsOpen(true);
          }
        })
        .finally(() => {
          if (requestId.current === currentRequest) {
            setIsLoading(false);
          }
        });
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [query, value]);

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label} <span className={styles.required}>*</span>
      </label>
      <div className={styles.search}>
        <input
          id={inputId}
          className={styles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen && !value}
          aria-invalid={Boolean(error)}
          placeholder="Buscar por código IATA, aeropuerto, ciudad o país"
          value={query}
          onFocus={() => {
            if (!value && (results.length > 0 || query.trim())) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            requestId.current += 1;
            setQuery(nextQuery);
            setResults([]);
            setIsLoading(Boolean(nextQuery.trim()));
            onChange(null);
            setIsOpen(Boolean(nextQuery.trim()));
          }}
        />

        {isOpen && !value && (
          <div className={styles.results} id={listboxId} role="listbox">
            {isLoading ? (
              <p className={styles.status}>Buscando aeropuertos…</p>
            ) : results.length > 0 ? (
              results.map((airport) => (
                <button
                  className={styles.result}
                  key={airport.iata}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    requestId.current += 1;
                    onChange(airport);
                    setQuery(formatAirport(airport));
                    setResults([]);
                    setIsLoading(false);
                    setIsOpen(false);
                  }}
                >
                  <strong className={styles.iata}>{airport.iata}</strong>
                  <span>
                    {airport.name}
                    <small className={styles.location}>
                      {airport.city}, {airport.country}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className={styles.status}>No se encontraron aeropuertos.</p>
            )}
          </div>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
