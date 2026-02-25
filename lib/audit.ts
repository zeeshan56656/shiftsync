/**
 * Audit Trail Helper
 *
 * All schedule mutations call logAudit() after the DB write.
 * The before/after snapshots are stored as JSON so admins can see
 * exactly what changed, when, and who made the change.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "published"
  | "unpublished"
  | "assigned"
  | "unassigned"
  | "approved"
  | "cancelled"
  | "expired";

type AuditEntityType =
  | "shift"
  | "assignment"
  | "swap_request"
  | "user"
  | "location";

interface LogAuditParams {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  performedById: string;
  locationId?: string;
}

export async function logAudit(params: LogAuditParams) {
  return prisma.auditLog.create({
    data: {
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      before: (params.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (params.after ?? undefined) as Prisma.InputJsonValue | undefined,
      performedById: params.performedById,
      locationId: params.locationId,
    },
  });
}

/**
 * Get the full audit history for a specific shift.
 * Used in the shift detail page's "History" tab.
 */
export async function getShiftAuditHistory(shiftId: string) {
  return prisma.auditLog.findMany({
    where: { entityType: "shift", entityId: shiftId },
    include: {
      performedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get audit logs for admin export.
 * Supports filtering by location, date range, and entity type.
 */
export async function getAuditLogs(params: {
  locationId?: string;
  from?: Date;
  to?: Date;
  entityType?: AuditEntityType;
  limit?: number;
  offset?: number;
}) {
  const { locationId, from, to, entityType, limit = 100, offset = 0 } = params;

  return prisma.auditLog.findMany({
    where: {
      ...(locationId && { locationId }),
      ...(entityType && { entityType }),
      ...(from || to
        ? {
            createdAt: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    },
    include: {
      performedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}
