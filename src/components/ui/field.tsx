import type { ComponentProps, ReactNode } from "react";

// 16px text on phones stops iOS Safari from zooming into focused inputs.
export const controlClasses = [
  "w-full rounded-lg border border-border-strong bg-surface px-3 text-base text-text sm:text-sm",
  "placeholder:text-subtle transition",
  "outline-none focus:border-ring focus:ring-3 focus:ring-ring/40",
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/35",
  "disabled:opacity-60",
].join(" ");

type FieldProps = {
  id: string;
  label: string;
  error?: string[];
  hint?: string;
  optional?: boolean;
  className?: string;
  children: ReactNode;
};

/** Label above, control, then hint or error below. */
export function Field({ id, label, error, hint, optional, className = "", children }: FieldProps) {
  const message = error?.[0];
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </label>
      {children}
      {message ? (
        <p id={`${id}-error`} className="text-sm text-danger-text">
          {message}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type ControlExtras = { invalid?: boolean };

function describedBy(id: string | undefined, invalid?: boolean) {
  return invalid && id ? `${id}-error` : undefined;
}

export function Input({ invalid, className = "", ...props }: ComponentProps<"input"> & ControlExtras) {
  return (
    <input
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={`${controlClasses} h-11 sm:h-10 ${className}`}
      {...props}
    />
  );
}

export function Select({ invalid, className = "", ...props }: ComponentProps<"select"> & ControlExtras) {
  return (
    <select
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={`${controlClasses} h-11 pr-8 sm:h-10 ${className}`}
      {...props}
    />
  );
}

export function Textarea({ invalid, className = "", ...props }: ComponentProps<"textarea"> & ControlExtras) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy(props.id, invalid)}
      className={`${controlClasses} min-h-28 py-2.5 leading-relaxed ${className}`}
      {...props}
    />
  );
}

export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger-text">
      {children}
    </div>
  );
}
