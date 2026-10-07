"use client";

import { useEffect, useRef } from "react";
import { Button } from "./button";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Built on <dialog>, which handles focus trapping, Escape and the backdrop. */
export function ConfirmDialog({ open, title, description, confirmLabel, pending, error, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-6 text-text shadow-raised backdrop:bg-zinc-950/50 backdrop:backdrop-blur-sm"
    >
      <h2 id="confirm-title" className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {pending ? "Deleting..." : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
