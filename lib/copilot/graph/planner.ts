import type { RunnableConfig } from "@langchain/core/runnables";
import { getPlannerLLM } from "@/lib/copilot/llm";
import type { CopilotStateType } from "@/lib/copilot/state";

export async function plannerNode(
  state: CopilotStateType,
  config?: RunnableConfig
): Promise<Partial<CopilotStateType>> {
  const llm = getPlannerLLM();
  const response = await llm.invoke(state.messages, config);
  return { messages: [response] };
}
