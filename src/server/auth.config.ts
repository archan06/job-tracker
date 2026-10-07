import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** Google sign-in is optional; the app works with email/password alone. */
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const PUBLIC_PATHS = ["/login", "/register"];
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
      const signedIn = Boolean(auth?.user);
      const { pathname } = nextUrl;
      if (pathname.startsWith("/api/auth")) return true;
      if (PUBLIC_ASSETS.includes(pathname)) return true;
      // API routes check the session themselves and answer 401; a redirect to /login would hand fetch() an HTML page.
      if (pathname.startsWith("/api/suggest/")) return true;
      if (pathname === "/") return Response.redirect(new URL(signedIn ? "/board" : "/login", nextUrl));
      if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
        // Only page visits are redirected. A form submission (Server Action POST) can't follow
        // a redirect, so redirecting it would crash the page instead of signing in.
        return signedIn && method === "GET" ? Response.redirect(new URL("/board", nextUrl)) : true;
      }
      return signedIn;
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
