import { DateTime } from "luxon";

export class DateUtils {
  static getCostaRicaToday(): Date {
    return DateTime.now()
      .setZone("America/Costa_Rica")
      .startOf("day")
      .toJSDate();
  }
}