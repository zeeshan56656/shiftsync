import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { AvailabilityClient } from "./_components/AvailabilityClient";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function AvailabilityPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/dashboard");

  const [windows, exceptions] = await Promise.all([
    prisma.availabilityWindow.findMany({
      where: { userId: session.user.id },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.availabilityException.findMany({
      where: {
        userId: session.user.id,
        date: { gte: new Date() },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // Build a complete 7-day grid (fill defaults for missing days)
  const windowMap: Record<number, (typeof windows)[0] | null> = {};
  for (let d = 0; d < 7; d++) windowMap[d] = null;
  for (const w of windows) windowMap[w.dayOfWeek] = w;

  const serializedWindows = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek: i,
    dayName: DAYS[i],
    id: windowMap[i]?.id ?? null,
    startTime: windowMap[i]?.startTime ?? "09:00",
    endTime: windowMap[i]?.endTime ?? "17:00",
    isAvailable: windowMap[i]?.isAvailable ?? true,
  }));

  const serializedExceptions = exceptions.map((e) => ({
    id: e.id,
    date: e.date.toISOString().split("T")[0],
    startTime: e.startTime ?? "",
    endTime: e.endTime ?? "",
    isAvailable: e.isAvailable,
    reason: e.reason ?? "",
  }));

  return (
    <AvailabilityClient
      windows={serializedWindows}
      exceptions={serializedExceptions}
    />
  );
}
