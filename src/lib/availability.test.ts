import { test } from "node:test";
import assert from "node:assert/strict";
import { getAvailableSlots, overlaps, toMinutes, toTime } from "./availability";

const hours = [{ start: toMinutes("10:30"), end: toMinutes("16:30"), slotMinutes: 90 }];

test("cuatro turnos iniciales de lunes a sábado", () => {
  assert.deepEqual(getAvailableSlots(hours, 90, []).map((slot) => toTime(slot.start)), ["10:30", "12:00", "13:30", "15:00"]);
});

test("domingo cerrado y excepción de día completo", () => {
  assert.deepEqual(getAvailableSlots([], 90, []), []);
  assert.deepEqual(getAvailableSlots(hours, 90, [{ start: 0, end: 1440 }]), []);
});

test("el slot de 12:00 ocupado desaparece sin afectar los demás", () => {
  assert.deepEqual(getAvailableSlots(hours, 90, [{ start: 720, end: 810 }]).map((slot) => toTime(slot.start)), ["10:30", "13:30", "15:00"]);
});

test("rechaza períodos que se solapan y permite límites contiguos", () => {
  assert.equal(overlaps({ start: 630, end: 720 }, { start: 719, end: 810 }), true);
  assert.equal(overlaps({ start: 630, end: 720 }, { start: 720, end: 810 }), false);
  assert.deepEqual(getAvailableSlots(hours, 120, []).map((slot) => toTime(slot.start)), ["10:30", "12:30", "14:30"]);
});

test("ventanas especiales superpuestas no duplican ni solapan slots", () => {
  const overlappingWindows = [
    { start: 630, end: 810, slotMinutes: 90 },
    { start: 675, end: 855, slotMinutes: 90 },
  ];
  const slots = getAvailableSlots(overlappingWindows, 90, []);
  assert.deepEqual(slots.map((slot) => toTime(slot.start)), ["10:30", "12:00"]);
});

test("fecha actual elimina slots pasados y horarios inválidos no se aceptan", () => {
  assert.deepEqual(getAvailableSlots(hours, 90, [], 730).map((slot) => toTime(slot.start)), ["13:30", "15:00"]);
  assert.throws(() => toMinutes("25:00"));
  assert.throws(() => getAvailableSlots(hours, 0, []));
});