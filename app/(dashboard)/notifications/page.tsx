import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MarkAllReadButton } from "./_components/MarkAllReadButton";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SHIFT_ASSIGNED:     { label: "Shift assigned",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  SHIFT_CHANGED:      { label: "Shift changed",     color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  SCHEDULE_PUBLISHED: { label: "Schedule published", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  SWAP_REQUESTED:     { label: "Swap request",       color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  SWAP_ACCEPTED:      { label: "Swap accepted",      color: "bg-green-500/20 text-green-400 border-green-500/30" },
  SWAP_REJECTED:      { label: "Swap declined",      color: "bg-red-500/20 text-red-400 border-red-500/30" },
  SWAP_APPROVED:      { label: "Swap approved",      color: "bg-green-500/20 text-green-400 border-green-500/30" },
  SWAP_CANCELLED:     { label: "Swap cancelled",     color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  DROP_CLAIMED:       { label: "Shift claimed",      color: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
  OVERTIME_WARNING:   { label: "Overtime warning",   color: "bg-red-500/20 text-red-400 border-red-500/30" },
  AVAILABILITY_CHANGED:{ label: "Availability",     color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const unread = notifications.filter((n) => !n.isRead).length;

  // Mark all as read (side-effect on page visit for unread ones)
  if (unread > 0) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-slate-400 text-sm mt-1">
            {unread > 0 ? `${unread} unread` : "All caught up"}
          </p>
        </div>
        {notifications.length > 0 && <MarkAllReadButton userId={session.user.id} />}
      </div>

      {notifications.length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-16 text-center">
            <BellOff className="h-8 w-8 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500">No notifications yet.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {notifications.map((n) => {
          const meta = TYPE_LABELS[n.type] ?? { label: n.type, color: "bg-slate-700 text-slate-300" };
          return (
            <div
              key={n.id}
              className={cn(
                "rounded-lg border px-4 py-3 transition-colors",
                n.isRead
                  ? "bg-slate-800/30 border-slate-800"
                  : "bg-slate-800/70 border-slate-700"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <Bell
                    className={cn(
                      "h-4 w-4",
                      n.isRead ? "text-slate-600" : "text-blue-400"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-white">{n.title}</span>
                    <Badge className={cn("text-[10px] px-1.5 py-0 h-4 border font-normal", meta.color)}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-slate-400 text-sm leading-snug">{n.message}</p>
                  <p className="text-slate-600 text-xs mt-1.5">
                    {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
