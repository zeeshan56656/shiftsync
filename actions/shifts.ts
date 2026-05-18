"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAssignmentConstraints } from "@/lib/constraints";
import { getOvertimeStatus } from "@/lib/overtime";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { isPremiumShift, localToUtc, displayInTz } from "@/lib/timezone";
import { broadcastEvent } from "@/lib/supabase-server";
import { buildAssignmentPreview } from "@/lib/preview";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/app/generated/prisma/client";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const CreateShiftSchema = z.object({
  locationId: z.string().min(1),
  requiredSkillId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  headcount: z.coerce.number().int().min(1).max(20),
  notes: z.string().optional(),
});

const AssignStaffSchema = z.object({
  shiftId: z.string().min(1),
  userId: z.string().min(1),
});

// ─── Create Shift ─────────────────────────────────────────────────────────────

export async function createShift(formData: FormData) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const parsed = CreateShiftSchema.safeParse({
    locationId: formData.get("locationId"),
    requiredSkillId: formData.get("requiredSkillId"),
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    headcount: formData.get("headcount"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: "Invalid input", details: parsed.error.flatten() };
  }

  const { locationId, requiredSkillId, date, startTime, endTime, headcount, notes } = parsed.data;

  // Check manager has access to this location
  if (session.user.role === "MANAGER") {
    const access = await prisma.locationManager.findUnique({
      where: { userId_locationId: { userId: session.user.id, locationId } },
    });
    if (!access) return { error: "You don't manage this location." };
  }

  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) return { error: "Location not found" };

  // Convert local times to UTC using the location's timezone
  const startUtc = localToUtc(date, startTime, location.timezone);
  let endUtc = localToUtc(date, endTime, location.timezone);

  // Handle overnight shifts (e.g., 11pm–3am)
  if (endUtc <= startUtc) {
    endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
  }

  const premium = isPremiumShift(startUtc, location.timezone);

  const shift = await prisma.shift.create({
    data: {
      locationId,
      requiredSkillId,
      startTime: startUtc,
      endTime: endUtc,
      headcount,
      notes: notes || null,
      isPremium: premium,
    },
  });

  await logAudit({
    entityType: "shift",
    entityId: shift.id,
    action: "created",
    after: { ...shift },
    performedById: session.user.id,
    locationId,
  });

  await broadcastEvent("schedule", "shift.created", { shiftId: shift.id, locationId });
  revalidatePath("/schedule");
  return { success: true, shiftId: shift.id };
}

// ─── Assign Staff to Shift ────────────────────────────────────────────────────

export async function assignStaffToShift(formData: FormData) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const parsed = AssignStaffSchema.safeParse({
    shiftId: formData.get("shiftId"),
    userId: formData.get("userId"),
  });

  if (!parsed.success) return { error: "Invalid input" };

  const { shiftId, userId } = parsed.data;

  // Run the full constraint engine
  const check = await checkAssignmentConstraints({ userId, shiftId });

  if (!check.ok) {
    // Filter out warnings (non-blocking) vs hard blocks
    const hardBlocks = check.violations.filter(
      (v) =>
        v.rule !== "daily_hours_warning" && v.rule !== "availability_outside_window"
    );

    if (hardBlocks.length > 0) {
      return {
        error: "Assignment blocked",
        violations: check.violations,
        suggestions: check.suggestions,
      };
    }

    // Warnings only — proceed but log them
    console.warn("Assignment with warnings:", check.violations);
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true, requiredSkill: true },
  });
  if (!shift) return { error: "Shift not found" };

  // Check for manager-override on overtime
  const overtimeStatus = await getOvertimeStatus(userId, shift.startTime, shift.location.timezone);
  const hasHardOvertimeBlock = overtimeStatus.warnings.some(
    (w) => w.level === "hard_block" && w.rule === "consecutive_7"
  );
  if (hasHardOvertimeBlock) {
    const override = formData.get("managerOverrideReason");
    if (!override || String(override).trim().length < 10) {
      return {
        error: "7th consecutive day requires a documented override reason (minimum 10 characters).",
        requiresOverride: true,
        overtimeWarnings: overtimeStatus.warnings,
      };
    }
  }

  // All checks passed — create the assignment
  // The @@unique([shiftId, userId]) constraint guards against concurrent double-assignment.
  let assignment;
  try {
    assignment = await prisma.shiftAssignment.create({
      data: { shiftId, userId },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "This staff member was just assigned to this shift by another manager. The schedule has been refreshed." };
    }
    throw err;
  }

  // Notify the staff member
  const shiftTime = displayInTz(shift.startTime, shift.location.timezone);
  await notify.shiftAssigned(userId, shiftId, shift.location.name, shiftTime);

  // Warn manager if staff approaching overtime
  if (overtimeStatus.warnings.some((w) => w.rule === "weekly_35h" || w.rule === "weekly_40h")) {
    const totalHours = overtimeStatus.weeklyHours;
    await notify.overtimeWarning(session.user.id, "Staff member", totalHours, shift.locationId);
  }

  await logAudit({
    entityType: "assignment",
    entityId: assignment.id,
    action: "assigned",
    after: { assignmentId: assignment.id, shiftId, userId },
    performedById: session.user.id,
    locationId: shift.locationId,
  });

  await broadcastEvent("schedule", "shift.updated", { shiftId, locationId: shift.locationId });
  revalidatePath("/schedule");
  revalidatePath(`/shifts/${shiftId}`);
  return {
    success: true,
    assignmentId: assignment.id,
    warnings: check.ok ? [] : check.violations,
  };
}

// ─── Remove Assignment ────────────────────────────────────────────────────────

export async function removeAssignment(assignmentId: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { shift: true, user: { select: { id: true, name: true } } },
  });

  if (!assignment) return { error: "Assignment not found" };

  // Can't remove if within the cutoff window and shift is published
  if (assignment.shift.status === "PUBLISHED") {
    const cutoffMs = assignment.shift.publishCutoffHours * 60 * 60 * 1000;
    const timeUntilShift = assignment.shift.startTime.getTime() - Date.now();
    if (timeUntilShift < cutoffMs) {
      return {
        error: `Cannot remove assignment — shift starts in less than ${assignment.shift.publishCutoffHours} hours.`,
      };
    }
  }

  // Cancel any pending swap requests for this assignment
  await prisma.swapRequest.updateMany({
    where: {
      assignmentId,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    data: { status: "CANCELLED" },
  });

  const before = { ...assignment };
  await prisma.shiftAssignment.delete({ where: { id: assignmentId } });

  await logAudit({
    entityType: "assignment",
    entityId: assignmentId,
    action: "deleted",
    before,
    performedById: session.user.id,
    locationId: assignment.shift.locationId,
  });

  revalidatePath("/schedule");
  return { success: true };
}

// ─── Publish / Unpublish Schedule ─────────────────────────────────────────────

export async function publishSchedule(locationId: string, weekStart: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  if (session.user.role === "MANAGER") {
    const access = await prisma.locationManager.findUnique({
      where: { userId_locationId: { userId: session.user.id, locationId } },
    });
    if (!access) return { error: "You don't manage this location." };
  }

  const weekStartDate = new Date(weekStart);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 7);

  // Find all DRAFT shifts in the week for this location
  const shifts = await prisma.shift.findMany({
    where: {
      locationId,
      status: "DRAFT",
      startTime: { gte: weekStartDate, lt: weekEndDate },
    },
    include: {
      assignments: { select: { userId: true } },
    },
  });

  if (shifts.length === 0) {
    return { error: "No draft shifts found for this week at this location." };
  }

  // Update all to PUBLISHED
  await prisma.shift.updateMany({
    where: { id: { in: shifts.map((s) => s.id) } },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });

  // Collect all affected staff user IDs
  const affectedUserIds = [
    ...new Set(shifts.flatMap((s) => s.assignments.map((a) => a.userId))),
  ];

  const location = await prisma.location.findUnique({ where: { id: locationId } });

  // Notify all affected staff
  if (affectedUserIds.length > 0 && location) {
    await notify.schedulePublished(
      affectedUserIds,
      location.name,
      weekStart,
      locationId
    );
  }

  await logAudit({
    entityType: "shift",
    entityId: locationId,
    action: "published",
    after: { weekStart, shiftCount: shifts.length },
    performedById: session.user.id,
    locationId,
  });

  // Broadcast to all connected clients — staff will see the schedule appear without refreshing
  await broadcastEvent("schedule", "shift.published", { locationId, weekStart });
  // Also send per-user notification broadcasts so toasts appear in real-time
  for (const uid of affectedUserIds) {
    await broadcastEvent(`notifications:${uid}`, "notification.new", {
      title: "Schedule Published",
      message: `Your schedule for ${location?.name ?? "your location"} has been published.`,
    });
  }

  revalidatePath("/schedule");
  revalidatePath("/dashboard");
  return { success: true, publishedCount: shifts.length, notifiedUsers: affectedUserIds.length };
}

// ─── Update Shift ─────────────────────────────────────────────────────────────

export async function updateShift(shiftId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { location: true },
  });
  if (!shift) return { error: "Shift not found" };

  // Enforce the publish cutoff window
  if (shift.status === "PUBLISHED") {
    const cutoffMs = shift.publishCutoffHours * 60 * 60 * 1000;
    if (shift.startTime.getTime() - Date.now() < cutoffMs) {
      return { error: `Cannot edit a published shift within ${shift.publishCutoffHours} hours of start time.` };
    }
  }

  const parsed = CreateShiftSchema.partial().safeParse({
    locationId: formData.get("locationId") || shift.locationId,
    requiredSkillId: formData.get("requiredSkillId") || shift.requiredSkillId,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    headcount: formData.get("headcount"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) return { error: "Invalid input" };

  const before = { ...shift };

  let startUtc = shift.startTime;
  let endUtc = shift.endTime;

  if (parsed.data.date && parsed.data.startTime) {
    startUtc = localToUtc(parsed.data.date, parsed.data.startTime, shift.location.timezone);
  }
  if (parsed.data.date && parsed.data.endTime) {
    endUtc = localToUtc(parsed.data.date, parsed.data.endTime, shift.location.timezone);
    if (endUtc <= startUtc) {
      endUtc = new Date(endUtc.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  const updated = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      startTime: startUtc,
      endTime: endUtc,
      headcount: parsed.data.headcount ?? shift.headcount,
      notes: parsed.data.notes ?? shift.notes,
      isPremium: isPremiumShift(startUtc, shift.location.timezone),
    },
    include: { assignments: { select: { userId: true } } },
  });

  // Cancel any pending swap requests affected by this change
  const pendingSwaps = await prisma.swapRequest.findMany({
    where: {
      assignment: { shiftId },
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    include: { requester: { select: { id: true } }, targetUser: { select: { id: true } } },
  });

  if (pendingSwaps.length > 0) {
    await prisma.swapRequest.updateMany({
      where: { id: { in: pendingSwaps.map((s) => s.id) } },
      data: { status: "CANCELLED" },
    });

    // Notify affected parties
    for (const swap of pendingSwaps) {
      const affectedIds = [swap.requesterId, swap.targetUserId].filter(Boolean) as string[];
      await notify.swapCancelled(
        affectedIds,
        swap.id,
        "The shift was modified by a manager, so the pending swap request was automatically cancelled."
      );
    }
  }

  // Notify assigned staff about the change
  if (updated.assignments.length > 0) {
    for (const a of updated.assignments) {
      await notify.shiftChanged(
        a.userId,
        shiftId,
        shift.location.name,
        "The shift time or details were updated."
      );
    }
  }

  await logAudit({
    entityType: "shift",
    entityId: shiftId,
    action: "updated",
    before,
    after: { ...updated },
    performedById: session.user.id,
    locationId: shift.locationId,
  });

  revalidatePath("/schedule");
  return { success: true };
}

// ─── Delete Shift ─────────────────────────────────────────────────────────────

export async function deleteShift(shiftId: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { assignments: { select: { userId: true } } },
  });
  if (!shift) return { error: "Shift not found" };

  if (shift.status === "PUBLISHED") {
    return { error: "Cannot delete a published shift. Unpublish it first." };
  }

  // Notify staff who were assigned
  for (const a of shift.assignments) {
    await notify.shiftChanged(a.userId, shiftId, "", "A draft shift you were assigned to has been deleted.");
  }

  await prisma.shift.delete({ where: { id: shiftId } });

  await logAudit({
    entityType: "shift",
    entityId: shiftId,
    action: "deleted",
    before: { ...shift },
    performedById: session.user.id,
    locationId: shift.locationId,
  });

  revalidatePath("/schedule");
  return { success: true };
}
// ─── What-If Preview (no DB write) ───────────────────────────────────────────
// Returns constraint + overtime impact WITHOUT creating the assignment.
// Used by AssignStaffDialog to show a confirmation panel before committing.

export async function checkAssignmentPreview(shiftId: string, userId: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const result = await buildAssignmentPreview(shiftId, userId);
  if ("error" in result) return result;
  return { success: true as const, ...result };
}
