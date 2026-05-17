import type { StructuredToolInterface } from "@langchain/core/tools";
import type { CopilotSession } from "@/lib/copilot/session";
import { makeGetWeekScheduleTool } from "./get-week-schedule";
import { makeListLocationsTool } from "./list-locations";
import { makePreviewAssignmentTool } from "./preview-assignment";

export function buildToolsForSession(
  session: CopilotSession
): StructuredToolInterface[] {
  return [
    makeListLocationsTool(session),
    makeGetWeekScheduleTool(session),
    makePreviewAssignmentTool(session),
  ];
}
