"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export function AppSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select an option",
  name,
  disabled = false,
  required = false,
  className,
}: AppSelectProps) {
  const selectedValue = value ?? defaultValue;

  const selectedOption = options.find(
    (option) => option.value === selectedValue,
  );

  return (
    <Select
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange?.(nextValue);
        }
      }}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        className={`h-9 w-full cursor-pointer rounded-lg border-border/80 bg-background px-3 text-sm shadow-none transition-all hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/20 ${className ?? ""}`}
      >
        <SelectValue placeholder={placeholder}>
          {selectedOption?.label ?? placeholder}
        </SelectValue>
      </SelectTrigger>

      <SelectContent className="max-h-72 rounded-xl border-border/80 p-1 shadow-lg">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="cursor-pointer rounded-md py-2 text-sm"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
