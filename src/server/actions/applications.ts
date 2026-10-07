"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { resolveToday } from "@/lib/dates";
import type { ApplicationStatus } from "@/lib/status";
import { applicationInputSchema } from "@/lib/validation/application";
import { eventInputSchema } from "@/lib/validation/event";
import { parseForm } from "@/lib/validation/form";
import { requireUserId } from "@/server/auth";
import {
  changeStatus,
  createApplication,
  deleteApplication,
  updateApplication,
} from "@/server/services/applications";
import { LimitReachedError, NotFoundError, RateLimitedError } from "@/server/services/errors";
import { enforceWriteLimit } from "@/server/services/rate-limit";
import { addEvent } from "@/server/services/events";
import type { ActionResult } from "./types";

function refreshLists() {
  revalidatePath("/board");
  revalidatePath("/applications");
}

/** The viewer's calendar day, sent by the browser as a hidden "clientToday" field. */
function todayFrom(formData: FormData) {
  const value = formData.get("clientToday");
  return resolveToday(typeof value === "string" ? value : undefined);
}

/** Limits become a message on the form instead of an error page. */
async function guarded(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof RateLimitedError || error instanceof LimitReachedError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Another user's id and a missing id both end in the 404 page. */
async function orNotFound<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}

export async function createApplicationAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = parseForm(applicationInputSchema, formData);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  let id = "";
  const result = await guarded(async () => {
    await enforceWriteLimit(userId);
    id = (await createApplication(userId, parsed.data, { today: todayFrom(formData) })).id;
    return { ok: true };
  });
  if (!result.ok) return result;
  refreshLists();
  redirect(`/applications/${id}`);
}

export async function updateApplicationAction(
  id: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = parseForm(applicationInputSchema, formData);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  const result = await guarded(async () => {
    await enforceWriteLimit(userId);
    await orNotFound(() => updateApplication(userId, id, parsed.data, { today: todayFrom(formData) }));
    return { ok: true };
  });
  if (!result.ok) return result;
  refreshLists();
  revalidatePath(`/applications/${id}`);
  redirect(`/applications/${id}`);
}

export async function deleteApplicationAction(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const result = await guarded(async () => {
    await enforceWriteLimit(userId);
    await orNotFound(() => deleteApplication(userId, id));
    return { ok: true };
  });
  if (!result.ok) return result;
  refreshLists();
  redirect("/applications");
}

export async function changeStatusAction(
  id: string,
  status: ApplicationStatus,
  clientToday?: string,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = applicationInputSchema.shape.status.safeParse(status);
  if (!parsed.success) return { ok: false, error: "Unknown status." };
  try {
    await enforceWriteLimit(userId);
    await changeStatus(userId, id, parsed.data, { today: resolveToday(clientToday) });
  } catch (error) {
    // The board shows these inline rather than navigating away.
    if (error instanceof NotFoundError) return { ok: false, error: "This application no longer exists." };
    if (error instanceof RateLimitedError) return { ok: false, error: error.message };
    throw error;
  }
  refreshLists();
  revalidatePath(`/applications/${id}`);
  return { ok: true };
}

export async function addEventAction(
  applicationId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = parseForm(eventInputSchema, formData);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.fieldErrors };
  try {
    await enforceWriteLimit(userId);
    await addEvent(userId, applicationId, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: "This application no longer exists." };
    if (error instanceof RateLimitedError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/board");
  return { ok: true };
}
