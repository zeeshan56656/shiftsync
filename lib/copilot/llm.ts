import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { ScriptedToolCallChatModel, type ScriptedRule } from "@/lib/copilot/mock-llm";

const MOCK_RULES: ScriptedRule[] = [
  { match: /location/, toolName: "listLocations" },
  { match: /(schedule|week|shifts|roster)/, toolName: "getWeekSchedule", args: {} },
  {
    match: /(preview|check|impact).*(assign|assignment)/,
    toolName: "previewAssignment",
    args: { shiftId: "demo-shift-id", userId: "demo-user-id" },
  },
  {
    match: /^(hi|hello|hey)/,
    reply:
      "[mock] Hi — I'm the scheduling copilot. Try: 'list locations', 'show this week's schedule', or 'preview assigning user X to shift Y'.",
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
