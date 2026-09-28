import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { connectedCalendar, googleCalendars } from "@/lib/calendar";
import { syncBooking } from "@/lib/booking";
import { errorResponse, sameOrigin } from "@/lib/security";

export const runtime = "nodejs";

async function admin() {
  const user = await currentUser();
  return user?.role === "ADMIN" ? user : null;
}

export async function GET(_request: Request, context: RouteContext<"/api/admin/[resource]">) {
  try {
    if (!(await admin())) return errorResponse("Acceso denegado", 403);
    const { resource } = await context.params;
    if (resource === "dashboard") {
      const [totals, upcoming] = await Promise.all([
        db()`SELECT
          (SELECT count(*)::int FROM bookings WHERE (starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AND status IN ('PENDING','CONFIRMED')) AS today,
          (SELECT count(*)::int FROM bookings WHERE status = 'PENDING') AS pending,
          (SELECT count(*)::int FROM bookings WHERE status = 'CONFIRMED') AS confirmed,
          (SELECT count(*)::int FROM users WHERE role = 'CUSTOMER') AS customers`,
        db()`SELECT b.id, b.starts_at, b.status, s.name AS service_name, p.first_name, p.last_name FROM bookings b JOIN services s ON s.id = b.service_id JOIN profiles p ON p.user_id = b.customer_id WHERE b.starts_at >= now() AND b.status IN ('PENDING','CONFIRMED') ORDER BY b.starts_at LIMIT 12`],
      );
      return Response.json({ totals: totals[0], upcoming });
    }
    if (resource === "bookings") return Response.json({ items: await db()`SELECT b.id, b.starts_at, b.ends_at, b.status, b.calendar_sync_status, s.name AS service_name, p.first_name, p.last_name, p.phone, u.email FROM bookings b JOIN services s ON s.id = b.service_id JOIN profiles p ON p.user_id = b.customer_id JOIN users u ON u.id = b.customer_id ORDER BY b.starts_at DESC LIMIT 200` });
    if (resource === "customers") return Response.json({ items: await db()`SELECT u.id, u.email, p.first_name, p.last_name, p.phone, u.created_at, count(b.id)::int AS bookings FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN bookings b ON b.customer_id = u.id WHERE u.role = 'CUSTOMER' GROUP BY u.id, p.user_id ORDER BY u.created_at DESC LIMIT 200` });
    if (resource === "services") return Response.json({ items: await db()`SELECT id, name, description, duration_minutes, active FROM services ORDER BY name` });
    if (resource === "hours") return Response.json({ items: await db()`SELECT weekday, opens_at::text, closes_at::text, slot_minutes FROM business_hours ORDER BY weekday` });
    if (resource === "exceptions") return Response.json({ items: await db()`SELECT id, starts_at, ends_at, kind, note FROM business_exceptions ORDER BY starts_at DESC LIMIT 200` });
    if (resource === "reviews") return Response.json({ items: await db()`SELECT r.id, r.booking_id, r.rating, r.comment, r.status, r.created_at, p.first_name, p.last_name FROM reviews r JOIN profiles p ON p.user_id = r.customer_id ORDER BY r.created_at DESC LIMIT 200` });
    if (resource === "calendar") return Response.json({ connected: Boolean(await connectedCalendar()), calendars: await googleCalendars(), connection: (await connectedCalendar())?.calendar_id ?? null });
    return errorResponse("Recurso desconocido", 404);
  } catch (error) {
    console.error("Admin read error", error);
    return errorResponse("No se pudo cargar el panel", 503);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/admin/[resource]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await admin();
    if (!user) return errorResponse("Acceso denegado", 403);
    const { resource } = await context.params;
    const input: unknown = await request.json();
    if (resource === "services") {
      const { name, description, durationMinutes } = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500), durationMinutes: z.number().int().min(15).max(480) }).parse(input);
      const rows = await db()`INSERT INTO services (name, description, duration_minutes) VALUES (${name}, ${description}, ${durationMinutes}) RETURNING id`;
      return Response.json({ id: rows[0].id }, { status: 201 });
    }
    if (resource === "exceptions") {
      const { startsAt, endsAt, kind, note } = z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), kind: z.enum(["CLOSED", "BLOCK", "SPECIAL"]), note: z.string().max(250).default("") }).parse(input);
      if (new Date(endsAt) <= new Date(startsAt)) return errorResponse("Período inválido", 400);
      const rows = await db()`INSERT INTO business_exceptions (starts_at, ends_at, kind, note) VALUES (${startsAt}, ${endsAt}, ${kind}, ${note}) RETURNING id`;
      return Response.json({ id: rows[0].id }, { status: 201 });
    }
    if (resource === "calendar-sync") {
      const { id } = z.object({ id: z.uuid() }).parse(input);
      await syncBooking(id);
      return Response.json({ message: "Reintento solicitado" });
    }
    return errorResponse("Acción desconocida", 404);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Admin write error", error);
    return errorResponse("No se pudo guardar el cambio", 503);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/admin/[resource]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    const user = await admin();
    if (!user) return errorResponse("Acceso denegado", 403);
    const { resource } = await context.params;
    const input: unknown = await request.json();
    if (resource === "bookings") {
      const { id, status } = z.object({ id: z.uuid(), status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]) }).parse(input);
      const rows = await db()`UPDATE bookings SET status = ${status}, updated_at = now(), calendar_sync_status = CASE WHEN ${status} = 'CANCELLED' AND google_calendar_event_id IS NOT NULL THEN 'PENDING' ELSE calendar_sync_status END WHERE id = ${id} AND status NOT IN ('CANCELLED','COMPLETED','NO_SHOW') AND status <> ${status} RETURNING id`;
      if (!rows.length) return errorResponse("Transición no permitida", 409);
      await db()`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${id}, ${user.id}, ${status})`;
      if (status === "CANCELLED") await syncBooking(id);
      return Response.json({ message: "Estado actualizado" });
    }
    if (resource === "services") {
      const { id, name, description, durationMinutes, active } = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100), description: z.string().trim().max(500), durationMinutes: z.number().int().min(15).max(480), active: z.boolean() }).parse(input);
      await db()`UPDATE services SET name = ${name}, description = ${description}, duration_minutes = ${durationMinutes}, active = ${active}, updated_at = now() WHERE id = ${id}`;
      return Response.json({ message: "Servicio actualizado" });
    }
    if (resource === "hours") {
      const { weekday, opensAt, closesAt, slotMinutes } = z.object({ weekday: z.number().int().min(0).max(6), opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), slotMinutes: z.number().int().min(15).max(480) }).parse(input);
      if ((opensAt === null) !== (closesAt === null) || (opensAt && closesAt && opensAt >= closesAt)) return errorResponse("Horario inválido", 400);
      await db()`UPDATE business_hours SET opens_at = ${opensAt}, closes_at = ${closesAt}, slot_minutes = ${slotMinutes} WHERE weekday = ${weekday}`;
      return Response.json({ message: "Horario actualizado" });
    }
    if (resource === "reviews") {
      const { id, status } = z.object({ id: z.uuid(), status: z.enum(["PENDING", "APPROVED", "REJECTED"]) }).parse(input);
      await db()`UPDATE reviews SET status = ${status}, updated_at = now() WHERE id = ${id}`;
      return Response.json({ message: "Reseña moderada" });
    }
    if (resource === "calendar") {
      const { calendarId } = z.object({ calendarId: z.string().min(1) }).parse(input);
      const calendars = await googleCalendars();
      if (!calendars.some((calendar) => calendar.id === calendarId)) return errorResponse("Calendario no autorizado", 400);
      await db()`UPDATE google_calendar_connections SET calendar_id = ${calendarId}, updated_at = now() WHERE id = 1`;
      return Response.json({ message: "Calendario seleccionado" });
    }
    return errorResponse("Acción desconocida", 404);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Admin update error", error);
    return errorResponse("No se pudo actualizar el recurso", 503);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/admin/[resource]">) {
  if (!sameOrigin(request)) return errorResponse("Origen no permitido", 403);
  try {
    if (!(await admin())) return errorResponse("Acceso denegado", 403);
    const { resource } = await context.params;
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    if (resource === "exceptions") await db()`DELETE FROM business_exceptions WHERE id = ${id}`;
    else return errorResponse("Acción desconocida", 404);
    return Response.json({ message: "Excepción eliminada" });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Datos inválidos", 400);
    console.error("Admin delete error", error);
    return errorResponse("No se pudo eliminar", 503);
  }
}