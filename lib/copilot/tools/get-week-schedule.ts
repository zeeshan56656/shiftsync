import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { startOfWeek, endOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { displayInTz } from "@/lib/timezone";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  locationId: z
    .string()
    .optional()
    .describe(
      "Optional location ID. If omitted, returns shifts across all locations the user can access."
    ),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe(
      "Optional ISO date (YYYY-MM-DD) for any day in the target week. Defaults to current week."
    ),
});

export function makeGetWeekScheduleTool(session: CopilotSession) {
  return tool(
    async ({ locationId, weekStart }) => {
      const anchor = weekStart ? new Date(weekStart) : new Date();
      const begin = startOfWeek(anchor, { weekStartsOn: 1 });
      const end = endOfWeek(anchor, { weekStartsOn: 1 });

      let allowedLocationIds: string[] | undefined;
      if (session.role === "MANAGER") {
        const managed = await prisma.locationManager.findMany({
          where: { userId: session.userId },
          select: { locationId: true },
        });
        allowedLocationIds = managed.map((m) => m.locationId);
        if (locationId && !allowedLocationIds.includes(locationId)) {
          return JSON.stringify({
            error: `You do not manage the location with id "${locationId}".`,
            yourManagedLocationIds: allowedLocationIds,
          });
        }
      }

      const shifts = await prisma.shift.findMany({
        where: {
          startTime: { gte: begin, lte: end },
          ...(locationId
            ? { locationId }
            : allowedLocationIds
              ? { locationId: { in: allowedLocationIds } }
              : {}),
        },
        include: {
          location: { select: { name: true, timezone: true } },
          requiredSkill: { select: { name: true } },
          assignments: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
        orderBy: { startTime: "asc" },
      });

      return JSON.stringify({
        weekStart: begin.toISOString().split("T")[0],
        weekEnd: end.toISOString().split("T")[0],
        shiftCount: shifts.length,
        shifts: shifts.map((s) => ({
          shiftId: s.id,
          location: s.location.name,
          skill: s.requiredSkill.name,
          startLocal: displayInTz(s.startTime, s.location.timezone),
          endLocal: displayInTz(s.endTime, s.location.timezone),
          status: s.status,
          headcount: s.headcount,
          assignedCount: s.assignments.length,
          unfilled: Math.max(0, s.headcount - s.assignments.length),
          assignedTo: s.assignments.map((a) => ({
            userId: a.user.id,
            name: a.user.name,
          })),
        })),
      });
    },
    {
      name: "getWeekSchedule",
      description:
        "Get all shifts for a given week. Returns shift IDs, locations, times, headcount, and current assignments. Manager users only see shifts at locations they oversee; admins see everything.",
      schema,
    }
  );
}
