import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Clock } from "lucide-react";

export default async function LocationsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const locations = await prisma.location.findMany({
    include: {
      managers: { include: { user: { select: { id: true, name: true, email: true } } } },
      staff: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { shifts: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MapPin className="h-6 w-6 text-blue-400" />
          Locations
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {locations.length} locations across {new Set(locations.map((l) => l.timezone)).size} time zones
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {locations.map((loc) => (
          <Card key={loc.id} className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-white text-base">{loc.name}</CardTitle>
                  <p className="text-slate-500 text-xs mt-0.5">{loc.address}</p>
                </div>
                <Badge className="bg-slate-700 text-slate-300 border-0 text-xs shrink-0">
                  {loc.timezone}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Managers */}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                  Managers
                </p>
                {loc.managers.length === 0 ? (
                  <p className="text-slate-600 text-xs">No managers assigned</p>
                ) : (
                  <div className="space-y-1">
                    {loc.managers.map((lm) => (
                      <div key={lm.userId} className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-[10px] font-bold shrink-0">
                          {lm.user.name.charAt(0)}
                        </div>
                        <div>
                          <span className="text-slate-300 text-xs">{lm.user.name}</span>
                          <span className="text-slate-600 text-xs ml-2">{lm.user.email}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 pt-2 border-t border-slate-700">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Users className="h-3.5 w-3.5" />
                  {loc.staff.length} staff
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {loc._count.shifts} total shifts
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
