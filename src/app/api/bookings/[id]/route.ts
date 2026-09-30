import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cancelCustomerBooking, notifyBooking, notifyBookingAdmins, syncBooking } from "@/lib/booking";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export function customerCancellationAuthorizationError(role: string): Response | null {
  return role === "CUSTOMER" ? null : errorResponse("Acceso denegado", 403);
}

export async function PATCH(request: Request, context: RouteContext<"/api/bookings/[id]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const roleError = customerCancellationAuthorizationError(user.role);
    if (roleError) return roleError;
    const { id } = await context.params;
    z.uuid().parse(id);
    const cancelled = await cancelCustomerBooking(user.id, id);
    if (!cancelled) return errorResponse("Reserva no encontrada o no cancelable", 404);
    await db()`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${id}, ${user.id}, 'CANCELLED')`;
    await syncBooking(id);
    const subject = "Reserva cancelada - L’Italia Barber";
    const text = "Tu reserva fue cancelada. Podés consultar nuevos horarios en el sitio";
    await notifyBooking(user.email, subject, text).catch((error) => console.error("Cancellation email error", { bookingId: id, error }));
    await notifyBookingAdmins(subject, text).catch((error) => console.error("Admin cancellation email error", { bookingId: id, error }));
    return Response.json({ message: "Reserva cancelada" });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("ID inválido", 400);
    console.error("Booking cancellation error", error);
    return errorResponse("No se pudo cancelar la reserva", 503);
  }
}