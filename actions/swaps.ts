"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { broadcastEvent } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const RequestSwapSchema = z.object({
  assignmentId: z.string().min(1),
  targetUserId: z.string().optional(),
  message: z.string().optional(),
});

const RequestDropSchema = z.object({
  assignmentId: z.string().min(1),
  message: z.string().optional(),
});

// ─── Request a swap with a specific colleague ─────────────────────────────────

export async function requestSwap(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = RequestSwapSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    targetUserId: formData.get("targetUserId") || undefined,
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };

  const { assignmentId, targetUserId, message } = parsed.data;

  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      shift: {
        include: { location: true, assignments: { include: { user: true } } },
      },
      user: true,
    },
  });

  if (!assignment) return { error: "Assignment not found" };
  if (assignment.userId !== session.user.id) return { error: "Not your assignment" };
  if (assignment.shift.status !== "PUBLISHED") return { error: "Can only swap published shifts" };

  // Check if shift hasn't started yet
  if (assignment.shift.startTime <= new Date()) return { error: "Cannot swap a shift that has already started" };

  // Check for existing pending swap for this assignment
  const existing = await prisma.swapRequest.findFirst({
    where: { assignmentId, status: { in: ["PENDING", "ACCEPTED"] } },
  });
  if (existing) return { error: "You already have a pending swap request for this shift" };

  // Enforce max 3 pending swap/drop requests globally per staff member
  const pendingCount = await prisma.swapRequest.count({
    where: { requesterId: session.user.id, status: { in: ["PENDING", "ACCEPTED"] } },
  });
  if (pendingCount >= 3) {
    return { error: "You already have 3 pending swap/drop requests. Resolve them before creating new ones." };
  }

  const expiresAt = new Date(assignment.shift.startTime.getTime() - 2 * 60 * 60 * 1000); // 2h before shift

  const swap = await prisma.swapRequest.create({
    data: {
      assignmentId,
      requesterId: session.user.id,
      targetUserId: targetUserId || null,
      type: "SWAP",
      requesterMessage: message || null,
      expiresAt,
    },
  });

  // Notify target if specified, otherwise notify managers
  const { location } = assignment.shift;
  const shiftTime = assignment.shift.startTime.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });

  if (targetUserId) {
    await notify.swapRequested(
      targetUserId,
      session.user.id,
      session.user.name!,
      swap.id,
      shiftTime
    );
  }

  // Notify managers
  const managers = await prisma.locationManager.findMany({
    where: { locationId: location.id },
    select: { userId: true },
  });
  await notify.swapRequestedForManager(
    managers.map((m) => m.userId),
    session.user.name!,
    swap.id,
    "SWAP"
  );

  await logAudit({
    entityType: "swap_request",
    entityId: swap.id,
    action: "created",
    after: { type: "SWAP", assignmentId, targetUserId },
    performedById: session.user.id,
    locationId: location.id,
  });

  await broadcastEvent("swaps", "swap.created", { swapId: swap.id, type: "SWAP" });
  revalidatePath("/swaps");
  return { success: true, swapId: swap.id };
}

// ─── Drop a shift (open pickup) ───────────────────────────────────────────────

export async function requestDrop(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = RequestDropSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    message: formData.get("message") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };

  const { assignmentId, message } = parsed.data;

  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { shift: { include: { location: true } } },
  });

  if (!assignment) return { error: "Assignment not found" };
  if (assignment.userId !== session.user.id) return { error: "Not your assignment" };
  if (assignment.shift.status !== "PUBLISHED") return { error: "Can only drop published shifts" };
  if (assignment.shift.startTime <= new Date()) return { error: "Cannot drop a shift that has already started" };

  const existing = await prisma.swapRequest.findFirst({
    where: { assignmentId, status: { in: ["PENDING", "ACCEPTED"] } },
  });
  if (existing) return { error: "You already have a pending request for this shift" };

  // Enforce max 3 pending swap/drop requests globally per staff member
  const pendingCount = await prisma.swapRequest.count({
    where: { requesterId: session.user.id, status: { in: ["PENDING", "ACCEPTED"] } },
  });
  if (pendingCount >= 3) {
    return { error: "You already have 3 pending swap/drop requests. Resolve them before creating new ones." };
  }

  const swap = await prisma.swapRequest.create({
    data: {
      assignmentId,
      requesterId: session.user.id,
      type: "DROP",
      requesterMessage: message || null,
      expiresAt: new Date(assignment.shift.startTime.getTime() - 2 * 60 * 60 * 1000),
    },
  });

  const managers = await prisma.locationManager.findMany({
    where: { locationId: assignment.shift.locationId },
    select: { userId: true },
  });
  await notify.swapRequestedForManager(
    managers.map((m) => m.userId),
    session.user.name!,
    swap.id,
    "DROP"
  );

  await logAudit({
    entityType: "swap_request",
    entityId: swap.id,
    action: "created",
    after: { type: "DROP", assignmentId },
    performedById: session.user.id,
    locationId: assignment.shift.locationId,
  });

  await broadcastEvent("swaps", "swap.created", { swapId: swap.id, type: "DROP" });
  revalidatePath("/swaps");
  return { success: true, swapId: swap.id };
}

// ─── Accept a swap request (target user) ─────────────────────────────────────

export async function acceptSwap(swapId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const swap = await prisma.swapRequest.findUnique({
    where: { id: swapId },
    include: {
      assignment: { include: { shift: { include: { location: true } } } },
      requester: true,
    },
  });

  if (!swap) return { error: "Swap request not found" };
  if (swap.targetUserId !== session.user.id) return { error: "Not your swap request" };
  if (swap.status !== "PENDING") return { error: "Swap is no longer pending" };

  await prisma.swapRequest.update({
    where: { id: swapId },
    data: { status: "ACCEPTED" },
  });

  await notify.swapAccepted(swap.requesterId, session.user.name!, swapId);

  revalidatePath("/swaps");
  return { success: true };
}

// ─── Reject a swap request (target user) ─────────────────────────────────────

export async function rejectSwap(swapId: string) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const swap = await prisma.swapRequest.findUnique({ where: { id: swapId } });
  if (!swap) return { error: "Swap request not found" };
  if (swap.targetUserId !== session.user.id) return { error: "Not your swap request" };
  if (swap.status !== "PENDING") return { error: "Swap is no longer pending" };

  await prisma.swapRequest.update({
    where: { id: swapId },
    data: { status: "REJECTED" },
  });

  await notify.swapRejected(swap.requesterId, session.user.name!, swapId);

  revalidatePath("/swaps");
  return { success: true };
}

// ─── Claim a dropped shift (any qualified staff) ──────────────────────────────

export async function claimDrop(swapId: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") return { error: "Unauthorized" };

  const swap = await prisma.swapRequest.findUnique({
    where: { id: swapId },
    include: {
      assignment: { include: { shift: { include: { location: true, requiredSkill: true } } } },
      requester: true,
    },
  });

  if (!swap) return { error: "Not found" };
  if (swap.type !== "DROP") return { error: "Not a drop request" };
  if (swap.status !== "PENDING") return { error: "This drop is no longer available" };
  if (swap.requesterId === session.user.id) return { error: "Cannot claim your own drop" };

  // Check staff is certified at this location
  const certified = await prisma.userLocation.findUnique({
    where: {
      userId_locationId: {
        userId: session.user.id,
        locationId: swap.assignment.shift.locationId,
      },
    },
  });
  if (!certified) return { error: "You are not certified at this location" };

  // Set targetUserId and move to ACCEPTED (awaiting manager approval)
  await prisma.swapRequest.update({
    where: { id: swapId },
    data: { targetUserId: session.user.id, status: "ACCEPTED" },
  });

  const shiftTime = swap.assignment.shift.startTime.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
  await notify.dropClaimed(swap.requesterId, session.user.name!, swapId, shiftTime);

  revalidatePath("/swaps");
  return { success: true };
}

// ─── Manager approve swap/drop ────────────────────────────────────────────────

export async function approveSwap(swapId: string, notes?: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const swap = await prisma.swapRequest.findUnique({
    where: { id: swapId },
    include: {
      assignment: { include: { shift: true, user: true } },
      requester: true,
      targetUser: true,
    },
  });

  if (!swap) return { error: "Not found" };
  if (swap.status !== "ACCEPTED" && swap.status !== "PENDING") {
    return { error: "Swap must be accepted or pending before approval" };
  }
  if (!swap.targetUserId) return { error: "No one has claimed this drop yet" };

  // Perform the swap: reassign the shift from requester to target
  await prisma.$transaction([
    prisma.shiftAssignment.update({
      where: { id: swap.assignmentId },
      data: { userId: swap.targetUserId },
    }),
    prisma.swapRequest.update({
      where: { id: swapId },
      data: {
        status: "APPROVED",
        approverId: session.user.id,
        approvedAt: new Date(),
        managerNotes: notes || null,
      },
    }),
  ]);

  await notify.swapApproved(
    [swap.requesterId, swap.targetUserId],
    swapId,
    session.user.name!
  );

  await logAudit({
    entityType: "swap_request",
    entityId: swapId,
    action: "approved",
    after: { fromUserId: swap.requesterId, toUserId: swap.targetUserId },
    performedById: session.user.id,
    locationId: swap.assignment.shift.locationId,
  });

  await broadcastEvent("swaps", "swap.updated", { swapId, status: "APPROVED" });
  await broadcastEvent("schedule", "shift.updated", { shiftId: swap.assignmentId });
  revalidatePath("/swaps");
  revalidatePath("/schedule");
  return { success: true };
}

// ─── Manager deny swap/drop ───────────────────────────────────────────────────

export async function denySwap(swapId: string, reason: string) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    return { error: "Unauthorized" };
  }

  const swap = await prisma.swapRequest.findUnique({
    where: { id: swapId },
    include: { assignment: { include: { shift: true } } },
  });

  if (!swap) return { error: "Not found" };

  const affectedIds = [swap.requesterId, swap.targetUserId].filter(Boolean) as string[];

  await prisma.swapRequest.update({
    where: { id: swapId },
    data: {
      status: "CANCELLED",
      approverId: session.user.id,
      managerNotes: reason,
    },
  });

  await notify.swapCancelled(affectedIds, swapId, reason || "Manager denied the request.");

  await broadcastEvent("swaps", "swap.updated", { swapId, status: "CANCELLED" });
  revalidatePath("/swaps");
  return { success: true };
}
