import { requireScopes, type McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SOURCES, STATUSES, USER_EVENT_TYPES } from "@/lib/status";
import { LimitReachedError, NotFoundError, RateLimitedError } from "@/server/services/errors";
import {
  ToolInputError,
  addApplicationTool,
  addTimelineEntryTool,
  changeStatusTool,
  getApplicationTool,
  pipelineSummaryTool,
  searchApplicationsTool,
  updateApplicationTool,
} from "./tools";

const READ = requireScopes("applications:read");
const WRITE = requireScopes("applications:write");

type Ctx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

/** Runs a tool for the token's user. Expected failures come back as tool errors the assistant can read and act on. */
async function run(ctx: Ctx, fn: (userId: string) => Promise<unknown>) {
  const userId = ctx.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string") return error("Not signed in.");
  try {
    const result = (await fn(userId)) as Record<string, unknown>;
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], structuredContent: result };
  } catch (e) {
    if (e instanceof NotFoundError) return error("Application not found.");
    if (e instanceof ToolInputError || e instanceof RateLimitedError || e instanceof LimitReachedError) return error(e.message);
    throw e;
  }
}

const error = (text: string) => ({ isError: true, content: [{ type: "text" as const, text }] });

const id = z.string().min(1).describe("The application's id (from search_applications)");
const status = z.enum(STATUSES);
const optionalText = (description: string) => z.string().nullable().optional().describe(`${description} Use null to clear it.`);
const fields = {
  url: optionalText("Link to the job posting."),
  companyDomain: optionalText("The company's website, e.g. stripe.com. Shows the company logo."),
  location: optionalText('Location, e.g. "Toronto, ON, Canada", "Remote" or "Hybrid · New York, NY, United States".'),
  salaryRange: optionalText('Salary range, e.g. "$120k-$150k".'),
  source: z.enum(SOURCES).optional().describe("Where the job was found."),
  dateApplied: z.string().nullable().optional().describe("Date applied, YYYY-MM-DD. Filled in automatically when the status becomes APPLIED."),
  description: optionalText("The job description."),
  notes: optionalText("Private notes."),
};

export function registerLandedTools(server: McpServer) {
  server.registerTool(
    "search_applications",
    {
      title: "Search applications",
      description: "List the user's job applications, newest activity first. Filter by company name, status or source.",
      inputSchema: z.object({
        company: z.string().optional().describe("Part of the company name"),
        statuses: z.array(status).optional(),
        sources: z.array(z.enum(SOURCES)).optional(),
        sort: z.enum(["company", "title", "status", "dateApplied", "updatedAt"]).optional(),
        dir: z.enum(["asc", "desc"]).optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
      }),
      annotations: { readOnlyHint: true },
      scopeChallenge: READ,
    },
    (args, ctx) => run(ctx, (userId) => searchApplicationsTool(userId, args)),
  );

  server.registerTool(
    "get_application",
    {
      title: "Get application",
      description: "One application in full, including its description, notes and timeline.",
      inputSchema: z.object({ id }),
      annotations: { readOnlyHint: true },
      scopeChallenge: READ,
    },
    (args, ctx) => run(ctx, (userId) => getApplicationTool(userId, args)),
  );

  server.registerTool(
    "pipeline_summary",
    {
      title: "Pipeline summary",
      description: `Counts per status, plus applications in APPLIED or INTERVIEW with no update for ${14}+ days (worth following up).`,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      scopeChallenge: READ,
    },
    (_args, ctx) => run(ctx, (userId) => pipelineSummaryTool(userId)),
  );

  server.registerTool(
    "add_application",
    {
      title: "Add application",
      description: "Add a job application. Company and title are required; status defaults to SAVED.",
      inputSchema: z.object({ company: z.string(), title: z.string(), status: status.optional(), ...fields }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      scopeChallenge: WRITE,
    },
    (args, ctx) => run(ctx, (userId) => addApplicationTool(userId, args)),
  );

  server.registerTool(
    "update_application",
    {
      title: "Update application",
      description: "Change some fields of an application. Fields left out stay as they are. To move it to another stage, prefer change_status.",
      inputSchema: z.object({ id, company: z.string().optional(), title: z.string().optional(), status: status.optional(), ...fields }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      scopeChallenge: WRITE,
    },
    (args, ctx) => run(ctx, (userId) => updateApplicationTool(userId, args)),
  );

  server.registerTool(
    "change_status",
    {
      title: "Change status",
      description: "Move an application to another stage. Recorded in its timeline, like dragging it on the board.",
      inputSchema: z.object({ id, status }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      scopeChallenge: WRITE,
    },
    (args, ctx) => run(ctx, (userId) => changeStatusTool(userId, args)),
  );

  server.registerTool(
    "add_timeline_entry",
    {
      title: "Add timeline entry",
      description: "Log an interview, email, note or follow-up on an application. NOTE entries need notes.",
      inputSchema: z.object({
        id,
        type: z.enum(USER_EVENT_TYPES),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
        notes: z.string().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      scopeChallenge: WRITE,
    },
    (args, ctx) => run(ctx, (userId) => addTimelineEntryTool(userId, args)),
  );
}
