export const MAX_INSTALLMENT_COUNT = 1_200;
const MAX_MONEY_CENTS = 999_999_999_999;

export type InstallmentScheduleEntry = {
  installmentNumber: number;
  dueDate: Date;
  amountCents: number;
};

export type InstallmentPlan = {
  balanceCents: number;
  installments: InstallmentScheduleEntry[];
};

export type InstallmentPlanResult =
  | { success: true; plan: InstallmentPlan }
  | { success: false; error: "amount" | "installment" };

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

export function parseMoneyToCents(value: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) return null;

  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;

  const cents = Math.round(amount * 100);
  return cents <= MAX_MONEY_CENTS ? cents : null;
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function calculateLineTotalCents(
  unitPriceCents: number,
  quantity: number,
): number | null {
  const total = unitPriceCents * quantity;
  return Number.isSafeInteger(total) && total <= MAX_MONEY_CENTS ? total : null;
}

export function calculateSaleTotalCents(
  lineTotalsCents: readonly number[],
): number | null {
  let total = 0;

  for (const lineTotal of lineTotalsCents) {
    if (!Number.isSafeInteger(lineTotal) || lineTotal < 0) return null;
    total += lineTotal;
    if (!Number.isSafeInteger(total) || total > MAX_MONEY_CENTS) return null;
  }

  return total;
}

export function addMonthsUTC(date: Date, monthsToAdd: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + monthsToAdd;
  const day = date.getUTCDate();
  const targetMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      targetMonth.getUTCFullYear(),
      targetMonth.getUTCMonth(),
      Math.min(day, lastDay),
    ),
  );
}

export function createInstallmentPlan(input: {
  totalCents: number;
  advanceCents: number;
  monthlyCents: number;
  saleDate: Date;
  firstInstallmentDate: Date;
}): InstallmentPlanResult {
  const {
    totalCents,
    advanceCents,
    monthlyCents,
    saleDate,
    firstInstallmentDate,
  } = input;

  if (advanceCents > totalCents) {
    return { success: false, error: "amount" };
  }

  const balanceCents = totalCents - advanceCents;

  if (balanceCents === 0) {
    return {
      success: true,
      plan: { balanceCents, installments: [] },
    };
  }

  if (
    monthlyCents <= 0 ||
    firstInstallmentDate.getTime() < saleDate.getTime()
  ) {
    return { success: false, error: "installment" };
  }

  const installmentCount = Math.ceil(balanceCents / monthlyCents);

  if (installmentCount > MAX_INSTALLMENT_COUNT) {
    return { success: false, error: "installment" };
  }

  return {
    success: true,
    plan: {
      balanceCents,
      installments: Array.from({ length: installmentCount }, (_, index) => ({
        installmentNumber: index + 1,
        dueDate: addMonthsUTC(firstInstallmentDate, index),
        amountCents: Math.min(
          monthlyCents,
          balanceCents - index * monthlyCents,
        ),
      })),
    },
  };
}
