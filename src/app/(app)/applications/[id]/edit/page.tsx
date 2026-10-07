import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationForm } from "@/components/applications/application-form";
import { DeleteApplicationButton } from "@/components/applications/delete-application-button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUserId } from "@/server/auth";
import { getApplication } from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage(props: PageProps<"/applications/[id]/edit">) {
  const { id } = await props.params;
  const userId = await requireUserId();
  const application = await getApplication(userId, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${application.company}`}
        description={application.title}
        actions={<DeleteApplicationButton id={application.id} company={application.company} />}
      />
      <ApplicationForm mode="edit" initial={application} />
    </div>
  );
}
