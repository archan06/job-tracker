import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import { db } from "@/server/db";
import { clientIp } from "@/server/client-ip";
import { emailSender } from "@/server/mail/sender";
import { sendVerification, verifyEmailToken } from "@/server/services/email-verification";
import { rateLimit } from "@/server/services/rate-limit";
import { verifyCredentials } from "@/server/services/users";
import { authConfig } from "./auth.config";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

/** Right password, but the address hasn't been confirmed. `unverified` when a fresh link went out, `unverified_unsent` when none could. */
class Unverified extends CredentialsSignin {
  constructor(sent: boolean) {
    super();
    this.code = sent ? "unverified" : "unverified_unsent";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    // A wrong password is expected user input, not a server error.
    error(error) {
      if (error.name === "CredentialsSignin" || error instanceof CredentialsSignin) return;
      console.error(error);
    },
  },
  adapter: PrismaAdapter(db),
  callbacks: {
    ...authConfig.callbacks,
    // Google has confirmed the address: record it, so the account counts as verified everywhere.
    async jwt(params) {
      const { user, account, profile } = params;
      if (user?.id && account?.provider === "google" && profile?.email_verified) {
        const now = new Date();
        await db.user.updateMany({ where: { id: user.id, emailVerified: null }, data: { emailVerified: now, unverifiedExpiresAt: null } });
        return authConfig.callbacks.jwt({ ...params, user: { ...user, emailVerified: now } });
      }
      return authConfig.callbacks.jwt(params);
    },
  },
  providers: [
    ...authConfig.providers,
    Credentials({
      // `token`: the emailed verification link's token, sent by the "Verify and sign in" page.
      credentials: { email: {}, password: {}, token: {} },
      // Every password check, from the login form or a direct POST to Auth.js, passes through here.
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const [perAccount, perNetwork] = await Promise.all([
          rateLimit(`login:email:${parsed.data.email}`, 10, LOGIN_WINDOW_MS),
          rateLimit(`login:ip:${clientIp(request.headers)}`, 50, LOGIN_WINDOW_MS),
        ]);
        if (!perAccount.ok || !perNetwork.ok) throw new TooManyAttempts();
        const user = await verifyCredentials(parsed.data.email, parsed.data.password);
        if (!user || user.emailVerified) return user;
        // Verifying takes both the link (the inbox) and the password, so whoever set the password can't verify someone else's inbox.
        const token = typeof raw.token === "string" ? raw.token : "";
        if (token && (await verifyEmailToken(token, user.id))) return { ...user, emailVerified: new Date() };
        const sent = await sendVerification(user.id, clientIp(request.headers), emailSender());
        throw new Unverified(sent === "sent");
      },
    }),
  ],
});

/** The signed-in user's id, or a redirect to /login. Call this first in every Server Action and page. */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}
