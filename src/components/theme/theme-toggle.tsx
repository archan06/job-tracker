"use client";

import { Check, Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Desktop },
] as const;

// The stored theme is only known in the browser; render a neutral icon on the server.
const subscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isClient = useIsClient();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const CurrentIcon = !isClient ? Desktop : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Theme"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <CurrentIcon size={20} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Theme"
          className="menu-enter absolute right-0 z-30 mt-2 w-40 origin-top-right rounded-xl border border-border bg-surface p-1 shadow-raised"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const checked = isClient && theme === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => {
                  setTheme(value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-text transition hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <Icon size={16} className="text-muted" />
                <span className="flex-1">{label}</span>
                {checked && <Check size={14} weight="bold" className="text-primary-text" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
