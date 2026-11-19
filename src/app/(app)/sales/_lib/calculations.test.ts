import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLineTotalCents,
  calculateSaleTotalCents,
  createInstallmentPlan,
  parseIsoDate,
  parseMoneyToCents,
} from "./calculations";

function date(value: string) {
  const parsed = parseIsoDate(value);
  assert.ok(parsed);
  return parsed;
}

function plan(input: {
  totalCents: number;
  advanceCents?: number;
  monthlyCents: number;
  saleDate?: string;
  firstInstallmentDate?: string;
}) {
  return createInstallmentPlan({
    totalCents: input.totalCents,
    advanceCents: input.advanceCents ?? 0,
    monthlyCents: input.monthlyCents,
    saleDate: date(input.saleDate ?? "2026-01-15"),
    firstInstallmentDate: date(
      input.firstInstallmentDate ?? "2026-02-15",
    ),
  });
}

test("creates a standard monthly installment schedule", () => {
  const result = plan({
    totalCents: 10_500_000,
    advanceCents: 1_000_000,
    monthlyCents: 2_000_000,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.plan.balanceCents, 9_500_000);
  assert.deepEqual(
    result.plan.installments.map((entry) => entry.amountCents),
    [2_000_000, 2_000_000, 2_000_000, 2_000_000, 1_500_000],
  );
});

test("exact division does not create an extra final installment", () => {
  const result = plan({ totalCents: 9_000_000, monthlyCents: 3_000_000 });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.plan.installments.map((entry) => entry.amountCents),
    [3_000_000, 3_000_000, 3_000_000],
  );
});

test("uses the exact remaining cents for a smaller final installment", () => {
  const result = plan({ totalCents: 5_001, monthlyCents: 2_000 });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.plan.installments.map((entry) => entry.amountCents),
    [2_000, 2_000, 1_001],
  );
});

test("supports a zero advance without changing the sale balance", () => {
  const result = plan({
    totalCents: 100_000,
    advanceCents: 0,
    monthlyCents: 25_000,
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.plan.balanceCents, 100_000);
  assert.equal(result.plan.installments.length, 4);
});

test("full advance creates a paid-up plan without installments", () => {
  const result = plan({
    totalCents: 100_000,
    advanceCents: 100_000,
    monthlyCents: 0,
    saleDate: "2026-02-01",
    firstInstallmentDate: "2026-01-01",
  });

  assert.deepEqual(result, {
    success: true,
    plan: { balanceCents: 0, installments: [] },
  });
});

test("rejects an advance exceeding the sale total", () => {
  assert.deepEqual(
    plan({
      totalCents: 100_000,
      advanceCents: 100_001,
      monthlyCents: 10_000,
    }),
    { success: false, error: "amount" },
  );
});

test("rejects zero monthly amounts and invalid money input", () => {
  assert.deepEqual(plan({ totalCents: 100_000, monthlyCents: 0 }), {
    success: false,
    error: "installment",
  });
  assert.equal(parseMoneyToCents("-1"), null);
  assert.equal(parseMoneyToCents("10.001"), null);
  assert.equal(parseMoneyToCents("not-money"), null);
});

test("rejects a first installment date earlier than the sale date", () => {
  assert.deepEqual(
    plan({
      totalCents: 100_000,
      monthlyCents: 10_000,
      saleDate: "2026-02-10",
      firstInstallmentDate: "2026-02-09",
    }),
    { success: false, error: "installment" },
  );
});

test("clamps month-end dates and respects leap years", () => {
  const result = plan({
    totalCents: 4_000,
    monthlyCents: 1_000,
    saleDate: "2024-01-01",
    firstInstallmentDate: "2024-01-31",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.plan.installments.map((entry) =>
      entry.dueDate.toISOString().slice(0, 10),
    ),
    ["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"],
  );
});

test("enforces the 1,200-installment limit", () => {
  assert.equal(
    plan({ totalCents: 1_200, monthlyCents: 1 }).success,
    true,
  );
  assert.deepEqual(plan({ totalCents: 1_201, monthlyCents: 1 }), {
    success: false,
    error: "installment",
  });
});

test("totals multiple products and quantities using integer cents", () => {
  const television = calculateLineTotalCents(
    parseMoneyToCents("19999.99") ?? 0,
    2,
  );
  const fan = calculateLineTotalCents(
    parseMoneyToCents("2500.50") ?? 0,
    3,
  );

  assert.equal(television, 3_999_998);
  assert.equal(fan, 750_150);
  assert.equal(calculateSaleTotalCents([television, fan]), 4_750_148);
  assert.equal(calculateLineTotalCents(999_999_999_999, 2), null);
  assert.equal(calculateSaleTotalCents([999_999_999_999, 1]), null);
});
