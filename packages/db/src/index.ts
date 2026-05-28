import getConfig from "@fincore/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let _db: ReturnType<typeof initDb>;

function initDb() {
  const pool = new Pool({
    connectionString: getConfig("DATABASE_URL") as string,
  });
  return drizzle(pool, { schema });
}

export function getDb() {
  if (!_db) {
    _db = initDb();
  }
  return _db;
}

export * from "./schema";
