import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export function createLogger(service: string) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    transport,
  });
}

export type Logger = ReturnType<typeof createLogger>;
