"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * App-wide theme provider (next-themes, `class` strategy). Defaults to the OS
 * preference and persists the choice; the root <html> carries
 * suppressHydrationWarning so the pre-paint class swap never flashes (docs/UI.md).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
