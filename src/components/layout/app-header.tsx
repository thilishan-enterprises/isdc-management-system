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

type AppHeaderProps = {
  username: string;
  role: AppRole;
};

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/customers": "Customers",
  "/employees": "Employees",
  "/users": "Users",
  "/products": "Products",
  "/sales": "Sales",
  "/collections": "Collections",
  "/vehicles": "Vehicles",
  "/settings": "Settings",
};

export function AppHeader({ username, role }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  const pageTitle =
    pageTitles[pathname] ??
    Object.entries(pageTitles).find(
      ([path]) => path !== "/dashboard" && pathname.startsWith(`${path}/`),
    )?.[1] ??
    "Workspace";

  const initials =
    username
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "US";

  async function handleSignOut() {
    await signOut({ redirect: false });
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <SidebarTrigger className="-ml-1" />

      <Separator orientation="vertical" className="mr-1 h-5" />

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h1 className="truncate text-sm font-semibold tracking-tight">
          {pageTitle}
        </h1>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Installment Management System
        </p>
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
