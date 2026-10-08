import { expect, test } from "vitest";
import { safeCallbackPath } from "@/lib/callback-path";

test.each([
  ["/oauth/authorize?client_id=x&state=y", "/oauth/authorize?client_id=x&state=y"],
  ["/applications/abc", "/applications/abc"],
  [undefined, "/board"],
  ["", "/board"],
  ["https://evil.example/", "/board"],
  ["//evil.example/x", "/board"],
  ["/\\evil.example", "/board"],
  ["javascript:alert(1)", "/board"],
  ["board", "/board"],
  ["/\t/evil.example", "/board"],
  ["/\n/evil.example", "/board"],
  ["/\r/evil.example", "/board"],
  ["/\t\\evil.example", "/board"],
  ["/ok?next=//x", "/ok?next=//x"],
])("safeCallbackPath(%j) = %j", (raw, expected) => expect(safeCallbackPath(raw)).toBe(expected));
