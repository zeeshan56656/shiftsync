import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { checkAssignmentPreview } from "@/actions/shifts";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  shiftId: z.string().min(1).describe("The shift ID to preview an assignment for."),
  userId: z.string().min(1).describe("The staff user ID to preview assigning."),
});

export function makePreviewAssignmentTool(_session: CopilotSession) {
  return tool(
    async ({ shiftId, userId }) => {
      const result = await checkAssignmentPreview(shiftId, userId);
      return JSON.stringify(result);
    },
    {
      name: "previewAssignment",
      description:
        "Preview the impact of assigning a staff member to a shift WITHOUT actually creating the assignment. Returns constraint violations, suggestions, overtime warnings, and projected weekly hours. Use this before assignStaff to surface hard blocks (double-booking, skill mismatch, < 10h rest, > 12h/day) and soft warnings (outside availability window, ≥ 35h week, > 8h day, 6th consecutive day).",
      schema,
    }
  );
}
