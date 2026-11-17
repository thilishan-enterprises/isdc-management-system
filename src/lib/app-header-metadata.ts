import { getNavigationTitle } from "@/lib/navigation";

export type AppHeaderMetadata = {
  title: string;
  subtitle?: string;
};

// Edit page titles and subtitles here. The most specific matching path wins.
const appHeaderRoutes: ReadonlyArray<AppHeaderMetadata & { path: string }> = [
  {
    path: "/customers/import/history",
    title: "Customer Import History",
    subtitle: "Review customer import progress, outcomes and counts.",
  },
  {
    path: "/customers/import",
    title: "Import Customers",
    subtitle: "Validate and import customer records from Excel or CSV files.",
  },
  {
    path: "/customers/register",
    title: "New Sale Registration",
    subtitle:
      "Register a customer purchase and configure its installment plan.",
  },
  {
    path: "/customers/new",
    title: "New Customer",
    subtitle:
      "Register and maintain customer's personal & contact information.",
  },
  {
    path: "/customers",
    title: "Customer Directory",
    subtitle: "Search, filter and manage registered customer records.",
  },
  {
    path: "/dashboard",
    title: "Dashboard",
    subtitle: "A snapshot of your current business performance.",
  },
  {
    path: "/collections",
    title: "Collections",
    subtitle: "Track installment collections and payment activity.",
  },
  {
    path: "/sales",
    title: "Sales",
    subtitle: "Manage sales, installment schedules and payment balances.",
  },
  {
    path: "/products",
    title: "Products",
    subtitle: "Manage product inventory, pricing and availability.",
  },
  {
    path: "/employees",
    title: "Employees",
    subtitle: "Manage employee details and collection commission rates.",
  },
  {
    path: "/vehicles",
    title: "Vehicles",
    subtitle: "Manage vehicle records used by the business.",
  },
  {
    path: "/users",
    title: "Users",
    subtitle: "Manage application users and their access.",
  },
  {
    path: "/settings",
    title: "Settings",
    subtitle: "Configure application preferences and system options.",
  },
];

export function getAppHeaderMetadata(pathname: string): AppHeaderMetadata {
  const route = appHeaderRoutes
    .filter(
      (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
    )
    .sort((first, second) => second.path.length - first.path.length)[0];

  if (route) {
    return {
      title: route.title,
      subtitle: route.subtitle?.trim() || undefined,
    };
  }

  return { title: getNavigationTitle(pathname) };
}
