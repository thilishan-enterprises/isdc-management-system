import {
  LayoutDashboard,
  Users,
  UserRound,
  Package,
  ShoppingCart,
  Wallet,
  CarFront,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "ADMIN" | "STAFF";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  allowedRoles: readonly AppRole[];
};

export type NavigationGroup = {
  title: string;
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
        title: "Customers",
        href: "/customers",
        icon: Users,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Employees",
        href: "/employees",
        icon: UserRound,
        allowedRoles: ADMIN_ONLY,
      },
      {
        title: "Users",
        href: "/users",
        icon: UserRound,
        allowedRoles: ADMIN_ONLY,
      },
      {
        title: "Products",
        href: "/products",
        icon: Package,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Sales",
        href: "/sales",
        icon: ShoppingCart,
        allowedRoles: ALL_ROLES,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "Collections",
        href: "/collections",
        icon: Wallet,
        allowedRoles: ALL_ROLES,
      },
      {
        title: "Vehicles",
        href: "/vehicles",
        icon: CarFront,
        allowedRoles: ALL_ROLES,
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
