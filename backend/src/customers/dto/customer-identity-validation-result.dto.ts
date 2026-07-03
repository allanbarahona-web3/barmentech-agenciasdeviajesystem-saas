/**
 * CustomerIdentityValidationResultDto
 * 
 * Result of customer identity validation.
 * 
 * States:
 * - valid: true - Identity is valid (no conflict or matches existing)
 * - valid: false - Identity conflict detected
 */
export class CustomerIdentityValidationResultDto {
  /**
   * Whether the identity validation passed
   */
  valid!: boolean;

  /**
   * Human-readable message in Spanish
   */
  message!: string;

  /**
   * If a customer exists with this idNumber, contains the existing customer data
   */
  existingCustomer?: {
    id: string;
    fullName: string;
    idNumber: string;
    email: string;
  };
}
