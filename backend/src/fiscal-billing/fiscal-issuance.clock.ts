import { Injectable } from "@nestjs/common";

@Injectable()
export class FiscalIssuanceClock {
  now(): Date {
    return new Date();
  }
}
