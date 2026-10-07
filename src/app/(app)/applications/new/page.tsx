import type { Metadata } from "next";
import { ApplicationForm } from "@/components/applications/application-form";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "New application" };

export default function NewApplicationPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New application" description="Only company and job title are required. You can fill in the rest later." />
      <ApplicationForm mode="create" />
    </div>
  );
}
