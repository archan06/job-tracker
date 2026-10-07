import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation/auth";
import { db } from "@/server/db";
import { clientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/services/rate-limit";
import { verifyCredentials } from "@/server/services/users";
import { authConfig } from "./auth.config";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
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
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      // Every password check, from the login form or a direct POST to Auth.js, passes through here.
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const [perAccount, perNetwork] = await Promise.all([
          rateLimit(`login:email:${parsed.data.email}`, 10, LOGIN_WINDOW_MS),
          rateLimit(`login:ip:${clientIp(request.headers)}`, 50, LOGIN_WINDOW_MS),
        ]);
        if (!perAccount.ok || !perNetwork.ok) throw new TooManyAttempts();
        return verifyCredentials(parsed.data.email, parsed.data.password);
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
