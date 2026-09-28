import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { createBooking } from "@/lib/booking";
import { db } from "@/lib/db";
import { errorResponse, rateLimit, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const bookings = await db()`
      SELECT b.id, b.starts_at, b.ends_at, b.status, b.calendar_sync_status, s.name AS service_name
      FROM bookings b JOIN services s ON s.id = b.service_id
      WHERE b.customer_id = ${user.id} ORDER BY b.starts_at DESC
    `;
    return Response.json({ bookings });
  } catch (error) {
    console.error("Booking list error", error);
    return errorResponse("No se pudieron consultar las reservas", 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user || user.role !== "CUSTOMER") return errorResponse("Iniciá sesión como cliente", 401);
    if (!(await rateLimit(`booking:${user.id}`, 10, 60))) return errorResponse("Demasiados intentos", 429);
    const { serviceId, date, time } = z.object({ serviceId: z.uuid(), date: z.string(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).parse(await request.json());
    const id = await createBooking(user.id, date, time, serviceId);
    if (!id) return errorResponse("El horario ya no está disponible. Elegí otro", 409);
    return Response.json({ id, message: "Reserva confirmada" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && /Fecha inválida|Servicio no disponible/.test(error.message))) return errorResponse("Datos inválidos", 400);
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23P01") return errorResponse("El horario ya fue reservado", 409);
    console.error("Booking create error", error);
    return errorResponse("No se pudo confirmar la reserva. Intentá más tarde", 503);
  }
}