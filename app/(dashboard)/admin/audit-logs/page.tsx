import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { AuditFilters } from "./_components/AuditFilters";
import { Suspense } from "react";

const ACTION_COLORS: Record<string, string> = {
  created:    "bg-green-500/20 text-green-400 border-green-500/30",
  updated:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
  deleted:    "bg-red-500/20 text-red-400 border-red-500/30",
  assigned:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
  unassigned: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  published:  "bg-teal-500/20 text-teal-400 border-teal-500/30",
  approved:   "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled:  "bg-slate-600/40 text-slate-400 border-slate-600",
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    entityType?: string;
    locationId?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const { from, to, entityType, locationId } = params;

  const [logs, locations] = await Promise.all([
    prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(locationId ? { locationId } : {}),
        ...((from || to) ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to   ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
          },
        } : {}),
      },
      include: { performedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="h-6 w-6 text-purple-400" />
            Audit Logs
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            All system actions with before/after snapshots
            {logs.length >= 200 && (
              <span className="text-amber-400 ml-1">· showing first 200 — use filters or export to see more</span>
            )}
          </p>
        </div>
        <Badge className="bg-slate-700 text-slate-300 border-0 shrink-0">
          {logs.length} entries
        </Badge>
      </div>

      {/* Filters + export */}
      <Suspense>
        <AuditFilters locations={locations} />
      </Suspense>

      {/* Log entries */}
      {logs.length === 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-14 text-center text-slate-500">
            No audit entries match your filters.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="bg-slate-800/40 border border-slate-700 rounded-lg px-4 py-3"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3 min-w-0">
                <div className="shrink-0 mt-0.5">
                  <Badge
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 border font-normal",
                      ACTION_COLORS[log.action] ?? "bg-slate-700 text-slate-400"
                    )}
                  >
                    {log.action}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm">
                    <span className="font-semibold">{log.performedBy.name}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-slate-400">{log.entityType}</span>
                    <span className="text-slate-600 ml-1.5 font-mono text-xs">
                      {log.entityId.slice(0, 8)}…
                    </span>
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{log.performedBy.email}</p>

                  {/* Before/After diff */}
                  {(log.before || log.after) && (
                    <details className="mt-2">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-400">
                        View changes
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                        {log.before && (
                          <div className="bg-red-950/20 border border-red-900/30 rounded p-2">
                            <p className="text-red-500 font-semibold mb-1">Before</p>
                            <pre className="text-red-300/70 whitespace-pre-wrap break-all font-mono">
                              {JSON.stringify(log.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.after && (
                          <div className="bg-green-950/20 border border-green-900/30 rounded p-2">
                            <p className="text-green-500 font-semibold mb-1">After</p>
                            <pre className="text-green-300/70 whitespace-pre-wrap break-all font-mono">
                              {JSON.stringify(log.after, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
              <span className="text-slate-600 text-xs shrink-0">
                {formatDistanceToNow(log.createdAt, { addSuffix: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
