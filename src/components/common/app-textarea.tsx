"use client";

import { cn } from "@/lib/utils";

type AppTextareaProps = React.ComponentProps<"textarea">;

const textareaStyles =
  "min-h-20 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

export function AppTextarea({ className, ...props }: AppTextareaProps) {
  return <textarea {...props} className={cn(textareaStyles, className)} />;
}
