"use client";

import { SignOut } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { signOutAction } from "@/server/actions/auth";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu({ name, email }: { name: string | null; email: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-9 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary-text transition hover:bg-primary/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {initials(name, email)}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="menu-enter absolute right-0 z-30 mt-2 w-60 origin-top-right rounded-xl border border-border bg-surface p-1 shadow-raised"
        >
          <div className="px-2.5 py-2">
            {name && <p className="truncate text-sm font-medium text-text">{name}</p>}
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text transition hover:bg-surface-hover"
            >
              <SignOut size={16} className="text-muted" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
