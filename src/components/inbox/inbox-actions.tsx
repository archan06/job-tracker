"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import {
  applyReviewAction,
  createFromReviewAction,
  ignoreEmailAction,
  retryEmailAction,
  undoEmailAction,
  type InboxActionResult,
} from "@/server/actions/inbound";

type Option = { id: string; label: string };

function useInboxAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<InboxActionResult>) =>
    start(async () => {
      const result = await action();
      setError(result.ok ? null : result.error);
    });
  return { pending, error, run };
}

const ErrorText = ({ error }: { error: string | null }) =>
  error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null;

export function UndoButton({ id }: { id: string }) {
  const { pending, error, run } = useInboxAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => undoEmailAction(id))}>
        Undo
      </Button>
      <ErrorText error={error} />
    </div>
  );
}

export function ReviewActions({ id, applications, canCreate }: { id: string; applications: Option[]; canCreate: boolean }) {
  const { pending, error, run } = useInboxAction();
  const [target, setTarget] = useState(applications[0]?.id ?? "");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {applications.length > 0 && (
          <>
            <Select aria-label="Apply to" value={target} onChange={(e) => setTarget(e.target.value)} className="w-auto max-w-64" disabled={pending}>
              {applications.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
            <Button size="sm" disabled={pending || !target} onClick={() => run(() => applyReviewAction(id, target))}>
              Apply
            </Button>
          </>
        )}
        {canCreate && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => createFromReviewAction(id))}>
            Create new application
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => ignoreEmailAction(id))}>
          Ignore
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function FailedActions({ id }: { id: string }) {
  const { pending, error, run } = useInboxAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => retryEmailAction(id))}>
          Retry
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => ignoreEmailAction(id))}>
          Ignore
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  );
}
