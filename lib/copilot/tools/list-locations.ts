import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { CopilotSession } from "@/lib/copilot/session";

export function makeListLocationsTool(session: CopilotSession) {
  return tool(
    async () => {
      const locations =
        session.role === "ADMIN"
          ? await prisma.location.findMany({
              select: { id: true, name: true, timezone: true, address: true },
              orderBy: { name: "asc" },
            })
          : await prisma.location.findMany({
              where: { managers: { some: { userId: session.userId } } },
              select: { id: true, name: true, timezone: true, address: true },
              orderBy: { name: "asc" },
            });

      return JSON.stringify({
        count: locations.length,
        scope: session.role === "ADMIN" ? "all" : "managed",
        locations,
      });
    },
    {
      name: "listLocations",
      description:
        "List all locations the current user can access. Admins see every location; managers see only the ones they oversee. Returns location IDs needed for other tools.",
      schema: z.object({}),
    }
  );
}
