"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { UnsavedChangesDialog } from "@/components/common/unsaved-changes-dialog";

type NavigationAction = () => void | Promise<void>;
type DiscardAction = () => void | Promise<void>;

export async function runConfirmedDiscard(
  discardActions: DiscardAction[],
  navigate: NavigationAction,
) {
  for (const discard of discardActions) await discard();
  await navigate();
}

type RegisteredGuard = {
  isDirty: boolean;
  onDiscard?: DiscardAction;
};

type UnsavedChangesGuardContextValue = {
  registerGuard: (
    id: symbol,
    isDirty: boolean,
    onDiscard?: DiscardAction,
  ) => () => void;
  requestNavigation: (action: NavigationAction) => boolean;
};

const UnsavedChangesGuardContext =
  createContext<UnsavedChangesGuardContextValue | null>(null);

export function useUnsavedChangesGuard() {
  const context = useContext(UnsavedChangesGuardContext);
  if (!context) {
    throw new Error(
      "useUnsavedChangesGuard must be used within UnsavedChangesGuard.",
    );
  }
  return context;
}

export function UnsavedChangesGuard({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<symbol, RegisteredGuard>());
  const hasUnsavedChanges = useRef(false);
  const pendingNavigation = useRef<NavigationAction | null>(null);
  const bypassBeforeUnload = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const registerGuard = useCallback(
    (id: symbol, isDirty: boolean, onDiscard?: DiscardAction) => {
      guards.current.set(id, { isDirty, onDiscard });
      hasUnsavedChanges.current = [...guards.current.values()].some(
        (guard) => guard.isDirty,
      );
      setIsDirty(hasUnsavedChanges.current);

      return () => {
        guards.current.delete(id);
        hasUnsavedChanges.current = [...guards.current.values()].some(
          (guard) => guard.isDirty,
        );
        setIsDirty(hasUnsavedChanges.current);
      };
    },
    [],
  );

  const requestNavigation = useCallback((action: NavigationAction) => {
    if (!hasUnsavedChanges.current) {
      void action();
      return true;
    }
    if (pendingNavigation.current) return false;

    pendingNavigation.current = action;
    setDialogOpen(true);
    return false;
  }, []);

  const stayOnPage = useCallback(() => {
    pendingNavigation.current = null;
    setDialogOpen(false);
  }, []);

  const discardAndLeave = useCallback(() => {
    const action = pendingNavigation.current;
    const discardActions = [...guards.current.values()]
      .filter((guard) => guard.isDirty)
      .map((guard) => guard.onDiscard)
      .filter((callback): callback is DiscardAction => Boolean(callback));
    pendingNavigation.current = null;
    setDialogOpen(false);
    if (!action) return;

    bypassBeforeUnload.current = true;
    void runConfirmedDiscard(discardActions, action)
      .catch(() => {
        console.error("Confirmed form discard navigation failed.");
      })
      .finally(() => {
        bypassBeforeUnload.current = false;
      });
  }, []);

  useEffect(() => {
    if (!isDirty) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges.current || bypassBeforeUnload.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const value = useMemo(
    () => ({ registerGuard, requestNavigation }),
    [registerGuard, requestNavigation],
  );

  return (
    <UnsavedChangesGuardContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        open={dialogOpen}
        onStay={stayOnPage}
        onDiscard={discardAndLeave}
      />
    </UnsavedChangesGuardContext.Provider>
  );
}

type UnsavedChangesLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

export function UnsavedChangesLink({
  href,
  replace,
  scroll,
  target,
  onClick,
  ...props
}: UnsavedChangesLinkProps) {
  const router = useRouter();
  const { requestNavigation } = useUnsavedChangesGuard();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (target && target !== "_self")
    ) {
      return;
    }

    event.preventDefault();
    requestNavigation(() => {
      if (replace) router.replace(href, { scroll });
      else router.push(href, { scroll });
    });
  }

  return (
    <Link
      {...props}
      href={href}
      replace={replace}
      scroll={scroll}
      target={target}
      onClick={handleClick}
    />
  );
}
