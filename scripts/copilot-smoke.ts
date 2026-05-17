import { HumanMessage } from "@langchain/core/messages";
import { buildCopilotGraph } from "../lib/copilot/graph";

async function main() {
  const startedAt = Date.now();
  console.log("[smoke] Building graph (checkpointer.setup() creates tables on first run)...");
  const graph = await buildCopilotGraph();
  console.log(`[smoke] Graph built in ${Date.now() - startedAt}ms`);

  const threadId = `smoke-${Date.now()}`;
  const runConfig = { configurable: { thread_id: threadId } };

  console.log(`[smoke] Invoking with thread_id=${threadId}`);
  const result = await graph.invoke(
    {
      messages: [new HumanMessage("Smoke test ping")],
      session: {
        userId: "smoke-user",
        email: "smoke@local",
        name: "Smoke Tester",
        role: "MANAGER",
      },
    },
    runConfig
  );

  const last = result.messages[result.messages.length - 1];
  console.log(`[smoke] Result: ${result.messages.length} messages, last="${String(last.content).slice(0, 80)}"`);

  console.log("[smoke] Reading state back from Postgres checkpoint...");
  const snapshot = await graph.getState(runConfig);
  const persisted = snapshot.values.messages?.length ?? 0;
  if (persisted !== result.messages.length) {
    throw new Error(`Checkpoint round-trip mismatch: invoked=${result.messages.length}, persisted=${persisted}`);
  }
  console.log(`[smoke] Checkpoint OK — ${persisted} messages persisted + retrieved`);

  console.log("[smoke] PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
});
