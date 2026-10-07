"use client";

import { Trash } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { deleteApplicationAction } from "@/server/actions/applications";

export function DeleteApplicationButton({ id, company }: { id: string; company: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Trash size={16} />
        Delete
      </Button>
      <ConfirmDialog
        open={open}
        title="Delete this application?"
        description={`${company} and its whole activity history will be removed. This can't be undone.`}
        confirmLabel="Delete"
        pending={pending}
        error={error}
        onCancel={() => {
          setOpen(false);
          setError(undefined);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const result = await runAction(() => deleteApplicationAction(id));
            if (!result.ok) setError(result.error);
          })
        }
      />
    </>
  );
}
