"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, LogOut, UserRound } from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import type { AppRole } from "@/lib/navigation";
import { getAppHeaderMetadata } from "@/lib/app-header-metadata";
import { useAppHeaderDetails } from "@/components/layout/app-header-details";
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes-guard";

type AppHeaderProps = {
  username: string;
  role: AppRole;
};

export function AppHeader({ username, role }: AppHeaderProps) {
  const router = useRouter();
  const { requestNavigation } = useUnsavedChangesGuard();
  const pathname = usePathname();
  const pageDetails = useAppHeaderDetails(pathname);
  const metadata = getAppHeaderMetadata(pathname);
  const title = pageDetails?.title ?? metadata.title;
  const subtitle = pageDetails?.subtitle ?? metadata.subtitle;

  const initials =
    username
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "US";

  async function performSignOut() {
    await signOut({ redirect: false });
    router.replace("/login");
    router.refresh();
  }

  function handleSignOut() {
    requestNavigation(performSignOut);
  }

  return (
    <header className="sticky top-0 z-30 flex h-18 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <SidebarTrigger />

      <Separator orientation="vertical" className="mr-1 h-5" />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
            {title}
          </h1>

          {typeof pageDetails?.count === "number" && (
            <span className="inline-flex max-w-[45vw] shrink-0 items-center truncate rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground sm:max-w-none sm:px-2.5 sm:py-1 sm:text-xs">
              {pageDetails.count.toLocaleString("en-LK")} {pageDetails.countLabel}
            </span>
          )}
        </div>

        {subtitle && (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {subtitle}
          </p>
        )}
      </div>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-10 gap-2 px-2"
              aria-label="Open account menu"
            />
          }
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
            {username}
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <span className="truncate text-sm font-medium">{username}</span>
              <span className="text-xs text-muted-foreground">
                {role === "ADMIN" ? "Administrator" : "Staff member"}
              </span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled>
            <UserRound aria-hidden="true" />
            Account
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
            <LogOut aria-hidden="true" />
            Sign out
            <ChevronRight className="ml-auto size-4" aria-hidden="true" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
