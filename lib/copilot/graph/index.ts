import { StateGraph, START, END } from "@langchain/langgraph";
import { CopilotState } from "@/lib/copilot/state";
import { plannerNode } from "@/lib/copilot/graph/planner";
import { getCopilotCheckpointer } from "@/lib/copilot/checkpointer";

export async function buildCopilotGraph() {
  const checkpointer = await getCopilotCheckpointer();

  return new StateGraph(CopilotState)
    .addNode("planner", plannerNode)
    .addEdge(START, "planner")
    .addEdge("planner", END)
    .compile({ checkpointer });
}
