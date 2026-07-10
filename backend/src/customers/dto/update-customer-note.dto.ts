import { IsNotEmpty, IsString } from "class-validator";

/**
 * UpdateCustomerNoteDto
 * 
 * DTO for updating an existing customer note.
 */
export class UpdateCustomerNoteDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
