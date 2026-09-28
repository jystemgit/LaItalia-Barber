import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyBooking, syncBooking } from "@/lib/booking";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/bookings/[id]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const { id } = await context.params;
    z.uuid().parse(id);
    const rows = await db()`
      UPDATE bookings SET status = 'CANCELLED', updated_at = now(),
        calendar_sync_status = CASE WHEN google_calendar_event_id IS NULL THEN 'DISCONNECTED' ELSE 'PENDING' END
      WHERE id = ${id} AND customer_id = ${user.id} AND status IN ('PENDING','CONFIRMED') AND starts_at > now()
      RETURNING id
    `;
    if (!rows.length) return errorResponse("Reserva no encontrada o no cancelable", 404);
    await db()`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${id}, ${user.id}, 'CANCELLED')`;
    if (rows.length) await syncBooking(id);
    await notifyBooking(user.email, "Reserva cancelada - L’Italia Barber", "Tu reserva fue cancelada. Podés consultar nuevos horarios en el sitio").catch((error) => console.error("Cancellation email error", { bookingId: id, error }));
    return Response.json({ message: "Reserva cancelada" });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("ID inválido", 400);
    console.error("Booking cancellation error", error);
    return errorResponse("No se pudo cancelar la reserva", 503);
  }
}