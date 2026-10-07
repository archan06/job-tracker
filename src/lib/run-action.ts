import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/server/actions/types";

/**
 * Calls a Server Action from client code. A thrown error (offline, database timeout)
 * becomes a normal failed result, so the UI can roll back and show a message instead of
 * the error page. Next.js redirects and not-found signals still propagate.
 */
export async function runAction(action: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await action();
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error: "Couldn't save. Check your connection and try again." };
  }
}
