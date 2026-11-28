import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { dueState, jobMatches, jobSorters } from "@shared/jobs";
import { formatPence } from "@shared/money";
import type { Job, JobPatch, JobsResponse, JobUpdateResponse } from "@shared/types";
import { londonToday, REPEAT_UNITS } from "@shared/week";
import type { ApiCall } from "../api";
import { jobData, jobMarkdown, page, paging, pounds, reply, responseFormat, text, toPence } from "../format";

const jobId = z.number().int().positive().describe("The job's id, from homeapp_list_jobs");
const partId = z.number().int().positive().describe("The part's id, shown next to each part by homeapp_list_jobs");

const severity = z.enum(["low", "med", "high"]).describe("How urgent: low, med or high");
const doer = z
  .enum(["diy", "trade"])
  .nullable()
  .describe("Who does it: 'diy' (ourselves), 'trade' (a tradesperson), or null for not decided");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("A date as YYYY-MM-DD");
const repeat = z
  .object({
    every: z.number().int().min(1).max(52).describe("How many units between repeats"),
    unit: z.enum(REPEAT_UNITS).describe("week, month or year"),
  })
  .nullable()
  .describe("Makes the job recurring, e.g. {every: 6, unit: 'month'}; null makes it one-off");
const link = z.string().max(2000).describe("An http(s) link to buy it");

/** Fields shared by create and update. All optional; null clears a field. */
const jobFields = {
  severity: severity.optional(),
  room: z.string().max(60).nullable().optional().describe("Where in the house, e.g. 'Kitchen'; null clears it"),
  doer: doer.optional(),
  notes: z.string().max(2000).optional().describe("Free-text notes"),
  estimate_gbp: pounds.nullable().optional().describe("Estimated cost in pounds, e.g. 120 or 12.5; null clears it"),
  due_on: date.nullable().optional().describe("Due date as YYYY-MM-DD; null clears it"),
  repeat: repeat.optional(),
};

/** MCP argument names → the API's field names, leaving out anything not given. */
function toApiFields(args: {
  severity?: Job["severity"];
  room?: string | null;
  doer?: Job["doer"];
  notes?: string;
  estimate_gbp?: number | null;
  due_on?: string | null;
  repeat?: Job["repeat"];
}): JobPatch {
  const { estimate_gbp, due_on, ...rest } = args;
  return {
    ...rest,
    ...(estimate_gbp !== undefined && { estimatePence: estimate_gbp === null ? null : toPence(estimate_gbp) }),
    ...(due_on !== undefined && { dueOn: due_on }),
  };
}

async function loadJobs(api: ApiCall) {
  return (await api<JobsResponse>("GET", "/api/jobs")).jobs;
}

export function registerJobTools(server: McpServer, api: ApiCall) {
  server.registerTool(
    "homeapp_list_jobs",
    {
      title: "List house jobs",
      description: `List the house jobs to-do list, with each job's parts to buy.

Defaults to open jobs, most urgent first (priority, then soonest due). Due states: overdue, due soon (within 7 days), coming up (further off). Money is shown in pounds.

Examples:
  - "What needs doing in the bathroom?" -> room="bathroom"
  - "Anything overdue?" -> due="overdue"
  - "What did we finish recently?" -> status="done", sort="newest"
  - "Which jobs need a tradesperson?" -> doer="trade"`,
      inputSchema: z.strictObject({
        status: z.enum(["open", "done", "all"]).default("open").describe("open (still to do), done, or all"),
        query: z.string().max(200).optional().describe("Words to find in the title, room or notes"),
        room: z.string().max(60).optional().describe("Only jobs in this room (case-insensitive)"),
        severity: severity.optional(),
        doer: z.enum(["diy", "trade", "undecided"]).optional().describe("Only DIY, tradesperson, or undecided jobs"),
        due: z
          .enum(["overdue", "due_soon", "upcoming", "no_date", "on_todo_list"])
          .optional()
          .describe("Only open jobs in this due state; 'on_todo_list' = overdue, due soon or no date (what the app shows as to-do)"),
        sort: z.enum(["urgent", "newest", "expensive"]).default("urgent"),
        ...paging,
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const today = londonToday();
      const room = args.room?.trim().toLowerCase();
      const found = (await loadJobs(api))
        .filter((j) => args.status === "all" || (args.status === "done") === (j.doneAt !== null))
        .filter((j) => !args.query || jobMatches(j, args.query))
        .filter((j) => !room || j.room?.toLowerCase() === room)
        .filter((j) => !args.severity || j.severity === args.severity)
        .filter((j) => !args.doer || (j.doer ?? "undecided") === args.doer)
        .filter((j) => {
          if (!args.due) return true;
          if (j.doneAt) return false;
          const state = dueState(j, today);
          if (args.due === "on_todo_list") return state !== "upcoming";
          return state === { overdue: "overdue", due_soon: "due-soon", upcoming: "upcoming", no_date: "none" }[args.due];
        })
        .sort(jobSorters[args.sort]);
      return page(found, { limit: args.limit, offset: args.offset, format: args.response_format }, {
        key: "jobs",
        heading: `House jobs (${args.status}) — today is ${today}`,
        empty: "No jobs match. Try status='all' or fewer filters.",
        item: (j) => jobMarkdown(j, today),
        data: (j) => jobData(j, today),
      });
    },
  );

  server.registerTool(
    "homeapp_get_job",
    {
      title: "Get house job",
      description: "Get one house job by id, with its notes and parts.",
      inputSchema: z.strictObject({ job_id: jobId, response_format: responseFormat }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id, response_format }) => {
      const job = (await loadJobs(api)).find((j) => j.id === job_id);
      if (!job) return text(`No job with id ${job_id}. Use homeapp_list_jobs (status='all') to find it.`);
      const today = londonToday();
      return reply(response_format, jobMarkdown(job, today), { job: jobData(job, today) });
    },
  );

  server.registerTool(
    "homeapp_create_job",
    {
      title: "Add house job",
      description: `Add a job to the house jobs list, optionally with parts to buy.

Severity defaults to 'med'. Set due_on for a deadline and repeat for chores that come round again (ticking one off creates the next copy automatically).

Example: "Fix the dripping kitchen tap, medium, DIY, need a washer" ->
  title="Fix dripping tap", room="Kitchen", severity="med", doer="diy", parts=[{name: "Tap washer"}]`,
      inputSchema: z.strictObject({
        title: z.string().min(1).max(200).describe("What needs doing"),
        ...jobFields,
        parts: z
          .array(z.strictObject({ name: z.string().min(1).max(200), url: link.optional() }))
          .max(30)
          .optional()
          .describe("Things to buy for it"),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, parts, response_format, ...fields }) => {
      let { job } = await api<{ job: Job }>("POST", "/api/jobs", { title, ...toApiFields(fields) });
      for (const part of parts ?? []) {
        ({ job } = await api<{ job: Job }>("POST", `/api/jobs/${job.id}/parts`, part));
      }
      const today = londonToday();
      return reply(response_format, `Added:\n${jobMarkdown(job, today)}`, { job: jobData(job, today) });
    },
  );

  server.registerTool(
    "homeapp_update_job",
    {
      title: "Update house job",
      description: `Change a house job, or tick it off.

- done=true ticks it off (recording who and when); add actual_gbp to record what it cost. For a recurring job this also creates the next copy, due one interval from today, with its parts back on the shopping list.
- done=false puts it back on the list and removes the next copy if that hasn't been done yet.
- Any other field changes just that field; null clears it.`,
      inputSchema: z.strictObject({
        job_id: jobId,
        title: z.string().min(1).max(200).optional(),
        ...jobFields,
        actual_gbp: pounds.nullable().optional().describe("What it actually cost, in pounds; null clears it"),
        done: z.boolean().optional().describe("true to tick off, false to put back on the list"),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id, title, actual_gbp, done, response_format, ...fields }) => {
      const today = londonToday();
      const patch: JobPatch = {
        ...toApiFields(fields),
        ...(title !== undefined && { title }),
        ...(actual_gbp !== undefined && { actualPence: actual_gbp === null ? null : toPence(actual_gbp) }),
        ...(done !== undefined && { done, today }),
      };
      if (!Object.keys(patch).length) return text("Nothing to change: pass at least one field.");
      const res = await api<JobUpdateResponse>("PATCH", `/api/jobs/${job_id}`, patch);
      const lines = [`Updated:\n${jobMarkdown(res.job, today)}`];
      if (res.created) lines.push(`\nNext occurrence created:\n${jobMarkdown(res.created, today)}`);
      if (res.removedId) lines.push(`\nRemoved the next occurrence (job_id ${res.removedId}).`);
      return reply(response_format, lines.join("\n"), {
        job: jobData(res.job, today),
        ...(res.created && { created: jobData(res.created, today) }),
        ...(res.removedId && { removed_id: res.removedId }),
      });
    },
  );

  server.registerTool(
    "homeapp_delete_job",
    {
      title: "Delete house job",
      description:
        "Delete a house job and its parts for good. To mark a job finished, use homeapp_update_job with done=true instead. Confirm with the user first.",
      inputSchema: z.strictObject({ job_id: jobId }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ job_id }) => {
      await api("DELETE", `/api/jobs/${job_id}`);
      return text(`Deleted job ${job_id}.`);
    },
  );

  server.registerTool(
    "homeapp_add_part",
    {
      title: "Add part to buy",
      description: "Add something to buy for a house job. It appears on the shopping list until marked bought.",
      inputSchema: z.strictObject({
        job_id: jobId,
        name: z.string().min(1).max(200).describe("What to buy, e.g. '15mm compression elbow'"),
        url: link.optional(),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ job_id, name, url, response_format }) => {
      const { job } = await api<{ job: Job }>("POST", `/api/jobs/${job_id}/parts`, { name, url });
      const today = londonToday();
      return reply(response_format, `Added part:\n${jobMarkdown(job, today)}`, { job: jobData(job, today) });
    },
  );

  server.registerTool(
    "homeapp_update_part",
    {
      title: "Update part",
      description: "Mark a part bought (or not bought), rename it, or change its link. url=null removes the link.",
      inputSchema: z.strictObject({
        part_id: partId,
        bought: z.boolean().optional().describe("true once bought, false to put it back on the shopping list"),
        name: z.string().min(1).max(200).optional(),
        url: link.nullable().optional(),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ part_id, response_format, ...patch }) => {
      if (Object.values(patch).every((v) => v === undefined)) {
        return text("Nothing to change: pass bought, name and/or url.");
      }
      const { job } = await api<{ job: Job }>("PATCH", `/api/parts/${part_id}`, patch);
      const today = londonToday();
      return reply(response_format, `Updated part:\n${jobMarkdown(job, today)}`, { job: jobData(job, today) });
    },
  );

  server.registerTool(
    "homeapp_delete_part",
    {
      title: "Delete part",
      description: "Remove a part from a job.",
      inputSchema: z.strictObject({ part_id: partId, response_format: responseFormat }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ part_id, response_format }) => {
      const { job } = await api<{ job: Job }>("DELETE", `/api/parts/${part_id}`);
      const today = londonToday();
      return reply(response_format, `Removed part:\n${jobMarkdown(job, today)}`, { job: jobData(job, today) });
    },
  );

  server.registerTool(
    "homeapp_shopping_list",
    {
      title: "Shopping list",
      description:
        "Everything still to buy across open house jobs, grouped by job (the app's Shopping list view). Use homeapp_update_part with bought=true to tick items off.",
      inputSchema: z.strictObject({
        include_bought: z.boolean().default(false).describe("Also list parts already bought"),
        response_format: responseFormat,
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ include_bought, response_format }) => {
      const groups = (await loadJobs(api))
        .filter((j) => j.doneAt === null)
        .sort(jobSorters.urgent)
        .map((job) => ({ job, parts: job.parts.filter((p) => include_bought || p.boughtAt === null) }))
        .filter((g) => g.parts.length);
      const count = groups.reduce((n, g) => n + g.parts.length, 0);
      const markdown = groups.length
        ? [
            `# Shopping list (${count} item${count === 1 ? "" : "s"})`,
            ...groups.map(({ job, parts }) =>
              [
                `\n## ${job.title} (job_id ${job.id})${job.room ? ` — ${job.room}` : ""}${job.estimatePence !== null ? ` — est. ${formatPence(job.estimatePence)}` : ""}`,
                ...parts.map((p) => `- [${p.boughtAt ? "x" : " "}] ${p.name} (part_id ${p.id})${p.url ? ` — ${p.url}` : ""}`),
              ].join("\n"),
            ),
          ].join("\n")
        : "Nothing to buy: no open job has unbought parts.";
      return reply(response_format, markdown, {
        count,
        groups: groups.map(({ job, parts }) => ({ job_id: job.id, job_title: job.title, room: job.room, parts })),
      });
    },
  );
}
