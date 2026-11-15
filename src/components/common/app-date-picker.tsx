"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type AppDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
};

function parseDate(value: string): Date | undefined {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return undefined;

  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}

export function AppDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  name,
  disabled = false,
  className,
}: AppDatePickerProps) {
  const selectedDate = parseDate(value);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}

      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "h-9 w-full justify-between rounded-lg border-border/80 bg-background px-3 text-left text-sm font-normal shadow-none transition-all hover:bg-muted/30",
                !selectedDate && "text-muted-foreground",
                className,
              )}
            >
              <span>
                {selectedDate
                  ? format(selectedDate, "dd MMM yyyy")
                  : placeholder}
              </span>

              <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          }
        />

        <PopoverContent
          align="start"
          className="w-auto rounded-xl border-border/80 p-2 shadow-xl"
        >
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;

              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");

              onChange(`${year}-${month}-${day}`);
            }}
            className="p-2"
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
