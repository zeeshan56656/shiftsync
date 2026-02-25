/**
 * GET /api/admin/audit-logs?from=&to=&entityType=&locationId=
 *
 * Returns a CSV download of audit logs.
 * Admin-only. Supports date range + entity type + location filters.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const from      = searchParams.get("from");
  const to        = searchParams.get("to");
  const entityType = searchParams.get("entityType") || undefined;
  const locationId = searchParams.get("locationId") || undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(locationId ? { locationId } : {}),
      ...((from || to) ? {
        createdAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to   ? { lte: new Date(to)   } : {}),
        },
      } : {}),
    },
    include: {
      performedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  // ── Build CSV ───────────────────────────────────────────────────────────────
  const header = [
    "id",
    "timestamp",
    "action",
    "entityType",
    "entityId",
    "performedBy",
    "email",
    "locationId",
    "before",
    "after",
  ].join(",");

  const rows = logs.map((log) => [
    log.id,
    log.createdAt.toISOString(),
    log.action,
    log.entityType,
    log.entityId,
    csvEscape(log.performedBy.name),
    csvEscape(log.performedBy.email),
    log.locationId ?? "",
    csvEscape(log.before ? JSON.stringify(log.before) : ""),
    csvEscape(log.after  ? JSON.stringify(log.after)  : ""),
  ].join(","));

  const csv = [header, ...rows].join("\n");

  const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (!value) return "";
  // Wrap in quotes if value contains comma, quote, or newline
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
