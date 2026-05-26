import getConfig from "@fincore/config";
import pino from "pino";

const isDev = getConfig("NODE_ENV") !== "production";

const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    }
  : undefined;

export function createLogger(service: string) {
  return pino({
    name: service,
    level: getConfig("LOG_LEVEL") ?? "info",
    transport,
  });
}

export type Logger = ReturnType<typeof createLogger>;
