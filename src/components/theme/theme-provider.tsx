"use client";

import type { ComponentProps } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

type AppThemeProviderProps = ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: AppThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
