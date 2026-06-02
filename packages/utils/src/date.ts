import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Timezone default untuk aplikasi (Asia/Jakarta = WIB, UTC+7) */
export const DEFAULT_TIMEZONE = "Asia/Jakarta";

/**
 * Dapatkan dayjs instance di timezone tertentu.
 * Fallback ke DEFAULT_TIMEZONE ("Asia/Jakarta") jika tidak diberikan.
 */
export function dayjsInTz(tz?: string | null): dayjs.Dayjs {
  return dayjs().tz(tz || DEFAULT_TIMEZONE);
}

/**
 * Dapatkan objek Date sekarang di timezone tertentu.
 */
export function nowInTz(tz?: string | null): Date {
  return dayjsInTz(tz).toDate();
}

/**
 * Format label tanggal jatuh tempo (contoh: "hari ini", "besok", "tanggal 15 (besok)")
 */
export function formatDueDateLabel(
  frequency: string,
  dayOfMonth: number | null | undefined,
): string {
  if (frequency === "DAILY") return "hari ini";
  if (frequency === "WEEKLY") return "besok";
  if (frequency === "MONTHLY" || frequency === "YEARLY") {
    return `tanggal ${dayOfMonth ?? 1} (besok)`;
  }
  return "besok";
}

/**
 * Hitung tanggal nextReminderAt berdasarkan frekuensi.
 * Mengembalikan objek Date JavaScript asli.
 */
export function computeNextReminderDate(
  frequency: string,
  dayOfMonth: number | null | undefined,
  tz: string,
): Date {
  const now = dayjs().tz(tz);
  let nextDate = now.startOf("day");

  if (frequency === "DAILY") {
    nextDate = nextDate.add(1, "day");
  } else if (frequency === "WEEKLY") {
    nextDate = nextDate.add(1, "week");
  } else if (frequency === "MONTHLY" || frequency === "YEARLY") {
    const reminderDay = (dayOfMonth ?? 1) - 1;
    const safeDay = reminderDay < 1 ? 1 : reminderDay;

    if (frequency === "MONTHLY") {
      nextDate = nextDate.add(1, "month").date(safeDay);
    } else {
      nextDate = nextDate.add(1, "year").date(safeDay);
    }
  }

  return nextDate.toDate();
}
