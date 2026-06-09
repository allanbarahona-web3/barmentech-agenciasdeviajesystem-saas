import { DateTime } from "luxon";

export class DateUtils {
  static getCostaRicaToday(): Date {
    const crNow = DateTime.now().setZone("America/Costa_Rica");

    console.log("CR NOW:", crNow.toISO());
    console.log("CR DATE:", crNow.toFormat("yyyy-MM-dd"));

    return crNow.startOf("day").toJSDate();
  }
}