"use client";

import { useMemo, useState } from "react";
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

  return (
    <div className="space-y-4">
      <div className="max-w-md">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, NIC, mobile, or address..."
          aria-label="Search customers"
        />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {filteredCustomers.length} of {customers.length} customers
      </p>

      {filteredCustomers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="font-medium">
            {customers.length === 0
              ? "No customers registered yet"
              : "No customers match your search"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {customers.length === 0
              ? "Add your first customer using the registration form."
              : "Try a different name, NIC, mobile number, or address."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">NIC</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Registered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{customer.fullName}</td>
                  <td className="px-4 py-3">{customer.nic}</td>
                  <td className="px-4 py-3">{customer.mobile}</td>
                  <td className="max-w-xs whitespace-normal px-4 py-3">
                    {customer.address}
                    {customer.area ? (
                      <span className="block text-xs text-muted-foreground">
                        {customer.area}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(customer.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
