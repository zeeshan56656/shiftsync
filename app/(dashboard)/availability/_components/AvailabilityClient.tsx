"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertAvailabilityWindow, addAvailabilityException, deleteAvailabilityException } from "@/actions/availability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { CalendarDays, Plus, Trash2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type WindowRow = {
  dayOfWeek: number;
  dayName: string;
  id: string | null;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

type ExceptionRow = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  reason: string;
};

export function AvailabilityClient({
  windows,
  exceptions,
}: {
  windows: WindowRow[];
  exceptions: ExceptionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addingException, setAddingException] = useState(false);

  function saveWindow(dayOfWeek: number, form: HTMLFormElement) {
    const fd = new FormData(form);
    fd.set("dayOfWeek", String(dayOfWeek));
    startTransition(async () => {
      const result = await upsertAvailabilityWindow(fd);
      if (result.error) toast.error(result.error);
      else { toast.success("Availability saved"); router.refresh(); }
    });
  }

  function addException(form: HTMLFormElement) {
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await addAvailabilityException(fd);
      if (result.error) toast.error(result.error);
      else { toast.success("Exception added"); setAddingException(false); router.refresh(); }
    });
  }

  function removeException(id: string) {
    startTransition(async () => {
      const result = await deleteAvailabilityException(id);
      if (result.error) toast.error(result.error);
      else { toast.success("Exception removed"); router.refresh(); }
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">My Availability</h1>
        <p className="text-slate-400 text-sm mt-1">
          Set your weekly availability and add exceptions for specific dates.
        </p>
      </div>

      {/* Weekly windows */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Weekly Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {windows.map((w) => (
            <WindowRow
              key={w.dayOfWeek}
              window={w}
              disabled={isPending}
              onSave={(form) => saveWindow(w.dayOfWeek, form)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Date exceptions */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm text-slate-300 font-semibold uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Date Exceptions
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAddingException(true)}
            className="text-xs text-slate-400 hover:text-white gap-1.5 h-7"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {addingException && (
            <form
              onSubmit={(e) => { e.preventDefault(); addException(e.currentTarget); }}
              className="bg-slate-700/40 rounded-lg p-4 space-y-3 border border-slate-600"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Date</Label>
                  <Input type="date" name="date" required className="bg-slate-800 border-slate-600 text-white text-sm h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Type</Label>
                  <select
                    name="isAvailable"
                    className="w-full h-8 rounded-md bg-slate-800 border border-slate-600 text-white text-sm px-2"
                  >
                    <option value="false">Unavailable</option>
                    <option value="true">Available (limited hours)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">Start (optional)</Label>
                  <Input type="time" name="startTime" className="bg-slate-800 border-slate-600 text-white text-sm h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-xs">End (optional)</Label>
                  <Input type="time" name="endTime" className="bg-slate-800 border-slate-600 text-white text-sm h-8" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-300 text-xs">Reason (optional)</Label>
                <Input name="reason" placeholder="Doctor's appointment…" className="bg-slate-800 border-slate-600 text-white text-sm h-8" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs">
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAddingException(false)} className="text-slate-400 h-8 text-xs">
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {exceptions.length === 0 && !addingException && (
            <p className="text-slate-600 text-sm text-center py-4">No exceptions set.</p>
          )}

          {exceptions.map((ex) => (
            <div key={ex.id} className="flex items-center justify-between bg-slate-700/30 rounded-lg px-3 py-2.5">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{ex.date}</span>
                  <Badge
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4 border font-normal",
                      ex.isAvailable
                        ? "bg-green-500/20 text-green-400 border-green-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    )}
                  >
                    {ex.isAvailable ? "Limited" : "Unavailable"}
                  </Badge>
                </div>
                {ex.reason && <p className="text-slate-500 text-xs">{ex.reason}</p>}
                {(ex.startTime || ex.endTime) && (
                  <p className="text-slate-500 text-xs">{ex.startTime} – {ex.endTime}</p>
                )}
              </div>
              <button
                onClick={() => removeException(ex.id)}
                disabled={isPending}
                className="text-slate-600 hover:text-red-400 transition-colors p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function WindowRow({
  window: w,
  disabled,
  onSave,
}: {
  window: WindowRow;
  disabled: boolean;
  onSave: (form: HTMLFormElement) => void;
}) {
  const [available, setAvailable] = useState(w.isAvailable);

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(e.currentTarget); }}
        className="flex items-center gap-3"
      >
        <div className="w-24 shrink-0">
          <span className="text-slate-300 text-sm font-medium">{w.dayName.slice(0, 3)}</span>
        </div>

        <Switch
          name="isAvailable"
          checked={available}
          onCheckedChange={setAvailable}
          value={available ? "true" : "false"}
          className="shrink-0"
        />

        <div className={cn("flex items-center gap-2 flex-1 transition-opacity", !available && "opacity-30 pointer-events-none")}>
          <Input
            type="time"
            name="startTime"
            defaultValue={w.startTime}
            className="bg-slate-800 border-slate-700 text-white text-sm h-8 w-28"
          />
          <span className="text-slate-600 text-sm">–</span>
          <Input
            type="time"
            name="endTime"
            defaultValue={w.endTime}
            className="bg-slate-800 border-slate-700 text-white text-sm h-8 w-28"
          />
        </div>

        <Button type="submit" size="sm" disabled={disabled} variant="ghost"
          className="h-8 text-xs text-slate-500 hover:text-white shrink-0">
          Save
        </Button>
      </form>
      <Separator className="bg-slate-800 last:hidden" />
    </>
  );
}
