import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { buildCopilotGraph } from "../lib/copilot/graph";
import type { CopilotSession } from "../lib/copilot/session";
import { prisma } from "../lib/prisma";

async function findAdminSession(): Promise<CopilotSession> {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!admin) {
    throw new Error("No ADMIN user found in DB — seed the database first.");
  }
  return {
    userId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

async function runTurn(label: string, graph: Awaited<ReturnType<typeof buildCopilotGraph>>, threadId: string, userText: string) {
  console.log(`\n[smoke] ─── ${label}: "${userText}" ───`);

  // Snapshot prior message count so we measure ONLY this turn's additions.
  const priorSnap = await graph.getState({ configurable: { thread_id: threadId } });
  const priorCount = priorSnap.values.messages?.length ?? 0;

  const result = await graph.invoke(
    { messages: [new HumanMessage(userText)] },
    { configurable: { thread_id: threadId } }
  );

  const newMessages = result.messages.slice(priorCount);
  let toolCallsSeen = 0;
  let toolResultsSeen = 0;
  for (const m of newMessages) {
    if (m instanceof AIMessage && Array.isArray(m.tool_calls)) {
      toolCallsSeen += m.tool_calls.length;
    }
    if (m instanceof ToolMessage) toolResultsSeen++;
  }

  const last = result.messages[result.messages.length - 1];
  console.log(
    `[smoke]   newInTurn=${newMessages.length}  toolCalls=${toolCallsSeen}  toolResults=${toolResultsSeen}  lastType=${last.constructor.name}`
  );
  console.log(`[smoke]   final: "${String(last.content).slice(0, 160)}${String(last.content).length > 160 ? "…" : ""}"`);

  return { result, toolCallsSeen, toolResultsSeen, newMessageCount: newMessages.length };
}

async function main() {
  console.log("[smoke] Resolving admin session from DB...");
  const session = await findAdminSession();
  console.log(`[smoke] Using session: ${session.email} (${session.role})`);

  console.log("[smoke] Building session-aware graph...");
  const graph = await buildCopilotGraph(session);

  const threadId = `smoke-${Date.now()}`;
  // Seed the session on the FIRST turn so it persists in checkpoint state.
  await graph.invoke(
    { messages: [], session },
    { configurable: { thread_id: threadId } }
  );

  // Turn 1: list locations
  const t1 = await runTurn("Turn 1", graph, threadId, "list locations please");
  if (t1.toolCallsSeen === 0) throw new Error("Turn 1: expected at least 1 tool call (listLocations)");

  // Turn 2: get this week's schedule
  const t2 = await runTurn("Turn 2", graph, threadId, "show me this week's schedule");
  if (t2.toolCallsSeen === 0) throw new Error("Turn 2: expected at least 1 tool call (getWeekSchedule)");

  // Turn 3: plain greeting → no tool call expected, just a reply
  const t3 = await runTurn("Turn 3", graph, threadId, "hi");
  if (t3.toolCallsSeen !== 0) throw new Error("Turn 3: expected 0 tool calls for greeting");

  // Verify checkpoint persistence
  console.log("\n[smoke] Reading state snapshot from Postgres checkpoint...");
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  const persistedCount = snapshot.values.messages?.length ?? 0;
  console.log(`[smoke]   persisted ${persistedCount} messages across 3 turns`);
  if (persistedCount < 6) {
    throw new Error(`Expected ≥6 messages persisted (2/turn × 3 turns), got ${persistedCount}`);
  }

  console.log("\n[smoke] ✅ PASSED — tool loop + checkpoint persistence verified");
  process.exit(0);
}

main()
  .catch((err) => {
    console.error("[smoke] ❌ FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
