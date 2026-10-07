import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { STATUS_STYLES } from "./status-styles";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status].badge}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${STATUS_STYLES[status].dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
