import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { CopilotSession } from "@/lib/copilot/session";

export const CopilotState = Annotation.Root({
  ...MessagesAnnotation.spec,
  session: Annotation<CopilotSession>(),
});

export type CopilotStateType = typeof CopilotState.State;
