import { readFile, readdir } from "node:fs/promises";
import nextEnv from "@next/env";
import postgres from "postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL requerida");
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for (const name of (await readdir("db/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
    const existing = await sql`SELECT name FROM schema_migrations WHERE name = ${name}`;
    if (existing.length) continue;
    const migration = await readFile(`db/migrations/${name}`, "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    console.log(`Applied ${name}`);
  }
} finally {
  await sql.end();
}