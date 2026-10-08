import { BrandMark } from "./brand-mark";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold whitespace-nowrap text-text">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#1e3a8a_0%,#2563eb_100%)] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]">
        <BrandMark size={18} />
      </span>
      {!compact && <span className="tracking-tight">Landed</span>}
    </span>
  );
}
