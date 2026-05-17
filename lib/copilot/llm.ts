import { ChatAnthropic } from "@langchain/anthropic";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const MOCK_RESPONSES = [
  "[mock LLM] I would call previewAssignment here, then ask the manager to confirm.",
  "[mock LLM] I would check compliance for the proposed swap and report blockers.",
  "[mock LLM] I would surface the schedule for the requested week.",
];

export function getPlannerLLM(): BaseChatModel {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new FakeListChatModel({ responses: MOCK_RESPONSES });
  }

  return new ChatAnthropic({
    model: "claude-sonnet-4-6",
    temperature: 0,
    maxTokens: 1024,
  });
}
