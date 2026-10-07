import { ArrowRight, BellRinging, EnvelopeSimple, NotePencil, Plus, UsersThree } from "@phosphor-icons/react/ssr";
import type { Event } from "@/generated/prisma/client";
import type { EventType } from "@/generated/prisma/enums";
import { formatDateOnly } from "@/lib/dates";
import { describeEvent } from "@/lib/timeline";

const ICONS: Record<EventType, typeof ArrowRight> = {
  STATUS_CHANGE: ArrowRight,
  INTERVIEW: UsersThree,
  EMAIL: EnvelopeSimple,
  NOTE: NotePencil,
  FOLLOW_UP: BellRinging,
};

export function Timeline({ events }: { events: Event[] }) {
  return (
    <ol className="relative flex flex-col gap-5">
      {/* The connecting line behind the icons. */}
      <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-border" />
      {events.map((event) => {
        const Icon = event.type === "STATUS_CHANGE" && !event.fromStatus ? Plus : ICONS[event.type];
        return (
          <li key={event.id} className="relative flex gap-3">
            <span className="relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-border">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-text">{describeEvent(event)}</p>
                <time dateTime={event.date.toISOString()} className="text-xs text-muted tabular-nums">
                  {formatDateOnly(event.date)}
                </time>
              </div>
              {event.notes && <p dir="auto" className="mt-1 text-sm whitespace-pre-line wrap-anywhere text-muted">{event.notes}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
