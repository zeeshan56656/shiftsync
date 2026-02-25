import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function MyShiftsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/dashboard");

  const now = new Date();
  const fourWeeksAhead = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      userId: session.user.id,
      shift: {
        endTime: { gte: now },
        startTime: { lt: fourWeeksAhead },
        status: "PUBLISHED",
      },
    },
    include: {
      shift: {
        include: {
          location: true,
          requiredSkill: true,
        },
      },
    },
    orderBy: { shift: { startTime: "asc" } },
  });

  // Group by week
  const grouped: Record<string, typeof assignments> = {};
  for (const a of assignments) {
    const weekStart = getWeekStart(a.shift.startTime);
    const key = weekStart.toISOString();
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">My Shifts</h1>
        <p className="text-slate-400 text-sm mt-1">Your upcoming published shifts</p>
      </div>

      {Object.keys(grouped).length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-14 text-center text-slate-500">
            <CalendarDays className="h-8 w-8 mx-auto mb-3 text-slate-700" />
            No upcoming shifts scheduled.
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([weekIso, items]) => {
        const weekDate = new Date(weekIso);
        const weekEnd = new Date(weekDate.getTime() + 6 * 24 * 60 * 60 * 1000);
        const totalHours = items.reduce((sum, a) => {
          const ms = a.shift.endTime.getTime() - a.shift.startTime.getTime();
          return sum + ms / 3_600_000;
        }, 0);

        return (
          <div key={weekIso}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300">
                Week of{" "}
                {weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" "}–{" "}
                {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </h2>
              <span className="text-xs text-slate-500">{totalHours.toFixed(1)} hrs</span>
            </div>

            <div className="space-y-2">
              {items.map((a) => {
                const { shift } = a;
                const tz = shift.location.timezone;
                const isOngoing =
                  shift.startTime <= now && shift.endTime >= now;

                return (
                  <Card
                    key={a.id}
                    className={cn(
                      "border transition-colors",
                      isOngoing
                        ? "bg-green-950/40 border-green-700/40"
                        : "bg-slate-800/50 border-slate-700"
                    )}
                  >
                    <CardContent className="p-4 flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold text-sm">
                            {formatInTimeZone(shift.startTime, tz, "EEE, MMM d")}
                          </span>
                          {isOngoing && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">
                              On now
                            </Badge>
                          )}
                          {shift.isPremium && (
                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] gap-1">
                              <Sparkles className="h-2.5 w-2.5" />
                              Premium
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          {formatInTimeZone(shift.startTime, tz, "h:mm a")} –{" "}
                          {formatInTimeZone(shift.endTime, tz, "h:mm a zzz")}
                        </div>

                        <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {shift.location.name}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <Badge className="bg-slate-700 text-slate-300 text-[11px] border-0">
                          {shift.requiredSkill.name}
                        </Badge>
                        <p className="text-slate-500 text-xs mt-1.5">
                          {(
                            (shift.endTime.getTime() - shift.startTime.getTime()) /
                            3_600_000
                          ).toFixed(1)}{" "}
                          hrs
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
