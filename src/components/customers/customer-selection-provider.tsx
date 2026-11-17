"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const MAX_SELECTED_CUSTOMERS = 5000;

type CustomerSelectionContextValue = {
  selectedIds: string[];
  maxSelection: number;
  select: (id: string) => void;
  deselect: (id: string) => void;
  selectMany: (ids: string[]) => void;
  deselectMany: (ids: string[]) => void;
  clearSelection: () => void;
};

const CustomerSelectionContext =
  createContext<CustomerSelectionContextValue | null>(null);

export function CustomerSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const select = useCallback((id: string) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) return previous;
      if (previous.length >= MAX_SELECTED_CUSTOMERS) {
        return previous;
      }

      return [...previous, id];
    });
  }, []);

  const deselect = useCallback((id: string) => {
    setSelectedIds((previous) => previous.filter((value) => value !== id));
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds((previous) => {
      const existing = new Set(previous);
      const additions: string[] = [];

      for (const id of ids) {
        if (existing.has(id)) continue;

        if (previous.length + additions.length >= MAX_SELECTED_CUSTOMERS) {
          break;
        }

        existing.add(id);
        additions.push(id);
      }

      if (additions.length === 0) return previous;

      return [...previous, ...additions];
    });
  }, []);

  const deselectMany = useCallback((ids: string[]) => {
    const removeSet = new Set(ids);

    setSelectedIds((previous) => previous.filter((id) => !removeSet.has(id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const value = useMemo<CustomerSelectionContextValue>(
    () => ({
      selectedIds,
      maxSelection: MAX_SELECTED_CUSTOMERS,
      select,
      deselect,
      selectMany,
      deselectMany,
      clearSelection,
    }),
    [selectedIds, select, deselect, selectMany, deselectMany, clearSelection],
  );

  return (
    <CustomerSelectionContext.Provider value={value}>
      {children}
    </CustomerSelectionContext.Provider>
  );
}

/**
 * Optional hook for shared components.
 *
 * Returns null when the component is outside
 * the Customers selection provider.
 */
export function useOptionalCustomerSelection() {
  return useContext(CustomerSelectionContext);
}

/**
 * Strict hook for Customers-only components.
 */
export function useCustomerSelection() {
  const context = useContext(CustomerSelectionContext);

  if (!context) {
    throw new Error(
      "useCustomerSelection must be used within CustomerSelectionProvider.",
    );
  }

  return context;
}
