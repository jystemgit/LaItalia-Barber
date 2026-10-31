import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import argon2 from "argon2";
import { DateTime } from "luxon";
import { db } from "./db";
import { availableSlots, cancelCustomerBooking, createBooking, syncBooking, updateBookingStatus } from "./booking";
import { businessZone, calendarEventId, createCalendarEvent, googleBusy } from "./calendar";
import { verifyEmail, resetPassword, register } from "./auth";
import { encrypt, hashToken, randomToken } from "./security";

test("PostgreSQL: tokens, horarios y dos reservas concurrentes", { skip: !process.env.DATABASE_URL && "DATABASE_URL no configurada" }, async () => {
  const sql = db();
  const email = `integration-${randomToken().slice(0, 12)}@example.test`;
  const token = randomToken();
  const secondEmail = `integration-${randomToken().slice(0, 12)}@example.test`;
  const thirdEmail = `integration-${randomToken().slice(0, 12)}@example.test`;
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
  let thirdId: string | undefined;
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
    const thirdUser = await sql`INSERT INTO users (email, password_hash) VALUES (${thirdEmail}, ${password}) RETURNING id`;
    thirdId = thirdUser[0].id;
    await sql`INSERT INTO profiles (user_id, first_name, last_name, phone) VALUES (${thirdId!}, 'Prueba', 'Tres', '12345678')`;
    const services = await sql`SELECT id FROM services WHERE name = 'Corte + barba'`;
    const serviceId = services[0].id as string;
    const serviceDurations = await sql`SELECT name, duration_minutes FROM services ORDER BY name`;
    assert.deepEqual(serviceDurations.map((row) => [row.name, Number(row.duration_minutes)]), [["Barba", 40], ["Corte", 60], ["Corte + barba", 90]]);
    const expectedWeeklyStarts = [
      ["12:30", "14:30", "16:00", "17:30"],
      ["10:30", "12:30", "14:30", "16:00"],
      ["12:30", "14:30", "16:00"],
      ["10:30", "12:30", "14:30", "16:00"],
      ["12:30", "14:30", "16:00", "17:30"],
      ["10:30", "12:30", "14:30", "16:00"],
    ];
    for (const [offset, expectedStarts] of expectedWeeklyStarts.entries()) {
      const date = DateTime.fromISO(monday, { zone: businessZone }).plus({ days: offset }).toISODate()!;
      assert.deepEqual((await availableSlots(date, serviceId)).slots.map((slot) => slot.time), expectedStarts);
    }
    const wednesday = DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 2 }).toISODate()!;
    assert.equal(await createBooking(firstId!, wednesday, "17:30", serviceId), null, "miércoles a las 17:30 no permite reservar directamente");
    assert.deepEqual((await availableSlots(sunday, serviceId)).slots, [], "domingo permanece cerrado");

    const cancellationBase = DateTime.now().plus({ days: 35 });
    async function addBooking(customerId: string, status: string, startsAt: DateTime) {
      const starts = startsAt.toJSDate();
      const ends = startsAt.plus({ minutes: 90 }).toJSDate();
      const rows = await sql`
        INSERT INTO bookings (customer_id, service_id, starts_at, ends_at, status)
        VALUES (${customerId}, ${serviceId}, ${starts}, ${ends}, ${status})
        RETURNING id
      `;
      return rows[0].id as string;
    }
    const pendingBookingId = await addBooking(firstId!, "PENDING", cancellationBase);
    const confirmedBookingId = await addBooking(firstId!, "CONFIRMED", cancellationBase.plus({ hours: 2 }));
    const completedBookingId = await addBooking(firstId!, "COMPLETED", cancellationBase.plus({ hours: 4 }));
    const cancelledBookingId = await addBooking(firstId!, "CANCELLED", cancellationBase.plus({ hours: 6 }));
    const noShowBookingId = await addBooking(firstId!, "NO_SHOW", cancellationBase.plus({ hours: 8 }));
    const foreignBookingId = await addBooking(secondId!, "CONFIRMED", cancellationBase.plus({ hours: 10 }));
    const pastBookingId = await addBooking(firstId!, "CONFIRMED", DateTime.now().minus({ hours: 3 }));

    assert.equal(await updateBookingStatus(confirmedBookingId, "NO_SHOW", secondId!), false, "una reserva futura no puede marcarse como NO_SHOW");
    const futureNoShowStatus = await sql`SELECT status FROM bookings WHERE id = ${confirmedBookingId}`;
    assert.equal(futureNoShowStatus[0].status, "CONFIRMED");
    const rejectedNoShowEffects = await sql`
      SELECT
        (SELECT count(*)::int FROM customer_no_shows WHERE booking_id = ${confirmedBookingId}) AS no_show_count,
        (SELECT count(*)::int FROM booking_events WHERE booking_id = ${confirmedBookingId} AND event = 'NO_SHOW') AS event_count,
        (SELECT count(*)::int FROM customer_suspensions WHERE customer_id = ${firstId!}) AS suspension_count
    `;
    assert.deepEqual([rejectedNoShowEffects[0].no_show_count, rejectedNoShowEffects[0].event_count, rejectedNoShowEffects[0].suspension_count], [0, 0, 0]);

    assert.ok(await cancelCustomerBooking(firstId!, pendingBookingId), "el cliente puede cancelar su reserva PENDING futura");
    assert.ok(await cancelCustomerBooking(firstId!, confirmedBookingId), "el cliente puede cancelar su reserva CONFIRMED futura");
    assert.equal(await cancelCustomerBooking(firstId!, completedBookingId), null, "no puede cancelar COMPLETED");
    assert.equal(await cancelCustomerBooking(firstId!, cancelledBookingId), null, "no puede cancelar CANCELLED");
    assert.equal(await cancelCustomerBooking(firstId!, noShowBookingId), null, "no puede cancelar NO_SHOW");
    assert.equal(await cancelCustomerBooking(firstId!, foreignBookingId), null, "no puede cancelar una reserva ajena");
    assert.equal(await cancelCustomerBooking(firstId!, pastBookingId), null, "no puede cancelar una reserva pasada");
    const cancelledStates = await sql`SELECT status FROM bookings WHERE id IN (${pendingBookingId}, ${confirmedBookingId}) ORDER BY id`;
    assert.deepEqual(cancelledStates.map((booking) => booking.status), ["CANCELLED", "CANCELLED"]);
    assert.equal(await updateBookingStatus(pastBookingId, "NO_SHOW", secondId!), true, "una reserva finalizada sí puede marcarse como NO_SHOW");
    const pastNoShow = await sql`SELECT status, ends_at <= now() AS ended FROM bookings WHERE id = ${pastBookingId}`;
    assert.equal(pastNoShow[0].status, "NO_SHOW");
    assert.equal(pastNoShow[0].ended, true);
    assert.equal((await sql`SELECT count(*)::int AS count FROM customer_no_shows WHERE booking_id = ${pastBookingId}`)[0].count, 1);
    await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${foreignBookingId}`;

    assert.deepEqual((await availableSlots(sunday, serviceId)).slots, []);
    const sundayOpen = DateTime.fromISO(sunday, { zone: businessZone }).set({ hour: 10, minute: 30 });
    const special = await sql`INSERT INTO business_exceptions (starts_at, ends_at, kind, note) VALUES (${sundayOpen.toJSDate()}, ${sundayOpen.plus({ minutes: 90 }).toJSDate()}, 'SPECIAL', 'prueba temporal') RETURNING id`;
    assert.deepEqual((await availableSlots(sunday, serviceId)).slots.map((slot) => slot.time), ["10:30"]);
    await sql`DELETE FROM business_exceptions WHERE id = ${special[0].id}`;
    assert.deepEqual((await availableSlots(monday, serviceId)).slots.map((item) => item.time), expectedWeeklyStarts[0]);
    assert.equal(await createBooking(firstId!, monday, "13:00", serviceId), null, "no se permiten inicios fuera de la lista semanal");
    await sql`UPDATE services SET duration_minutes = 120 WHERE id = ${serviceId}`;
    const longerSlots = await availableSlots(monday, serviceId);
    assert.deepEqual(longerSlots.slots.map((slot) => slot.time), ["12:30", "14:30", "17:30"]);
    assert.ok(longerSlots.slots.every((slot) => slot.endsAt.getTime() - slot.startsAt.getTime() === 120 * 60 * 1000));
    await sql`UPDATE services SET duration_minutes = 90 WHERE id = ${serviceId}`;

    const tuesday = DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 1 }).toISODate()!;
    for (const status of ["PENDING", "CONFIRMED"]) {
      const activeId = await addBooking(firstId!, status, DateTime.fromISO(monday, { zone: businessZone }).set({ hour: 12, minute: 30 }));
      assert.deepEqual(await createBooking(firstId!, monday, "12:30", serviceId), { reason: "ACTIVE_BOOKING" }, `${status} futura comunica la reserva activa incluso en el mismo slot`);
      assert.deepEqual(await createBooking(firstId!, tuesday, "12:30", serviceId), { reason: "ACTIVE_BOOKING" }, `${status} futura bloquea una segunda reserva`);
      await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${activeId}`;
    }

    const expiredConfirmed = await addBooking(firstId!, "CONFIRMED", DateTime.now().minus({ hours: 5 }));
    const afterExpired = await createBooking(firstId!, tuesday, "12:30", serviceId);
    assert.equal(typeof afterExpired, "string", "una reserva CONFIRMED vencida no bloquea otra");
    if (typeof afterExpired === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${afterExpired}`;
    await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${expiredConfirmed}`;

    for (const status of ["CANCELLED", "COMPLETED", "NO_SHOW"]) {
      const inactiveId = await addBooking(firstId!, status, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 7 }).set({ hour: 12, minute: 30 }));
      const afterInactive = await createBooking(firstId!, tuesday, "12:30", serviceId);
      assert.equal(typeof afterInactive, "string", `${status} no bloquea una nueva reserva`);
      if (typeof afterInactive === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${afterInactive}`;
      await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${inactiveId}`;
    }

    const sameCustomerResults = await Promise.all([
      createBooking(firstId!, monday, "12:30", serviceId),
      createBooking(firstId!, tuesday, "12:30", serviceId),
    ]);
    assert.equal(sameCustomerResults.filter((result) => typeof result === "string").length, 1, "dos solicitudes simultáneas del cliente crean como máximo una reserva");
    assert.equal(sameCustomerResults.filter((result) => result && typeof result !== "string" && result.reason === "ACTIVE_BOOKING").length, 1);
    for (const result of sameCustomerResults) {
      if (typeof result === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${result}`;
    }

    const noShowIds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const noShowId = await addBooking(thirdId!, "CONFIRMED", DateTime.now().minus({ days: 15 - index }));
      noShowIds.push(noShowId);
      assert.equal(await updateBookingStatus(noShowId, "NO_SHOW", firstId!), true);
    }
    assert.equal((await sql`SELECT count(*)::int AS count FROM customer_no_shows WHERE customer_id = ${thirdId!}`)[0].count, 4);
    const beforeThreshold = await createBooking(thirdId!, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 14 }).toISODate()!, "12:30", serviceId);
    assert.equal(typeof beforeThreshold, "string", "menos de cinco inasistencias no suspende");
    if (typeof beforeThreshold === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${beforeThreshold}`;

    const fifthNoShow = await addBooking(thirdId!, "CONFIRMED", DateTime.now().minus({ days: 11 }).set({ hour: 14, minute: 30 }));
    noShowIds.push(fifthNoShow);
    const concurrentNoShowTransitions = await Promise.all([
      updateBookingStatus(fifthNoShow, "NO_SHOW", firstId!),
      updateBookingStatus(fifthNoShow, "NO_SHOW", firstId!),
    ]);
    assert.equal(concurrentNoShowTransitions.filter(Boolean).length, 1, "dos cambios concurrentes solo aplican una transición");
    const firstSuspension = await sql`SELECT no_show_count, starts_at, suspended_until, suspended_until = starts_at + interval '3 months' AS exact_duration FROM customer_suspensions WHERE customer_id = ${thirdId!}`;
    assert.equal(firstSuspension.length, 1);
    assert.equal(firstSuspension[0].no_show_count, 5);
    assert.equal(firstSuspension[0].exact_duration, true);

    const duringSuspension = await createBooking(thirdId!, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 21 }).toISODate()!, "12:30", serviceId);
    assert.equal(typeof duringSuspension, "object");
    assert.equal(duringSuspension && typeof duringSuspension !== "string" ? duringSuspension.reason : null, "SUSPENDED");
    await sql`UPDATE customer_suspensions SET starts_at = now() - interval '2 months', suspended_until = now() - interval '1 second' WHERE customer_id = ${thirdId!} AND no_show_count = 5`;
    const afterSuspension = await createBooking(thirdId!, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 21 }).toISODate()!, "12:30", serviceId);
    assert.equal(typeof afterSuspension, "string", "al vencer la suspensión se permite reservar");
    if (typeof afterSuspension === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${afterSuspension}`;
    assert.equal((await sql`SELECT count(*)::int AS count FROM customer_no_shows WHERE customer_id = ${thirdId!}`)[0].count, 5, "el historial no se reinicia al vencer la suspensión");

    for (let index = 0; index < 5; index += 1) {
      const noShowId = await addBooking(thirdId!, "CONFIRMED", DateTime.now().minus({ days: 10 - index }));
      noShowIds.push(noShowId);
      assert.equal(await updateBookingStatus(noShowId, "NO_SHOW", firstId!), true);
    }
    assert.equal(await updateBookingStatus(noShowIds[9], "CONFIRMED", firstId!), false, "una reserva NO_SHOW no se reabre mediante una transición ordinaria");
    assert.equal(await updateBookingStatus(noShowIds[9], "NO_SHOW", firstId!), false, "repetir NO_SHOW no registra otra inasistencia");
    assert.equal((await sql`SELECT status FROM bookings WHERE id = ${noShowIds[9]}`)[0].status, "NO_SHOW");
    const noShowTotal = await sql`SELECT count(*)::int AS count FROM customer_no_shows WHERE customer_id = ${thirdId!}`;
    const suspensionTotal = await sql`SELECT count(*)::int AS count FROM customer_suspensions WHERE customer_id = ${thirdId!}`;
    assert.equal(noShowTotal[0].count, 10, "una reserva NO_SHOW repetida no duplica el historial");
    assert.equal(suspensionTotal[0].count, 2, "se crea una suspensión nueva al llegar a diez inasistencias");
    await sql`UPDATE customer_suspensions SET starts_at = now() - interval '2 months', suspended_until = now() + interval '1 month' WHERE customer_id = ${thirdId!} AND no_show_count = 5`;
    const activeSuspensions = await sql`
      SELECT count(*)::int AS count, MAX(suspended_until) AS latest_until
      FROM customer_suspensions
      WHERE customer_id = ${thirdId!} AND suspended_until > now()
    `;
    assert.equal(activeSuspensions[0].count, 2, "el escenario tiene dos suspensiones vigentes");
    const withMultipleSuspensions = await createBooking(thirdId!, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 28 }).toISODate()!, "12:30", serviceId);
    assert.equal(withMultipleSuspensions && typeof withMultipleSuspensions !== "string" ? withMultipleSuspensions.reason : null, "SUSPENDED");
    assert.equal(
      withMultipleSuspensions && typeof withMultipleSuspensions !== "string" && withMultipleSuspensions.reason === "SUSPENDED" ? withMultipleSuspensions.until.getTime() : null,
      new Date(activeSuspensions[0].latest_until).getTime(),
      "la lógica devuelve el vencimiento más lejano entre suspensiones vigentes",
    );
    await sql`UPDATE customer_suspensions SET starts_at = now() - interval '2 months', suspended_until = now() - interval '1 second' WHERE customer_id = ${thirdId!}`;
    const afterAllSuspensions = await createBooking(thirdId!, DateTime.fromISO(monday, { zone: businessZone }).plus({ days: 35 }).toISODate()!, "12:30", serviceId);
    assert.equal(typeof afterAllSuspensions, "string", "cuando vencen todas las suspensiones el cliente puede reservar");
    if (typeof afterAllSuspensions === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${afterAllSuspensions}`;

    const results = await Promise.allSettled([
      createBooking(firstId!, monday, "14:30", serviceId),
      createBooking(secondId!, monday, "14:30", serviceId),
    ]);
    const accepted = results.filter((result) => result.status === "fulfilled" && result.value !== null);
    assert.equal(accepted.length, 1, "solo una reserva del mismo slot puede confirmarse");
    assert.deepEqual((await availableSlots(monday, serviceId)).slots.map((item) => item.time), ["12:30", "16:00", "17:30"]);
    const winnerIndex = results.findIndex((result) => result.status === "fulfilled" && typeof result.value === "string");
    const availableCustomerId = winnerIndex === 0 ? secondId! : firstId!;
    const availableSlotBooking = await createBooking(availableCustomerId, monday, "16:00", serviceId);
    assert.equal(typeof availableSlotBooking, "string");
    if (typeof availableSlotBooking === "string") await sql`UPDATE bookings SET status = 'CANCELLED' WHERE id = ${availableSlotBooking}`;
    await sql`UPDATE bookings SET status = 'CANCELLED' WHERE customer_id IN (${firstId!}, ${secondId!})`;
    assert.ok((await availableSlots(monday, serviceId)).slots.some((item) => item.time === "14:30"));

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
    assert.ok(await cancelCustomerBooking(firstId!, syncId));
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
    if (firstId || secondId || thirdId) {
      const first = firstId || "00000000-0000-0000-0000-000000000000";
      const second = secondId || "00000000-0000-0000-0000-000000000000";
      const third = thirdId || "00000000-0000-0000-0000-000000000000";
      await sql`DELETE FROM reviews WHERE customer_id IN (${first}, ${second}, ${third})`;
      await sql`DELETE FROM customer_no_shows WHERE customer_id IN (${first}, ${second}, ${third})`;
      await sql`DELETE FROM bookings WHERE customer_id IN (${first}, ${second}, ${third})`;
      await sql`DELETE FROM customer_suspensions WHERE customer_id IN (${first}, ${second}, ${third})`;
      await sql`DELETE FROM google_calendar_connections WHERE owner_id IN (${first}, ${second}, ${third})`;
      await sql`DELETE FROM users WHERE id IN (${first}, ${second}, ${third})`;
    }
    await sql`DELETE FROM pending_users WHERE email IN (${email}, ${secondEmail}, ${thirdEmail}, ${expiredEmail})`;
  }
});

test("PostgreSQL: migración 007 backfillea inasistencias y suspensiones históricas", { skip: !process.env.DATABASE_URL && "DATABASE_URL no configurada" }, async () => {
  const sql = db();
  const migrationName = "007_customer_no_shows_and_suspensions.sql";
  const migration = await readFile(new URL("../../db/migrations/007_customer_no_shows_and_suspensions.sql", import.meta.url), "utf8");
  const schemaName = `test_migration_007_${randomToken().replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;

  await sql.unsafe(`CREATE SCHEMA "${schemaName}"`);
  try {
    await sql.begin(async (transaction) => {
      await transaction`SELECT set_config('search_path', ${schemaName}, true)`;
      await transaction`CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
      await transaction`CREATE TABLE users (id uuid PRIMARY KEY)`;
      await transaction`CREATE TABLE services (id uuid PRIMARY KEY)`;
      await transaction`CREATE TABLE bookings (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES users(id),
        service_id uuid NOT NULL REFERENCES services(id),
        starts_at timestamptz NOT NULL,
        ends_at timestamptz NOT NULL,
        status text NOT NULL,
        updated_at timestamptz NOT NULL
      )`;
      await transaction`CREATE TABLE booking_events (
        id bigserial PRIMARY KEY,
        booking_id uuid NOT NULL REFERENCES bookings(id),
        event text NOT NULL,
        created_at timestamptz NOT NULL
      )`;

      const customerId = randomUUID();
      const serviceId = randomUUID();
      const eventDates = Array.from({ length: 10 }, (_, index) => new Date(Date.UTC(2024, 0, 1 + index, 15)));
      await transaction`INSERT INTO users (id) VALUES (${customerId})`;
      await transaction`INSERT INTO services (id) VALUES (${serviceId})`;
      for (const recordedAt of eventDates) {
        const bookingId = randomUUID();
        await transaction`
          INSERT INTO bookings (id, customer_id, service_id, starts_at, ends_at, status, updated_at)
          VALUES (${bookingId}, ${customerId}, ${serviceId}, ${recordedAt}, ${new Date(recordedAt.getTime() + 90 * 60 * 1000)}, 'NO_SHOW', ${recordedAt})
        `;
        await transaction`
          INSERT INTO booking_events (booking_id, event, created_at)
          VALUES (${bookingId}, 'NO_SHOW', ${recordedAt})
        `;
      }

      const existingTables = await transaction`SELECT to_regclass('customer_no_shows') AS no_shows, to_regclass('customer_suspensions') AS suspensions`;
      assert.equal(existingTables[0].no_shows, null);
      assert.equal(existingTables[0].suspensions, null);

      async function applyMigrationIfPending() {
        const existing = await transaction`SELECT name FROM schema_migrations WHERE name = ${migrationName}`;
        if (existing.length) return false;
        await transaction.unsafe(migration);
        await transaction`INSERT INTO schema_migrations (name) VALUES (${migrationName})`;
        return true;
      }

      assert.equal(await applyMigrationIfPending(), true);
      const noShows = await transaction`
        SELECT count(*)::int AS count, count(DISTINCT booking_id)::int AS unique_count
        FROM customer_no_shows WHERE customer_id = ${customerId}
      `;
      assert.equal(noShows[0].count, 10);
      assert.equal(noShows[0].unique_count, 10);

      const suspensions = await transaction`
        SELECT no_show_count, starts_at, suspended_until,
          suspended_until = starts_at + interval '3 months' AS exact_duration
        FROM customer_suspensions WHERE customer_id = ${customerId}
        ORDER BY no_show_count
      `;
      assert.equal(suspensions.length, 2);
      assert.deepEqual(suspensions.map((item) => Number(item.no_show_count)), [5, 10]);
      for (const [index, noShowCount] of [5, 10].entries()) {
        const expectedStart = eventDates[noShowCount - 1];
        assert.equal(new Date(suspensions[index].starts_at).toISOString(), expectedStart.toISOString());
        assert.equal(suspensions[index].exact_duration, true);
      }

      assert.equal(await applyMigrationIfPending(), false, "el runner omite la migración ya registrada");
      const noShowsAfterSecondRun = await transaction`SELECT count(*)::int AS count FROM customer_no_shows WHERE customer_id = ${customerId}`;
      const suspensionsAfterSecondRun = await transaction`SELECT count(*)::int AS count FROM customer_suspensions WHERE customer_id = ${customerId}`;
      assert.equal(noShowsAfterSecondRun[0].count, 10);
      assert.equal(suspensionsAfterSecondRun[0].count, 2);
    });
  } finally {
    await sql.unsafe(`DROP SCHEMA "${schemaName}" CASCADE`);
  }
});