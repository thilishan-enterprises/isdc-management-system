import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  className?: string;
  tone?: "blue" | "violet" | "emerald" | "amber" | "rose";
};

const toneStyles = {
  blue: {
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    accent: "bg-blue-500",
    background: "bg-blue-50/35 dark:bg-card",
  },
  violet: {
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    accent: "bg-violet-500",
    background: "bg-violet-50/35 dark:bg-card",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    accent: "bg-emerald-500",
    background: "bg-emerald-50/35 dark:bg-card",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500",
    background: "bg-amber-50/35 dark:bg-card",
  },
  rose: {
    icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    accent: "bg-rose-500",
    background: "bg-rose-50/25 dark:bg-card",
  },
};

export function StatCard({
  title,
  value,
  description,
  icon,
  className,
  tone = "blue",
}: StatCardProps) {
  const styles = toneStyles[tone];

  return (
    <Card
      className={cn(
        "group relative min-w-0 gap-0 overflow-hidden border-border/70 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        styles.background,
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-[3px] opacity-80",
          styles.accent,
        )}
      />

      <CardContent className="flex min-w-0 items-start justify-between gap-3 p-5 sm:p-5">
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-[13px] font-medium text-muted-foreground">
            {title}
          </p>

          <p className="whitespace-nowrap text-[clamp(1.2rem,2vw,1.85rem)] font-bold leading-tight tracking-tight tabular-nums text-foreground">
            {value}
          </p>

          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
            styles.icon,
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
