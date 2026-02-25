import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MapPin, Clock } from "lucide-react";

export default async function StaffPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  // Managers only see staff at their locations
  const locationFilter =
    session.user.role === "MANAGER"
      ? { locations: { some: { location: { managers: { some: { userId: session.user.id } } } } } }
      : {};

  const staff = await prisma.user.findMany({
    where: { role: "STAFF", ...locationFilter },
    include: {
      locations: { include: { location: true } },
      skills: { include: { skill: true } },
      assignments: {
        where: {
          shift: {
            startTime: { gte: new Date() },
            status: "PUBLISHED",
          },
        },
        include: { shift: { include: { location: true } } },
        orderBy: { shift: { startTime: "asc" } },
        take: 3,
      },
    },
    orderBy: { name: "asc" },
  });

  // Weekly hours for each staff member
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const weeklyHoursMap: Record<string, number> = {};
  for (const member of staff) {
    const weeklyAssignments = await prisma.shiftAssignment.findMany({
      where: {
        userId: member.id,
        shift: { startTime: { gte: weekStart, lt: weekEnd }, status: "PUBLISHED" },
      },
      include: { shift: true },
    });
    weeklyHoursMap[member.id] = weeklyAssignments.reduce(
      (sum, a) => sum + (a.shift.endTime.getTime() - a.shift.startTime.getTime()) / 3_600_000,
      0
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Staff</h1>
          <p className="text-slate-400 text-sm mt-1">{staff.length} team members</p>
        </div>
      </div>

      {staff.length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-14 text-center text-slate-500">
            <Users className="h-8 w-8 mx-auto mb-3 text-slate-700" />
            No staff assigned to your locations.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {staff.map((member) => {
          const weekHours = weeklyHoursMap[member.id] ?? 0;
          const overtimeLevel =
            weekHours >= 40 ? "high" : weekHours >= 35 ? "warn" : "ok";

          return (
            <Card
              key={member.id}
              className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors"
            >
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold text-sm shrink-0">
                    {member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold text-sm truncate">{member.name}</p>
                    <p className="text-slate-500 text-xs truncate">{member.email}</p>
                  </div>
                </div>

                {/* Skills */}
                {member.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {member.skills.map((us) => (
                      <Badge
                        key={us.skillId}
                        className="text-[10px] px-1.5 py-0 h-4 bg-slate-700 text-slate-300 border-0 font-normal"
                      >
                        {us.skill.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Locations */}
                {member.locations.length > 0 && (
                  <div className="flex items-start gap-1.5 text-slate-500 text-xs">
                    <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="truncate">
                      {member.locations.map((ul) => ul.location.name).join(", ")}
                    </span>
                  </div>
                )}

                {/* Weekly hours */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-700">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-slate-400">This week:</span>
                    <span
                      className={
                        overtimeLevel === "high"
                          ? "text-red-400 font-semibold"
                          : overtimeLevel === "warn"
                          ? "text-amber-400 font-semibold"
                          : "text-slate-300"
                      }
                    >
                      {weekHours.toFixed(1)} hrs
                    </span>
                    {overtimeLevel === "high" && (
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-red-500/20 text-red-400 border-red-500/30">
                        OT
                      </Badge>
                    )}
                    {overtimeLevel === "warn" && (
                      <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                        ~OT
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-slate-600">
                    {member.assignments.length > 0
                      ? `${member.assignments.length} upcoming`
                      : "no shifts"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
