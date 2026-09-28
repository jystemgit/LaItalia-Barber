import { DateTime } from "luxon";
import type postgres from "postgres";
import { db } from "./db";
import { businessZone, calendarEventId, connectedCalendar, createCalendarEvent, deleteCalendarEvent, googleBusy } from "./calendar";
import { getAvailableSlots, toMinutes, toTime, type Interval } from "./availability";
import { sendEmail } from "./email";

type Query = postgres.Sql | postgres.TransactionSql;

export function localDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida");
  const day = DateTime.fromISO(date, { zone: businessZone });
  if (!day.isValid || day.toISODate() !== date) throw new Error("Fecha inválida");
  return day;
}

export async function serviceById(id: string, query: Query = db()) {
  const rows = await query`SELECT id, name, description, duration_minutes FROM services WHERE id = ${id} AND active = true`;
  return rows[0] as { id: string; name: string; description: string; duration_minutes: number } | undefined;
}

export async function availableSlots(date: string, serviceId: string, query: Query = db(), checkCalendar = true) {
  const day = localDay(date);
  const service = await serviceById(serviceId, query);
  if (!service) throw new Error("Servicio no disponible");
  if (day.endOf("day") < DateTime.now().setZone(businessZone)) return { service, slots: [] };
  const nextDay = day.plus({ days: 1 });
  const hours = await query`SELECT opens_at::text, closes_at::text, slot_minutes FROM business_hours WHERE weekday = ${day.weekday % 7}`;
  const exceptions = await query`
    SELECT starts_at, ends_at, kind FROM business_exceptions
    WHERE starts_at < ${nextDay.toJSDate()} AND ends_at > ${day.toJSDate()}
  `;
  const special = exceptions.filter((item) => item.kind === "SPECIAL");
  if (!hours.length || (!hours[0].opens_at && !special.length)) return { service, slots: [] };
  const windows = (special.length ? special : [{ starts_at: day.set({ hour: Number(hours[0].opens_at.slice(0, 2)), minute: Number(hours[0].opens_at.slice(3, 5)) }).toJSDate(), ends_at: day.set({ hour: Number(hours[0].closes_at.slice(0, 2)), minute: Number(hours[0].closes_at.slice(3, 5)) }).toJSDate() }])
    .map((item) => ({
      start: Math.max(0, Math.floor(DateTime.fromJSDate(item.starts_at).setZone(businessZone).diff(day, "minutes").minutes)),
      end: Math.min(1440, Math.floor(DateTime.fromJSDate(item.ends_at).setZone(businessZone).diff(day, "minutes").minutes)),
      slotMinutes: Number(hours[0].slot_minutes),
    }));
  const booked = await query`
    SELECT starts_at, ends_at FROM bookings
    WHERE starts_at < ${nextDay.toJSDate()} AND ends_at > ${day.toJSDate()}
      AND status IN ('PENDING','CONFIRMED')
  `;
  const connected = checkCalendar ? await connectedCalendar() : null;
  const busy = connected ? await googleBusy(day, nextDay) : [];
  const occupied: Interval[] = [...booked, ...exceptions.filter((item) => item.kind !== "SPECIAL"), ...busy.map((item) => ({ starts_at: item.start, ends_at: item.end }))]
    .map((item) => ({
      start: Math.floor(DateTime.fromJSDate(item.starts_at).setZone(businessZone).diff(day, "minutes").minutes),
      end: Math.ceil(DateTime.fromJSDate(item.ends_at).setZone(businessZone).diff(day, "minutes").minutes),
    }));
  const today = DateTime.now().setZone(businessZone);
  const nowMinutes = today.toISODate() === date ? today.hour * 60 + today.minute : undefined;
  return { service, slots: getAvailableSlots(windows.filter((window) => window.end > window.start), service.duration_minutes, occupied, nowMinutes).map((slot) => ({
    time: toTime(slot.start),
    startsAt: day.plus({ minutes: slot.start }).toJSDate(),
    endsAt: day.plus({ minutes: slot.end }).toJSDate(),
  })) };
}

export async function createBooking(customerId: string, date: string, time: string, serviceId: string) {
  const startMinutes = toMinutes(time);
  const day = localDay(date);
  const slotStart = day.plus({ minutes: startMinutes }).toJSDate();
  const initial = await availableSlots(date, serviceId);
  if (!initial.slots.some((slot) => slot.time === time && slot.startsAt.getTime() === slotStart.getTime())) return null;
  const connection = await connectedCalendar();
  const booked = await db().begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${date}))`;
    const current = await availableSlots(date, serviceId, transaction, false);
    const slot = current.slots.find((item) => item.time === time);
    if (!slot || slot.startsAt.getTime() !== slotStart.getTime()) return null;
    const rows = await transaction`
      INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status, calendar_sync_status)
      VALUES (${customerId}, ${serviceId}, ${slot.startsAt}, ${slot.endsAt}, 'CONFIRMED', ${connection ? "PENDING" : "DISCONNECTED"})
      RETURNING id, starts_at, ends_at
    `;
    await transaction`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${rows[0].id}, ${customerId}, 'CREATED')`;
    return { ...rows[0], service_name: current.service.name } as { id: string; starts_at: Date; ends_at: Date; service_name: string };
  });
  if (!booked) return null;
  await syncBooking(booked.id);
  const user = await db()`SELECT email FROM users WHERE id = ${customerId}`;
  await notifyBooking(user[0]?.email, "Reserva confirmada - L’Italia Barber", `Tu turno de ${booked.service_name} está confirmado para el ${date} a las ${time} en L’Italia Barber`).catch((error) => console.error("Booking email error", { bookingId: booked.id, error }));
  return booked.id;
}

export async function cancelCustomerBooking(customerId: string, bookingId: string) {
  const rows = await db()`
    UPDATE bookings SET status = 'CANCELLED', updated_at = now(),
      calendar_sync_status = CASE WHEN google_calendar_event_id IS NULL THEN 'DISCONNECTED' ELSE 'PENDING' END
    WHERE id = ${bookingId} AND customer_id = ${customerId}
      AND status IN ('PENDING','CONFIRMED') AND starts_at > now()
    RETURNING id
  `;
  return rows[0] as { id: string } | undefined ?? null;
}

export async function notifyBooking(email: string | undefined, subject: string, text: string) {
  if (!email || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return;
  await sendEmail(email, subject, text);
}

export async function syncBooking(id: string) {
  const rows = await db()`
    SELECT b.id, b.starts_at, b.ends_at, b.status, b.calendar_sync_status, b.google_calendar_event_id,
      s.name AS service_name, p.first_name, p.last_name, p.phone
    FROM bookings b JOIN services s ON s.id = b.service_id JOIN profiles p ON p.user_id = b.customer_id
    WHERE b.id = ${id}
  `;
  const booking = rows[0] as {
    id: string; starts_at: Date; ends_at: Date; status: string; calendar_sync_status: string;
    google_calendar_event_id: string | null; service_name: string;
    first_name: string; last_name: string; phone: string;
  } | undefined;
  if (!booking || booking.calendar_sync_status === "SYNCED") return;
  try {
    if (booking.status === "CANCELLED") {
      const connection = await connectedCalendar();
      if (!connection) {
        await db()`UPDATE bookings SET calendar_sync_status = ${booking.google_calendar_event_id ? "FAILED" : "DISCONNECTED"} WHERE id = ${id} AND status = 'CANCELLED'`;
        return;
      }
      await deleteCalendarEvent(booking.google_calendar_event_id || calendarEventId(id));
      await db()`UPDATE bookings SET calendar_sync_status = 'SYNCED' WHERE id = ${id} AND status = 'CANCELLED'`;
    } else if (booking.status === "CONFIRMED") {
      const eventId = await createCalendarEvent(booking);
      if (eventId) await db()`UPDATE bookings SET calendar_sync_status = 'SYNCED', google_calendar_event_id = ${eventId} WHERE id = ${id} AND status = 'CONFIRMED'`;
    }
  } catch (error) {
    console.error("Calendar sync error", { bookingId: id, error });
    await db()`UPDATE bookings SET calendar_sync_status = 'FAILED' WHERE id = ${id}`;
  }
}