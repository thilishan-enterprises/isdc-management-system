"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type PageStatsProps = {
  children?: ReactNode;
  defaultVisible?: boolean;
  showToggle?: boolean;
  columns?: 2 | 3 | 4;
};

export function PageStats({
  children,
  defaultVisible = true,
  showToggle = true,
  columns = 4,
}: PageStatsProps) {
  const [visible, setVisible] = useState(defaultVisible);

  if (!children) return null;

  const gridColumns = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 xl:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
  };

  return (
    <section className="space-y-1.5">
      {showToggle && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setVisible((prev) => !prev)}
            aria-label={visible ? "Hide summary cards" : "Show summary cards"}
            aria-expanded={visible}
            title={visible ? "Hide summary cards" : "Show summary cards"}
            className="inline-flex size-6 items-center justify-center rounded-md border border-border/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            {visible ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </button>
        </div>
      )}

      {visible && (
        <div className={`grid gap-3 ${gridColumns[columns]}`}>{children}</div>
      )}
    </section>
  );
}
