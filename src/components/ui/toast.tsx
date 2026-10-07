"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { useEffect } from "react";

/** A single transient message, used for failed background saves. */
export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-40 flex justify-center px-4 md:bottom-6">
      {message && (
        <div
          role="status"
          className="toast-enter pointer-events-auto flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text shadow-raised"
        >
          <WarningCircle size={18} weight="fill" className="shrink-0 text-danger" />
          {message}
        </div>
      )}
    </div>
  );
}
