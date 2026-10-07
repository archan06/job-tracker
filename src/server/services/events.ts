import type { Event } from "@/generated/prisma/client";
import type { EventInput } from "@/lib/validation/event";
import { db } from "@/server/db";
import { NotFoundError } from "./errors";

/** Adds a note, interview, email or follow-up. Status changes go through applications.changeStatus. */
export async function addEvent(userId: string, applicationId: string, input: EventInput): Promise<Event> {
  return db.$transaction(async (tx) => {
    const owned = await tx.application.findFirst({ where: { id: applicationId, userId }, select: { id: true } });
    if (!owned) throw new NotFoundError();
    // Counts as activity, so the card moves up its board column.
    await tx.application.update({ where: { id: applicationId }, data: { updatedAt: new Date() } });
    return tx.event.create({
      data: { applicationId, type: input.type, date: input.date, notes: input.notes ?? null },
    });
  });
}
