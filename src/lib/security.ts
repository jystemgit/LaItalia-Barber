import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { db } from "./db";

export const randomToken = () => randomBytes(32).toString("hex");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const normalizedEmail = (email: string) => email.trim().toLowerCase();

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET debe tener al menos 32 caracteres");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decrypt(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

export async function rateLimit(key: string, maximum: number, intervalMinutes: number) {
  const rows = await db()`
    INSERT INTO rate_limits (key, attempts, reset_at)
    VALUES (${key}, 1, now() + ${intervalMinutes} * interval '1 minute')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.attempts + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + ${intervalMinutes} * interval '1 minute' ELSE rate_limits.reset_at END
    RETURNING attempts
  `;
  return Number(rows[0].attempts) <= maximum;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const errorResponse = (message: string, status: number) => Response.json({ error: message }, { status });