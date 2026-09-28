"use client";

import { useEffect, useRef, useState } from "react";

export type ToastMessage = { id: number; message: string };

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    if (timer.current) clearTimeout(timer.current);
    const id = ++nextId.current;
    setToast({ id, message });
    timer.current = setTimeout(() => {
      setToast((current) => current?.id === id ? null : current);
      timer.current = null;
    }, 3500);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { toast, showToast };
}

export default function ToastNotification({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;
  return <div key={toast.id} className="toast-notification" role="status" aria-live="polite" aria-atomic="true">{toast.message}</div>;
}
