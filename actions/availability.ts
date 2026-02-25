"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const WindowSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  isAvailable: z.coerce.boolean(),
});

const ExceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  isAvailable: z.coerce.boolean(),
  reason: z.string().optional(),
});

export async function upsertAvailabilityWindow(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = WindowSchema.safeParse({
    dayOfWeek: formData.get("dayOfWeek"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    isAvailable: formData.get("isAvailable") ?? "true",
  });
  if (!parsed.success) return { error: "Invalid input" };

  const { dayOfWeek, startTime, endTime, isAvailable } = parsed.data;

  // Upsert (one window per day per user)
  const existing = await prisma.availabilityWindow.findFirst({
    where: { userId: session.user.id, dayOfWeek },
  });

  if (existing) {
    await prisma.availabilityWindow.update({
      where: { id: existing.id },
      data: { startTime, endTime, isAvailable },
    });
  } else {
    await prisma.availabilityWindow.create({
      data: { userId: session.user.id, dayOfWeek, startTime, endTime, isAvailable },
    });
  }

  revalidatePath("/availability");
  return { success: true };
}

export async function addAvailabilityException(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = ExceptionSchema.safeParse({
    date: formData.get("date"),
    startTime: formData.get("startTime") || undefined,
    endTime: formData.get("endTime") || undefined,
    isAvailable: formData.get("isAvailable") ?? "false",
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input" };

  const { date, startTime, endTime, isAvailable, reason } = parsed.data;

  // Upsert by date
  const existing = await prisma.availabilityException.findFirst({
    where: { userId: session.user.id, date: new Date(date) },
  });

  if (existing) {
    await prisma.availabilityException.update({
      where: { id: existing.id },
      data: {
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable,
        reason: reason || null,
      },
    });
  } else {
    await prisma.availabilityException.create({
      data: {
        userId: session.user.id,
        date: new Date(date),
        startTime: startTime || null,
        endTime: endTime || null,
        isAvailable,
        reason: reason || null,
      },
    });
  }

  revalidatePath("/availability");
  return { success: true };
}

export async function deleteAvailabilityException(id: string) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const exception = await prisma.availabilityException.findUnique({ where: { id } });
  if (!exception || exception.userId !== session.user.id) return { error: "Not found" };

  await prisma.availabilityException.delete({ where: { id } });
  revalidatePath("/availability");
  return { success: true };
}
