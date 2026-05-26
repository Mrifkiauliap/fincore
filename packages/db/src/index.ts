import getConfig from "@fincore/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle>;

export function getDb() {
  if (!_db) {
    const pool = new Pool({
      connectionString: getConfig().DATABASE_URL,
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export * from "./schema";
export { schema };
