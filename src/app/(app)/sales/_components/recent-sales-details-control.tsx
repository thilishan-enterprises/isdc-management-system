"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "lucide-react";

export function RecentSalesDetailsControl({
  children,
}: {
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  function toggleAll() {
    const details = containerRef.current?.querySelectorAll("details") ?? [];

    const shouldExpand = !expanded;

    details.forEach((element) => {
      element.open = shouldExpand;
    });

    setExpanded(shouldExpand);
  }

  return (
    <div ref={containerRef}>
      <div className="flex justify-end border-b border-border/60 px-4 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={toggleAll}
        >
          <ChevronsUpDown className="size-3.5" />
          {expanded ? "Collapse all details" : "Expand all details"}
        </Button>
      </div>

      {children}
    </div>
  );
}

