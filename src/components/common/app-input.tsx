"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AppInputProps = React.ComponentProps<typeof Input>;

const inputStyles =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-none outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

export function AppInput({ className, ...props }: AppInputProps) {
  return <Input {...props} className={cn(inputStyles, className)} />;
}
