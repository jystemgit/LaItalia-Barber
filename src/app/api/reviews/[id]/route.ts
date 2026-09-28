import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { deleteCustomerReview, updateCustomerReview } from "@/lib/reviews";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";
const reviewInput = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().min(1).max(2000) });

export async function PATCH(request: Request, context: RouteContext<"/api/reviews/[id]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user || user.role !== "CUSTOMER") return errorResponse("Iniciá sesión como cliente", 401);
    const { id } = await context.params;
    const reviewId = z.uuid().parse(id);
    const review = await updateCustomerReview(user.id, reviewId, reviewInput.parse(await request.json()));
    if (!review) return errorResponse("Reseña no encontrada o ya publicada", 404);
    return Response.json({ review });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return errorResponse("Datos inválidos", 400);
    console.error("Review update error", error);
    return errorResponse("No se pudo actualizar la reseña", 503);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/reviews/[id]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user || user.role !== "CUSTOMER") return errorResponse("Iniciá sesión como cliente", 401);
    const { id } = await context.params;
    if (!(await deleteCustomerReview(user.id, z.uuid().parse(id)))) return errorResponse("Reseña no encontrada", 404);
    return Response.json({ message: "Reseña eliminada" });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("ID inválido", 400);
    console.error("Review delete error", error);
    return errorResponse("No se pudo eliminar la reseña", 503);
  }
}