import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftRight, Clock, MapPin } from "lucide-react";
import { SwapActions } from "./_components/SwapActions";
import { RequestSwapButton } from "./_components/RequestSwapButton";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  PENDING:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  ACCEPTED:  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  APPROVED:  "bg-green-500/20 text-green-400 border-green-500/30",
  REJECTED:  "bg-red-500/20 text-red-400 border-red-500/30",
  CANCELLED: "bg-slate-500/20 text-slate-500 border-slate-600",
  EXPIRED:   "bg-slate-500/20 text-slate-600 border-slate-700",
};

export default async function SwapsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isManager = ["ADMIN", "MANAGER"].includes(session.user.role);

  // Fetch relevant swap requests
  const swaps = await prisma.swapRequest.findMany({
    where: isManager
      ? {
          assignment: {
            shift: {
              location: {
                managers: session.user.role === "MANAGER"
                  ? { some: { userId: session.user.id } }
                  : undefined,
              },
            },
          },
          status: { in: ["PENDING", "ACCEPTED"] },
        }
      : {
          OR: [
            { requesterId: session.user.id },
            { targetUserId: session.user.id },
          ],
        },
    include: {
      assignment: {
        include: {
          shift: { include: { location: true, requiredSkill: true } },
          user: { select: { id: true, name: true } },
        },
      },
      requester: { select: { id: true, name: true } },
      targetUser: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // For staff: also fetch their upcoming assignments so they can initiate swaps
  const myAssignments =
    session.user.role === "STAFF"
      ? await prisma.shiftAssignment.findMany({
          where: {
            userId: session.user.id,
            shift: { startTime: { gt: new Date() }, status: "PUBLISHED" },
            // No pending swap already
            swapRequests: { none: { status: { in: ["PENDING", "ACCEPTED"] } } },
          },
          include: {
            shift: { include: { location: true, requiredSkill: true } },
          },
          orderBy: { shift: { startTime: "asc" } },
          take: 10,
        })
      : [];

  // Open drops staff can claim (type=DROP, status=PENDING, not their own)
  const openDrops =
    session.user.role === "STAFF"
      ? await prisma.swapRequest.findMany({
          where: {
            type: "DROP",
            status: "PENDING",
            requesterId: { not: session.user.id },
            assignment: {
              shift: {
                startTime: { gt: new Date() },
                status: "PUBLISHED",
                location: { staff: { some: { userId: session.user.id } } },
              },
            },
          },
          include: {
            assignment: {
              include: {
                shift: { include: { location: true, requiredSkill: true } },
                user: { select: { name: true } },
              },
            },
            requester: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Swaps & Drops</h1>
        <p className="text-slate-400 text-sm mt-1">
          {isManager ? "Approve or deny pending requests" : "Manage your shift swaps and drops"}
        </p>
      </div>

      {/* Staff: Initiate a swap/drop */}
      {session.user.role === "STAFF" && myAssignments.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
            Your upcoming shifts
          </h2>
          <div className="space-y-2">
            {myAssignments.map((a) => {
              const tz = a.shift.location.timezone;
              return (
                <Card key={a.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-white font-medium text-sm">
                        {formatInTimeZone(a.shift.startTime, tz, "EEE, MMM d · h:mm a")} –{" "}
                        {formatInTimeZone(a.shift.endTime, tz, "h:mm a zzz")}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {a.shift.location.name}
                        </span>
                        <span>{a.shift.requiredSkill.name}</span>
                      </div>
                    </div>
                    <RequestSwapButton assignmentId={a.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Staff: Open drops to claim */}
      {openDrops.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
            Open shifts to pick up
          </h2>
          <div className="space-y-2">
            {openDrops.map((drop) => {
              const tz = drop.assignment.shift.location.timezone;
              return (
                <Card key={drop.id} className="bg-teal-950/30 border-teal-700/30">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <p className="text-white font-medium text-sm">
                        {formatInTimeZone(drop.assignment.shift.startTime, tz, "EEE, MMM d · h:mm a")} –{" "}
                        {formatInTimeZone(drop.assignment.shift.endTime, tz, "h:mm a zzz")}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {drop.assignment.shift.location.name}
                        </span>
                        <span>{drop.assignment.shift.requiredSkill.name}</span>
                        <span>Dropped by {drop.requester.name}</span>
                      </div>
                    </div>
                    <SwapActions
                      swapId={drop.id}
                      type="DROP"
                      viewAs="claimer"
                      status={drop.status}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* All swap requests */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">
          {isManager ? "Pending approval" : "Your requests"}
        </h2>

        {swaps.length === 0 && (
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-14 text-center">
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-3 text-slate-700" />
              <p className="text-slate-500">
                {isManager ? "No pending requests." : "No swap or drop requests yet."}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {swaps.map((swap) => {
            const tz = swap.assignment.shift.location.timezone;
            const isRequester = swap.requesterId === session.user.id;
            const isTarget = swap.targetUserId === session.user.id;

            return (
              <Card
                key={swap.id}
                className={cn(
                  "border",
                  swap.status === "PENDING" || swap.status === "ACCEPTED"
                    ? "bg-slate-800/60 border-slate-700"
                    : "bg-slate-800/20 border-slate-800"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Shift info */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            variant="outline"
                            className={cn("text-[11px] border", STATUS_STYLE[swap.status])}
                          >
                            {swap.type} · {swap.status}
                          </Badge>
                          {swap.assignment.shift.isPremium && (
                            <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                              Premium
                            </Badge>
                          )}
                        </div>
                        <p className="text-white font-medium text-sm mt-1.5">
                          {formatInTimeZone(swap.assignment.shift.startTime, tz, "EEE, MMM d")}
                        </p>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                          <Clock className="h-3 w-3" />
                          {formatInTimeZone(swap.assignment.shift.startTime, tz, "h:mm a")} –{" "}
                          {formatInTimeZone(swap.assignment.shift.endTime, tz, "h:mm a zzz")}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-0.5">
                          <MapPin className="h-3 w-3" />
                          {swap.assignment.shift.location.name} ·{" "}
                          {swap.assignment.shift.requiredSkill.name}
                        </div>
                      </div>

                      {/* Parties */}
                      <div className="text-xs text-slate-500 space-y-0.5">
                        <p>
                          Requested by:{" "}
                          <span className="text-slate-300">{swap.requester.name}</span>
                        </p>
                        {swap.targetUser && (
                          <p>
                            {swap.type === "DROP" ? "Claimed by" : "Swap with"}:{" "}
                            <span className="text-slate-300">{swap.targetUser.name}</span>
                          </p>
                        )}
                        {swap.managerNotes && (
                          <p className="text-slate-600 italic">"{swap.managerNotes}"</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <SwapActions
                      swapId={swap.id}
                      type={swap.type}
                      status={swap.status}
                      viewAs={
                        isManager ? "manager" : isTarget ? "target" : "requester"
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
