"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";

type AppHeaderDetailsValue = {
  pathname: string;
  title?: string;
  subtitle?: string;
  count?: number;
  countLabel?: string;
};

const AppHeaderDetailsContext = createContext<{
  details: AppHeaderDetailsValue | null;
  setDetails: Dispatch<SetStateAction<AppHeaderDetailsValue | null>>;
} | null>(null);

export function AppHeaderDetailsProvider({ children }: { children: ReactNode }) {
  const [details, setDetails] = useState<AppHeaderDetailsValue | null>(null);
  const value = useMemo(() => ({ details, setDetails }), [details]);

  return (
    <AppHeaderDetailsContext.Provider value={value}>
      {children}
    </AppHeaderDetailsContext.Provider>
  );
}

export function AppHeaderDetails({
  title,
  subtitle,
  count,
  countLabel,
}: Omit<AppHeaderDetailsValue, "pathname">) {
  const pathname = usePathname();
  const context = useContext(AppHeaderDetailsContext);

  if (!context) {
    throw new Error(
      "AppHeaderDetails must be used within AppHeaderDetailsProvider.",
    );
  }

  const { setDetails } = context;

  useLayoutEffect(() => {
    setDetails({ pathname, title, subtitle, count, countLabel });

    return () => {
      setDetails((current) =>
        current?.pathname === pathname ? null : current,
      );
    };
  }, [pathname, title, subtitle, count, countLabel, setDetails]);

  return null;
}

export function useAppHeaderDetails(pathname: string) {
  const context = useContext(AppHeaderDetailsContext);

  if (!context) {
    throw new Error(
      "useAppHeaderDetails must be used within AppHeaderDetailsProvider.",
    );
  }

  return context.details?.pathname === pathname ? context.details : null;
}
