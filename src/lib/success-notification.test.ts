import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyAfterSuccess } from "./success-notification";

test("notifyAfterSuccess emits the reservation success copy only after success", async () => {
  const messages: string[] = [];
  const result = await notifyAfterSuccess(Promise.resolve({ id: "booking-1" }), () => messages.push("Turno reservado"));
  assert.equal(result.id, "booking-1");
  assert.deepEqual(messages, ["Turno reservado"]);
});

test("notifyAfterSuccess emits the cancellation success copy only after success", async () => {
  const messages: string[] = [];
  await notifyAfterSuccess(Promise.resolve({ status: "CANCELLED" }), () => messages.push("Turno cancelado"));
  assert.deepEqual(messages, ["Turno cancelado"]);
});

test("notifyAfterSuccess does not emit a success message when the operation fails", async () => {
  const messages: string[] = [];
  await assert.rejects(notifyAfterSuccess(Promise.reject(new Error("API error")), () => messages.push("Turno reservado")), /API error/);
  assert.deepEqual(messages, []);
});
