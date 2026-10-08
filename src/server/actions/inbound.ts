"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/server/auth";
import { inboundDeps, inboundDomain } from "@/server/inbound/deps";
import {
  ReviewError,
  applyReview,
  createFromReview,
  ignoreEmail,
  regenerateInboundAddress,
  retryEmail,
  undoEmail,
} from "@/server/inbound/service";
import { ChangedSinceError } from "@/server/services/applications";
import { LimitReachedError, NotFoundError, RateLimitedError } from "@/server/services/errors";

export type InboxActionResult = { ok: true } | { ok: false; error: string };

/** Runs an Inbox action for the signed-in user; expected failures come back as a message to show. */
async function run(action: (userId: string) => Promise<unknown>): Promise<InboxActionResult> {
  const userId = await requireUserId();
  try {
    await action(userId);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "That email or application no longer exists." };
    if (error instanceof ReviewError || error instanceof ChangedSinceError || error instanceof RateLimitedError || error instanceof LimitReachedError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  revalidatePath("/email");
  revalidatePath("/board");
  return { ok: true };
}

export async function undoEmailAction(id: string) {
  return run((userId) => undoEmail(userId, id));
}

export async function applyReviewAction(id: string, applicationId: string) {
  return run((userId) => applyReview(userId, id, applicationId));
}

export async function createFromReviewAction(id: string) {
  return run((userId) => createFromReview(userId, id));
}

export async function ignoreEmailAction(id: string) {
  return run((userId) => ignoreEmail(userId, id));
}

export async function retryEmailAction(id: string) {
  return run(async (userId) => {
    const deps = inboundDeps();
    if (!deps) throw new ReviewError("Email forwarding isn't configured.");
    await retryEmail(userId, id, deps);
  });
}

export async function regenerateAddressAction() {
  return run(async (userId) => {
    const domain = inboundDomain();
    if (!domain) throw new ReviewError("Email forwarding isn't configured.");
    await regenerateInboundAddress(userId, domain);
  });
}
