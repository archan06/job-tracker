import type { ApplicationInput } from "@/lib/validation/application";
import { db } from "@/server/db";
import { createApplication } from "@/server/services/applications";

let counter = 0;

export function makeUser(email = `user-${++counter}-${Date.now()}@example.com`) {
  return db.user.create({ data: { email, name: "Test User" } });
}

export function makeApplication(userId: string, overrides: Partial<ApplicationInput> = {}) {
  return createApplication(userId, {
    company: "Northwind Labs",
    title: "Software Engineer",
    status: "SAVED",
    source: "OTHER",
    ...overrides,
  });
}
