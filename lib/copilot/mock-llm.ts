import {
  BaseChatModel,
  type BaseChatModelParams,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

export interface ScriptedRule {
  match: RegExp;
  toolName?: string;
  /** Either a static args object OR an async resolver that fetches real IDs at call time. */
  args?: Record<string, unknown> | (() => Promise<Record<string, unknown>>);
  reply?: string;
}

export class ScriptedToolCallChatModel extends BaseChatModel {
  private rules: ScriptedRule[];
  private fallback: string;
  private callCounter = 0;

  constructor(
    rules: ScriptedRule[],
    fallback = "[mock] I can show the week's schedule, list locations, or preview an assignment. What would you like?",
    params: BaseChatModelParams = {}
  ) {
    super(params);
    this.rules = rules;
    this.fallback = fallback;
  }

  _llmType(): string {
    return "scripted-tool-call-mock";
  }

  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const last = messages[messages.length - 1];

    if (last instanceof ToolMessage) {
      const preview = String(last.content).slice(0, 240);
      return this.message(
        `[mock] Tool returned (truncated): ${preview}${String(last.content).length > 240 ? "…" : ""}`
      );
    }

    const lastHuman = [...messages].reverse().find((m) => m instanceof HumanMessage);
    const userText = String(lastHuman?.content ?? "").toLowerCase();

    for (const rule of this.rules) {
      if (rule.match.test(userText)) {
        if (rule.toolName) {
          this.callCounter++;
          const args =
            typeof rule.args === "function" ? await rule.args() : (rule.args ?? {});
          return {
            generations: [
              {
                message: new AIMessage({
                  content: "",
                  tool_calls: [
                    {
                      name: rule.toolName,
                      args,
                      id: `call_mock_${Date.now()}_${this.callCounter}`,
                    },
                  ],
                }),
                text: "",
              },
            ],
          };
        }
        return this.message(rule.reply ?? "[mock] (no reply)");
      }
    }

    return this.message(this.fallback);
  }

  private message(text: string): ChatResult {
    return {
      generations: [{ message: new AIMessage(text), text }],
    };
  }

  bindTools() {
    return this;
  }
}
