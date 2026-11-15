"use client";

import type { ReactNode } from "react";
import { Download, X } from "lucide-react";

export type DataTableSelectionAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  variant?: "default" | "destructive";
  singleOnly?: boolean;
  onClick: (selectedIds: string[]) => void;
};

type Props = {
  selectedIds: string[];
  actions?: DataTableSelectionAction[];
  canExport?: boolean;
  onExport?: () => void;
  onClear: () => void;
  children?: ReactNode;
};

export function DataTableSelectionToolbar({
  selectedIds,
  actions = [],
  canExport = false,
  onExport,
  onClear,
  children,
}: Props) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-primary/5 px-4 py-2.5 sm:px-5">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
          {selectedIds.length} selected
        </span>

        <button
          type="button"
          onClick={onClear}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          aria-label="Clear selection"
          title="Clear selection"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {canExport && onExport && (
          <button
            type="button"
            onClick={onExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-muted cursor-pointer"
          >
            <Download className="size-3.5" />
            Export Selected
          </button>
        )}

        {children}

        {actions.map((action) => {
          const disabled = action.singleOnly && selectedIds.length !== 1;

          return (
            <button
              key={action.key}
              type="button"
              disabled={disabled}
              onClick={() => action.onClick(selectedIds)}
              className={[
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                action.variant === "destructive"
                  ? "border-destructive/30 bg-background text-destructive hover:bg-destructive/10"
                  : "border-input bg-background hover:bg-muted",
              ].join(" ")}
            >
              {action.icon}
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
