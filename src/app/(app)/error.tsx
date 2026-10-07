"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<WarningCircle size={24} />}
      title="Something went wrong"
      description="This page couldn't load. Your data is safe; try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
