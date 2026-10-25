import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ContentSectionProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ContentSection({
  children,
  title,
  description,
  actions,
  className,
  contentClassName,
}: ContentSectionProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section className={cn("min-w-0 space-y-4", className)}>
      {hasHeader ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}

            {description ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}
