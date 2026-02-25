import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Clock } from "lucide-react";
import { SettingsClient } from "./_components/SettingsClient";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      notifyInApp: true,
      notifyEmail: true,
      desiredHoursPerWeek: true,
    },
  });
  if (!user) redirect("/login");

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Manage your preferences and account settings
        </p>
      </div>

      {/* Profile info (read-only) */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-blue-600/40 flex items-center justify-center text-blue-300 font-bold text-sm">
              {user.name.charAt(0)}
            </div>
            {user.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="text-slate-400">
            <span className="text-slate-500">Email: </span>{user.email}
          </p>
          <p className="text-slate-400">
            <span className="text-slate-500">Role: </span>
            <span className="capitalize">{user.role.toLowerCase()}</span>
          </p>
        </CardContent>
      </Card>

      {/* Notification preferences */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-400" />
            Notification Preferences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsClient
            notifyInApp={user.notifyInApp}
            notifyEmail={user.notifyEmail}
            desiredHoursPerWeek={user.desiredHoursPerWeek}
            isStaff={user.role === "STAFF"}
          />
        </CardContent>
      </Card>

      {/* Desired hours (staff only) */}
      {user.role === "STAFF" && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-green-400" />
              Scheduling Preferences
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 text-sm mb-4">
              Let managers know how many hours per week you'd like to work.
            </p>
            <SettingsClient
              notifyInApp={user.notifyInApp}
              notifyEmail={user.notifyEmail}
              desiredHoursPerWeek={user.desiredHoursPerWeek}
              isStaff={user.role === "STAFF"}
              showHoursOnly
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
