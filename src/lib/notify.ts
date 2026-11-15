"use client";

import { toast } from "sonner";

type NotifyOptions = {
  description?: string;
  duration?: number;
};

export const notify = {
  success(message: string, options?: NotifyOptions) {
    return toast.success(message, {
      description: options?.description,
      duration: options?.duration ?? 3500,
    });
  },

  error(message: string, options?: NotifyOptions) {
    return toast.error(message, {
      description: options?.description,
      duration: options?.duration ?? 5000,
    });
  },

  warning(message: string, options?: NotifyOptions) {
    return toast.warning(message, {
      description: options?.description,
      duration: options?.duration ?? 4500,
    });
  },

  info(message: string, options?: NotifyOptions) {
    return toast.info(message, {
      description: options?.description,
      duration: options?.duration ?? 3500,
    });
  },

  loading(message: string) {
    return toast.loading(message, {
      duration: Infinity,
    });
  },

  dismiss(id?: string | number) {
    toast.dismiss(id);
  },

  promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    },
  ) {
    return toast.promise(promise, messages);
  },
};
