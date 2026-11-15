"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { notify } from "@/lib/notify";

type ToastType = "success" | "error" | "warning" | "info";

type ToastMessage = {
  type: ToastType;
  title: string;
  description?: string;
};

type Props = {
  messages: Record<string, ToastMessage>;
};

export function RouteToast({ messages }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.toString();

  // Prevent the same notification from appearing twice.
  const handledQueryRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(query);

    const created = params.get("created");
    const error = params.get("error");

    const messageKey =
      created === "1" ? "created" : error ? `error:${error}` : null;

    if (!messageKey) {
      handledQueryRef.current = null;
      return;
    }

    const message = messages[messageKey];

    if (!message) return;

    const notificationKey = `${pathname}?${query}`;

    // Skip duplicate effect executions.
    if (handledQueryRef.current === notificationKey) {
      return;
    }

    handledQueryRef.current = notificationKey;

    // Remove notification parameters so refreshing
    // the page does not show the same toast again.
    params.delete("created");
    params.delete("error");

    const remainingQuery = params.toString();

    const cleanUrl = remainingQuery
      ? `${pathname}?${remainingQuery}`
      : pathname;

    window.history.replaceState(null, "", cleanUrl);

    // Display notification only once per handled URL.
    switch (message.type) {
      case "success":
        notify.success(message.title, {
          description: message.description,
        });
        break;

      case "error":
        notify.error(message.title, {
          description: message.description,
        });
        break;

      case "warning":
        notify.warning(message.title, {
          description: message.description,
        });
        break;

      case "info":
        notify.info(message.title, {
          description: message.description,
        });
        break;
    }
  }, [pathname, query, messages]);

  return null;
}
