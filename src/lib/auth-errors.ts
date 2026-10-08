const MESSAGES: Record<string, string> = {
  CredentialsSignin: "Email or password is incorrect.",
  unverified: "Verify your email first. We've sent you a new link.",
  rate_limited: "Too many sign-in attempts. Wait 15 minutes and try again.",
  OAuthAccountNotLinked: "This email is already registered with a password. Sign in with your password instead.",
};

/** Turns an Auth.js error code (from `?error=` or a thrown AuthError) into text for the login page. */
export function authErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "Something went wrong signing you in. Please try again.";
}
