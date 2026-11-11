"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MapPin, Search, UserRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";

type Customer = {
  id: string;
  fullName: string;
  nic: string;
  mobile: string;
  address: string;
  area: string | null;
  createdAt: Date;
};

type CustomerSearchProps = {
  customers: Customer[];
};

function formatRegisteredDate(date: Date) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function CustomerSearch({ customers }: CustomerSearchProps) {
  const [query, setQuery] = useState("");

  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) return customers;

    return customers.filter((customer) =>
      [
        customer.fullName,
        customer.nic,
        customer.mobile,
        customer.address,
        customer.area ?? "",
      ].some((value) => value.toLowerCase().includes(search)),
    );
  }, [customers, query]);

  const hasSearch = query.trim().length > 0;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, NIC, mobile or address..."
            aria-label="Search customers"
            className="h-10 rounded-lg border-border/70 bg-background pl-9 pr-10 text-sm shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-2"
          />

          {hasSearch && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <p
          className="text-xs text-muted-foreground sm:text-right"
          aria-live="polite"
        >
          Showing{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {filteredCustomers.length.toLocaleString("en-LK")}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {customers.length.toLocaleString("en-LK")}
          </span>{" "}
          customers
        </p>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-muted/10 px-5 py-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
            <Search className="size-5 text-muted-foreground" />
          </div>

          <p className="text-sm font-semibold">
            {customers.length === 0
              ? "No customers registered yet"
              : "No matching customers"}
          </p>

          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {customers.length === 0
              ? "Customer records will appear here once they have been registered."
              : "Try searching with a different name, NIC number, mobile number or address."}
          </p>

          {hasSearch && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-3 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop and tablet directory */}
          <div className="hidden overflow-hidden rounded-lg border border-border/70 md:block">
            <table className="w-full table-fixed text-left text-sm">
              <thead className="bg-muted/45">
                <tr className="border-b border-border/70">
                  <th className="w-[25%] px-4 py-3 text-xs font-semibold text-muted-foreground">
                    CUSTOMER
                  </th>
                  <th className="w-[17%] px-4 py-3 text-xs font-semibold text-muted-foreground">
                    NIC NUMBER
                  </th>
                  <th className="w-[17%] px-4 py-3 text-xs font-semibold text-muted-foreground">
                    MOBILE
                  </th>
                  <th className="w-[26%] px-4 py-3 text-xs font-semibold text-muted-foreground">
                    ADDRESS
                  </th>
                  <th className="w-[15%] px-4 py-3 text-xs font-semibold text-muted-foreground">
                    REGISTERED
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60">
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition-colors hover:bg-muted/25"
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                          {getInitials(customer.fullName)}
                        </div>

                        <span className="truncate font-medium text-foreground">
                          {customer.fullName}
                        </span>
                      </div>
                    </td>

                    <td className="truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                      {customer.nic}
                    </td>

                    <td className="truncate px-4 py-3 text-sm">
                      {customer.mobile}
                    </td>

                    <td className="px-4 py-3">
                      <div className="truncate text-sm">{customer.address}</div>
                      {customer.area && (
                        <div className="truncate text-xs text-muted-foreground">
                          {customer.area}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {formatRegisteredDate(customer.createdAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Compact mobile directory */}
          <div className="space-y-2 md:hidden">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-lg border border-border/70 bg-card p-3"
              >
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {getInitials(customer.fullName)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-1">
                      <p className="truncate text-sm font-semibold">
                        {customer.fullName}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRegisteredDate(customer.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {customer.nic}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="size-3.5" />
                        {customer.mobile}
                      </span>

                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {[customer.area, customer.address]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
