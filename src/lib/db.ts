import postgres from "postgres";

const globalDb = globalThis as typeof globalThis & { litaliaDb?: ReturnType<typeof postgres> };

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada");
  return (globalDb.litaliaDb ??= postgres(process.env.DATABASE_URL, { max: 5, idle_timeout: 20 }));
}