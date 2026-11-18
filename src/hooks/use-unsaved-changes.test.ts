import assert from "node:assert/strict";
import test from "node:test";
import { areFormValuesEqual } from "./use-unsaved-changes";

const initial = {
  name: "",
  area: "",
  active: false,
  date: new Date("2026-01-01T00:00:00.000Z"),
  tags: [] as string[],
};

test("untouched form values are clean", () => {
  assert.equal(areFormValuesEqual(initial, { ...initial }), true);
});

test("meaningful input, select, checkbox, date, and list changes are dirty", () => {
  assert.equal(areFormValuesEqual(initial, { ...initial, name: "Customer" }), false);
  assert.equal(areFormValuesEqual(initial, { ...initial, area: "North" }), false);
  assert.equal(areFormValuesEqual(initial, { ...initial, active: true }), false);
  assert.equal(
    areFormValuesEqual(initial, {
      ...initial,
      date: new Date("2026-01-02T00:00:00.000Z"),
    }),
    false,
  );
  assert.equal(areFormValuesEqual(initial, { ...initial, tags: ["priority"] }), false);
});

test("restoring every value to its initial state clears dirty state", () => {
  const restored = {
    name: "",
    area: "",
    active: false,
    date: new Date("2026-01-01T00:00:00.000Z"),
    tags: [] as string[],
  };
  assert.equal(areFormValuesEqual(initial, restored), true);
});

test("validation and submission metadata do not affect controlled form values", () => {
  const valuesAfterValidationFailure = { ...initial, name: "Customer" };
  assert.equal(
    areFormValuesEqual(valuesAfterValidationFailure, {
      ...initial,
      name: "Customer",
    }),
    true,
  );
  assert.equal(areFormValuesEqual(initial, valuesAfterValidationFailure), false);
});
