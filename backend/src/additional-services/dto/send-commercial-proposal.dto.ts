import { Transform } from "class-transformer";
import { IsEmail, IsOptional } from "class-validator";

export class SendCommercialProposalDto {
  @IsOptional()
  @Transform(({ value }) => {
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized || undefined;
  })
  @IsEmail({}, { message: "El correo CC no es válido." })
  cc?: string;
}
