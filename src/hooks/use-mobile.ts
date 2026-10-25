"use client";

import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;

function subscribeToViewport(callback: () => void) {
  window.addEventListener("resize", callback);

  return () => window.removeEventListener("resize", callback);
}

function getMobileSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function getServerSnapshot() {
  return false;
}

export function useIsMobile() {
  return useSyncExternalStore(
    subscribeToViewport,
    getMobileSnapshot,
    getServerSnapshot,
  );
}
