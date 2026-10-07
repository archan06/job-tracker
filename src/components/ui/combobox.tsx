"use client";

import { Fragment, useEffect, useId, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { controlClasses } from "./field";

/** `data` carries whatever the caller needs back when the option is picked. */
export type ComboboxOption<T = undefined> = { id: string; value: string; render?: ReactNode; group?: string; data?: T };

type Props<T> = Omit<ComponentProps<"input">, "onChange" | "value" | "defaultValue"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Suggestions for a query of 2+ characters. Rejecting (or a 429) just closes the list. */
  fetchOptions: (query: string, signal: AbortSignal) => Promise<ComboboxOption<T>[]>;
  onPick: (option: ComboboxOption<T>) => void;
  /** Options shown instead of fetching, when this returns a non-empty list (e.g. quick picks for an empty field). */
  staticOptions?: (value: string) => ComboboxOption<T>[];
  /** The part of the value to search for. Defaults to the whole value. */
  queryFor?: (value: string) => string;
  footer?: ReactNode;
  invalid?: boolean;
};

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

/**
 * A text input with a suggestion list (WAI-ARIA combobox with a listbox popup).
 * Suggestions are optional: the input always submits whatever is typed.
 */
export function Combobox<T = undefined>({
  value,
  onValueChange,
  fetchOptions,
  onPick,
  staticOptions,
  queryFor = (v) => v,
  footer,
  invalid,
  id,
  className = "",
  onBlur,
  onFocus,
  ...inputProps
}: Props<T>) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ComboboxOption<T>[]>([]);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const request = useRef<AbortController | null>(null);

  function cancel() {
    clearTimeout(timer.current);
    request.current?.abort();
    request.current = null;
  }

  useEffect(() => cancel, []);

  function close() {
    cancel();
    setOpen(false);
    setLoading(false);
    setActive(-1);
  }

  /** Shows quick picks, or schedules a search for `next`. Each call replaces the previous search. */
  function refresh(next: string) {
    cancel();
    const quick = staticOptions?.(next) ?? [];
    if (quick.length > 0) {
      setOptions(quick);
      setLoading(false);
      setActive(-1);
      setOpen(true);
      return;
    }
    const query = queryFor(next).trim();
    if (query.length < MIN_QUERY) {
      close();
      setOptions([]);
      return;
    }
    setLoading(true);
    setOpen(true);
    timer.current = setTimeout(() => {
      const controller = new AbortController();
      request.current = controller;
      fetchOptions(query, controller.signal).then(
        (found) => {
          if (controller.signal.aborted) return;
          setOptions(found);
          setLoading(false);
          setActive(-1);
          setOpen(found.length > 0);
        },
        () => {
          if (!controller.signal.aborted) close();
        },
      );
    }, DEBOUNCE_MS);
  }

  function pick(option: ComboboxOption<T>) {
    close();
    onPick(option);
  }

  function move(delta: number) {
    if (options.length === 0) return;
    const next = active < 0 && delta < 0 ? options.length - 1 : (active + delta + options.length) % options.length;
    setActive(next);
    setOpen(true);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open && options.length === 0) refresh(value);
        else move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter":
        // Picking a suggestion must not submit the form.
        if (open && active >= 0 && options[active]) {
          event.preventDefault();
          pick(options[active]);
        }
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      case "Tab":
        close();
        break;
    }
  }

  const expanded = open && (loading || options.length > 0);

  return (
    <div className="relative">
      <input
        {...inputProps}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid && id ? `${id}-error` : undefined}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          refresh(event.target.value);
        }}
        onFocus={(event) => {
          if ((staticOptions?.(value) ?? []).length > 0) refresh(value);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          close();
          onBlur?.(event);
        }}
        onKeyDown={onKeyDown}
        className={`${controlClasses} h-11 sm:h-10 ${className}`}
      />
      <div
        hidden={!expanded}
        // Keeps focus in the input while clicking inside the popup (options, footer links).
        onMouseDown={(event) => event.preventDefault()}
        className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-border bg-surface shadow-card"
      >
        <ul id={listId} role="listbox" className="max-h-72 overflow-auto py-1">
          {loading && options.length === 0 && (
            <li role="presentation" className="px-3 py-2.5 text-sm text-muted">
              Searching…
            </li>
          )}
          {options.map((option, index) => (
            <Fragment key={option.id}>
              {option.group && option.group !== options[index - 1]?.group && (
                <li role="presentation" className="px-3 pt-2 pb-1 text-xs font-medium text-subtle">
                  {option.group}
                </li>
              )}
              <li
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // mousedown fires before the input's blur, so a click picks before the list closes.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
                onMouseMove={() => setActive(index)}
                className={`flex min-h-11 cursor-pointer items-center gap-2.5 px-3 text-sm text-text ${
                  index === active ? "bg-surface-hover" : ""
                }`}
              >
                {option.render ?? option.value}
              </li>
            </Fragment>
          ))}
        </ul>
        {footer && <div className="border-t border-border px-3 py-1.5 text-xs text-subtle">{footer}</div>}
      </div>
    </div>
  );
}
