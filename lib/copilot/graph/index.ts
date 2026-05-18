import { StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { CopilotState, type CopilotStateType } from "@/lib/copilot/state";
import { makePlannerNode } from "@/lib/copilot/graph/planner";
import { getCopilotCheckpointer } from "@/lib/copilot/checkpointer";
import { getPlannerLLM } from "@/lib/copilot/llm";
import { buildToolsForSession } from "@/lib/copilot/tools";
import type { CopilotSession } from "@/lib/copilot/session";

function shouldContinue(state: CopilotStateType): "tools" | typeof END {
  const last = state.messages[state.messages.length - 1];
  if (last instanceof AIMessage && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
    return "tools";
  }
  return END;
}

export async function buildCopilotGraph(
  session: CopilotSession,
  opts: { llm?: BaseChatModel } = {}
) {
  const checkpointer = await getCopilotCheckpointer();
  const tools = buildToolsForSession(session);
  const llm = opts.llm ?? getPlannerLLM(tools);
  const planner = makePlannerNode(llm);
  const toolNode = new ToolNode(tools);

  return new StateGraph(CopilotState)
    .addNode("planner", planner)
    .addNode("tools", toolNode)
    .addEdge(START, "planner")
    .addConditionalEdges("planner", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "planner")
    .compile({ checkpointer });
}
