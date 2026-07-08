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
  dateOfBirth!: Date | null;
  nationality!: string | null;
  occupation!: string | null;
  address!: string | null;
  city!: string | null;
  country!: string | null;
  postalCode!: string | null;
  secondaryEmail!: string | null;
  secondaryPhone!: string | null;
  emergencyContactRelationship!: string | null;
  emergencyContactEmail!: string | null;
  leadSource!: string | null;
  customerStatus!: string;
  assignedToUserId!: string | null;
  lastContactDate!: Date | null;
  nextFollowUpDate!: Date | null;
  preferredLanguage!: string | null;
  tags!: string | null;
  bloodType!: string | null;
  allergies!: string | null;
  medicalConditions!: string | null;
  medications!: string | null;
}
