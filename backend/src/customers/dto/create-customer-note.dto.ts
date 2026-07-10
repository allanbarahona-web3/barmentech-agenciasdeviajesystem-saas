import { IsNotEmpty, IsString } from "class-validator";

/**
 * CreateCustomerNoteDto
 * 
 * DTO for creating a new customer note.
 */
export class CreateCustomerNoteDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
