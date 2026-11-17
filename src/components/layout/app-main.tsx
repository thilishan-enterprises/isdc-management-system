"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const usesTableWorkspace =
    pathname === "/customers" || pathname === "/customers/import/history";
  const usesImportWorkspace = pathname === "/customers/import";

  return (
    <main
      className={[
        "flex flex-1 flex-col px-4 pt-4 pb-4 md:px-6 md:pt-6 md:pb-6",
        usesTableWorkspace
          ? "min-h-0 overflow-hidden"
          : usesImportWorkspace
            ? "md:min-h-0 md:overflow-hidden"
            : "",
      ].join(" ")}
    >
      {children}
    </main>
  );
}
