"use client";

import {
  attendanceCheckIn,
  getAttendanceStatus,
  type AttendanceState,
  type AttendanceStatus,
} from "@/lib/attendance-api";
import { BreakModal } from "@/components/break-modal";
import { useEffect, useMemo, useRef, useState } from "react";

const STATE_LABELS: Record<AttendanceState, string> = {
  WORKING: "WORKING",
  MEETING: "MEETING",
  BREAK1: "Break 1",
  LUNCH: "LUNCH",
  BREAK2: "Break 2",
  BREAK3: "Break 3",
  OT: "OT",
  OFF: "OFF",
};

const STATE_OPTIONS: AttendanceState[] = ["WORKING", "MEETING", "BREAK1", "LUNCH", "BREAK2", "BREAK3", "OT", "OFF"];
const RESTRICTED_STATES = new Set<AttendanceState>(["LUNCH", "BREAK1", "BREAK2", "BREAK3"]);

const getStateClassName = (state: AttendanceState | null): string => {
  if (state === "WORKING") return "is-working";
  if (state === "OT") return "is-working";
  if (state === "MEETING") return "is-meeting";
  if (state === "OFF") return "is-off";
  return "is-break";
};

const formatClock = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(safe / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = (safe % 60).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

export function AttendanceWidget() {
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState<AttendanceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [selectorValue, setSelectorValue] = useState("");
  const [now, setNow] = useState(Date.now());
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        if (!hasLoadedOnce.current) {
          setLoading(true);
        }
        setError(null);
        const data = await getAttendanceStatus();
        setStatus(data);
        hasLoadedOnce.current = true;
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "No se pudo cargar asistencia.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void loadStatus();
    const refresh = window.setInterval(() => void loadStatus(), 30000);
    return () => window.clearInterval(refresh);
  }, []);

  const currentState = status?.currentState ?? null;
  const isRestrictedState = currentState ? RESTRICTED_STATES.has(currentState) : false;

  useEffect(() => {
    setShowBreakModal(isRestrictedState);
  }, [isRestrictedState]);

  const sessionSeconds = useMemo(() => {
    if (!status?.clockedInAt) return 0;
    return Math.max(0, Math.floor((now - new Date(status.clockedInAt).getTime()) / 1000));
  }, [now, status?.clockedInAt]);

  const markState = async (state: AttendanceState) => {
    try {
      setMarking(state);
      setSelectorValue("");
      setError(null);
      await attendanceCheckIn(state);
      const nextStatus = await getAttendanceStatus();
      setStatus(nextStatus);
    } catch (markError) {
      const message = markError instanceof Error ? markError.message : "No se pudo registrar el estado.";
      setError(message);
    } finally {
      setMarking(null);
    }
  };

  return (
    <section className="attendance-widget-header" aria-label="Widget de asistencia">
      <div className="attendance-widget-header-top">
        <div className="attendance-widget-header-state">
          <span className={`attendance-widget-dot ${getStateClassName(currentState)}`} aria-hidden="true"></span>
          <strong>{currentState ? STATE_LABELS[currentState] : "NO STATUS"}</strong>
        </div>
        <span className="attendance-widget-header-clock">{formatClock(sessionSeconds)}</span>
      </div>

      <select
        className="attendance-widget-select"
        value={selectorValue}
        onChange={(event) => {
          const nextState = event.target.value as AttendanceState;
          if (!nextState) {
            return;
          }
          void markState(nextState);
        }}
        disabled={marking !== null}
        aria-label="Cambiar estado de asistencia"
      >
        <option value="" disabled>
          Change status
        </option>
        {STATE_OPTIONS.map((state) => (
          <option key={state} value={state}>
            {STATE_LABELS[state]}
          </option>
        ))}
      </select>

      {loading ? <p className="attendance-widget-status">Loading...</p> : null}
      {marking ? <p className="attendance-widget-status">Updating {STATE_LABELS[marking]}...</p> : null}
      {error ? <p className="attendance-widget-error-inline">{error}</p> : null}

      <BreakModal
        isOpen={showBreakModal}
        currentState={currentState}
        isEndingBreak={marking === "WORKING"}
        onEndBreak={() => {
          void markState("WORKING");
        }}
        clockedInAt={status?.clockedInAt ?? null}
        now={now}
      />
    </section>
  );
}