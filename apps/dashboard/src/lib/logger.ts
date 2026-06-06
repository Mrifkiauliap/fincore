/**
 * Lightweight structured logger for Dashboard API routes.
 * Wraps console.error with structured key-value pairs for
 * better searchability in production (Docker) logs.
 */
export const logger = {
  error(meta: Record<string, unknown>, message: string): void {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: "error", ...meta, msg: message }));
  },
  warn(meta: Record<string, unknown>, message: string): void {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({ level: "warn", ...meta, msg: message }));
  },
  info(meta: Record<string, unknown>, message: string): void {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: "info", ...meta, msg: message }));
  },
};
