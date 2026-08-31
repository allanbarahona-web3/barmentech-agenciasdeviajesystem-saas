import { Allow } from "class-validator";

export class SetFiscalNumberSequenceDto {
  @Allow()
  nextSequenceNumber!: unknown;
}
