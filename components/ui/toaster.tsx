'use client';

import * as React from 'react';
import {
  Toast as ToastRoot,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastClose,
} from '@/components/ui/toast';

interface ToastData {
  id: string;
  title: string;
  variant: 'default' | 'success' | 'destructive' | 'info' | 'warning';
  duration?: number;
}

interface ToastStore {
  toasts: ToastData[];
  subscribe: (callback: (toasts: ToastData[]) => void) => () => void;
  add: (toast: Omit<ToastData, 'id'>) => string;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 5000;
const ERROR_DURATION = Infinity;

function createToastStore(): ToastStore {
  let toasts: ToastData[] = [];
  const subscribers = new Set<(toasts: ToastData[]) => void>();

  return {
    get toasts() {
      return toasts;
    },
    subscribe(callback) {
      subscribers.add(callback);
      callback(toasts);
      return () => subscribers.delete(callback);
    },
    add(options) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const duration =
        options.variant === 'destructive' ? ERROR_DURATION : options.duration ?? DEFAULT_DURATION;

      toasts = [...toasts, { ...options, id, duration }].slice(-MAX_TOASTS);
      subscribers.forEach((cb) => cb(toasts));

      if (duration !== Infinity) {
        setTimeout(() => this.dismiss(id), duration);
      }

      return id;
    },
    dismiss(id) {
      toasts = toasts.filter((t) => t.id !== id);
      subscribers.forEach((cb) => cb(toasts));
    },
  };
}

const toastStore: ToastStore = typeof window !== 'undefined' ? createToastStore() : ({} as ToastStore);

// Make it accessible globally for libraries
if (typeof window !== 'undefined') {
  (window as unknown as { __toastStore?: ToastStore }).__toastStore = toastStore;
}

export const toast = {
  success: (title: string, duration?: number) => toastStore.add({ title, variant: 'success', duration }),
  error: (title: string, duration = ERROR_DURATION) =>
    toastStore.add({ title, variant: 'destructive', duration }),
  info: (title: string, duration?: number) =>
    toastStore.add({ title, variant: 'info', duration }),
  warning: (title: string, duration?: number) =>
    toastStore.add({ title, variant: 'warning', duration }),
  default: (title: string, duration?: number) =>
    toastStore.add({ title, variant: 'default', duration }),
};

export { Toaster };

function Toaster() {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  React.useEffect(() => {
    return toastStore.subscribe(setToasts);
  }, []);

  return (
    <ToastProvider>
      {toasts.map((t) => (
        <ToastRoot
          key={t.id}
          variant={t.variant}
          onOpenChange={(open) => {
            if (!open) toastStore.dismiss(t.id);
          }}
        >
          <ToastTitle>{t.title}</ToastTitle>
          <ToastClose />
        </ToastRoot>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}