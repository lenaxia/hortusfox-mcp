import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { HortusFoxClient } from "../client.js";
import { jsonResult } from "../result.js";
import { registerConfirmableRemove } from "./shared.js";

const RECURRING_SCOPES = z
  .enum(["hours", "days", "weeks", "months"])
  .describe("Time unit for recurring_time.");

export function registerTaskTools(
  server: McpServer,
  client: HortusFoxClient,
  config: Config,
): void {
  server.tool(
    "tasks_list",
    "List tasks. Defaults to open tasks only.",
    {
      done: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, return completed tasks instead of open ones."),
      limit: z.number().int().positive().max(500).optional().default(100),
    },
    async (args) => {
      const data = await client.get("/tasks/fetch", args);
      return jsonResult(data);
    },
  );

  if (!config.enableWrites) return;

  server.tool(
    "tasks_add",
    "Add a new task. To make it recurring, supply both due_date and recurring_time.",
    {
      title: z.string().min(1),
      description: z.string().optional().default(""),
      due_date: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD) the task is due."),
      recurring_time: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          "Quantity of recurrence (requires due_date + recurring_scope).",
        ),
      recurring_scope: RECURRING_SCOPES.optional().default("hours"),
      plant: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Optional plant id to associate the task with."),
    },
    async (args) => {
      const params: Record<string, unknown> = {
        title: args.title,
        description: args.description,
        due_date: args.due_date,
        recurring_time: args.recurring_time,
        recurring_scope: args.recurring_scope,
      };
      if (args.plant !== undefined) params.plant = args.plant;
      const data = await client.get("/tasks/add", params);
      return jsonResult(data);
    },
  );

  server.tool(
    "tasks_edit",
    "Edit a task. All non-id fields are optional (partial updates supported). " +
      "Caveat: if you set recurring_time, also set recurring_scope — otherwise " +
      "the upstream default of 'hours' overwrites any existing scope.",
    {
      task: z.string().or(z.number().int().positive()),
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      due_date: z.string().optional(),
      recurring_time: z.number().int().positive().optional(),
      recurring_scope: RECURRING_SCOPES.optional(),
      done: z.boolean().optional(),
    },
    async (args) => {
      const data = await client.get("/tasks/edit", args);
      return jsonResult(data);
    },
  );

  server.tool(
    "tasks_complete",
    "Convenience wrapper: mark a task done. Equivalent to tasks_edit with done=true.",
    {
      task: z.string().or(z.number().int().positive()),
    },
    async (args) => {
      const data = await client.get("/tasks/edit", {
        task: args.task,
        done: true,
      });
      return jsonResult(data);
    },
  );

  registerConfirmableRemove(
    server,
    "tasks_remove",
    "Remove a task.",
    "task",
    async (task) => {
      const data = await client.get("/tasks/remove", { task });
      return data;
    },
    async () => ({ note: "Task will be permanently deleted." }),
  );
}
