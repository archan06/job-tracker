import Anthropic from "@anthropic-ai/sdk";
import { fakeClassifier, haikuClassifier, type EmailClassifier } from "./classifier";
import { fakeProvider, resendProvider, type InboundProvider } from "./provider";
import type { InboundDeps } from "./service";

const notConfigured: EmailClassifier = {
  classify: async () => {
    throw new Error("ANTHROPIC_API_KEY is not set");
  },
};

/** The receiving domain users forward to (e.g. "in.alexrchan.dev" or "<id>.resend.app"). */
export const inboundDomain = () => process.env.INBOUND_EMAIL_DOMAIN?.trim().toLowerCase() || null;

/** Real Resend + Claude Haiku in production; fakes when INBOUND_PROVIDER / EMAIL_CLASSIFIER = "fake" (end-to-end tests). Null when not configured. */
export function inboundDeps(): InboundDeps | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const domain = inboundDomain();
  if (!secret || !domain) return null;

  let provider: InboundProvider;
  if (process.env.INBOUND_PROVIDER === "fake") provider = fakeProvider(secret);
  else if (process.env.RESEND_API_KEY) provider = resendProvider(process.env.RESEND_API_KEY, secret);
  else return null;

  const classifier =
    process.env.EMAIL_CLASSIFIER === "fake"
      ? fakeClassifier
      : process.env.ANTHROPIC_API_KEY
        ? haikuClassifier(new Anthropic())
        : notConfigured;
  return { provider, classifier, domain };
}
