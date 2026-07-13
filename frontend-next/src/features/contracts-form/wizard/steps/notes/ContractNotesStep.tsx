"use client";

import { useState } from "react";
import type { ContractFormState, ContractNote } from "@/features/contracts-form/types";

export type ContractNoteStepProps = {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
};

export function ContractNotesStep({ state, setState }: ContractNoteStepProps) {
  const notes = state.notes || [];
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [selectedPassenger, setSelectedPassenger] = useState<{
    type: "HOLDER" | "COMPANION" | "MINOR";
    index: number | null;
    name: string;
  } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [editingNoteIndex, setEditingNoteIndex] = useState<number | null>(null);

  // Build list of all passengers
  const passengers: Array<{
    type: "HOLDER" | "COMPANION" | "MINOR";
    index: number | null;
    name: string;
  }> = [
    { type: "HOLDER", index: null, name: state.clientFullName || "Titular" },
    ...state.companions.map((c, idx) => ({
      type: "COMPANION" as const,
      index: idx,
      name: c.fullName || `Acompañante ${idx + 1}`,
    })),
    ...state.minors.map((m, idx) => ({
      type: "MINOR" as const,
      index: idx,
      name: m.minorName || `Menor ${idx + 1}`,
    })),
  ];

  const handleAddNote = (passenger: typeof passengers[0]) => {
    setSelectedPassenger(passenger);
    setNoteText("");
    setEditingNoteIndex(null);
    setShowNoteModal(true);
  };

  const handleEditNote = (noteIndex: number) => {
    const note = notes[noteIndex];
    setSelectedPassenger({ type: note.passengerType, index: note.passengerIndex, name: note.passengerName });
    setNoteText(note.note);
    setEditingNoteIndex(noteIndex);
    setShowNoteModal(true);
  };

  const handleSaveNote = () => {
    if (!selectedPassenger || !noteText.trim()) return;

    const newNote: ContractNote = {
      passengerType: selectedPassenger.type,
      passengerIndex: selectedPassenger.index,
      passengerName: selectedPassenger.name,
      note: noteText.trim(),
    };

    let updatedNotes: ContractNote[];
    if (editingNoteIndex !== null) {
      // Update existing note
      updatedNotes = [...notes];
      updatedNotes[editingNoteIndex] = { ...notes[editingNoteIndex], note: noteText.trim() };
    } else {
      // Add new note
      updatedNotes = [...notes, newNote];
    }

    setState(prev => ({ ...prev, notes: updatedNotes }));
    setShowNoteModal(false);
    setSelectedPassenger(null);
    setNoteText("");
    setEditingNoteIndex(null);
  };

  const handleDeleteNote = (noteIndex: number) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta nota?")) {
      const updatedNotes = notes.filter((_, idx) => idx !== noteIndex);
      setState(prev => ({ ...prev, notes: updatedNotes }));
    }
  };

  const getPassengerNotes = (passenger: typeof passengers[0]) => {
    return notes.filter(
      (n) => n.passengerType === passenger.type && n.passengerIndex === passenger.index
    );
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ fontSize: "24px", fontWeight: "600", marginBottom: "12px", color: "#1f2937" }}>
        📝 Notas del Contrato
      </h2>
      <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "32px" }}>
        Agrega notas específicas para cada pasajero. Estas notas son para uso interno y no aparecen en el contrato PDF.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {passengers.map((passenger) => {
          const passengerNotes = getPassengerNotes(passenger);
          const hasNotes = passengerNotes.length > 0;

          return (
            <div
              key={`${passenger.type}-${passenger.index}`}
              style={{
                padding: "20px",
                background: "white",
                border: hasNotes ? "2px solid #10b981" : "2px solid #e5e7eb",
                borderRadius: "12px",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasNotes ? "16px" : "0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: passenger.type === "HOLDER" ? "#667eea" : passenger.type === "COMPANION" ? "#48bb78" : "#f6ad55",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "600",
                      fontSize: "16px",
                    }}
                  >
                    {passenger.name[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: "600", color: "#1f2937" }}>
                      {passenger.name}
                    </div>
                    <div style={{ fontSize: "13px", color: "#9ca3af" }}>
                      {passenger.type === "HOLDER" ? "Titular" : passenger.type === "COMPANION" ? "Acompañante" : "Menor"}
                    </div>
                  </div>
                  {hasNotes && (
                    <div
                      style={{
                        marginLeft: "8px",
                        padding: "4px 12px",
                        background: "#d1fae5",
                        color: "#065f46",
                        borderRadius: "12px",
                        fontSize: "12px",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      🟢 {passengerNotes.length} {passengerNotes.length === 1 ? "nota" : "notas"}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleAddNote(passenger)}
                  style={{
                    padding: "8px 16px",
                    background: "#667eea",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "500",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#5568d3")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#667eea")}
                >
                  + Agregar Nota
                </button>
              </div>

              {hasNotes && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}>
                  {passengerNotes.map((note, idx) => {
                    const noteIndex = notes.indexOf(note);
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: "12px",
                          background: "#f9fafb",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        <div style={{ fontSize: "14px", color: "#374151", marginBottom: "8px", whiteSpace: "pre-wrap" }}>
                          {note.note}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => handleEditNote(noteIndex)}
                            style={{
                              padding: "4px 12px",
                              background: "transparent",
                              color: "#667eea",
                              border: "1px solid #667eea",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteNote(noteIndex)}
                            style={{
                              padding: "4px 12px",
                              background: "transparent",
                              color: "#dc2626",
                              border: "1px solid #dc2626",
                              borderRadius: "6px",
                              cursor: "pointer",
                              fontSize: "12px",
                              fontWeight: "500",
                            }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add/Edit Note Modal */}
      {showNoteModal && selectedPassenger && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => {
            setShowNoteModal(false);
            setSelectedPassenger(null);
            setNoteText("");
            setEditingNoteIndex(null);
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "12px",
              padding: "24px",
              width: "90%",
              maxWidth: "600px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
              {editingNoteIndex !== null ? "Editar Nota" : "Agregar Nota"}
            </h3>
            
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "8px" }}>
                Pasajero
              </label>
              <div
                style={{
                  padding: "12px",
                  background: "#f9fafb",
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                  fontSize: "14px",
                  color: "#1f2937",
                  fontWeight: "500",
                }}
              >
                {selectedPassenger.name}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "500", color: "#374151", marginBottom: "8px" }}>
                Nota
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Escribe tu nota aquí..."
                rows={8}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "14px",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowNoteModal(false);
                  setSelectedPassenger(null);
                  setNoteText("");
                  setEditingNoteIndex(null);
                }}
                style={{
                  padding: "10px 20px",
                  background: "transparent",
                  color: "#6b7280",
                  border: "2px solid #e5e7eb",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!noteText.trim()}
                style={{
                  padding: "10px 20px",
                  background: noteText.trim() ? "#667eea" : "#9ca3af",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: noteText.trim() ? "pointer" : "not-allowed",
                  fontSize: "14px",
                  fontWeight: "500",
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
