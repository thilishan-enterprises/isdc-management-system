import assert from "node:assert/strict";
import test from "node:test";
import { shouldCloseAppSelectOnScroll } from "./app-select-scroll";

test("closes AppSelect on the first page or ancestor scroll event", () => {
  assert.equal(shouldCloseAppSelectOnScroll(false), true);
});

test("keeps AppSelect open while its own option list scrolls", () => {
  assert.equal(shouldCloseAppSelectOnScroll(true), false);
});
