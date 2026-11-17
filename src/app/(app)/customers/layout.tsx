import type { ReactNode } from "react";
import { CustomerSelectionProvider } from "@/components/customers/customer-selection-provider";

export default function CustomersLayout({ children }: { children: ReactNode }) {
  return <CustomerSelectionProvider>{children}</CustomerSelectionProvider>;
}
