import { DateTime } from "luxon";
import type postgres from "postgres";
import { db } from "./db";
import { businessZone, calendarEventId, connectedCalendar, createCalendarEvent, deleteCalendarEvent, googleBusy } from "./calendar";
import { getAvailableSlots, toMinutes, toTime, type Interval } from "./availability";
import { sendEmail } from "./email";

type Query = postgres.Sql | postgres.TransactionSql;
type BookingStatus = "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

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
  const hours = await query`
    SELECT opens_at::text, closes_at::text, slot_minutes,
      ARRAY(
        SELECT to_char(item.start_time, 'HH24:MI')
        FROM unnest(start_times) AS item(start_time)
        ORDER BY item.start_time
      ) AS start_times
    FROM business_hours WHERE weekday = ${day.weekday % 7}
  `;
  const exceptions = await query`
    SELECT starts_at, ends_at, kind FROM business_exceptions
    WHERE starts_at < ${nextDay.toJSDate()} AND ends_at > ${day.toJSDate()}
  `;
  const special = exceptions.filter((item) => item.kind === "SPECIAL");
  if (!hours.length || (!hours[0].start_times.length && !special.length)) return { service, slots: [] };
  const windows = special.length
    ? special.map((item) => ({
      start: Math.max(0, Math.floor(DateTime.fromJSDate(item.starts_at).setZone(businessZone).diff(day, "minutes").minutes)),
      end: Math.min(1440, Math.floor(DateTime.fromJSDate(item.ends_at).setZone(businessZone).diff(day, "minutes").minutes)),
      slotMinutes: Number(hours[0].slot_minutes),
    }))
    : (hours[0].start_times as string[]).map((time) => {
      const start = toMinutes(time);
      return { start, end: start + service.duration_minutes, slotMinutes: service.duration_minutes };
    });
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
  const initiallyAvailable = initial.slots.some((slot) => slot.time === time && slot.startsAt.getTime() === slotStart.getTime());
  const connection = await connectedCalendar();
  const booked = await db().begin(async (transaction) => {
    await transaction`SELECT pg_advisory_xact_lock(0, hashtext(${customerId}))`;
    await transaction`SELECT pg_advisory_xact_lock(hashtext(${date}))`;
    const restrictions = await transaction`
      SELECT
        EXISTS (
          SELECT 1 FROM bookings
          WHERE customer_id = ${customerId}
            AND status IN ('PENDING','CONFIRMED')
            AND ends_at > NOW()
        ) AS has_active_booking,
        (
          SELECT MAX(suspended_until) FROM customer_suspensions
          WHERE customer_id = ${customerId} AND suspended_until > NOW()
        ) AS suspended_until
    `;
    if (restrictions[0].suspended_until) {
      return { reason: "SUSPENDED", until: restrictions[0].suspended_until as Date } as const;
    }
    if (restrictions[0].has_active_booking) return { reason: "ACTIVE_BOOKING" } as const;
    const current = await availableSlots(date, serviceId, transaction, false);
    const slot = current.slots.find((item) => item.time === time);
    if (!initiallyAvailable || !slot || slot.startsAt.getTime() !== slotStart.getTime()) return null;
    const rows = await transaction`
      INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status, calendar_sync_status)
      VALUES (${customerId}, ${serviceId}, ${slot.startsAt}, ${slot.endsAt}, 'CONFIRMED', ${connection ? "PENDING" : "DISCONNECTED"})
      RETURNING id, starts_at, ends_at
    `;
    await transaction`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${rows[0].id}, ${customerId}, 'CREATED')`;
    return { ...rows[0], service_name: current.service.name } as { id: string; starts_at: Date; ends_at: Date; service_name: string };
  });
  if (booked && "reason" in booked) return booked;
  if (!booked) return null;
  await syncBooking(booked.id);
  const user = await db()`SELECT email FROM users WHERE id = ${customerId}`;
  const subject = "Reserva confirmada - L’Italia Barber";
  const text = `Tu turno de ${booked.service_name} está confirmado para el ${date} a las ${time} en L’Italia Barber`;
  await notifyBooking(user[0]?.email, subject, text).catch((error) => console.error("Booking email error", { bookingId: booked.id, error }));
  await notifyBookingAdmins(subject, text).catch((error) => console.error("Admin booking email error", { bookingId: booked.id, error }));
  return booked.id;
}

export async function updateBookingStatus(id: string, status: BookingStatus, actorId: string) {
  return db().begin(async (transaction) => {
    const booking = await transaction`SELECT customer_id FROM bookings WHERE id = ${id}`;
    if (!booking.length) return false;
    const customerId = booking[0].customer_id as string;
    await transaction`SELECT pg_advisory_xact_lock(0, hashtext(${customerId}))`;
    const lockedBooking = await transaction`SELECT customer_id, ends_at <= NOW() AS ended FROM bookings WHERE id = ${id} FOR UPDATE`;
    if (!lockedBooking.length || lockedBooking[0].customer_id !== customerId) return false;
    if (status === "NO_SHOW" && !lockedBooking[0].ended) return false;
    const rows = await transaction`
      UPDATE bookings SET status = ${status}, updated_at = now(),
        calendar_sync_status = CASE WHEN ${status} = 'CANCELLED' AND google_calendar_event_id IS NOT NULL THEN 'PENDING' ELSE calendar_sync_status END
      WHERE id = ${id} AND status NOT IN ('CANCELLED','COMPLETED','NO_SHOW') AND status <> ${status}
      RETURNING id
    `;
    if (!rows.length) return false;
    await transaction`INSERT INTO booking_events (booking_id, actor_id, event) VALUES (${id}, ${actorId}, ${status})`;
    if (status === "NO_SHOW") {
      const recorded = await transaction`
        INSERT INTO customer_no_shows (booking_id, customer_id, recorded_at)
        VALUES (${id}, ${customerId}, now())
        ON CONFLICT (booking_id) DO NOTHING
        RETURNING booking_id, recorded_at
      `;
      if (recorded.length) {
        const recordedAt = recorded[0].recorded_at as Date;
        const counts = await transaction`SELECT count(*)::int AS no_show_count FROM customer_no_shows WHERE customer_id = ${customerId}`;
        const noShowCount = Number(counts[0].no_show_count);
        if (noShowCount % 5 === 0) {
          await transaction`
            INSERT INTO customer_suspensions (customer_id, no_show_count, starts_at, suspended_until)
            VALUES (${customerId}, ${noShowCount}, ${recordedAt}, ${recordedAt} + interval '3 months')
          `;
        }
      }
    }
    return true;
  });
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

export function bookingAdminNotificationRecipients(currentAdminEmail = process.env.ADMIN_EMAIL) {
  return [...new Set([currentAdminEmail, "piersantialexis@gmail.com"]
    .filter((email): email is string => Boolean(email?.trim()))
    .map((email) => email.trim().toLowerCase()))];
}

export async function notifyBookingAdmins(subject: string, text: string) {
  await Promise.all(bookingAdminNotificationRecipients().map((email) => notifyBooking(email, subject, text)));
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