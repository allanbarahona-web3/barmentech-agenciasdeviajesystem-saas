import { Companion, ContractFormState, ItineraryItem, Minor } from "@/features/contracts-form/types";

/**
 * Get today's date in YYYY-MM-DD format using local timezone
 * Avoids UTC conversion issues that cause date to shift by one day
 */
export const getTodayIsoLocal = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createCompanion = (): Companion => ({
  id: `companion-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
  fullName: "",
  idType: "Cedula",
  idNumber: "",
  email: "",
  phone: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  address: "",
  civilStatus: "Soltero",
  profession: "",
  nationality: "Costa Rica",
  idFrontDocumentName: "",
  idBackDocumentName: "",
  passportDocumentName: "",
});

const createMinor = (): Minor => ({
  id: `minor-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
  minorName: "",
  minorId: "",
  travelsWithParent: false,
  tutorName: "",
  tutorIdType: "Cedula",
  tutorId: "",
  tutorEmail: "",
  travelingWith: "",
  minorIdFrontDocumentName: "",
  minorIdBackDocumentName: "",
  minorPassportDocumentName: "",
  tutorIdFrontDocumentName: "",
  tutorIdBackDocumentName: "",
  tutorPassportDocumentName: "",
});

const toMoney = (value: string): number => {
  const text = String(value || "").trim();
  if (!text) {
    return Number.NaN;
  }

  const amount = Number.parseFloat(text);
  return Number.isFinite(amount) ? amount : Number.NaN;
};

const formatMoney = (value: number): string => value.toFixed(2);

const daysBetweenInclusive = (startIso: string, endIso: string): number => {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffMs = end.getTime() - start.getTime();
  if (diffMs < 0) {
    return 0;
  }

  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
};

export const normalizeMoneyInputValue = (value: string): string => {
  const amount = toMoney(value);
  return Number.isFinite(amount) ? formatMoney(amount) : "";
};

const minusDaysIso = (dateIso: string, days: number): string => {
  if (!dateIso) return "";
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};

export const addDaysIso = (dateIso: string, days: number): string => {
  if (!dateIso) return "";
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const createInitialFormState = (agent?: { fullName?: string; email?: string }): ContractFormState => {
  const today = getTodayIsoLocal();

  return {
    contractNumber: "",
    issuedAt: today,
    destination: "",
    travelPackageId: null,
    startDate: today,
    endDate: today,
    accommodationType: "N/A",
    lodgingType: "N/A",
    clientFullName: "",
    clientIdType: "Cedula",
    clientIdNumber: "",
    clientEmail: "",
    clientPhone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    clientAddress: "",
    civilStatus: "Soltero",
    profession: "",
    clientNationality: "Costa Rica",
    totalAmount: "",
    reservationAmount: "",
    balanceAmount: "",
    installmentCount: "",
    paymentFrequency: "MENSUAL",
    monthlyInstallmentAmount: "",
    lastInstallmentAmount: "",
    paymentDueDate: today, // Inicializado como today, se actualizará cuando el usuario cambie startDate
    companions: [],
    hasMinorCompanion: false,
    minors: [],
    itinerary: [
      { id: "opening", kind: "opening", date: today, detail: "" },
      { id: "closing", kind: "closing", date: today, detail: "" },
    ],
    luggageClause: "Equipaje de Mano",
    insurance: {
      holder: false,
      companions: {},
      minors: {},
    },
    idFrontDocumentName: "",
    idBackDocumentName: "",
    passportDocumentName: "",
    contractDocumentsNames: [],
    generatedByAgentName: String(agent?.fullName || "").trim(),
    generatedByAgentEmail: String(agent?.email || "").trim(),
    notes: [],
  };
};

export const applyMoneyDerivedValues = (state: ContractFormState): ContractFormState => {
  const total = toMoney(state.totalAmount);
  const reservation = toMoney(state.reservationAmount);
  const frequencyDays = state.paymentFrequency === "QUINCENAL" ? 15 : 30;
  const availableWindowDays = daysBetweenInclusive(state.issuedAt, state.paymentDueDate);
  const computedInstallments = availableWindowDays > 0 ? Math.max(1, Math.ceil(availableWindowDays / frequencyDays)) : 0;

  const balance = Number.isFinite(total) && Number.isFinite(reservation) ? total - reservation : Number.NaN;
  const regularInstallment =
    Number.isFinite(balance) && computedInstallments > 0 ? Math.floor((balance / computedInstallments) * 100) / 100 : Number.NaN;
  const lastInstallment =
    Number.isFinite(balance) && computedInstallments > 0
      ? balance - regularInstallment * (computedInstallments - 1)
      : Number.NaN;

  return {
    ...state,
    installmentCount: computedInstallments > 0 ? String(computedInstallments) : "",
    balanceAmount: Number.isFinite(balance) ? formatMoney(balance) : "",
    monthlyInstallmentAmount: Number.isFinite(regularInstallment) ? formatMoney(regularInstallment) : "",
    lastInstallmentAmount: Number.isFinite(lastInstallment) ? formatMoney(lastInstallment) : "",
  };
};

export const syncTourDates = (
  state: ContractFormState,
  side: "start" | "end",
  value: string,
): ContractFormState => {
  const today = getTodayIsoLocal();
  const normalizedStartCandidate = side === "start" ? value : state.startDate;
  const normalizedStart = normalizedStartCandidate && normalizedStartCandidate < today ? today : normalizedStartCandidate;
  const minEnd = normalizedStart ? addDaysIso(normalizedStart, 1) : "";
  const normalizedEndCandidate = side === "end" ? value : state.endDate;
  const normalizedEnd =
    normalizedEndCandidate && minEnd && normalizedEndCandidate < minEnd ? minEnd : normalizedEndCandidate;

  const next = {
    ...state,
    startDate: normalizedStart,
    endDate: normalizedEnd,
  };

  const itinerary = next.itinerary.map((item) => {
    if (item.kind === "opening") {
      return { ...item, date: next.startDate };
    }
    if (item.kind === "closing") {
      return { ...item, date: next.endDate };
    }
    return item;
  });

  return {
    ...next,
    itinerary,
    paymentDueDate: minusDaysIso(next.startDate, 22),
  };
};

export const getDateRangeValidityMessage = (state: ContractFormState): string => {
  const today = getTodayIsoLocal();

  if (state.startDate && state.startDate < today) {
    return "La fecha inicio del viaje no puede ser anterior al dia actual.";
  }

  if (!state.startDate || !state.endDate) {
    return "";
  }
  if (state.endDate > state.startDate) {
    return "";
  }
  return "La fecha fin del viaje debe ser posterior a la fecha inicio.";
};

export const addCustomItineraryItem = (state: ContractFormState): ContractFormState => {
  const custom: ItineraryItem = {
    id: `custom-${Date.now()}`,
    kind: "custom",
    date: "",
    detail: "",
  };

  const closingIndex = state.itinerary.findIndex((item) => item.kind === "closing");
  if (closingIndex === -1) {
    return { ...state, itinerary: [...state.itinerary, custom] };
  }

  const nextItinerary = [...state.itinerary];
  nextItinerary.splice(closingIndex, 0, custom);
  return {
    ...state,
    itinerary: nextItinerary,
  };
};

export const removeCustomItineraryItem = (state: ContractFormState, id: string): ContractFormState => ({
  ...state,
  itinerary: state.itinerary.filter((item) => item.id !== id || item.kind !== "custom"),
});

export const updateItineraryItem = (
  state: ContractFormState,
  id: string,
  field: "date" | "detail",
  value: string,
): ContractFormState => {
  if (field === "date") {
    const min = state.startDate;
    const max = state.endDate;
    const boundedDate =
      value && min && max
        ? value < min
          ? min
          : value > max
            ? max
            : value
        : value;

    return {
      ...state,
      itinerary: state.itinerary.map((item) => (item.id === id ? { ...item, date: boundedDate } : item)),
    };
  }

  return {
    ...state,
    itinerary: state.itinerary.map((item) => (item.id === id ? { ...item, detail: value } : item)),
  };
};

export const getItineraryValidityMessage = (state: ContractFormState): string => {
  if (state.itinerary.length < 2) {
    return "Debes mantener al menos inicio y fin en el itinerario.";
  }

  for (const item of state.itinerary) {
    if (!item.date) {
      return "Cada item del itinerario debe tener fecha.";
    }

    if (state.startDate && item.date < state.startDate) {
      return "Las fechas del itinerario no pueden ser anteriores al inicio del viaje.";
    }

    if (state.endDate && item.date > state.endDate) {
      return "Las fechas del itinerario no pueden superar la fecha fin del viaje.";
    }

    if (item.kind === "custom" && !String(item.detail || "").trim()) {
      return "Cada actividad del itinerario debe incluir detalle.";
    }
  }

  return "";
};

export const addCompanion = (state: ContractFormState): ContractFormState => {
  const newCompanion = createCompanion();
  const updatedState = {
    ...state,
    companions: [...state.companions, newCompanion],
    insurance: {
      ...state.insurance,
      companions: {
        ...state.insurance.companions,
        [newCompanion.id]: false,
      },
    },
  };
  
  // Recalculate totalAmount and reservationAmount if this is from a travel package
  if (updatedState.travelPackageId && updatedState.pricePerPerson) {
    const pricePerPerson = toMoney(updatedState.pricePerPerson);
    const reservationPerPerson = updatedState.reservationPerPerson ? toMoney(updatedState.reservationPerPerson) : 0;
    if (!Number.isNaN(pricePerPerson)) {
      const totalPeople = 1 + updatedState.companions.length + updatedState.minors.length;
      const newTotal = pricePerPerson * totalPeople;
      const newReservation = !Number.isNaN(reservationPerPerson) && reservationPerPerson > 0 
        ? reservationPerPerson * totalPeople 
        : 0;
      
      return applyMoneyDerivedValues({
        ...updatedState,
        totalAmount: formatMoney(newTotal),
        reservationAmount: newReservation > 0 ? formatMoney(newReservation) : updatedState.reservationAmount,
      });
    }
  }
  
  return updatedState;
};

export const addCompanionFromCustomer = (
  state: ContractFormState,
  customerData: {
    fullName: string;
    idNumber: string;
    email: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    address: string;
    idType?: string;
    maritalStatus?: string;
    occupation?: string;
    nationality?: string;
  }
): ContractFormState => {
  const newCompanion: Companion = {
    id: `companion-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    fullName: customerData.fullName,
    idType: (customerData.idType || "Cedula") as "Cedula" | "Pasaporte" | "DIMEX",
    idNumber: customerData.idNumber,
    email: customerData.email,
    phone: customerData.phone,
    emergencyContactName: customerData.emergencyContactName,
    emergencyContactPhone: customerData.emergencyContactPhone,
    address: customerData.address,
    civilStatus: (customerData.maritalStatus || "Soltero") as "Soltero" | "Casado" | "Divorciado" | "Viudo",
    profession: customerData.occupation || "",
    nationality: customerData.nationality || "Costa Rica",
    idFrontDocumentName: "",
    idBackDocumentName: "",
    passportDocumentName: "",
  };
  const updatedState = {
    ...state,
    companions: [...state.companions, newCompanion],
    insurance: {
      ...state.insurance,
      companions: {
        ...state.insurance.companions,
        [newCompanion.id]: false,
      },
    },
  };
  
  // Recalculate totalAmount and reservationAmount if this is from a travel package
  if (updatedState.travelPackageId && updatedState.pricePerPerson) {
    const pricePerPerson = toMoney(updatedState.pricePerPerson);
    const reservationPerPerson = updatedState.reservationPerPerson ? toMoney(updatedState.reservationPerPerson) : 0;
    if (!Number.isNaN(pricePerPerson)) {
      const totalPeople = 1 + updatedState.companions.length + updatedState.minors.length;
      const newTotal = pricePerPerson * totalPeople;
      const newReservation = !Number.isNaN(reservationPerPerson) && reservationPerPerson > 0 
        ? reservationPerPerson * totalPeople 
        : 0;
      
      return applyMoneyDerivedValues({
        ...updatedState,
        totalAmount: formatMoney(newTotal),
        reservationAmount: newReservation > 0 ? formatMoney(newReservation) : updatedState.reservationAmount,
      });
    }
  }
  
  return updatedState;
};

export const removeCompanion = (state: ContractFormState, id: string): ContractFormState => {
  const newCompanions = { ...state.insurance.companions };
  delete newCompanions[id];
  
  const updatedState = {
    ...state,
    companions: state.companions.filter((item) => item.id !== id),
    minors: state.minors.map((minor) =>
      minor.travelingWith === state.companions.find((item) => item.id === id)?.fullName
        ? { ...minor, travelingWith: "" }
        : minor,
    ),
    insurance: {
      ...state.insurance,
      companions: newCompanions,
    },
  };
  
  // Recalculate totalAmount and reservationAmount if this is from a travel package
  if (updatedState.travelPackageId && updatedState.pricePerPerson) {
    const pricePerPerson = toMoney(updatedState.pricePerPerson);
    const reservationPerPerson = updatedState.reservationPerPerson ? toMoney(updatedState.reservationPerPerson) : 0;
    if (!Number.isNaN(pricePerPerson)) {
      const totalPeople = 1 + updatedState.companions.length + updatedState.minors.length;
      const newTotal = pricePerPerson * totalPeople;
      const newReservation = !Number.isNaN(reservationPerPerson) && reservationPerPerson > 0 
        ? reservationPerPerson * totalPeople 
        : 0;
      
      return applyMoneyDerivedValues({
        ...updatedState,
        totalAmount: formatMoney(newTotal),
        reservationAmount: newReservation > 0 ? formatMoney(newReservation) : updatedState.reservationAmount,
      });
    }
  }
  
  return updatedState;
};

export const updateCompanion = (
  state: ContractFormState,
  id: string,
  field: keyof Companion,
  value: string,
): ContractFormState => ({
  ...state,
  companions: state.companions.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
});

export const addMinor = (state: ContractFormState): ContractFormState => {
  const newMinor = createMinor();
  const updatedState = {
    ...state,
    hasMinorCompanion: true,
    minors: [...state.minors, newMinor],
    insurance: {
      ...state.insurance,
      minors: {
        ...state.insurance.minors,
        [newMinor.id]: false,
      },
    },
  };
  
  // Recalculate totalAmount and reservationAmount if this is from a travel package
  if (updatedState.travelPackageId && updatedState.pricePerPerson) {
    const pricePerPerson = toMoney(updatedState.pricePerPerson);
    const reservationPerPerson = updatedState.reservationPerPerson ? toMoney(updatedState.reservationPerPerson) : 0;
    if (!Number.isNaN(pricePerPerson)) {
      const totalPeople = 1 + updatedState.companions.length + updatedState.minors.length;
      const newTotal = pricePerPerson * totalPeople;
      const newReservation = !Number.isNaN(reservationPerPerson) && reservationPerPerson > 0 
        ? reservationPerPerson * totalPeople 
        : 0;
      
      return applyMoneyDerivedValues({
        ...updatedState,
        totalAmount: formatMoney(newTotal),
        reservationAmount: newReservation > 0 ? formatMoney(newReservation) : updatedState.reservationAmount,
      });
    }
  }
  
  return updatedState;
};

export const removeMinor = (state: ContractFormState, id: string): ContractFormState => {
  const newMinors = { ...state.insurance.minors };
  delete newMinors[id];
  
  const updatedState = {
    ...state,
    minors: state.minors.filter((item) => item.id !== id),
    insurance: {
      ...state.insurance,
      minors: newMinors,
    },
  };
  
  // Recalculate totalAmount and reservationAmount if this is from a travel package
  if (updatedState.travelPackageId && updatedState.pricePerPerson) {
    const pricePerPerson = toMoney(updatedState.pricePerPerson);
    const reservationPerPerson = updatedState.reservationPerPerson ? toMoney(updatedState.reservationPerPerson) : 0;
    if (!Number.isNaN(pricePerPerson)) {
      const totalPeople = 1 + updatedState.companions.length + updatedState.minors.length;
      const newTotal = pricePerPerson * totalPeople;
      const newReservation = !Number.isNaN(reservationPerPerson) && reservationPerPerson > 0 
        ? reservationPerPerson * totalPeople 
        : 0;
      
      return applyMoneyDerivedValues({
        ...updatedState,
        totalAmount: formatMoney(newTotal),
        reservationAmount: newReservation > 0 ? formatMoney(newReservation) : updatedState.reservationAmount,
      });
    }
  }
  
  return updatedState;
};

export const updateMinor = (
  state: ContractFormState,
  id: string,
  field: keyof Minor,
  value: string,
): ContractFormState => {
  // Handle boolean conversion for travelsWithParent field
  if (field === "travelsWithParent") {
    return {
      ...state,
      minors: state.minors.map((item) => 
        item.id === id ? { ...item, [field]: value === "true" } : item
      ),
    };
  }
  
  return {
    ...state,
    minors: state.minors.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
  };
};
