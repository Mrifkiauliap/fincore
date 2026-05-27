const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function run() {
  // 1. Load DATABASE_URL dari .env
  const envPath = path.join(__dirname, "..", "..", ".env");
  let dbUrl = process.env.DATABASE_URL;

  if (!dbUrl && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^DATABASE_URL=(.*)$/m);
    if (match) {
      dbUrl = match[1].trim();
    }
  }

  if (!dbUrl) {
    console.error("❌ DATABASE_URL tidak ditemukan di .env!");
    process.exit(1);
  }

  console.log("Mereset skema database lokal secara paksa...");
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    // Drop dan recreate schema public untuk mengosongkan semua tabel
    await client.query("DROP SCHEMA public CASCADE;");
    await client.query("CREATE SCHEMA public;");
    await client.query("GRANT ALL ON SCHEMA public TO postgres;");
    await client.query("GRANT ALL ON SCHEMA public TO public;");
    console.log("Skema database berhasil dikosongkan!");
  } catch (err) {
    console.error("Gagal mereset skema database:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }

  console.log("\n🗑️ Menghapus riwayat migrasi Drizzle...");
  const drizzleDir = path.join(
    __dirname,
    "..",
    "..",
    "packages",
    "db",
    "drizzle",
  );
  if (fs.existsSync(drizzleDir)) {
    fs.rmSync(drizzleDir, { recursive: true, force: true });
  }

  try {
    console.log("\nMelakukan Push schema ke database...");
    execSync("pnpm run db:push", { stdio: "inherit" });

    console.log("\nMenjalankan Seeder...");
    execSync("tsx packages/db/src/seed.ts", { stdio: "inherit" });

    console.log("\n✅ Database lokal berhasil di-reset dan di-seed!");
  } catch (error) {
    console.error("\n❌ Terjadi kesalahan saat push/seed:", error.message);
    process.exit(1);
  }
}

run();
