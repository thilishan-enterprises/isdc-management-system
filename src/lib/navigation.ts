import {
  BadgePlus,
  BookUser,
  BriefcaseBusiness,
  CarFront,
  HandCoins,
  LayoutDashboard,
  Package,
  Settings,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "ADMIN" | "STAFF";

export type NavigationItem = {
  title: string;
  headerTitle?: string;
  href: string;
  icon: LucideIcon;
  allowedRoles: readonly AppRole[];
  visuallySeparated?: boolean;
};

export type NavigationGroup = {
  title?: string;
  items: readonly NavigationItem[];
};

const ADMIN_ONLY = ["ADMIN"] as const;
const ALL_ROLES = ["ADMIN", "STAFF"] as const;

export const navigationGroups: readonly NavigationGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        allowedRoles: ALL_ROLES,
      },
    ],
  },
  {
    title: "Management",
    items: [
      {
        title: "Add New Sale",
        href: "/customers/register",
        icon: BadgePlus,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Collections",
        href: "/collections",
        icon: HandCoins,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Customer Base",
        headerTitle: "Sales",
        href: "/sales",
        icon: BookUser,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Products",
        href: "/products",
        icon: Package,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Employees",
        href: "/employees",
        icon: BriefcaseBusiness,
        allowedRoles: ADMIN_ONLY,
      },
      {
        title: "Vehicles",
        href: "/vehicles",
        icon: CarFront,
        allowedRoles: ALL_ROLES,
      },

      {
        title: "Users",
        href: "/users",
        icon: UserCog,
        allowedRoles: ADMIN_ONLY,
      },
      {
        title: "Customers",
        href: "/customers",
        icon: UsersRound,
        allowedRoles: ALL_ROLES,
        visuallySeparated: true,
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        allowedRoles: ADMIN_ONLY,
      },
    ],
  },
];

export function getNavigationForRole(role: AppRole): NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.allowedRoles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);
}

export function getNavigationTitle(pathname: string) {
  const matchingItem = navigationGroups
    .flatMap((group) => group.items)
    .filter(
      (item) =>
        pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((first, second) => second.href.length - first.href.length)[0];

  return matchingItem?.headerTitle ?? matchingItem?.title ?? "Dashboard";
}
