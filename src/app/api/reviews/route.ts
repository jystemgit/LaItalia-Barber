import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { errorResponse, sameOrigin } from "@/lib/security";
import { createCustomerReview, listCustomerReviews } from "@/lib/reviews";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const reviews = await listCustomerReviews(user.id);
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
    const { bookingId, rating, comment } = z.object({ bookingId: z.uuid(), rating: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(2000) }).parse(await request.json());
    const review = await createCustomerReview(user.id, bookingId, { rating, comment });
    if (!review) return errorResponse("Solo podés reseñar una reserva completada una vez", 409);
    return Response.json({ review }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Review create error", error);
    return errorResponse("No se pudo guardar la reseña", 503);
  }
}