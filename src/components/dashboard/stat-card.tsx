import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  className?: string;
};

export function StatCard({
  title,
  value,
  description,
  icon,
  className,
}: StatCardProps) {
  return (
    <Card className={cn("min-w-0 gap-0 py-0", className)}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>

          <p className="break-words text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
            {value}
          </p>

          {description ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>

        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground"
          aria-hidden="true"
        >
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}
