import type { CreateLeadInput } from '@/lib/leads-api';

export type LeadQuickCreateValues = {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
};

export const emptyLeadQuickCreateValues: LeadQuickCreateValues = {
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
};

export function validateLeadQuickCreate(values: LeadQuickCreateValues): string | null {
  if (!values.fullName.trim()) {
    return 'El nombre completo es requerido.';
  }

  if (!values.email.trim()) {
    return 'El correo electrónico es requerido.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    return 'Ingrese un correo electrónico válido.';
  }

  return null;
}

export function toCreateLeadInput(values: LeadQuickCreateValues): CreateLeadInput {
  const phone = values.phone.trim();
  const companyName = values.companyName.trim();

  return {
    fullName: values.fullName.trim(),
    email: values.email.trim().toLowerCase(),
    ...(phone ? { phone } : {}),
    ...(companyName ? { companyName } : {}),
  };
}
