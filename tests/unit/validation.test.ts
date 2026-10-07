import { describe, expect, test } from "vitest";
import { applicationInputSchema } from "@/lib/validation/application";
import { eventInputSchema } from "@/lib/validation/event";
import { registerSchema } from "@/lib/validation/auth";

const base = { company: "Acme", title: "Frontend Engineer" };

describe("applicationInputSchema", () => {
  test("minimal input gets defaults", () => {
    expect(applicationInputSchema.parse(base)).toMatchObject({ status: "SAVED", source: "OTHER" });
  });

  test("company and title are required and trimmed", () => {
    expect(applicationInputSchema.safeParse({ company: "  ", title: "x" }).success).toBe(false);
    expect(applicationInputSchema.parse({ company: " Acme ", title: " Dev " })).toMatchObject({
      company: "Acme",
      title: "Dev",
    });
  });

  test("url without protocol is normalized to https", () => {
    expect(applicationInputSchema.parse({ ...base, url: "boards.greenhouse.io/acme/jobs/1" }).url).toBe(
      "https://boards.greenhouse.io/acme/jobs/1",
    );
  });

  test("empty optional strings become undefined", () => {
    const r = applicationInputSchema.parse({ ...base, url: "", location: "", dateApplied: "" });
    expect(r.url).toBeUndefined();
    expect(r.location).toBeUndefined();
    expect(r.dateApplied).toBeUndefined();
  });

  test("non-http url is rejected", () => {
    expect(applicationInputSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
  });

  test("dateApplied parses as UTC date", () => {
    expect(applicationInputSchema.parse({ ...base, dateApplied: "2026-10-07" }).dateApplied?.toISOString()).toBe(
      "2026-10-07T00:00:00.000Z",
    );
  });

  test("length limits", () => {
    expect(applicationInputSchema.safeParse({ ...base, company: "a".repeat(101) }).success).toBe(false);
    expect(applicationInputSchema.safeParse({ ...base, notes: "a".repeat(5001) }).success).toBe(false);
  });
});

describe("eventInputSchema", () => {
  test("excludes STATUS_CHANGE and requires notes for NOTE", () => {
    expect(eventInputSchema.safeParse({ type: "STATUS_CHANGE", date: "2026-10-07" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ type: "NOTE", date: "2026-10-07", notes: "" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ type: "INTERVIEW", date: "2026-10-07" }).success).toBe(true);
  });
});

describe("registerSchema", () => {
  test("lowercases email and bounds password bytes", () => {
    expect(registerSchema.parse({ email: "Foo@Example.com", name: "A", password: "longenough" }).email).toBe(
      "foo@example.com",
    );
    expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "short" }).success).toBe(false);
    // 37 two-byte characters = 74 bytes, over bcrypt's 72-byte limit.
    expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "é".repeat(37) }).success).toBe(false);
  });
});
