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
  status: "OPEN" | "CLOSED" | "CANCELLED";
  packagePrice: number | string | null; // Decimal comes as string from API
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
  priceCurrency?: "USD" | "CRC";
  status?: "OPEN" | "CLOSED" | "CANCELLED";
};

export type UpdateTravelPackageInput = Partial<CreateTravelPackageInput>;

/**
 * Obtener todos los viajes (ADMIN)
 */
export const getAllTravelPackages = async (): Promise<TravelPackage[]> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const response = await authenticatedFetch(`${apiBase}/travel-packages`, {
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
 */
export const getAvailableTravelPackages = async (): Promise<TravelPackage[]> => {
  const token = getStoredToken();
  if (!token) throw new Error("No autenticado");

  const apiBase = resolveApiBase();
  if (!apiBase) throw new Error("No hay API configurada");

  const response = await authenticatedFetch(`${apiBase}/travel-packages/available`, {
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

  const response = await authenticatedFetch(`${apiBase}/travel-packages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
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

  const response = await authenticatedFetch(`${apiBase}/travel-packages/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
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
