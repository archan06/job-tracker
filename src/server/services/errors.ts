/** Thrown when a record doesn't exist or belongs to another user. The two cases look identical on purpose. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailTakenError";
  }
}

/** The account hit a hard cap (for example, the maximum number of applications). */
export class LimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitReachedError";
  }
}

/** Too many requests in a short time; try again shortly. */
export class RateLimitedError extends Error {
  constructor(message = "You're making changes too quickly. Wait a minute and try again.") {
    super(message);
    this.name = "RateLimitedError";
  }
}
