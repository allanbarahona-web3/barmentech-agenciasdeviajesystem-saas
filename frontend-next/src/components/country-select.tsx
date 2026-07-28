'use client';

import { useId, useMemo, useState } from 'react';
import {
  getSpanishCountryName,
  searchSpanishCountries,
  type CountryOption,
} from '@/shared/countries';
import styles from './country-select.module.css';

export interface CountrySelectProps {
  value: string;
  onChange: (countryCode: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  name?: string;
}

export function CountrySelect({
  value,
  onChange,
  label = 'País',
  placeholder = 'Buscar país',
  required = false,
  disabled = false,
  error,
  name,
}: CountrySelectProps) {
  const inputId = useId();
  const listboxId = useId();
  const selectedName = getSpanishCountryName(value) ?? '';
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => searchSpanishCountries(query), [query]);

  function selectCountry(country: CountryOption) {
    onChange(country.code);
    setQuery(country.name);
    setIsOpen(false);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
        {required && (
          <>
            {' '}
            <span className={styles.required}>*</span>
          </>
        )}
      </label>
      <div className={styles.search}>
        <input
          id={inputId}
          name={name}
          className={styles.input}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-invalid={Boolean(error)}
          aria-required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={isOpen ? query : selectedName}
          onFocus={() => {
            setQuery(selectedName);
            setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 150);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setIsOpen(true);
          }}
        />

        {isOpen && !disabled && (
          <div className={styles.results} id={listboxId} role="listbox">
            {results.length > 0 ? (
              results.map((country) => (
                <button
                  className={styles.result}
                  key={country.code}
                  type="button"
                  role="option"
                  aria-selected={country.code === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectCountry(country)}
                >
                  <span>{country.name}</span>
                  <span className={styles.code}>{country.code}</span>
                </button>
              ))
            ) : (
              <p className={styles.status}>No se encontraron países.</p>
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
