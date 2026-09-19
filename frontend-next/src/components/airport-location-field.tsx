"use client";

import { useEffect, useRef, useState } from "react";
import { AirportSearchField } from "@/components/airport-search-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchAirports, type Airport } from "@/shared/airports";

export type AirportLocationSelection =
  | { kind: "STANDARD"; airport: Airport }
  | { kind: "MANUAL"; value: string };

type Props = {
  label: string;
  value: string;
  onChange: (selection: AirportLocationSelection) => void;
  error?: string;
};

/** Keeps standardized airport selections distinct from free-text locations. */
export function AirportLocationField({ label, value, onChange, error }: Props) {
  const [mode, setMode] = useState<"STANDARD" | "MANUAL">(value ? "MANUAL" : "STANDARD");
  const [airport, setAirport] = useState<Airport | null>(null);
  const [manualValue, setManualValue] = useState(value);
  const emittedValue = useRef<string | null>(null);

  useEffect(() => {
    if (value === emittedValue.current) return;
    setManualValue(value);
    setAirport(null);
    if (!value.trim()) {
      setMode("STANDARD");
      return;
    }
    let active = true;
    void searchAirports(value, { limit: 1 }).then((matches) => {
      if (!active) return;
      const exactIata = matches.find((item) => item.iata === value.trim().toUpperCase());
      if (exactIata) {
        setAirport(exactIata);
        setMode("STANDARD");
      } else {
        setMode("MANUAL");
      }
    });
    return () => { active = false; };
  }, [value]);

  const selectAirport = (next: Airport | null) => {
    setAirport(next);
    if (!next) {
      emittedValue.current = "";
      onChange({ kind: "MANUAL", value: "" });
      return;
    }
    setMode("STANDARD");
    emittedValue.current = next.iata;
    onChange({ kind: "STANDARD", airport: next });
  };

  if (mode === "MANUAL") {
    return <div className="space-y-2"><label className="block text-sm font-medium">{label} <span className="text-destructive">*</span><Input className="mt-1" value={manualValue} onChange={(event) => { const next = event.target.value; setManualValue(next); emittedValue.current = next; onChange({ kind: "MANUAL", value: next }); }} placeholder="Ingresa aeropuerto o ubicación" /></label>{error ? <p className="text-sm font-medium text-destructive" role="alert">{error}</p> : null}<Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => { setMode("STANDARD"); setAirport(null); }}>Buscar aeropuerto</Button></div>;
  }

  return <div className="space-y-2"><AirportSearchField label={label} value={airport} onChange={selectAirport} error={error} /><Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => { setMode("MANUAL"); setAirport(null); setManualValue(value); }}>Ingresar manualmente</Button></div>;
}
