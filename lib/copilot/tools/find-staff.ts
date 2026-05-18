import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { CopilotSession } from "@/lib/copilot/session";

const schema = z.object({
  nameQuery: z
    .string()
    .optional()
    .describe(
      "Optional substring of the staff member's name (case-insensitive). Omit to list all accessible staff."
    ),
  locationId: z
    .string()
    .optional()
    .describe("Optional location ID to filter to staff certified at that location."),
});

export function makeFindStaffTool(session: CopilotSession) {
  return tool(
    async ({ nameQuery, locationId }) => {
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
          });
        }
      }

      const users = await prisma.user.findMany({
        where: {
          role: "STAFF",
          ...(nameQuery ? { name: { contains: nameQuery, mode: "insensitive" as const } } : {}),
          ...(locationId
            ? { locations: { some: { locationId } } }
            : allowedLocationIds
              ? { locations: { some: { locationId: { in: allowedLocationIds } } } }
              : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          desiredHoursPerWeek: true,
          skills: { select: { skill: { select: { name: true } } } },
          locations: { select: { location: { select: { id: true, name: true } } } },
        },
        orderBy: { name: "asc" },
        take: 30,
      });

      return JSON.stringify({
        count: users.length,
        staff: users.map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          desiredHoursPerWeek: u.desiredHoursPerWeek,
          skills: u.skills.map((s) => s.skill.name),
          locations: u.locations.map((l) => l.location.name),
        })),
      });
    },
    {
      name: "findStaff",
      description:
        "Look up staff members by name substring and/or location. ALWAYS use this when the manager mentions a staff name (e.g., 'Sarah', 'John'). Returns userIds needed for previewAssignment and assignStaff. Managers see only staff certified at locations they oversee; admins see all.",
      schema,
    }
  );
}
