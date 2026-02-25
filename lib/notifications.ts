/**
 * Notification helper — centralized factory for creating notifications.
 * All notification creation goes through here to keep types consistent.
 *
 * Usage from Server Actions:
 *   await notify.shiftAssigned(userId, shift)
 *   await notify.swapRequested(managerId, swapRequest)
 */

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@/app/generated/prisma/client";

type NotificationPayload = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, string | number | boolean | null>;
};

async function createNotification(payload: NotificationPayload) {
  return prisma.notification.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      data: payload.data ?? {},
    },
  });
}

async function createManyNotifications(payloads: NotificationPayload[]) {
  return prisma.notification.createMany({
    data: payloads.map((p) => ({
      userId: p.userId,
      type: p.type,
      title: p.title,
      message: p.message,
      data: p.data ?? {},
    })),
  });
}

export const notify = {
  async shiftAssigned(
    userId: string,
    shiftId: string,
    locationName: string,
    shiftTime: string
  ) {
    return createNotification({
      userId,
      type: "SHIFT_ASSIGNED",
      title: "New shift assigned",
      message: `You've been assigned to a shift at ${locationName} on ${shiftTime}.`,
      data: { shiftId },
    });
  },

  async shiftChanged(
    userId: string,
    shiftId: string,
    locationName: string,
    changeDescription: string
  ) {
    return createNotification({
      userId,
      type: "SHIFT_CHANGED",
      title: "Shift updated",
      message: `Your shift at ${locationName} has been updated: ${changeDescription}`,
      data: { shiftId },
    });
  },

  async schedulePublished(
    userIds: string[],
    locationName: string,
    weekOf: string,
    locationId: string
  ) {
    return createManyNotifications(
      userIds.map((userId) => ({
        userId,
        type: "SCHEDULE_PUBLISHED" as NotificationType,
        title: "Schedule published",
        message: `The schedule for ${locationName} (week of ${weekOf}) is now available.`,
        data: { locationId },
      }))
    );
  },

  async swapRequested(
    targetUserId: string,
    requesterId: string,
    requesterName: string,
    swapRequestId: string,
    shiftTime: string
  ) {
    return createNotification({
      userId: targetUserId,
      type: "SWAP_REQUESTED",
      title: "Shift swap request",
      message: `${requesterName} is asking to swap their ${shiftTime} shift with you.`,
      data: { swapRequestId, requesterId },
    });
  },

  async swapAccepted(
    requesterId: string,
    targetName: string,
    swapRequestId: string
  ) {
    return createNotification({
      userId: requesterId,
      type: "SWAP_ACCEPTED",
      title: "Swap accepted",
      message: `${targetName} accepted your swap request — awaiting manager approval.`,
      data: { swapRequestId },
    });
  },

  async swapRejected(
    requesterId: string,
    targetName: string,
    swapRequestId: string
  ) {
    return createNotification({
      userId: requesterId,
      type: "SWAP_REJECTED",
      title: "Swap declined",
      message: `${targetName} declined your swap request.`,
      data: { swapRequestId },
    });
  },

  async swapApproved(
    userIds: string[],
    swapRequestId: string,
    managerName: string
  ) {
    return createManyNotifications(
      userIds.map((userId) => ({
        userId,
        type: "SWAP_APPROVED" as NotificationType,
        title: "Swap approved",
        message: `${managerName} approved the shift swap. Assignments have been updated.`,
        data: { swapRequestId },
      }))
    );
  },

  async swapCancelled(
    userIds: string[],
    swapRequestId: string,
    reason: string
  ) {
    return createManyNotifications(
      userIds.map((userId) => ({
        userId,
        type: "SWAP_CANCELLED" as NotificationType,
        title: "Swap cancelled",
        message: reason,
        data: { swapRequestId },
      }))
    );
  },

  async dropClaimed(
    requesterId: string,
    claimerName: string,
    swapRequestId: string,
    shiftTime: string
  ) {
    return createNotification({
      userId: requesterId,
      type: "DROP_CLAIMED",
      title: "Someone claimed your shift",
      message: `${claimerName} has picked up your dropped ${shiftTime} shift — awaiting manager approval.`,
      data: { swapRequestId },
    });
  },

  async overtimeWarning(
    managerId: string,
    staffName: string,
    weeklyHours: number,
    locationId: string
  ) {
    return createNotification({
      userId: managerId,
      type: "OVERTIME_WARNING",
      title: "Overtime warning",
      message: `${staffName} is projected at ${weeklyHours.toFixed(1)} hours this week — approaching overtime.`,
      data: { locationId },
    });
  },

  async swapRequestedForManager(
    managerIds: string[],
    requesterName: string,
    swapRequestId: string,
    type: "SWAP" | "DROP"
  ) {
    return createManyNotifications(
      managerIds.map((userId) => ({
        userId,
        type: "SWAP_REQUESTED" as NotificationType,
        title: type === "SWAP" ? "Swap request needs approval" : "Drop request needs approval",
        message:
          type === "SWAP"
            ? `${requesterName} has submitted a swap request that needs your approval.`
            : `${requesterName} has dropped a shift that needs your attention.`,
        data: { swapRequestId },
      }))
    );
  },
};
