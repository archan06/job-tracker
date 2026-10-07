"use client";

import { useState, useTransition } from "react";
import { StatusSelect } from "@/components/board/status-select";
import { localDateString } from "@/lib/dates";
import { runAction } from "@/lib/run-action";
import type { ApplicationStatus } from "@/lib/status";
import { changeStatusAction } from "@/server/actions/applications";

export function DetailStatusSelect({ id, company, status }: { id: string; company: string; status: ApplicationStatus }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusSelect
        value={status}
        label={`Status for ${company}`}
        className={`h-10 text-sm sm:text-sm ${pending ? "opacity-60" : ""}`}
        onChange={(next) =>
          startTransition(async () => {
            setError(undefined);
            const result = await runAction(() => changeStatusAction(id, next, localDateString()));
            if (!result.ok) setError(result.error);
          })
        }
      />
      {error && <p className="text-sm text-danger-text">{error}</p>}
    </div>
  );
}
