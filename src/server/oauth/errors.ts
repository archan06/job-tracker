/** An OAuth protocol error (RFC 6749 §5.2), carried to the HTTP layer as `{ error, error_description }`. */
export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }

  toResponse(headers: Record<string, string> = {}): Response {
    return Response.json(
      { error: this.code, error_description: this.description },
      { status: this.status, headers: { "Cache-Control": "no-store", ...headers } },
    );
  }
}
