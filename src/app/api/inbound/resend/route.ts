import { inboundDeps } from "@/server/inbound/deps";
import { ingestEmail } from "@/server/inbound/service";

/** Resend's "email received" webhook. Every request must carry a valid signature. */
export async function POST(request: Request) {
  const deps = inboundDeps();
  if (!deps) return Response.json({ error: "Email forwarding isn't configured" }, { status: 503 });
  const body = await request.text();
  const event = deps.provider.verify(body, request.headers);
  if (!event) return Response.json({ error: "invalid signature" }, { status: 401 });
  return Response.json(await ingestEmail(event, deps));
}
