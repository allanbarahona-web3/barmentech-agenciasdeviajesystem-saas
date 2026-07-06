import type { ContractFormState } from "@/features/contracts-form/types";
import { addCustomItineraryItem, removeCustomItineraryItem, updateItineraryItem } from "@/features/contracts-form/utils";

export interface ItineraryStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  rangeMessage: string;
  itineraryMessage: string;
}

/**
 * ItineraryStep - Itinerary Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the complete Itinerary section for international trips including:
 * - Opening day (fixed)
 * - Closing day (fixed)
 * - Custom activities (user-defined)
 * - Add/remove activity functionality
 * 
 * This component is only rendered for international trips (not internal trips).
 * 
 * This is a pure extraction with zero functional changes.
 */
export function ItineraryStep({
  state,
  setState,
  isInternalTrip,
  rangeMessage,
  itineraryMessage,
}: ItineraryStepProps) {
  // Only render for international trips
  if (isInternalTrip) {
    return null;
  }

  return (
    <div className="itinerary-box">
      <div className="itinerary-head">
        <h2>Itinerario</h2>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setState((prev) => addCustomItineraryItem(prev))}
          disabled={Boolean(rangeMessage) || Boolean(itineraryMessage)}
        >
          + Agregar actividad
        </button>
      </div>

      {itineraryMessage ? <p className="form-error">{itineraryMessage}</p> : null}

      <div className="itinerary-list">
        {state.itinerary.map((item) => {
          const isFixed = item.kind === "opening" || item.kind === "closing";
          const label = item.kind === "opening" ? "Inicio del Viaje" : item.kind === "closing" ? "Fin del Viaje" : "Actividad";

          return (
            <div key={item.id} className="itinerary-row">
              <label>
                Tipo
                <input value={label} readOnly />
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  value={item.date}
                  min={!rangeMessage ? state.startDate || undefined : undefined}
                  max={!rangeMessage ? state.endDate || undefined : undefined}
                  readOnly={isFixed}
                  onChange={(event) =>
                    setState((prev) => updateItineraryItem(prev, item.id, "date", event.target.value))
                  }
                />
              </label>

              <label>
                Detalle
                <input
                  value={item.detail}
                  placeholder="Tour a X lugar"
                  onChange={(event) =>
                    setState((prev) => updateItineraryItem(prev, item.id, "detail", event.target.value))
                  }
                />
              </label>

              <div className="itinerary-actions">
                {item.kind === "custom" ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={Boolean(itineraryMessage)}
                    onClick={() => setState((prev) => removeCustomItineraryItem(prev, item.id))}
                  >
                    Eliminar
                  </button>
                ) : (
                  <span className="hint-pill">No eliminar</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
