import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    return Response.json({ user });
  } catch (error) {
    console.error("Profile read error", error);
    return errorResponse("Cuenta temporalmente no disponible", 503);
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await currentUser();
    if (!user) return errorResponse("Iniciá sesión", 401);
    const { firstName, lastName, phone } = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), phone: z.string().trim().min(7).max(30) }).parse(await request.json());
    await db()`UPDATE profiles SET first_name = ${firstName}, last_name = ${lastName}, phone = ${phone}, updated_at = now() WHERE user_id = ${user.id}`;
    return Response.json({ message: "Datos actualizados" });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Profile update error", error);
    return errorResponse("No se pudo actualizar tu perfil", 503);
  }
}