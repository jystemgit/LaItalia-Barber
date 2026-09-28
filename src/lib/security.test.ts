import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt, encrypt, hashToken, normalizedEmail, randomToken, sameOrigin } from "./security";
import { calendarEventId, googleAuthorizationUrl } from "./calendar";
import { customerCancellationAuthorizationError } from "../app/api/bookings/[id]/route";

test("tokens aleatorios, hash y cifrado autenticado", () => {
  process.env.AUTH_SECRET = "local-test-secret-with-at-least-32-characters";
  const first = randomToken();
  const second = randomToken();
  assert.notEqual(first, second);
  assert.notEqual(hashToken(first), first);
  assert.equal(decrypt(encrypt(first)), first);
  assert.throws(() => decrypt(encrypt(first).slice(0, -5)));
});

test("email normalizado, origen protegido y evento idempotente", () => {
  assert.equal(normalizedEmail("  Persona@Ejemplo.com  "), "persona@ejemplo.com");
  assert.equal(sameOrigin(new Request("https://sitio.example/api", { headers: { origin: "https://sitio.example", host: "sitio.example" } })), true);
  assert.equal(sameOrigin(new Request("https://sitio.example/api", { headers: { origin: "https://otro.example", host: "sitio.example" } })), false);
  assert.equal(calendarEventId("11111111-1111-4111-8111-111111111111"), calendarEventId("11111111-1111-4111-8111-111111111111"));
});

test("OAuth Google solicita permisos y usa state de un solo uso", () => {
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  process.env.GOOGLE_REDIRECT_URI = "https://sitio.example/api/admin/google/callback";
  const url = new URL(googleAuthorizationUrl("random-state"));
  assert.equal(url.searchParams.get("state"), "random-state");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.match(url.searchParams.get("scope") || "", /calendar.events/);
});

test("ADMIN no puede usar la autorización del endpoint de cancelación CUSTOMER", () => {
  const adminError = customerCancellationAuthorizationError("ADMIN");
  assert.ok(adminError);
  assert.equal(adminError.status, 403);
  assert.equal(customerCancellationAuthorizationError("CUSTOMER"), null);
});