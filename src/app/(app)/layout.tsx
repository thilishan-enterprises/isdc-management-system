import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth-guards";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import type { AppRole } from "@/lib/navigation";

type AppLayoutProps = {
  children: ReactNode;
};

function WorkspaceFallback() {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      Loading workspace…
    </div>
  );
}

async function AuthenticatedWorkspace({ children }: AppLayoutProps) {
  await connection();

  const session = await requireUser();

  const role: AppRole = session.user.role === "ADMIN" ? "ADMIN" : "STAFF";

  const username = session.user.username ?? "User";

  return (
    <SidebarProvider>
      <AppSidebar role={role} username={username} />

      <SidebarInset className="min-h-svh min-w-0">
        <AppHeader username={username} role={role} />

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
