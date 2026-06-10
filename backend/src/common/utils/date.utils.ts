import { DateTime } from "luxon";

export class DateUtils {
  static getCostaRicaToday(): Date {
    const crNow = DateTime.now().setZone("America/Costa_Rica");

    
    return crNow.startOf("day").toJSDate();
  }

  static getCostaRicaStartOfDay(date: string | Date): Date {
  return DateTime
    .fromISO(typeof date === 'string' ? date : date.toISOString(), {
      zone: 'America/Costa_Rica',
    })
    .startOf('day')
    .toJSDate();
}

static getCostaRicaEndOfDay(date: string | Date): Date {
  return DateTime
    .fromISO(typeof date === 'string' ? date : date.toISOString(), {
      zone: 'America/Costa_Rica',
    })
    .endOf('day')
    .toJSDate();
}


}
