import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const reviews = await db()`SELECT id, booking_id, rating, comment, status, created_at FROM reviews WHERE customer_id = ${user.id} ORDER BY created_at DESC`;
    return Response.json({ reviews });
  } catch (error) {
    console.error("Reviews list error", error);
    return errorResponse("No se pudieron consultar las reseñas", 503);
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user || user.role !== "CUSTOMER") return errorResponse("Iniciá sesión como cliente", 401);
    const { bookingId, rating, comment } = z.object({ bookingId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000) }).parse(await request.json());
    const reviews = await db()`
      INSERT INTO reviews (customer_id, booking_id, rating, comment)
      SELECT ${user.id}, b.id, ${rating}, ${comment} FROM bookings b
      WHERE b.id = ${bookingId} AND b.customer_id = ${user.id} AND b.status = 'COMPLETED'
      ON CONFLICT (booking_id) DO NOTHING RETURNING id
    `;
    if (!reviews.length) return errorResponse("Solo podés reseñar una reserva completada una vez", 409);
    return Response.json({ id: reviews[0].id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Review create error", error);
    return errorResponse("No se pudo guardar la reseña", 503);
  }
}