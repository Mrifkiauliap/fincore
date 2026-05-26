import { getDb } from "@fincore/db";
import { Global, Module } from "@nestjs/common";

/**
 * DI token for the Drizzle database client.
 * Inject with: @Inject(DRIZZLE) private readonly db: ReturnType<typeof getDb>
 */
export const DRIZZLE = Symbol("DRIZZLE");

/**
 * Global module that provides the Drizzle database client.
 * Import this once in AppModule — all other modules can inject DRIZZLE directly.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => getDb(),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
