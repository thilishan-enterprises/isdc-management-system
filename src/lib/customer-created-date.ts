const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

function parseCalendarDate(value: string | undefined): CalendarDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const validationDate = new Date(Date.UTC(year, month - 1, day));

  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function calendarDateValue(date: CalendarDate) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

export function getSriLankaCreatedAtRange(
  startValue: string | undefined,
  endValue: string | undefined,
) {
  const start = parseCalendarDate(startValue);
  const end = endValue ? parseCalendarDate(endValue) : start;

  if (!start || !end || calendarDateValue(end) < calendarDateValue(start)) {
    return undefined;
  }

  return {
    gte: new Date(calendarDateValue(start) - SRI_LANKA_OFFSET_MS),
    lt: new Date(
      Date.UTC(end.year, end.month - 1, end.day + 1) -
        SRI_LANKA_OFFSET_MS,
    ),
  };
}
