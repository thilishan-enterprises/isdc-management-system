import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-screen-2xl flex-col gap-6 pb-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
