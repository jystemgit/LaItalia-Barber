import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(null, { status: 401 });
  }
  try {
    await db()`DELETE FROM pending_users WHERE expires_at < now()`;
    await db()`DELETE FROM sessions WHERE expires_at < now()`;
    await db()`DELETE FROM password_resets WHERE expires_at < now()`;
    await db()`DELETE FROM oauth_states WHERE expires_at < now()`;
    await db()`DELETE FROM rate_limits WHERE reset_at < now()`;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Cleanup job error", error);
    return Response.json({ error: "Error de mantenimiento" }, { status: 503 });
  }
}