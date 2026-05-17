import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { CopilotStateType } from "@/lib/copilot/state";

export function makePlannerNode(llm: BaseChatModel) {
  return async (state: CopilotStateType): Promise<Partial<CopilotStateType>> => {
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  };
}
