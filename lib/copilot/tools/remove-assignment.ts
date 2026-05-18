import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { broadcastEvent } from "@/lib/supabase-server";
import { displayInTz } from "@/lib/timezone";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  assignmentId: z
    .string()
    .min(1)
    .describe("The shift assignment ID to remove. Get this from getWeekSchedule output."),
});

type Approval = { approved: boolean; reason?: string };

export function makeRemoveAssignmentTool(session: CopilotSession) {
  return tool(
    async ({ assignmentId }) => {
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

      // Enforce publish-cutoff window (mirrors actions/shifts.ts:removeAssignment).
      if (assignment.shift.status === "PUBLISHED") {
        const cutoffMs = assignment.shift.publishCutoffHours * 60 * 60 * 1000;
        const timeUntilShift = assignment.shift.startTime.getTime() - Date.now();
        if (timeUntilShift < cutoffMs) {
          return JSON.stringify({
            status: "blocked",
            reason: `Cannot remove assignment — shift starts in less than ${assignment.shift.publishCutoffHours} hours.`,
          });
        }
      }

      const shiftTimeStr = displayInTz(
        assignment.shift.startTime,
        assignment.shift.location.timezone
      );

      const approval = interrupt({
        type: "needs_approval",
        toolName: "removeAssignment",
        args: { assignmentId },
        preview: {
          userName: assignment.user.name,
          location: assignment.shift.location.name,
          skill: assignment.shift.requiredSkill.name,
          shiftTime: shiftTimeStr,
          status: assignment.shift.status,
        },
      }) as Approval;

      if (!approval?.approved) {
        return JSON.stringify({
          status: "cancelled",
          reason: approval?.reason ?? "Manager declined the removal.",
        });
      }

      // Approved — execute. Snapshot before delete so audit captures who was removed.
      const before = {
        assignmentId: assignment.id,
        shiftId: assignment.shiftId,
        userId: assignment.userId,
        userName: assignment.user.name,
        location: assignment.shift.location.name,
        shiftTime: shiftTimeStr,
      };

      // Cancel any pending swap requests for this assignment (mirrors removeAssignment).
      await prisma.swapRequest.updateMany({
        where: {
          assignmentId,
          status: { in: ["PENDING", "ACCEPTED"] },
        },
        data: { status: "CANCELLED" },
      });

      await prisma.shiftAssignment.delete({ where: { id: assignmentId } });

      await Promise.all([
        logAudit({
          entityType: "assignment",
          entityId: assignmentId,
          action: "agent.unassigned",
          before,
          performedById: session.userId,
          locationId: assignment.shift.locationId,
        }),
        broadcastEvent("schedule", "shift.updated", {
          shiftId: assignment.shiftId,
          locationId: assignment.shift.locationId,
        }),
      ]);

      return JSON.stringify({
        status: "removed",
        removed: before,
      });
    },
    {
      name: "removeAssignment",
      description:
        "Remove a staff member from a shift. ALWAYS pauses for manager approval (HITL). Refuses if the shift is PUBLISHED and within the publish-cutoff window (default 48h before start). On success, cancels any pending swap requests on this assignment. Use getWeekSchedule first to find the assignmentId.",
      schema,
    }
  );
}
