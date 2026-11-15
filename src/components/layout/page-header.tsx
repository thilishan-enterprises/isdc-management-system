import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  count?: number;
  countLabel?: string;
  actions?: ReactNode;
  compact?: boolean;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  count,
  countLabel = "records",
  actions,
  compact = false,
}: PageHeaderProps) {
  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center justify-between gap-3"
          : "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      }
    >
      <div
        className={
          compact ? "flex min-w-0 items-center gap-3" : "min-w-0 space-y-1.5"
        }
      >
        <div
          className={
            compact ? "flex min-w-0 items-center gap-3" : "space-y-1.5"
          }
        >
          {eyebrow && !compact && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
          )}

          <h1
            className={
              compact
                ? "text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
                : "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            }
          >
            {title}
          </h1>

          {typeof count === "number" && (
            <span className="inline-flex shrink-0 items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {count.toLocaleString("en-LK")} {countLabel}
            </span>
          )}

          {description && !compact && (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
