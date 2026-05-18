import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { buildAssignmentPreview } from "@/lib/preview";
import { logAudit } from "@/lib/audit";
import { broadcastEvent } from "@/lib/supabase-server";
import { notify } from "@/lib/notifications";
import { displayInTz } from "@/lib/timezone";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  shiftId: z.string().min(1).describe("The shift ID to assign the user to."),
  userId: z.string().min(1).describe("The staff user ID to assign."),
});

type Approval = { approved: boolean; reason?: string };

export function makeAssignStaffTool(session: CopilotSession) {
  return tool(
    async ({ shiftId, userId }) => {
      // 1) Always start with preview — establishes constraints + impact.
      // RBAC is enforced upstream in the SSE route + via session-scoped tool factory.
      const preview = await buildAssignmentPreview(shiftId, userId);

      if ("error" in preview) {
        return JSON.stringify({ status: "error", ...preview });
      }

      // 2) Hard blocks are non-negotiable — refuse before involving the manager.
      if (preview.hasHardBlock) {
        return JSON.stringify({
          status: "blocked",
          reason: "Assignment violates a hard constraint (cannot proceed).",
          violations: preview.violations,
          overtimeWarnings: preview.overtimeWarnings,
          suggestions: preview.suggestions,
        });
      }

      // 3) HITL: pause for manager approval. On resume the entire tool re-runs
      //    and interrupt() returns the resume payload instead of pausing.
      const approval = interrupt({
        type: "needs_approval",
        toolName: "assignStaff",
        args: { shiftId, userId },
        preview: {
          userName: preview.userName,
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
          reason: approval?.reason ?? "Manager declined the assignment.",
        });
      }

      // 4) Approved — execute. Mirrors actions/shifts.ts:assignStaffToShift but
      //    uses agent.* audit action so reports can distinguish agent writes.
      const shift = await prisma.shift.findUnique({
        where: { id: shiftId },
        include: { location: true },
      });
      if (!shift) {
        return JSON.stringify({ status: "error", error: "Shift not found at execute time." });
      }

      let assignmentId: string;
      try {
        const created = await prisma.shiftAssignment.create({
          data: { shiftId, userId },
        });
        assignmentId = created.id;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return JSON.stringify({
            status: "race_conflict",
            error: "Another manager assigned this person to this shift moments ago. Please refresh.",
          });
        }
        throw err;
      }

      const shiftTimeStr = displayInTz(shift.startTime, shift.location.timezone);

      await Promise.all([
        notify.shiftAssigned(userId, shiftId, shift.location.name, shiftTimeStr),
        logAudit({
          entityType: "assignment",
          entityId: assignmentId,
          action: "agent.assigned",
          after: { assignmentId, shiftId, userId, viaAgent: true },
          performedById: session.userId,
          locationId: shift.locationId,
        }),
        broadcastEvent("schedule", "shift.updated", {
          shiftId,
          locationId: shift.locationId,
        }),
      ]);

      return JSON.stringify({
        status: "assigned",
        assignmentId,
        userName: preview.userName,
        shiftSummary: `${shift.location.name} · ${shiftTimeStr}`,
        projectedWeeklyHours: preview.projectedWeeklyHours,
        warnings: preview.violations,
      });
    },
    {
      name: "assignStaff",
      description:
        "Assign a staff member to a shift. ALWAYS pauses for manager approval before writing (HITL). Hard constraint violations (double-booking, skill mismatch, < 10h rest, > 12h/day, 7th consecutive day) are refused outright. Soft warnings (over 35h week, outside availability window) are surfaced in the approval card. Returns the new assignment ID on success, or status: 'cancelled' / 'blocked' / 'race_conflict' / 'error'.",
      schema,
    }
  );
}
