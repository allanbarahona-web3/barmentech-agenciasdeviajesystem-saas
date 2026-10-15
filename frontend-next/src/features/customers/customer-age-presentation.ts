export function isMinorCustomerAge(age: number | null): boolean {
  return age !== null && age < 18;
}
