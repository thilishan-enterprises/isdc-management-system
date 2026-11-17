import type { ReactNode } from "react";

type PageWorkspaceProps = {
  header?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  scrollMode?: "content" | "table";
};

export function PageWorkspace({
  header,
  toolbar,
  children,
  className = "",
  scrollMode = "content",
}: PageWorkspaceProps) {
  return (
    <div
      className={["flex min-h-0 min-w-0 flex-1 flex-col", className].join(" ")}
    >
      {(header || toolbar) && (
        <div className="z-20 shrink-0 space-y-3 bg-background pb-3">
          {header}
          {toolbar}
        </div>
      )}

      <div
        className={[
          "flex min-h-0 min-w-0 flex-1 flex-col",
          scrollMode === "content"
            ? "overflow-y-auto overscroll-contain"
            : "overflow-hidden",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
