'use client';

import { useState, useRef, useCallback } from 'react';

export interface Toast {
  id: number;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback((message: string) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  return { toasts, addToast };
}
