import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarDays, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Currently active shifts (started ≤ now, ending ≥ now)
  const activeShifts = await prisma.shift.findMany({
    where: {
      status: "PUBLISHED",
      startTime: { lte: now },
      endTime: { gte: now },
      ...(session.user.role === "MANAGER"
        ? {
            location: {
              managers: { some: { userId: session.user.id } },
            },
          }
        : {}),
    },
    include: {
      location: true,
      requiredSkill: true,
      assignments: {
        where: { status: { not: "NO_SHOW" } },
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // Pending swap requests
  const pendingSwaps = await prisma.swapRequest.count({
    where: {
      status: "PENDING",
      ...(session.user.role === "MANAGER"
        ? {
            assignment: {
              shift: {
                location: { managers: { some: { userId: session.user.id } } },
              },
            },
          }
        : session.user.role === "STAFF"
        ? {
            OR: [
              { requesterId: session.user.id },
              { targetUserId: session.user.id },
            ],
          }
        : {}),
    },
  });

  // Upcoming shifts this week
  const upcomingShifts = await prisma.shiftAssignment.count({
    where: {
      userId: session.user.role === "STAFF" ? session.user.id : undefined,
      shift: {
        startTime: { gte: now, lte: weekEnd },
        status: "PUBLISHED",
        ...(session.user.role === "MANAGER"
          ? { location: { managers: { some: { userId: session.user.id } } } }
          : {}),
      },
    },
  });

  // Unread notifications
  const unreadNotifications = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Good {getTimeOfDay()}, {session.user.name.split(" ")[0]}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-green-400" />}
          label="On Duty Now"
          value={activeShifts.reduce((sum, s) => sum + s.assignments.length, 0)}
          sub={`across ${activeShifts.length} active shift${activeShifts.length !== 1 ? "s" : ""}`}
          color="green"
        />
        <StatCard
          icon={<CalendarDays className="h-5 w-5 text-blue-400" />}
          label={session.user.role === "STAFF" ? "My Shifts This Week" : "Shifts This Week"}
          value={upcomingShifts}
          sub="remaining"
          color="blue"
        />
        <StatCard
          icon={<ArrowLeftRight className="h-5 w-5 text-yellow-400" />}
          label="Pending Swaps"
          value={pendingSwaps}
          sub="need attention"
          color={pendingSwaps > 0 ? "yellow" : "slate"}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5 text-slate-400" />}
          label="Unread"
          value={unreadNotifications}
          sub="notifications"
          color={unreadNotifications > 0 ? "red" : "slate"}
        />
      </div>

      {/* On-duty now */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">On Duty Now</h2>
        {activeShifts.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-10 text-center text-slate-500">
              No active shifts at this time.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeShifts.map((shift) => (
              <Card key={shift.id} className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm text-white font-semibold">
                        {shift.location.name}
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatInTimeZone(shift.startTime, shift.location.timezone, "h:mm a")}
                        {" – "}
                        {formatInTimeZone(shift.endTime, shift.location.timezone, "h:mm a zzz")}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-xs border-green-500/30 text-green-400 bg-green-500/10 shrink-0"
                    >
                      Live
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-300">
                      {shift.requiredSkill.name}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {shift.assignments.length}/{shift.headcount} filled
                    </span>
                  </div>
                  <div className="space-y-1">
                    {shift.assignments.length === 0 ? (
                      <p className="text-xs text-red-400">No staff assigned</p>
                    ) : (
                      shift.assignments.map((a) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <div className="h-5 w-5 rounded-full bg-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                            {a.user.name.charAt(0)}
                          </div>
                          <span className="text-xs text-slate-300">{a.user.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  color: "green" | "blue" | "yellow" | "red" | "slate";
}) {
  const bg = {
    green: "bg-green-500/10 border-green-500/20",
    blue: "bg-blue-500/10 border-blue-500/20",
    yellow: "bg-yellow-500/10 border-yellow-500/20",
    red: "bg-red-500/10 border-red-500/20",
    slate: "bg-slate-800/50 border-slate-700",
  }[color];

  return (
    <Card className={`${bg} border`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <p className="text-3xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
