import dayjs from "dayjs";
import "dayjs/locale/id";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("id");

/**
 * Returns the current month/year period in Asia/Jakarta timezone.
 * Used by budget-command, monthly-report, and other processors.
 */
export function getCurrentPeriod() {
  const now = dayjs().tz("Asia/Jakarta");
  return {
    month: now.month() + 1,
    year: now.year(),
    monthName: now.toDate().toLocaleDateString("id-ID", { month: "long" }),
  };
}

/**
 * Compact currency formatter for WhatsApp messages.
 * e.g. 1_500_000 → "Rp 1,5jt", 50_000 → "Rp 50rb"
 */
export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
