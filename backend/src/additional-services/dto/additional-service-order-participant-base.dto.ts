import { IsString } from "class-validator";

export class AdditionalServiceOrderParticipantBaseDto {
  @IsString()
  clientId!: string;
}
