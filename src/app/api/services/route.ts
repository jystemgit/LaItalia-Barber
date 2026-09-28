import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const services = await db()`SELECT id, name, description, duration_minutes FROM services WHERE active = true ORDER BY name`;
    return Response.json({ services });
  } catch (error) {
    console.error("Services error", error);
    return Response.json({ error: "Servicios temporalmente no disponibles" }, { status: 503 });
  }
}