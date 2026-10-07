import { expect, test } from "vitest";
import { clientIp } from "@/server/client-ip";

test("prefers the platform's real-ip header, then the first forwarded address", () => {
  expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
  expect(clientIp(new Headers())).toBe("unknown");
});
