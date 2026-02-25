import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart2, TrendingUp, AlertTriangle, Users, Star, Target } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { subDays } from "date-fns";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "MANAGER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Last 30 days for fairness window
  const fairnessFrom = subDays(now, 30);

  // Get locations this manager has access to
  const locations = await prisma.location.findMany({
    where:
      session.user.role === "MANAGER"
        ? { managers: { some: { userId: session.user.id } } }
        : undefined,
    orderBy: { name: "asc" },
  });

  const locationIds = locations.map((l) => l.id);

  // Get all staff for these locations with this week's assignments
  const staff = await prisma.user.findMany({
    where: {
      role: "STAFF",
      locations: { some: { locationId: { in: locationIds } } },
    },
    include: {
      assignments: {
        where: {
          shift: {
            startTime: { gte: weekStart, lt: weekEnd },
            status: "PUBLISHED",
          },
        },
        include: { shift: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // Calculate weekly hours per staff
  const staffMetrics = staff.map((member) => {
    const weeklyHours = member.assignments.reduce(
      (sum, a) =>
        sum + (a.shift.endTime.getTime() - a.shift.startTime.getTime()) / 3_600_000,
      0
    );
    const overtimeLevel =
      weeklyHours >= 40 ? "hard" : weeklyHours >= 35 ? "warn" : "ok";
    const desired = member.desiredHoursPerWeek;
    const delta = desired != null ? weeklyHours - desired : null;
    return { ...member, weeklyHours, overtimeLevel, delta };
  });
  staffMetrics.sort((a, b) => b.weeklyHours - a.weeklyHours);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalShiftsThisWeek = await prisma.shift.count({
    where: {
      locationId: { in: locationIds },
      startTime: { gte: weekStart, lt: weekEnd },
      status: "PUBLISHED",
    },
  });

  const understaffedShifts = await prisma.shift.findMany({
    where: {
      locationId: { in: locationIds },
      startTime: { gte: weekStart, lt: weekEnd },
      status: "PUBLISHED",
    },
    include: { _count: { select: { assignments: true } } },
  });
  const understaffedCount = understaffedShifts.filter(
    (s) => s._count.assignments < s.headcount
  ).length;

  const pendingSwaps = await prisma.swapRequest.count({
    where: {
      status: { in: ["PENDING", "ACCEPTED"] },
      assignment: { shift: { locationId: { in: locationIds } } },
    },
  });

  // ── Premium shift fairness (last 30 days) ─────────────────────────────────
  const premiumAssignments = await prisma.shiftAssignment.findMany({
    where: {
      shift: {
        locationId: { in: locationIds },
        isPremium: true,
        startTime: { gte: fairnessFrom },
        status: "PUBLISHED",
      },
      userId: { in: staff.map((s) => s.id) },
    },
    select: { userId: true },
  });

  const premiumCountByUser: Record<string, number> = {};
  for (const a of premiumAssignments) {
    premiumCountByUser[a.userId] = (premiumCountByUser[a.userId] ?? 0) + 1;
  }
  const totalPremiumShifts = premiumAssignments.length;

  const premiumFairness = staff
    .map((member) => ({
      id: member.id,
      name: member.name,
      count: premiumCountByUser[member.id] ?? 0,
      pct: totalPremiumShifts > 0
        ? ((premiumCountByUser[member.id] ?? 0) / totalPremiumShifts) * 100
        : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const maxPremium = Math.max(...premiumFairness.map((p) => p.count), 1);

  // ── Hours distribution chart max ──────────────────────────────────────────
  const maxHours = Math.max(...staffMetrics.map((s) => s.weeklyHours), 40);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">
          Week of{" "}
          {weekStart.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<BarChart2 className="h-5 w-5 text-blue-400" />} label="Published Shifts" value={totalShiftsThisWeek} color="blue" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5 text-amber-400" />} label="Understaffed" value={understaffedCount} color={understaffedCount > 0 ? "amber" : "slate"} />
        <SummaryCard icon={<TrendingUp className="h-5 w-5 text-red-400" />} label="Pending Swaps" value={pendingSwaps} color={pendingSwaps > 0 ? "red" : "slate"} />
        <SummaryCard icon={<Users className="h-5 w-5 text-slate-400" />} label="Active Staff" value={staff.length} color="slate" />
      </div>

      {/* Weekly hours distribution */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base">Weekly Hours Distribution</CardTitle>
          <p className="text-slate-500 text-xs mt-0.5">
            Current week — flags overtime thresholds (35h / 40h)
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {staffMetrics.length === 0 && (
            <p className="text-slate-600 text-sm text-center py-6">
              No staff data for this week.
            </p>
          )}
          {staffMetrics.map((member) => (
            <div key={member.id} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                    {member.name.charAt(0)}
                  </div>
                  <span className="text-slate-300 truncate max-w-[140px]">
                    {member.name}
                  </span>
                  {member.delta !== null && (
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        member.delta > 5
                          ? "text-red-400"
                          : member.delta < -5
                          ? "text-slate-500"
                          : "text-green-400"
                      )}
                    >
                      {member.delta > 0 ? "+" : ""}
                      {member.delta.toFixed(0)}h vs target
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "font-semibold tabular-nums text-sm",
                      member.overtimeLevel === "hard"
                        ? "text-red-400"
                        : member.overtimeLevel === "warn"
                        ? "text-amber-400"
                        : "text-slate-400"
                    )}
                  >
                    {member.weeklyHours.toFixed(1)}h
                  </span>
                  {member.overtimeLevel === "hard" && (
                    <Badge className="text-[10px] px-1 py-0 h-4 bg-red-500/20 text-red-400 border-red-500/30">
                      OT
                    </Badge>
                  )}
                  {member.overtimeLevel === "warn" && (
                    <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                      ~OT
                    </Badge>
                  )}
                </div>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    member.overtimeLevel === "hard"
                      ? "bg-red-500"
                      : member.overtimeLevel === "warn"
                      ? "bg-amber-500"
                      : "bg-blue-500"
                  )}
                  style={{
                    width: `${Math.min((member.weeklyHours / maxHours) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-4 pt-2 border-t border-slate-700 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> Normal
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> 35h+ warning
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> 40h+ overtime
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Premium shift fairness */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            Premium Shift Fairness
          </CardTitle>
          <p className="text-slate-500 text-xs mt-0.5">
            Fri/Sat evening shifts — last 30 days · {totalPremiumShifts} total premium assignments
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {totalPremiumShifts === 0 ? (
            <p className="text-slate-600 text-sm text-center py-6">
              No premium shifts assigned in the last 30 days.
            </p>
          ) : (
            premiumFairness.map((member) => {
              // Flag inequity: >2× the average
              const avg = totalPremiumShifts / staff.length;
              const isHigh = member.count > avg * 2 && member.count > 2;
              const isLow = member.count === 0 && totalPremiumShifts > 2;
              return (
                <div key={member.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <span className="text-slate-300 truncate max-w-[140px]">
                        {member.name}
                      </span>
                      {isHigh && (
                        <Badge className="text-[10px] px-1 py-0 h-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                          High
                        </Badge>
                      )}
                      {isLow && (
                        <Badge className="text-[10px] px-1 py-0 h-4 bg-slate-700 text-slate-500 border-slate-600">
                          None
                        </Badge>
                      )}
                    </div>
                    <span className="text-amber-400 font-semibold tabular-nums text-sm shrink-0">
                      {member.count}{" "}
                      <span className="text-slate-500 font-normal text-xs">
                        ({member.pct.toFixed(0)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{
                        width: `${(member.count / maxPremium) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
          {totalPremiumShifts > 0 && (
            <p className="text-xs text-slate-600 pt-2 border-t border-slate-700">
              Average:{" "}
              {(totalPremiumShifts / staff.length).toFixed(1)} premium shifts per staff member
            </p>
          )}
        </CardContent>
      </Card>

      {/* Under/over-scheduled vs desired hours */}
      {staffMetrics.some((m) => m.delta !== null) && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-green-400" />
              Hours vs Target
            </CardTitle>
            <p className="text-slate-500 text-xs mt-0.5">
              Staff with a set desired hours target — current week
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {staffMetrics
                .filter((m) => m.delta !== null)
                .map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                        {member.name.charAt(0)}
                      </div>
                      <span className="text-slate-300 text-sm truncate max-w-[140px]">
                        {member.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-sm">
                      <span className="text-slate-500 text-xs">
                        target: {member.desiredHoursPerWeek}h
                      </span>
                      <span className="text-slate-300 tabular-nums">
                        {member.weeklyHours.toFixed(1)}h
                      </span>
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5",
                          member.delta! > 5
                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                            : member.delta! < -5
                            ? "bg-slate-700 text-slate-400 border-slate-600"
                            : "bg-green-500/20 text-green-400 border-green-500/30"
                        )}
                      >
                        {member.delta! > 0 ? "+" : ""}
                        {member.delta!.toFixed(0)}h
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Understaffed shifts */}
      {understaffedCount > 0 && (
        <Card className="bg-amber-950/20 border-amber-700/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-amber-400 text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Understaffed Shifts This Week
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {understaffedShifts
              .filter((s) => s._count.assignments < s.headcount)
              .map((s) => {
                const loc = locations.find((l) => l.id === s.locationId);
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between bg-slate-800/40 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{loc?.name}</p>
                      <p className="text-slate-500 text-xs">
                        {formatInTimeZone(
                          s.startTime,
                          loc?.timezone ?? "UTC",
                          "EEE, MMM d · h:mm a"
                        )}{" "}
                        –{" "}
                        {formatInTimeZone(
                          s.endTime,
                          loc?.timezone ?? "UTC",
                          "h:mm a zzz"
                        )}
                      </p>
                    </div>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                      {s._count.assignments}/{s.headcount} filled
                    </Badge>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "amber" | "red" | "slate";
}) {
  const bg = {
    blue: "bg-blue-500/10 border-blue-500/20",
    amber: "bg-amber-500/10 border-amber-500/20",
    red: "bg-red-500/10 border-red-500/20",
    slate: "bg-slate-800/50 border-slate-700",
  }[color];

  return (
    <Card className={cn("border", bg)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
            {label}
          </span>
          {icon}
        </div>
        <p className="text-3xl font-bold text-white">{value}</p>
      </CardContent>
    </Card>
  );
}
