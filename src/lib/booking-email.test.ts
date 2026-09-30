import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingAdminNotificationRecipients, notifyBooking, notifyBookingAdmins } from "./booking";

type SentEmail = { to: string; subject: string; text: string };

async function captureEmails(run: (sent: SentEmail[]) => Promise<void>) {
  const previousFetch = globalThis.fetch;
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  const previousResendKey = process.env.RESEND_API_KEY;
  const previousEmailFrom = process.env.EMAIL_FROM;
  const sent: SentEmail[] = [];
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.EMAIL_FROM = "L’Italia Barber <test@example.test>";
  globalThis.fetch = async (_input, init) => {
    sent.push(JSON.parse(String(init?.body)) as SentEmail);
    return new Response(JSON.stringify({ id: "mock-email" }), { status: 200 });
  };
  try {
    await run(sent);
    return sent;
  } finally {
    globalThis.fetch = previousFetch;
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
    if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousResendKey;
    if (previousEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = previousEmailFrom;
  }
}

test("reserva confirmada notifica cliente, ADMIN configurado y Alexis", async () => {
  process.env.ADMIN_EMAIL = "admin@example.test";
  const sent = await captureEmails(async () => {
    const subject = "Reserva confirmada - L’Italia Barber";
    const text = "Tu turno está confirmado";
    await notifyBooking("cliente@example.test", subject, text);
    await notifyBookingAdmins(subject, text);
  });
  assert.deepEqual(sent.map((email) => email.to), ["cliente@example.test", "admin@example.test", "piersantialexis@gmail.com"]);
  assert.ok(sent.every((email) => email.subject === "Reserva confirmada - L’Italia Barber"));
});

test("reserva cancelada notifica cliente, ADMIN configurado y Alexis", async () => {
  process.env.ADMIN_EMAIL = "admin@example.test";
  const sent = await captureEmails(async () => {
    const subject = "Reserva cancelada - L’Italia Barber";
    const text = "Tu reserva fue cancelada";
    await notifyBooking("cliente@example.test", subject, text);
    await notifyBookingAdmins(subject, text);
  });
  assert.deepEqual(sent.map((email) => email.to), ["cliente@example.test", "admin@example.test", "piersantialexis@gmail.com"]);
  assert.ok(sent.every((email) => email.subject === "Reserva cancelada - L’Italia Barber"));
});

test("destinatario ADMIN se deduplica si coincide con Alexis", async () => {
  assert.deepEqual(bookingAdminNotificationRecipients(" PiersantiAlexis@gmail.com "), ["piersantialexis@gmail.com"]);
  process.env.ADMIN_EMAIL = "PIERSANTIALEXIS@gmail.com";
  const sent = await captureEmails(async () => notifyBookingAdmins("Reserva", "Notificación de reserva"));
  assert.deepEqual(sent.map((email) => email.to), ["piersantialexis@gmail.com"]);
});
