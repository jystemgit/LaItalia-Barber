import { currentUser } from "@/lib/auth";
import { exchangeCode } from "@/lib/calendar";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const destination = new URL("/admin", request.url);
  try {
    const user = await currentUser();
    if (user?.role !== "ADMIN") return Response.redirect(new URL("/ingresar", request.url));
    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") || "";
    const code = searchParams.get("code") || "";
    if (!/^[a-f0-9]{64}$/.test(state) || !code) throw new Error("OAuth state inválido");
    const rows = await db()`DELETE FROM oauth_states WHERE state_hash = ${hashToken(state)} AND user_id = ${user.id} AND expires_at > now() RETURNING user_id`;
    if (!rows.length) throw new Error("OAuth state expirado");
    const encrypted = await exchangeCode(code);
    await db()`INSERT INTO google_calendar_connections (id, owner_id, refresh_token_encrypted) VALUES (1, ${user.id}, ${encrypted}) ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, refresh_token_encrypted = EXCLUDED.refresh_token_encrypted, updated_at = now()`;
    destination.searchParams.set("calendar", "connected");
  } catch (error) {
    console.error("Google OAuth callback", error);
    destination.searchParams.set("calendar", "error");
  }
  return Response.redirect(destination);
}