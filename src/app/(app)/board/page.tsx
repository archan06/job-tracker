import { Kanban, Plus } from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import { Board } from "@/components/board/board";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUserId } from "@/server/auth";
import { listBoard } from "@/server/services/applications";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage() {
  const userId = await requireUserId();
  const board = await listBoard(userId);
  const total = Object.values(board.totals).reduce((sum, n) => sum + n, 0);

  return (
    <>
      <PageHeader
        title="Board"
        description={
          total > 0
            ? "Drag a card to another column, or use its status menu, to update where it stands."
            : undefined
        }
      />
      {total === 0 ? (
        <EmptyState
          icon={<Kanban size={24} />}
          title="No applications yet"
          description="Add a job you're interested in and it will show up here in the Saved column."
          action={
            <ButtonLink href="/applications/new">
              <Plus size={16} weight="bold" />
              Add your first application
            </ButtonLink>
          }
        />
      ) : (
        <Board columns={board.columns} totals={board.totals} />
      )}
    </>
  );
}
