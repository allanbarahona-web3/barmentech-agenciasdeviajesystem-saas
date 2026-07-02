/**
 * CustomerInfoDto
 * 
 * Customer basic information for profile response.
 */
export class CustomerInfoDto {
  id!: string;
  fullName!: string;
  idNumber!: string;
  email!: string;
  phone!: string | null;
  emergencyContactName!: string | null;
  emergencyContactPhone!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
