import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateContractNoteDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
