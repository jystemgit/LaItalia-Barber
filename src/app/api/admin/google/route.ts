import { currentUser } from "@/lib/auth";
import { googleAuthorizationUrl } from "@/lib/calendar";
import { db } from "@/lib/db";
import { errorResponse, hashToken, randomToken, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (user?.role !== "ADMIN") return errorResponse("Acceso denegado", 403);
    const state = randomToken();
    await db()`INSERT INTO oauth_states (state_hash, user_id, expires_at) VALUES (${hashToken(state)}, ${user.id}, now() + interval '10 minutes')`;
    return Response.json({ url: googleAuthorizationUrl(state) });
  } catch (error) {
    console.error("Google OAuth start", error);
    return errorResponse("No se pudo conectar Google Calendar", 503);
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (user?.role !== "ADMIN") return errorResponse("Acceso denegado", 403);
    const future = await db()`SELECT id FROM bookings WHERE google_calendar_event_id IS NOT NULL AND starts_at > now() AND status IN ('PENDING','CONFIRMED') LIMIT 1`;
    if (future.length) return errorResponse("Hay reservas futuras vinculadas. Cancelalas o completalas antes de desconectar", 409);
    await db()`DELETE FROM google_calendar_connections WHERE id = 1`;
    return Response.json({ message: "Calendario desconectado" });
  } catch (error) {
    console.error("Google disconnect", error);
    return errorResponse("No se pudo desconectar", 503);
  }
}