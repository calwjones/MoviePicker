'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type ToastVariant = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number | string;
  message: string;
  variant: ToastVariant;
}

export interface ToastOptions {
  id?: string;
  variant?: ToastVariant;
  duration?: number | null;
}

const DEFAULT_DURATION = 5000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const autoIdRef = useRef(0);
  const timersRef = useRef<Map<number | string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const removeToast = useCallback((id: number | string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, options: ToastOptions = {}) => {
    const id: number | string = options.id ?? ++autoIdRef.current;
    const variant = options.variant ?? 'info';
    const duration = options.duration === undefined ? DEFAULT_DURATION : options.duration;

    const existing = timersRef.current.get(id);
    if (existing) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }

    setToasts((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      return [...filtered, { id, message, variant }];
    });

    if (duration !== null && duration > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, []);

  return { toasts, addToast, removeToast };
}
