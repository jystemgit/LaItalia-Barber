import { z } from "zod";
import { availableSlots } from "@/lib/booking";
import { errorResponse } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { date, serviceId } = z.object({ date: z.string(), serviceId: z.uuid() }).parse(Object.fromEntries(url.searchParams));
    const { service, slots } = await availableSlots(date, serviceId);
    return Response.json({ service, slots: slots.map((slot) => slot.time) });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof RangeError || (error instanceof Error && /Fecha inválida|Servicio no disponible/.test(error.message))) return errorResponse("Fecha o servicio inválido", 400);
    console.error("Availability error", error);
    return errorResponse("No se puede verificar disponibilidad en este momento", 503);
  }
}