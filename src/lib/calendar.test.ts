import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarEventId } from "./calendar";

test("el ID de evento es estable e independiente de retries", () => {
  const id = "9f9d75b0-4aa0-4fa8-8095-bb977ba99a3b";
  assert.equal(calendarEventId(id), "li9f9d75b04aa04fa88095bb977ba99a3b");
  assert.equal(calendarEventId(id), calendarEventId(id));
});