import { expect, test } from "vitest";
import { impersonatedApp } from "@/lib/oauth/lookalike";

test.each([
  ["Claude", "claude.ai", null],
  ["Claude", "api.claude.ai", null],
  ["ChatGPT", "chatgpt.com", null],
  ["Claude", "client.example", "Claude"],
  ["Anthropic Claude", "claude.ai.evil.example", "Claude"],
  ["ChatGPT Connector", "evil.example", "ChatGPT"],
  ["My Tool", "evil.example", null],
])("impersonatedApp(%s, %s) = %s", (name, host, expected) => expect(impersonatedApp(name, host)).toBe(expected));
