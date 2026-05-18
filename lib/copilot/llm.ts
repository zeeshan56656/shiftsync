import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ScriptedToolCallChatModel, type ScriptedRule } from "@/lib/copilot/mock-llm";

/**
 * Mock rules for browser demos when ANTHROPIC_API_KEY is empty.
 * Read rules return static args. Write rules use async resolvers that
 * look up real IDs from the DB at call time — making the HITL demo
 * fully working without any LLM cost.
 */
const MOCK_RULES: ScriptedRule[] = [
  // Read tools
  { match: /location/i, toolName: "listLocations" },
  { match: /(schedule|week|shifts|roster|unfilled)/i, toolName: "getWeekSchedule", args: {} },
  {
    match: /find\s+(staff|sarah|john|maria|rachel)/i,
    toolName: "findStaff",
    args: async () => {
      // No specific name → list all. With a specific name, the find tool itself does substring match.
      return {};
    },
  },

  // Write tools — async resolvers fetch real IDs at call time.
  {
    match: /assign\s+sarah/i,
    toolName: "assignStaff",
    args: async () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const sarah = await prisma.user.findUnique({
        where: { email: "sarah@coastaleats.com" },
      });
      // First unfilled shift this week where Sarah is qualified (bartender or server skill).
      const shift = await prisma.shift.findFirst({
        where: {
          startTime: { gte: monday },
          status: "PUBLISHED",
          assignments: { none: { userId: sarah?.id } },
          requiredSkill: { name: { in: ["bartender", "server"] } },
          location: { id: { in: ["loc_marina", "loc_pacific"] } },
        },
        orderBy: { startTime: "asc" },
      });
      return { userId: sarah?.id ?? "missing-sarah", shiftId: shift?.id ?? "no-unfilled-shift" };
    },
  },
  {
    match: /assign\s+john/i,
    toolName: "assignStaff",
    args: async () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const john = await prisma.user.findUnique({
        where: { email: "john@coastaleats.com" },
      });
      const shift = await prisma.shift.findFirst({
        where: {
          startTime: { gte: monday },
          status: "PUBLISHED",
          assignments: { none: { userId: john?.id } },
          requiredSkill: { name: { in: ["bartender", "barback"] } },
        },
        orderBy: { startTime: "asc" },
      });
      return { userId: john?.id ?? "missing-john", shiftId: shift?.id ?? "no-unfilled-shift" };
    },
  },
  {
    match: /(reassign|swap|replace).*\b(with|for|to)\b/i,
    toolName: "reassignShift",
    args: async () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      // Pick first pre-assigned current-week assignment + a different qualified staff.
      const assignment = await prisma.shiftAssignment.findFirst({
        where: { shift: { startTime: { gte: monday } } },
        include: { shift: { include: { requiredSkill: true } } },
        orderBy: { shift: { startTime: "asc" } },
      });
      if (!assignment) {
        return { assignmentId: "no-assignment", newUserId: "no-user" };
      }
      const candidate = await prisma.user.findFirst({
        where: {
          role: "STAFF",
          id: { not: assignment.userId },
          skills: { some: { skillId: assignment.shift.requiredSkillId } },
          locations: { some: { locationId: assignment.shift.locationId } },
        },
      });
      return {
        assignmentId: assignment.id,
        newUserId: candidate?.id ?? "no-candidate",
      };
    },
  },
  {
    match: /(unassign|remove).*(sarah|monday|first)/i,
    toolName: "removeAssignment",
    args: async () => {
      // Pick the first pre-assigned current-week assignment.
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const assignment = await prisma.shiftAssignment.findFirst({
        where: { shift: { startTime: { gte: monday } } },
        orderBy: { shift: { startTime: "asc" } },
      });
      return { assignmentId: assignment?.id ?? "no-assignment" };
    },
  },
  {
    match: /(preview|check).*(assign|impact)/i,
    toolName: "previewAssignment",
    args: async () => {
      const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
      const sarah = await prisma.user.findUnique({
        where: { email: "sarah@coastaleats.com" },
      });
      const shift = await prisma.shift.findFirst({
        where: {
          startTime: { gte: monday },
          status: "PUBLISHED",
          requiredSkill: { name: { in: ["bartender", "server"] } },
        },
      });
      return { userId: sarah?.id ?? "missing", shiftId: shift?.id ?? "missing" };
    },
  },
  {
    match: /^(hi|hello|hey)/i,
    reply:
      "[mock] Hi — I'm the scheduling copilot. Try: 'list locations', 'show this week's schedule', 'find sarah', or the HITL flow with 'assign sarah to a bartender shift'.",
  },
];

export function getPlannerLLM(
  tools: StructuredToolInterface[]
): BaseChatModel {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new ScriptedToolCallChatModel(MOCK_RULES);
  }

  const real = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 1024,
  });
  return real.bindTools(tools) as unknown as BaseChatModel;
}
