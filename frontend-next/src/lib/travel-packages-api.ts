import { authenticatedFetch, getStoredToken } from "./auth-api";
import { resolveApiBase } from "./runtime-config";

export type TravelPackage = {
  id: string;
  packageCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  occupiedSlots: number;
  status: "OPEN" | "CLOSED" | "CANCELLED" | "COMPLETED";
  travelType: "INTERNATIONAL" | "MIGRATION";
  packagePrice: number | string | null; // Decimal comes as string from API
  minReservation?: number | string | null; // Monto de reserva mínima
  priceCurrency: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateTravelPackageInput = {
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  packagePrice?: number;
  minReservation?: number;
  priceCurrency?: "USD" | "CRC";
  travelType?: "INTERNATIONAL" | "MIGRATION";
  status?: "OPEN" | "CLOSED" | "CANCELLED" | "COMPLETED";
};

export type UpdateTravelPackageInput = Partial<CreateTravelPackageInput>;

/**
 * Obtener todos los viajes (ADMIN)
 * @param travelType - Filtrar por tipo de viaje (opcional)
 */
export const getAllTravelPackages = async (travelType?: "INTERNATIONAL" | "MIGRATION"): Promise<TravelPackage[]> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const url = new URL(`${apiBase}/travel-packages`);
  if (travelType) {
    url.searchParams.append("travelType", travelType);
  }

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error al cargar viajes" }));
    throw new Error(error.message || "Error al cargar viajes");
  }

  return await response.json();
};

/**
 * Obtener viajes disponibles (AGENT, OPERATIONS)
 * @param travelType - Filtrar por tipo de viaje (opcional)
 */
export const getAvailableTravelPackages = async (travelType?: "INTERNATIONAL" | "MIGRATION"): Promise<TravelPackage[]> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const url = new URL(`${apiBase}/travel-packages/available`);
  if (travelType) {
    url.searchParams.append("travelType", travelType);
  }

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error al cargar viajes disponibles" }));
    throw new Error(error.message || "Error al cargar viajes disponibles");
  }

  return await response.json();
};

/**
 * Obtener un viaje por ID
 */
export const getTravelPackageById = async (id: string): Promise<TravelPackage> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const response = await authenticatedFetch(`${apiBase}/travel-packages/${id}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Viaje no encontrado" }));
    throw new Error(error.message || "Viaje no encontrado");
  }

  return await response.json();
};

/**
 * Obtener un viaje por código
 */
export const getTravelPackageByCode = async (packageCode: string): Promise<TravelPackage> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const response = await authenticatedFetch(`${apiBase}/travel-packages/code/${packageCode}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Viaje no encontrado" }));
    throw new Error(error.message || "Viaje no encontrado");
  }

  return await response.json();
};

/**
 * Crear un viaje (ADMIN)
 */
export const createTravelPackage = async (data: CreateTravelPackageInput): Promise<TravelPackage> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  // ⚠️ SANITIZAR: Solo enviar campos permitidos por el DTO
  const payload = {
    name: data.name,
    destination: data.destination,
    departureDate: data.departureDate,
    returnDate: data.returnDate,
    capacity: data.capacity,
    ...(data.packagePrice !== undefined && { packagePrice: data.packagePrice }),
    ...(data.minReservation !== undefined && { minReservation: data.minReservation }),
    ...(data.priceCurrency && { priceCurrency: data.priceCurrency }),
    ...(data.travelType && { travelType: data.travelType }),
    ...(data.status && { status: data.status }),
  };

  const response = await authenticatedFetch(`${apiBase}/travel-packages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error al crear viaje" }));
    throw new Error(error.message || "Error al crear viaje");
  }

  return await response.json();
};

/**
 * Actualizar un viaje (ADMIN)
 */
export const updateTravelPackage = async (id: string, data: UpdateTravelPackageInput): Promise<TravelPackage> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  // ⚠️ SANITIZAR: Solo enviar campos permitidos por el DTO
  const payload: any = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.destination !== undefined) payload.destination = data.destination;
  if (data.departureDate !== undefined) payload.departureDate = data.departureDate;
  if (data.returnDate !== undefined) payload.returnDate = data.returnDate;
  if (data.capacity !== undefined) payload.capacity = data.capacity;
  if (data.packagePrice !== undefined) payload.packagePrice = data.packagePrice;
  if (data.minReservation !== undefined) payload.minReservation = data.minReservation;
  if (data.priceCurrency !== undefined) payload.priceCurrency = data.priceCurrency;
  if (data.travelType !== undefined) payload.travelType = data.travelType;
  if (data.status !== undefined) payload.status = data.status;

  const response = await authenticatedFetch(`${apiBase}/travel-packages/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error al actualizar viaje" }));
    throw new Error(error.message || "Error al actualizar viaje");
  }

  return await response.json();
};

/**
 * Cancelar un viaje (ADMIN) - soft delete
 */
export const deleteTravelPackage = async (id: string): Promise<TravelPackage> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const response = await authenticatedFetch(`${apiBase}/travel-packages/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Error al cancelar viaje" }));
    throw new Error(error.message || "Error al cancelar viaje");
  }

  return await response.json();
};
