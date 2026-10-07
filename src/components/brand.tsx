import { Briefcase } from "@phosphor-icons/react/ssr";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold whitespace-nowrap text-text">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Briefcase size={18} weight="bold" />
      </span>
      {!compact && <span className="tracking-tight">Job Tracker</span>}
    </span>
  );
}
