import { DateTime } from "luxon";
import { db } from "./db";
import { decrypt, encrypt } from "./security";

export const businessZone = "America/Argentina/Buenos_Aires";

function config() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) throw new Error("OAuth Google no configurado");
  return { clientId, clientSecret, redirectUri };
}

export function googleAuthorizationUrl(state: string) {
  const { clientId, redirectUri } = config();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string) {
  const { clientId, clientSecret, redirectUri } = config();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Google OAuth: ${response.status}`);
  const tokens = await response.json() as { refresh_token?: string };
  if (!tokens.refresh_token) throw new Error("Google no devolvió refresh token");
  return encrypt(tokens.refresh_token);
}

export async function connectedCalendar() {
  const rows = await db()`SELECT calendar_id, refresh_token_encrypted FROM google_calendar_connections WHERE id = 1`;
  return rows[0] as { calendar_id: string; refresh_token_encrypted: string } | undefined;
}

export async function googleCalendars() {
  const connection = await connectedCalendar();
  if (!connection) return [];
  const response = await calendarRequest("users/me/calendarList", connection, { method: "GET" });
  if (!response.ok) throw new Error(`Google calendarList: ${response.status}`);
  const data = await response.json() as { items: { id: string; summary: string; accessRole: string }[] };
  return data.items.filter((item) => item.accessRole === "owner" || item.accessRole === "writer").map(({ id, summary }) => ({ id, summary }));
}

async function accessToken(refreshTokenEncrypted: string) {
  const { clientId, clientSecret } = config();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: decrypt(refreshTokenEncrypted), grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Google token: ${response.status}`);
  const data = await response.json() as { access_token: string };
  return data.access_token;
}

async function calendarRequest(path: string, connection: NonNullable<Awaited<ReturnType<typeof connectedCalendar>>>, init: RequestInit) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(connection.refresh_token_encrypted)}`, "Content-Type": "application/json" },
  });
  return response;
}

export async function googleBusy(start: DateTime, end: DateTime) {
  const connection = await connectedCalendar();
  if (!connection) return [];
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(connection.refresh_token_encrypted)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: start.toISO(), timeMax: end.toISO(), items: [{ id: connection.calendar_id }] }),
  });
  if (!response.ok) throw new Error(`Google freeBusy: ${response.status}`);
  const data = await response.json() as { calendars: Record<string, { busy: { start: string; end: string }[]; errors?: unknown[] }> };
  const calendar = data.calendars[connection.calendar_id];
  if (!calendar || calendar.errors?.length) throw new Error("Google Calendar no disponible");
  return calendar.busy.map((item) => ({ start: new Date(item.start), end: new Date(item.end) }));
}

export function calendarEventId(bookingId: string) {
  return `li${bookingId.replaceAll("-", "")}`;
}

export async function createCalendarEvent(booking: {
  id: string; starts_at: Date; ends_at: Date; service_name: string;
  first_name: string; last_name: string; phone: string;
}) {
  const connection = await connectedCalendar();
  if (!connection) return null;
  const eventId = calendarEventId(booking.id);
  const response = await calendarRequest(`calendars/${encodeURIComponent(connection.calendar_id)}/events`, connection, {
    method: "POST",
    body: JSON.stringify({
      id: eventId,
      summary: `${booking.service_name} - ${booking.first_name} ${booking.last_name}`,
      description: `Reserva ${booking.id}\nContacto: ${booking.phone}`,
      start: { dateTime: booking.starts_at.toISOString(), timeZone: businessZone },
      end: { dateTime: booking.ends_at.toISOString(), timeZone: businessZone },
    }),
  });
  if (response.status === 409) return eventId;
  if (!response.ok) throw new Error(`Google create event: ${response.status}`);
  return eventId;
}

export async function deleteCalendarEvent(eventId: string) {
  const connection = await connectedCalendar();
  if (!connection) throw new Error("Google Calendar desconectado");
  const response = await calendarRequest(`calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(eventId)}`, connection, { method: "DELETE" });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google delete event: ${response.status}`);
}