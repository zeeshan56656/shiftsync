import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { startOfWeek, addDays } from "date-fns";
import { buildCopilotGraph } from "../lib/copilot/graph";
import { ScriptedToolCallChatModel } from "../lib/copilot/mock-llm";
import type { CopilotSession } from "../lib/copilot/session";
import { prisma } from "../lib/prisma";

async function findAdminSession(): Promise<CopilotSession> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin) throw new Error("No ADMIN user in DB — run `npm run copilot:seed` first.");
  return {
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

type SmokeGraph = Awaited<ReturnType<typeof buildCopilotGraph>>;

async function runTurn(
  label: string,
  graph: SmokeGraph,
  threadId: string,
  userText: string
) {
  console.log(`\n[smoke] ─── ${label}: "${userText}" ───`);
  const priorSnap = await graph.getState({ configurable: { thread_id: threadId } });
  const priorCount = priorSnap.values.messages?.length ?? 0;

  const result = await graph.invoke(
    { messages: [new HumanMessage(userText)] },
    { configurable: { thread_id: threadId } }
  );

  const newMessages = result.messages.slice(priorCount);
  let toolCallsSeen = 0;
  for (const m of newMessages) {
    if (m instanceof AIMessage && Array.isArray(m.tool_calls)) toolCallsSeen += m.tool_calls.length;
  }

  const last = result.messages[result.messages.length - 1];
  console.log(
    `[smoke]   newInTurn=${newMessages.length}  toolCalls=${toolCallsSeen}  lastType=${last.constructor.name}`
  );
  console.log(`[smoke]   final: "${String(last.content).slice(0, 160)}${String(last.content).length > 160 ? "…" : ""}"`);

  return { result, toolCallsSeen };
}

async function readTools(graph: SmokeGraph, threadId: string) {
  const t1 = await runTurn("Turn 1", graph, threadId, "list locations please");
  if (t1.toolCallsSeen === 0) throw new Error("Turn 1: expected ≥1 tool call (listLocations)");

  const t2 = await runTurn("Turn 2", graph, threadId, "show me this week's schedule");
  if (t2.toolCallsSeen === 0) throw new Error("Turn 2: expected ≥1 tool call (getWeekSchedule)");

  const t3 = await runTurn("Turn 3", graph, threadId, "hi");
  if (t3.toolCallsSeen !== 0) throw new Error("Turn 3: expected 0 tool calls for greeting");

  const snap = await graph.getState({ configurable: { thread_id: threadId } });
  console.log(`[smoke]   persisted ${snap.values.messages?.length ?? 0} messages`);
}

async function hitlAssignFlow(session: CopilotSession) {
  console.log("\n[smoke] ─── HITL: assignStaff with interrupt() + resume ───");

  // 1) Find an unfilled shift in this week.
  const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const nextMonday = addDays(thisMonday, 7);
  const shift = await prisma.shift.findFirst({
    where: {
      startTime: { gte: thisMonday, lt: nextMonday },
      status: "PUBLISHED",
      assignments: { none: {} },
    },
    include: { location: true, requiredSkill: true },
  });
  if (!shift) throw new Error("No unfilled current-week shift found — re-run `npm run copilot:seed`.");

  // 2) Find a qualified user (right skill + certified at location) not already on this shift.
  const candidate = await prisma.user.findFirst({
    where: {
      role: "STAFF",
      skills: { some: { skillId: shift.requiredSkillId } },
      locations: { some: { locationId: shift.locationId } },
      assignments: { none: { shiftId: shift.id } },
    },
  });
  if (!candidate) throw new Error(`No qualified candidate for shift ${shift.id}`);

  console.log(`[smoke]   testShift=${shift.id} (${shift.location.name}, ${shift.requiredSkill.name})`);
  console.log(`[smoke]   candidate=${candidate.id} (${candidate.name})`);

  // 3) Custom scripted mock that fires assignStaff with the real IDs.
  const scriptedMock = new ScriptedToolCallChatModel([
    {
      match: /assign/,
      toolName: "assignStaff",
      args: { shiftId: shift.id, userId: candidate.id },
    },
  ]);

  const graph = await buildCopilotGraph(session, { llm: scriptedMock });
  const threadId = `smoke-hitl-${Date.now()}`;
  const config = { configurable: { thread_id: threadId } };

  // 4) Invoke — expect graph to pause on interrupt().
  await graph.invoke(
    { messages: [new HumanMessage(`assign ${candidate.name} to that shift`)] },
    config
  );

  const pausedState = await graph.getState(config);
  type PendingInterrupt = { value?: unknown; id?: string };
  const interrupts: PendingInterrupt[] =
    pausedState.tasks?.flatMap((t: { interrupts?: PendingInterrupt[] }) => t.interrupts ?? []) ?? [];

  if (interrupts.length === 0) throw new Error("Expected graph to be paused on interrupt() — none found");
  console.log(`[smoke]   ✓ paused on interrupt; payload toolName=${(interrupts[0].value as { toolName?: string })?.toolName}`);

  // 5) Cancel path first — verify no write happens.
  await graph.invoke(new Command({ resume: { approved: false, reason: "smoke test cancel branch" } }), config);

  const afterCancel = await prisma.shiftAssignment.count({
    where: { shiftId: shift.id, userId: candidate.id },
  });
  if (afterCancel !== 0) throw new Error(`Cancel branch should not create assignment; found ${afterCancel}`);
  console.log("[smoke]   ✓ cancel branch — no DB write");

  // 6) Re-invoke + approve path — verify write happens.
  await graph.invoke(
    { messages: [new HumanMessage(`assign ${candidate.name} again`)] },
    config
  );
  await graph.invoke(new Command({ resume: { approved: true } }), config);

  const created = await prisma.shiftAssignment.findFirst({
    where: { shiftId: shift.id, userId: candidate.id },
  });
  if (!created) throw new Error("Approved branch should create the assignment");
  console.log(`[smoke]   ✓ approve branch — assignment ${created.id} created`);

  const audit = await prisma.auditLog.findFirst({
    where: { entityType: "assignment", entityId: created.id, action: "agent.assigned" },
  });
  if (!audit) throw new Error("Approved branch should write agent.assigned audit row");
  console.log(`[smoke]   ✓ audit row written with action='${audit.action}', performedById=${audit.performedById}`);

  // 7) Cleanup: delete the test assignment + audit row.
  await prisma.auditLog.deleteMany({ where: { entityId: created.id } });
  await prisma.shiftAssignment.delete({ where: { id: created.id } });
  console.log("[smoke]   ✓ cleanup complete");
}

async function main() {
  console.log("[smoke] Resolving admin session from DB...");
  const session = await findAdminSession();
  console.log(`[smoke] Using session: ${session.email} (${session.role})`);

  console.log("\n[smoke] === SECTION A: read tools (mock LLM) ===");
  const readGraph = await buildCopilotGraph(session);
  await readTools(readGraph, `smoke-read-${Date.now()}`);

  console.log("\n[smoke] === SECTION B: HITL write (scripted mock) ===");
  await hitlAssignFlow(session);

  console.log("\n[smoke] ✅ ALL PASSED — read loop, HITL pause, cancel, approve, audit, cleanup");
  process.exit(0);
}

main()
  .catch((err) => {
    console.error("[smoke] ❌ FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
