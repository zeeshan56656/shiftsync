import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { startOfWeek, addDays } from "date-fns";
import { ScheduleCalendar } from "./_components/ScheduleCalendar";

export type SerializedLocation = { id: string; name: string; timezone: string };
export type SerializedSkill = { id: string; name: string };
export type SerializedStaff = { id: string; name: string; skills: string[] };
export type SerializedAssignment = { id: string; userId: string; userName: string; status: string };
export type SerializedShift = {
  id: string;
  locationId: string;
  locationName: string;
  locationTimezone: string;
  requiredSkillId: string;
  requiredSkillName: string;
  startTime: string;
  endTime: string;
  headcount: number;
  status: "DRAFT" | "PUBLISHED";
  isPremium: boolean;
  notes: string | null;
  assignments: SerializedAssignment[];
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; location?: string }>;
}) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  let weekStart: Date;
  if (params.week) {
    weekStart = new Date(params.week);
  } else {
    weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  }
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 7);

  const locations = await prisma.location.findMany({
    where:
      session.user.role === "ADMIN"
        ? undefined
        : { managers: { some: { userId: session.user.id } } },
    orderBy: { name: "asc" },
  });

  if (locations.length === 0) redirect("/dashboard");

  const defaultLocationId = params.location ?? locations[0].id;

  const [rawShifts, rawSkills, rawStaff] = await Promise.all([
    prisma.shift.findMany({
      where: {
        locationId: { in: locations.map((l) => l.id) },
        startTime: { gte: weekStart, lt: weekEnd },
      },
      include: {
        location: true,
        requiredSkill: true,
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    prisma.skill.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: {
        role: "STAFF",
        locations: { some: { locationId: { in: locations.map((l) => l.id) } } },
      },
      include: { skills: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const shifts: SerializedShift[] = rawShifts.map((s) => ({
    id: s.id,
    locationId: s.locationId,
    locationName: s.location.name,
    locationTimezone: s.location.timezone,
    requiredSkillId: s.requiredSkillId,
    requiredSkillName: s.requiredSkill.name,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    headcount: s.headcount,
    status: s.status,
    isPremium: s.isPremium,
    notes: s.notes,
    assignments: s.assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.name,
      status: a.status,
    })),
  }));

  return (
    <ScheduleCalendar
      weekStart={weekStart.toISOString()}
      locations={locations.map((l) => ({ id: l.id, name: l.name, timezone: l.timezone }))}
      shifts={shifts}
      skills={rawSkills.map((s) => ({ id: s.id, name: s.name }))}
      staff={rawStaff.map((u) => ({ id: u.id, name: u.name, skills: u.skills.map((us) => us.skillId) }))}
      defaultLocationId={defaultLocationId}
    />
  );
}
