import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildAssignmentPreview } from "@/lib/preview";
import { logAudit } from "@/lib/audit";
import { broadcastEvent } from "@/lib/supabase-server";
import { notify } from "@/lib/notifications";
import { displayInTz } from "@/lib/timezone";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  assignmentId: z
    .string()
    .min(1)
    .describe("The existing ShiftAssignment ID to swap out. Get this from getWeekSchedule."),
  newUserId: z
    .string()
    .min(1)
    .describe("The userId of the staff member who should take over this shift. Get this from findStaff."),
});

type Approval = { approved: boolean; reason?: string };

export function makeReassignShiftTool(session: CopilotSession) {
  return tool(
    async ({ assignmentId, newUserId }) => {
      const assignment = await prisma.shiftAssignment.findUnique({
        where: { id: assignmentId },
        include: {
          shift: { include: { location: true, requiredSkill: true } },
          user: { select: { id: true, name: true } },
        },
      });
      if (!assignment) {
        return JSON.stringify({ status: "error", error: "Assignment not found." });
      }
      if (assignment.userId === newUserId) {
        return JSON.stringify({
          status: "noop",
          reason: `${assignment.user.name} is already assigned to this shift.`,
        });
      }

      // Preview the NEW assignment under constraints.
      const preview = await buildAssignmentPreview(assignment.shiftId, newUserId);
      if ("error" in preview) {
        return JSON.stringify({ status: "error", ...preview });
      }
      if (preview.hasHardBlock) {
        return JSON.stringify({
          status: "blocked",
          reason: "New assignee fails hard constraints (cannot proceed).",
          violations: preview.violations,
          overtimeWarnings: preview.overtimeWarnings,
        });
      }

      const shiftTimeStr = displayInTz(
        assignment.shift.startTime,
        assignment.shift.location.timezone
      );

      const approval = interrupt({
        type: "needs_approval",
        toolName: "reassignShift",
        args: { assignmentId, newUserId },
        preview: {
          currentAssignee: assignment.user.name,
          newAssignee: preview.userName,
          location: assignment.shift.location.name,
          skill: assignment.shift.requiredSkill.name,
          shiftTime: shiftTimeStr,
          shiftHours: preview.shiftHours,
          currentWeeklyHours: preview.currentWeeklyHours,
          projectedWeeklyHours: preview.projectedWeeklyHours,
          violations: preview.violations,
          overtimeWarnings: preview.overtimeWarnings,
        },
      }) as Approval;

      if (!approval?.approved) {
        return JSON.stringify({
          status: "cancelled",
          reason: approval?.reason ?? "Manager declined the reassignment.",
        });
      }

      // Execute: atomic update — change the assignment's userId.
      const before = {
        assignmentId,
        shiftId: assignment.shiftId,
        previousUserId: assignment.userId,
        previousUserName: assignment.user.name,
      };

      await prisma.shiftAssignment.update({
        where: { id: assignmentId },
        data: { userId: newUserId },
      });

      await Promise.all([
        notify.shiftChanged(
          assignment.userId,
          assignment.shiftId,
          assignment.shift.location.name,
          "You have been reassigned off this shift by a manager."
        ),
        notify.shiftAssigned(
          newUserId,
          assignment.shiftId,
          assignment.shift.location.name,
          shiftTimeStr
        ),
        logAudit({
          entityType: "assignment",
          entityId: assignmentId,
          action: "agent.reassigned",
          before,
          after: {
            assignmentId,
            shiftId: assignment.shiftId,
            newUserId,
            newUserName: preview.userName,
            viaAgent: true,
          },
          performedById: session.userId,
          locationId: assignment.shift.locationId,
        }),
        broadcastEvent("schedule", "shift.updated", {
          shiftId: assignment.shiftId,
          locationId: assignment.shift.locationId,
        }),
      ]);

      return JSON.stringify({
        status: "reassigned",
        from: assignment.user.name,
        to: preview.userName,
        shiftSummary: `${assignment.shift.location.name} · ${shiftTimeStr}`,
        projectedWeeklyHours: preview.projectedWeeklyHours,
      });
    },
    {
      name: "reassignShift",
      description:
        "Replace one staff member with another on an existing shift assignment in one atomic operation. ALWAYS pauses for manager approval (HITL). Refuses if the new user fails hard constraints (skill mismatch, location cert, double-booking, < 10h rest, > 12h/day). Use when the manager says things like 'swap X for Y on Friday' or 'put John on Sarah's Monday shift'. Get assignmentId from getWeekSchedule (it appears in the assignedTo array entries) and newUserId from findStaff.",
      schema,
    }
  );
}
