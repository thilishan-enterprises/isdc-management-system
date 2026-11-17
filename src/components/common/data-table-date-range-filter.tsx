"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type DataTableDateRangeFilterProps = {
  label: string;
  startValue: string;
  endValue: string;
  onApply: (startValue: string, endValue: string) => void;
  onClear: () => void;
};

function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

function formatParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRange(startValue: string, endValue: string): DateRange | undefined {
  const from = parseDate(startValue);
  if (!from) return undefined;

  const to = parseDate(endValue);
  if (!endValue) return { from };

  return to && to >= from ? { from, to } : undefined;
}

export function DataTableDateRangeFilter({
  label,
  startValue,
  endValue,
  onApply,
  onClear,
}: DataTableDateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() =>
    getRange(startValue, endValue),
  );
  const selectedRange = getRange(startValue, endValue);

  const triggerLabel = selectedRange?.from
    ? selectedRange.to
      ? `${format(selectedRange.from, "dd MMM yyyy")} – ${format(selectedRange.to, "dd MMM yyyy")}`
      : format(selectedRange.from, "dd MMM yyyy")
    : "Select Date";

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setDraftRange(selectedRange);
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 rounded-lg bg-background px-3 font-normal shadow-none sm:w-auto sm:max-w-[260px]"
            aria-label={`${label}: ${triggerLabel}`}
          />
        }
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{triggerLabel}</span>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-1.5rem)] gap-0 overflow-x-auto rounded-xl border-border/80 p-0 shadow-xl"
      >
        <div className="border-b border-border/70 px-3 py-2.5">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            Select a specific date or a date range
          </p>
        </div>

        <Calendar
          mode="range"
          selected={draftRange}
          onSelect={setDraftRange}
          className="p-2"
        />

        <div className="flex items-center justify-between gap-2 border-t border-border/70 p-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraftRange(undefined);
              onClear();
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!draftRange?.from}
            onClick={() => {
              if (!draftRange?.from) return;

              onApply(
                formatParam(draftRange.from),
                draftRange.to ? formatParam(draftRange.to) : "",
              );
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
