"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { getNavigationForRole, type AppRole } from "@/lib/navigation";

type AppSidebarProps = {
  role: AppRole;
  username: string;
};

export function AppSidebar({ role, username }: AppSidebarProps) {
  const pathname = usePathname();
  const groups = getNavigationForRole(role);

  const initials =
    username
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "US";

  return (
    <Sidebar collapsible="icon" variant="inset">
      {/* Brand */}
      <SidebarHeader className="border-b border-sidebar-border/70 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <span className="text-sm font-bold tracking-tight">IM</span>
          </div>

          <div className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[14px] font-semibold tracking-tight text-sidebar-foreground">
              ISDC Manager
            </span>
            <span className="truncate text-[11px] font-medium text-muted-foreground">
              Installment Management
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="gap-1 px-3 py-4">
        {groups.map((group) => (
          <SidebarGroup key={group.title} className="px-0 py-1">
            <SidebarGroupLabel className="h-8 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/75 group-data-[collapsible=icon]:opacity-0">
              {group.title}
            </SidebarGroupLabel>

            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;

                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(`${item.href}/`));

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={isActive}
                        tooltip={item.title}
                        className="
                          h-10 rounded-xl px-3
                          text-[13px] font-medium
                          text-sidebar-foreground/80
                          transition-all duration-200
                          hover:bg-sidebar-accent/70
                          hover:text-sidebar-accent-foreground
                          data-[active=true]:bg-primary/10
                          data-[active=true]:font-semibold
                          data-[active=true]:text-primary
                          data-[active=true]:shadow-none
                          [&>svg]:size-[18px]
                          [&>svg]:shrink-0
                        "
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* User profile */}
      <SidebarFooter className="border-t border-sidebar-border/70 p-3">
        <div className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-accent text-[11px] font-semibold text-sidebar-foreground">
            {initials}
          </div>

          <div className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[13px] font-semibold text-sidebar-foreground">
              {username}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {role === "ADMIN" ? "Administrator" : "Staff member"}
            </span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
