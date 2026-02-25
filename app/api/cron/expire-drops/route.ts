/**
 * Cron: Expire unclaimed DROP requests
 *
 * Runs automatically via Vercel Cron (see vercel.json).
 * Can also be triggered manually: GET /api/cron/expire-drops
 *
 * Marks PENDING DROP requests as EXPIRED when their expiresAt time has passed.
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Protect from external abuse in production
  const authHeader = request.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all PENDING DROPs whose expiresAt has passed
  const expiredDrops = await prisma.swapRequest.findMany({
    where: {
      type: "DROP",
      status: "PENDING",
      expiresAt: { lte: now },
    },
    include: {
      requester: { select: { id: true, name: true } },
      assignment: { include: { shift: { include: { location: true } } } },
    },
  });

  if (expiredDrops.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  // Mark them all EXPIRED
  await prisma.swapRequest.updateMany({
    where: { id: { in: expiredDrops.map((d) => d.id) } },
    data: { status: "EXPIRED" },
  });

  // Notify each requester
  await prisma.notification.createMany({
    data: expiredDrops.map((drop) => ({
      userId: drop.requesterId,
      type: "SWAP_CANCELLED" as const,
      title: "Drop Request Expired",
      message: `Your drop request for the ${drop.assignment.shift.location.name} shift on ${drop.assignment.shift.startTime.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} expired without being claimed.`,
      data: { swapRequestId: drop.id },
    })),
  });

  return NextResponse.json({ expired: expiredDrops.length });
}
