"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="top-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      richColors
      closeButton
      duration={4000}
      visibleToasts={4}
      gap={10}
      offset={20}
      toastOptions={{
        className: "font-sans",
        style: {
          borderRadius: "12px",
          padding: "14px 16px",
          boxShadow: "0 8px 30px rgba(0,0,0,0.10)",
        },
      }}
    />
  );
}
