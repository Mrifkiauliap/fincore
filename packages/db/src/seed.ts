import getConfig from "@fincore/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_TRANSACTION_CATEGORIES,
  paymentMethods,
  transactionCategories,
} from "./schema";

async function main() {
  console.log("🌱 Starting database seeder...");

  const pool = new Pool({
    connectionString: getConfig("DATABASE_URL") as string,
  });
  const db = drizzle(pool);

  try {
    console.log("Seeding Payment Methods...");
    await db
      .insert(paymentMethods)
      .values(DEFAULT_PAYMENT_METHODS)
      .onConflictDoNothing();
    console.log(`✅ Seeded ${DEFAULT_PAYMENT_METHODS.length} payment methods.`);

    console.log("Seeding Transaction Categories...");
    await db
      .insert(transactionCategories)
      .values(DEFAULT_TRANSACTION_CATEGORIES)
      .onConflictDoNothing();
    console.log(
      `✅ Seeded ${DEFAULT_TRANSACTION_CATEGORIES.length} transaction categories.`,
    );

    console.log("🎉 Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Error during seeding:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
