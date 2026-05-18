import type { StructuredToolInterface } from "@langchain/core/tools";
import type { CopilotSession } from "@/lib/copilot/session";
import { makeGetWeekScheduleTool } from "./get-week-schedule";
import { makeListLocationsTool } from "./list-locations";
import { makePreviewAssignmentTool } from "./preview-assignment";
import { makeAssignStaffTool } from "./assign-staff";
import { makeRemoveAssignmentTool } from "./remove-assignment";
import { makeFindStaffTool } from "./find-staff";

export function buildToolsForSession(
  session: CopilotSession
): StructuredToolInterface[] {
  return [
    makeListLocationsTool(session),
    makeFindStaffTool(session),
    makeGetWeekScheduleTool(session),
    makePreviewAssignmentTool(session),
    makeAssignStaffTool(session),
    makeRemoveAssignmentTool(session),
  ];
}
