"use client";

import { Label } from "@/components/ui/label";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
};

export function FormField({
  label,
  htmlFor,
  required = false,
  description,
  error,
  children,
}: FormFieldProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-foreground/85"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      {children}

      {description && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {description}
        </p>
      )}

      {error && (
        <p className="text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
