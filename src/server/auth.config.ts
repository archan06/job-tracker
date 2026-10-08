import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { safeCallbackPath } from "@/lib/callback-path";

/** Google sign-in is optional; the app works with email/password alone. */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const PUBLIC_PATHS = ["/login", "/register", "/check-email", "/verify-email"];
/** Generated metadata routes with no file extension, so the proxy matcher doesn't skip them. */
const PUBLIC_ASSETS = ["/apple-icon"];

/**
 * Settings shared by the request proxy and the full Auth.js setup. Kept free of
 * database code so the proxy stays fast. The proxy only guards navigation;
 * every Server Action and service still checks the user itself.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  // A stolen or forgotten session cookie stops working after a week.
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  providers: googleEnabled ? [Google] : [],
  callbacks: {
    authorized({ auth, request: { nextUrl, method } }) {
      // The session only carries an id for verified accounts (see `session` below).
      const signedIn = Boolean(auth?.user?.id);
      const { pathname } = nextUrl;
      if (pathname.startsWith("/api/auth")) return true;
      if (PUBLIC_ASSETS.includes(pathname)) return true;
      // API routes check the session themselves and answer 401; a redirect to /login would hand fetch() an HTML page.
      if (pathname.startsWith("/api/suggest/")) return true;
      // OAuth and MCP endpoints answer for themselves: tokens, JSON errors, or (authorize) their own sign-in redirect.
      if (pathname.startsWith("/oauth/") || pathname.startsWith("/.well-known/") || pathname === "/api/mcp") return true;
      // Resend's webhook: authenticated by its signature, not a session.
      if (pathname.startsWith("/api/inbound/")) return true;
      if (pathname === "/") return Response.redirect(new URL(signedIn ? "/board" : "/login", nextUrl));
      if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        // Only page visits are redirected. A form submission (Server Action POST) can't follow
        // a redirect, so redirecting it would crash the page instead of signing in.
        if (!signedIn || method !== "GET") return true;
        return Response.redirect(new URL(safeCallbackPath(nextUrl.searchParams.get("callbackUrl")), nextUrl));
      }
      return signedIn;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.verified = "emailVerified" in user && Boolean(user.emailVerified);
      }
      return token;
    },
    // Sessions from before email verification have no `verified`, so they act signed out until the person signs in again.
    session({ session, token }) {
      if (token.sub && token.verified === true) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
