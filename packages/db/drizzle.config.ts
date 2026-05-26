import getConfig from "@fincore/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getConfig().DATABASE_URL,
  },
} satisfies Config;
