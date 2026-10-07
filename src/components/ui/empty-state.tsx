import type { ReactNode } from "react";

export function EmptyState({ icon, title, description, action }: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary-text">{icon}</div>
      <h2 className="text-base font-semibold text-text">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
