"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const NotifPrefsSchema = z.object({
  notifyInApp: z.coerce.boolean(),
  notifyEmail: z.coerce.boolean(),
});

export async function updateNotificationPrefs(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = NotifPrefsSchema.safeParse({
    notifyInApp: formData.get("notifyInApp") === "true",
    notifyEmail: formData.get("notifyEmail") === "true",
  });
  if (!parsed.success) return { error: "Invalid input" };

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      notifyInApp: parsed.data.notifyInApp,
      notifyEmail: parsed.data.notifyEmail,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

const DesiredHoursSchema = z.object({
  desiredHoursPerWeek: z.coerce.number().int().min(0).max(80),
});

export async function updateDesiredHours(formData: FormData) {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const parsed = DesiredHoursSchema.safeParse({
    desiredHoursPerWeek: formData.get("desiredHoursPerWeek"),
  });
  if (!parsed.success) return { error: "Invalid hours value" };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { desiredHoursPerWeek: parsed.data.desiredHoursPerWeek },
  });

  revalidatePath("/settings");
  return { success: true };
}
