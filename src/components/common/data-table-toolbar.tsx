"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppSelect } from "@/components/common/app-select";
import { Search, X } from "lucide-react";

export type DataTableFilterOption = {
  label: string;
  value: string;
};

export type DataTableFilter = {
  name: string;
  label: string;
  options: DataTableFilterOption[];
  value?: string;
  placeholder?: string;
};

type DataTableToolbarProps = {
  searchPlaceholder?: string;
  filters?: DataTableFilter[];
  debounceMs?: number;
};

export function DataTableToolbar({
  searchPlaceholder = "Search records...",
  filters = [],
  debounceMs = 300,
}: DataTableToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";
  const currentParams = searchParams.toString();

  const [draftQuery, setDraftQuery] = useState(urlQuery);

  // Track the latest intended URL, including pending navigation.
  const latestParamsRef = useRef(currentParams);

  // Keep the latest search text available to event handlers.
  const queryRef = useRef(draftQuery);

  // Prevent an older URL response from replacing a newer search.
  const pendingQueryRef = useRef<string | null>(null);

  // Synchronize refs after rendering.
  useEffect(() => {
    const pendingQuery = pendingQueryRef.current;

    if (pendingQuery !== null) {
      if (urlQuery !== pendingQuery) {
        return;
      }

      pendingQueryRef.current = null;
    }

    latestParamsRef.current = currentParams;
    queryRef.current = urlQuery;
  }, [currentParams, urlQuery]);

  const navigate = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(latestParamsRef.current);

      for (const [key, value] of Object.entries(updates)) {
        const trimmedValue = value.trim();

        if (trimmedValue) {
          params.set(key, trimmedValue);
        } else {
          params.delete(key);
        }
      }

      // New search/filter starts at page 1.
      params.delete("page");

      // Remove previous registration notifications.
      params.delete("created");
      params.delete("error");

      const nextQuery = params.toString();

      latestParamsRef.current = nextQuery;

      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;

      router.replace(nextUrl, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  const updateSearch = useCallback(
    (value: string) => {
      queryRef.current = value;
      pendingQueryRef.current = value;

      navigate({
        q: value,
      });
    },
    [navigate],
  );

  // Debounced search, without synchronous setState in an effect.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draftQuery !== urlQuery) {
        updateSearch(draftQuery);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draftQuery, urlQuery, debounceMs, updateSearch]);

  const hasSearch = draftQuery.trim().length > 0;

  const hasFilters = filters.some(
    (filter) => (searchParams.get(filter.name) ?? "").length > 0,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-4 sm:px-5">
      {/* Live search input */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

        <input
          type="text"
          value={draftQuery}
          onChange={(event) => {
            const value = event.target.value;

            queryRef.current = value;
            setDraftQuery(value);
          }}
          placeholder={searchPlaceholder}
          aria-label="Search records"
          className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />

        {hasSearch && (
          <button
            type="button"
            onClick={() => {
              setDraftQuery("");
              updateSearch("");
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Page-specific filters  */}
      {filters.map((filter) => {
        const selectedValue =
          searchParams.get(filter.name) ?? filter.value ?? "";

        return (
          <div key={filter.name} className="w-full sm:w-[180px]">
            <AppSelect
              value={selectedValue || "ALL"}
              placeholder={filter.placeholder ?? filter.label}
              options={[
                {
                  value: "ALL",
                  label: filter.placeholder ?? filter.label,
                },
                ...filter.options,
              ]}
              onValueChange={(value) => {
                pendingQueryRef.current = queryRef.current;

                navigate({
                  q: queryRef.current,
                  [filter.name]: value === "ALL" ? "" : value,
                });
              }}
              className="h-9"
            />
          </div>
        );
      })}

      {/* Reset search and filters */}
      {(hasSearch || hasFilters) && (
        <button
          type="button"
          onClick={() => {
            setDraftQuery("");
            queryRef.current = "";
            pendingQueryRef.current = "";

            const updates: Record<string, string> = {
              q: "",
            };

            for (const filter of filters) {
              updates[filter.name] = "";
            }

            navigate(updates);
          }}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-muted cursor-pointer"
        >
          Reset
        </button>
      )}
    </div>
  );
}
