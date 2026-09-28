import { test } from "node:test";
import assert from "node:assert/strict";
import argon2 from "argon2";
import { DateTime } from "luxon";
import { db } from "./db";
import { availableSlots, createBooking, syncBooking } from "./booking";
import { businessZone, calendarEventId, createCalendarEvent, googleBusy } from "./calendar";
import { verifyEmail, resetPassword, register } from "./auth";
import { encrypt, hashToken, randomToken } from "./security";

test("PostgreSQL: tokens, horarios y dos reservas concurrentes", { skip: !process.env.DATABASE_URL && "DATABASE_URL no configurada" }, async () => {
  const sql = db();
  const email = `integration-${randomToken().slice(0, 12)}@example.test`;
  const token = randomToken();
  const secondEmail = `integration-${randomToken().slice(0, 12)}@example.test`;
  const expiredEmail = `integration-${randomToken().slice(0, 12)}@example.test`;
  const password = await argon2.hash("contraseña-segura-para-test");
  process.env.AUTH_SECRET = "integration-test-secret-with-32-characters-minimum";
  process.env.GOOGLE_CLIENT_ID = "integration-client";
  process.env.GOOGLE_CLIENT_SECRET = "integration-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://integration.example/callback";
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "test@example.test";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: "mock-email" }), { status: 200 });
  const day = DateTime.now().setZone(businessZone).plus({ days: 18 });
  const monday = day.plus({ days: (8 - day.weekday) % 7 }).toISODate()!;
  const sunday = DateTime.fromISO(monday, { zone: businessZone }).minus({ days: 1 }).toISODate()!;
  let firstId: string | undefined;
  let secondId: string | undefined;
  try {
    await register({ email, password: "contraseña-segura-para-test", firstName: "Prueba", lastName: "Integración", phone: "12345678" }, "https://test.example");
    assert.equal((await sql`SELECT count(*)::int AS count FROM users WHERE email = ${email}`)[0].count, 0, "no existe cuenta activa antes de verificar");
    await sql`UPDATE pending_users SET token_hash = ${hashToken(token)} WHERE email = ${email}`;
    assert.equal(await verifyEmail("invalido"), false);
    const expiredToken = randomToken();
    await sql`INSERT INTO pending_users (email, password_hash, first_name, last_name, phone, token_hash, expires_at) VALUES (${expiredEmail}, ${password}, 'Vencida', 'Prueba', '12345678', ${hashToken(expiredToken)}, now() - interval '1 minute')`;
    assert.equal(await verifyEmail(expiredToken), false);
    assert.equal((await sql`SELECT count(*)::int AS count FROM users WHERE email = ${expiredEmail}`)[0].count, 0);
    assert.equal(await verifyEmail(token), true);
    assert.equal(await verifyEmail(token), false);
    const firstUser = await sql`SELECT id, role FROM users WHERE email = ${email}`;
    firstId = firstUser[0].id;
    assert.equal(firstUser[0].role, "CUSTOMER");

    const expired = randomToken();
    await sql`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (${hashToken(expired)}, ${firstId!}, now() - interval '1 minute')`;
    assert.equal(await resetPassword(expired, "otra-contraseña-segura"), false);
    const validReset = randomToken();
    const session = randomToken();
    await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(session)}, ${firstId!}, now() + interval '1 day')`;
    await sql`INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (${hashToken(validReset)}, ${firstId!}, now() + interval '1 hour')`;
    assert.equal(await resetPassword(validReset, "nueva-contraseña-segura"), true);
    assert.equal(await resetPassword(validReset, "nueva-contraseña-segura"), false);
    assert.equal((await sql`SELECT count(*)::int AS count FROM sessions WHERE user_id = ${firstId!}`)[0].count, 0);

    const secondUser = await sql`INSERT INTO users (email, password_hash) VALUES (${secondEmail}, ${password}) RETURNING id`;
    secondId = secondUser[0].id;
    await sql`INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES (${secondId!}, 'Prueba', 'Dos', '12345678')`;
    const services = await sql`SELECT id FROM services WHERE name = 'Corte + barba'`;
    const serviceId = services[0].id as string;
    const serviceDurations = await sql`SELECT name, duration_minutes FROM services ORDER BY name`;
    assert.deepEqual(serviceDurations.map((row) => [row.name, Number(row.duration_minutes)]), [["Barba", 40], ["Corte", 60], ["Corte + barba", 90]]);

    assert.deepEqual((await availableSlots(sunday, serviceId)).slots, []);
    const sundayOpen = DateTime.fromISO(sunday, { zone: businessZone }).set({ hour: 10, minute: 30 });
    const special = await sql`INSERT INTO business_exceptions (starts_at, ends_at, kind, note) VALUES (${sundayOpen.toJSDate()}, ${sundayOpen.plus({ minutes: 90 }).toJSDate()}, 'SPECIAL', 'prueba temporal') RETURNING id`;
    assert.deepEqual((await availableSlots(sunday, serviceId)).slots.map((slot) => slot.time), ["10:30"]);
    await sql`DELETE FROM business_exceptions WHERE id = ${special[0].id}`;
    assert.deepEqual((await availableSlots(monday, serviceId)).slots.map((item) => item.time), ["10:30", "12:00", "13:30", "15:00"]);
    await sql`UPDATE services SET duration_minutes = 120 WHERE id = ${serviceId}`;
    assert.deepEqual((await availableSlots(monday, serviceId)).slots.map((slot) => slot.time), ["10:30", "12:30", "14:30"]);
    await sql`UPDATE services SET duration_minutes = 90 WHERE id = ${serviceId}`;

    const results = await Promise.allSettled([
      createBooking(firstId!, monday, "12:00", serviceId),
      createBooking(secondId!, monday, "12:00", serviceId),
    ]);
    const accepted = results.filter((result) => result.status === "fulfilled" && result.value !== null);
    assert.equal(accepted.length, 1, "solo una reserva del mismo slot puede confirmarse");
    assert.deepEqual((await availableSlots(monday, serviceId)).slots.map((item) => item.time), ["10:30", "13:30", "15:00"]);
    assert.ok(await createBooking(secondId!, monday, "13:30", serviceId));
    await sql`UPDATE bookings SET status = 'CANCELLED' WHERE customer_id IN (${firstId!}, ${secondId!})`;
    assert.ok((await availableSlots(monday, serviceId)).slots.some((item) => item.time === "12:00"));

    await sql`INSERT INTO google_calendar_connections (id, owner_id, refresh_token_encrypted) VALUES (1, ${firstId!}, ${encrypt("refresh-token-test")})`;
    const eventBodies: Record<string, unknown>[] = [];
    let eventCreates = 0;
    let deletes = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "access-token-test" }), { status: 200 });
      if (url.endsWith("/freeBusy")) return new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: `${monday}T10:30:00-03:00`, end: `${monday}T12:00:00-03:00` }] } } }), { status: 200 });
      if (url.endsWith("/events") && init?.method === "POST") {
        eventCreates += 1;
        eventBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (eventCreates === 1) return new Response("temporary calendar error", { status: 503 });
        return new Response(JSON.stringify({ id: eventBodies.at(-1)?.id }), { status: eventCreates === 3 ? 409 : 200 });
      }
      if (url.includes("/events/") && init?.method === "DELETE") { deletes += 1; return new Response(null, { status: 204 }); }
      return new Response("upstream error", { status: 503 });
    };
    const rangeStart = DateTime.fromISO(monday, { zone: businessZone });
    const busy = await googleBusy(rangeStart, rangeStart.plus({ days: 1 }));
    assert.equal(busy.length, 1);
    const syncBookingRows = await sql`
      INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status, calendar_sync_status)
      VALUES (${firstId!}, ${serviceId}, ${rangeStart.plus({ hours: 12 }).toJSDate()}, ${rangeStart.plus({ hours: 13, minutes: 30 }).toJSDate()}, 'CONFIRMED', 'PENDING')
      RETURNING id
    `;
    const syncId = syncBookingRows[0].id as string;
    const originalConsoleError = console.error;
    const syncErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => { syncErrors.push(args); };
    try { await syncBooking(syncId); } finally { console.error = originalConsoleError; }
    assert.equal(syncErrors[0]?.[0], "Calendar sync error");
    assert.equal((await sql`SELECT calendar_sync_status FROM bookings WHERE id = ${syncId}`)[0].calendar_sync_status, "FAILED");
    await syncBooking(syncId);
    const synced = await sql`SELECT calendar_sync_status, google_calendar_event_id FROM bookings WHERE id = ${syncId}`;
    assert.equal(synced[0].calendar_sync_status, "SYNCED");
    assert.equal(synced[0].google_calendar_event_id, calendarEventId(syncId));
    await syncBooking(syncId);
    assert.equal(eventCreates, 2, "retry y repetición no duplican evento");
    await sql`UPDATE bookings SET status = 'CANCELLED', calendar_sync_status = 'PENDING' WHERE id = ${syncId}`;
    await syncBooking(syncId);
    assert.equal((await sql`SELECT calendar_sync_status FROM bookings WHERE id = ${syncId}`)[0].calendar_sync_status, "SYNCED");
    assert.equal(deletes, 1, "cancelar borra solo el evento de la reserva");
    const event = { id: syncId, starts_at: rangeStart.plus({ hours: 12 }).toJSDate(), ends_at: rangeStart.plus({ hours: 13, minutes: 30 }).toJSDate(), service_name: "Corte", first_name: "QA", last_name: "Cliente", phone: "12345678" };
    assert.equal(await createCalendarEvent(event), calendarEventId(event.id), "un 409 de evento existente es idempotente");
    assert.equal(eventBodies.length, 3);
    globalThis.fetch = async (input) => String(input).includes("oauth2.googleapis.com/token")
      ? new Response(JSON.stringify({ access_token: "access-token-test" }), { status: 200 })
      : new Response("calendar unavailable", { status: 503 });
    await assert.rejects(googleBusy(rangeStart, rangeStart.plus({ days: 1 })), /Google freeBusy: 503/);
  } finally {
    globalThis.fetch = originalFetch;
    if (firstId || secondId) {
      await sql`DELETE FROM reviews WHERE customer_id IN (${firstId || "00000000-0000-0000-0000-000000000000"}, ${secondId || "00000000-0000-0000-0000-000000000000"})`;
      await sql`DELETE FROM bookings WHERE customer_id IN (${firstId || "00000000-0000-0000-0000-000000000000"}, ${secondId || "00000000-0000-0000-0000-000000000000"})`;
      await sql`DELETE FROM google_calendar_connections WHERE owner_id IN (${firstId || "00000000-0000-0000-0000-000000000000"}, ${secondId || "00000000-0000-0000-0000-000000000000"})`;
      await sql`DELETE FROM users WHERE id IN (${firstId || "00000000-0000-0000-0000-000000000000"}, ${secondId || "00000000-0000-0000-0000-000000000000"})`;
    }
    await sql`DELETE FROM pending_users WHERE email IN (${email}, ${expiredEmail})`;
  }
});