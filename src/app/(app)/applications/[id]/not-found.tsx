import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function ApplicationNotFound() {
  return (
    <EmptyState
      icon={<MagnifyingGlass size={24} />}
      title="Application not found"
      description="It may have been deleted, or the link is wrong."
      action={<ButtonLink href="/applications">Back to applications</ButtonLink>}
    />
  );
}
