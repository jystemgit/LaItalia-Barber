import postgres from "postgres";
import argon2 from "argon2";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_PHONE } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_FIRST_NAME || !ADMIN_LAST_NAME || !ADMIN_PHONE) {
  throw new Error("Requeridos: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME, ADMIN_PHONE");
}
if (ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres");
const sql = postgres(DATABASE_URL, { max: 1 });
try {
  const email = ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await argon2.hash(ADMIN_PASSWORD);
  await sql.begin(async (transaction) => {
    const users = await transaction`
      INSERT INTO users (email, password_hash, role) VALUES (${email}, ${passwordHash}, 'ADMIN')
      ON CONFLICT (email) DO NOTHING RETURNING id
    `;
    if (!users.length) throw new Error("Email ya registrado: no se promueven cuentas existentes automáticamente");
    await transaction`INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES (${users[0].id}, ${ADMIN_FIRST_NAME}, ${ADMIN_LAST_NAME}, ${ADMIN_PHONE})`;
  });
  console.log("Cuenta ADMIN creada");
} finally {
  await sql.end();
}