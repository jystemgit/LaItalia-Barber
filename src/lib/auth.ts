import { cookies, headers } from "next/headers";
import argon2 from "argon2";
import { z } from "zod";
import { db } from "./db";
import { sendEmail } from "./email";
import { hashToken, normalizedEmail, randomToken } from "./security";

const cookieName = "litalia_session";
export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(7).max(30),
});

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const rows = await db()`
    SELECT u.id, u.email, u.role, p.first_name, p.last_name, p.phone
    FROM sessions s JOIN users u ON u.id = s.user_id
    JOIN profiles p ON p.user_id = u.id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now() AND u.disabled_at IS NULL
  `;
  return rows[0] as { id: string; email: string; role: "CUSTOMER" | "ADMIN"; first_name: string; last_name: string; phone: string } | undefined ?? null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  await db()`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, now() + interval '14 days')`;
  const host = (await headers()).get("host") || "";
  const secure = process.env.NODE_ENV === "production" && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  (await cookies()).set(cookieName, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 14 * 86400 });
}

export async function revokeSession() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) await db()`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  store.delete(cookieName);
}

export async function register(input: z.infer<typeof registerSchema>, baseUrl: string) {
  const email = normalizedEmail(input.email);
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Proveedor de email no configurado");
  const existing = await db()`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length) return false;
  const pending = await db()`SELECT email FROM pending_users WHERE email = ${email} AND expires_at > now()`;
  if (pending.length) return false;
  const token = randomToken();
  const inserted = await db()`
    INSERT INTO pending_users (email, password_hash, first_name, last_name, phone, token_hash, expires_at)
    VALUES (${email}, ${await argon2.hash(input.password)}, ${input.firstName}, ${input.lastName}, ${input.phone}, ${hashToken(token)}, now() + interval '24 hours')
    ON CONFLICT (email) DO NOTHING RETURNING email
  `;
  if (!inserted.length) return false;
  await sendEmail(email, "Verificá tu email - L’Italia Barber", `Confirmá tu cuenta: ${baseUrl}/verificar?token=${token}\nEl enlace vence en 24 horas`);
  return true;
}

export async function verifyEmail(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const result = await db().begin(async (transaction) => {
    const rows = await transaction`
      DELETE FROM pending_users WHERE token_hash = ${hashToken(token)} AND expires_at > now()
      RETURNING email, password_hash, first_name, last_name, phone
    `;
    if (!rows.length) return false;
    const pending = rows[0];
    const users = await transaction`
      INSERT INTO users (email, password_hash) VALUES (${pending.email}, ${pending.password_hash})
      ON CONFLICT (email) DO NOTHING RETURNING id
    `;
    if (!users.length) return false;
    await transaction`
      INSERT INTO profiles (user_id, first_name, last_name, phone)
      VALUES (${users[0].id}, ${pending.first_name}, ${pending.last_name}, ${pending.phone})
    `;
    return true;
  });
  return result;
}

export async function login(email: string, password: string) {
  const users = await db()`SELECT id, password_hash, role FROM users WHERE email = ${normalizedEmail(email)} AND disabled_at IS NULL`;
  if (!users.length || !(await argon2.verify(users[0].password_hash, password))) return null;
  await createSession(users[0].id);
  return users[0].role as "CUSTOMER" | "ADMIN";
}

export async function requestPasswordReset(email: string, baseUrl: string) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Proveedor de email no configurado");
  const users = await db()`SELECT id FROM users WHERE email = ${normalizedEmail(email)}`;
  if (!users.length) return;
  const token = randomToken();
  await db()`DELETE FROM password_resets WHERE user_id = ${users[0].id}`;
  await db()`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${users[0].id}, now() + interval '1 hour')`;
  await sendEmail(normalizedEmail(email), "Restablecer contraseña - L’Italia Barber", `Restablecé tu contraseña: ${baseUrl}/restablecer?token=${token}\nEl enlace vence en una hora`);
}

export async function updatePassword(userId: string, password: string) {
  await db().begin(async (transaction) => {
    await transaction`UPDATE users SET password_hash = ${await argon2.hash(password)}, updated_at = now() WHERE id = ${userId}`;
    await transaction`DELETE FROM sessions WHERE user_id = ${userId}`;
    await transaction`DELETE FROM password_resets WHERE user_id = ${userId}`;
  });
}

export async function resetPassword(token: string, password: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const passwordHash = await argon2.hash(password);
  return db().begin(async (transaction) => {
    const rows = await transaction`DELETE FROM password_resets WHERE token_hash = ${hashToken(token)} AND expires_at > now() RETURNING user_id`;
    if (!rows.length) return false;
    await transaction`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${rows[0].user_id}`;
    await transaction`DELETE FROM sessions WHERE user_id = ${rows[0].user_id}`;
    await transaction`DELETE FROM password_resets WHERE user_id = ${rows[0].user_id}`;
    return true;
  });
}