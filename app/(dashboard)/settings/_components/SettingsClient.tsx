"use client";

import { useTransition, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateNotificationPrefs, updateDesiredHours } from "@/actions/settings";
import { toast } from "sonner";

interface Props {
  notifyInApp: boolean;
  notifyEmail: boolean;
  desiredHoursPerWeek: number | null;
  isStaff: boolean;
  showHoursOnly?: boolean;
}

export function SettingsClient({
  notifyInApp,
  notifyEmail,
  desiredHoursPerWeek,
  isStaff,
  showHoursOnly = false,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [inApp, setInApp] = useState(notifyInApp);
  const [email, setEmail] = useState(notifyEmail);
  const [hours, setHours] = useState(desiredHoursPerWeek?.toString() ?? "");

  function handleNotifSave() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("notifyInApp", String(inApp));
      fd.set("notifyEmail", String(email));
      const res = await updateNotificationPrefs(fd);
      if (res.error) toast.error(res.error);
      else toast.success("Notification preferences saved");
    });
  }

  function handleHoursSave() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("desiredHoursPerWeek", hours);
      const res = await updateDesiredHours(fd);
      if (res.error) toast.error(res.error);
      else toast.success("Desired hours saved");
    });
  }

  if (showHoursOnly) {
    return (
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={0}
          max={80}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-24 bg-slate-900 border-slate-600 text-white"
          placeholder="40"
        />
        <span className="text-slate-400 text-sm">hours / week</span>
        <Button
          size="sm"
          onClick={handleHoursSave}
          disabled={isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white ml-2"
        >
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-slate-200 text-sm">In-app notifications</Label>
          <p className="text-slate-500 text-xs mt-0.5">
            Show alerts in the notification center
          </p>
        </div>
        <Switch
          checked={inApp}
          onCheckedChange={setInApp}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-slate-200 text-sm">Email notifications</Label>
          <p className="text-slate-500 text-xs mt-0.5">
            Receive emails for important updates
          </p>
        </div>
        <Switch
          checked={email}
          onCheckedChange={setEmail}
        />
      </div>

      <Button
        size="sm"
        onClick={handleNotifSave}
        disabled={isPending}
        className="bg-blue-600 hover:bg-blue-700 text-white mt-2"
      >
        Save preferences
      </Button>
    </div>
  );
}
