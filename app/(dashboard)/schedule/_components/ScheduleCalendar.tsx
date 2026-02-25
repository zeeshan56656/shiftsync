"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, addWeeks, subWeeks, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { publishSchedule } from "@/actions/shifts";
import { CreateShiftDialog } from "./CreateShiftDialog";
import { AssignStaffDialog } from "./AssignStaffDialog";
import { cn } from "@/lib/utils";
import type {
  SerializedLocation,
  SerializedSkill,
  SerializedStaff,
  SerializedShift,
} from "../page";

interface ScheduleCalendarProps {
  weekStart: string;
  locations: SerializedLocation[];
  shifts: SerializedShift[];
  skills: SerializedSkill[];
  staff: SerializedStaff[];
  defaultLocationId: string;
}

export function ScheduleCalendar({
  weekStart,
  locations,
  shifts,
  skills,
  staff,
  defaultLocationId,
}: ScheduleCalendarProps) {
  const router = useRouter();
  const [selectedLocation, setSelectedLocation] = useState(defaultLocationId);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<SerializedShift | null>(null);
  const [isPublishing, startPublishTransition] = useTransition();

  const weekStartDate = parseISO(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const location = locations.find((l) => l.id === selectedLocation) ?? locations[0];
  const locationShifts = shifts.filter((s) => s.locationId === selectedLocation);

  function navigateWeek(dir: "prev" | "next") {
    const next = dir === "prev" ? subWeeks(weekStartDate, 1) : addWeeks(weekStartDate, 1);
    router.push(`/schedule?week=${format(next, "yyyy-MM-dd")}&location=${selectedLocation}`);
  }

  function getShiftsForDay(dayIndex: number) {
    const dayLabel = formatInTimeZone(days[dayIndex], location.timezone, "yyyy-MM-dd");
    return locationShifts.filter(
      (s) => formatInTimeZone(parseISO(s.startTime), location.timezone, "yyyy-MM-dd") === dayLabel
    );
  }

  function openCreate(dateStr: string) {
    setCreateDefaultDate(dateStr);
    setCreateOpen(true);
  }

  function handlePublish() {
    startPublishTransition(async () => {
      const result = await publishSchedule(selectedLocation, format(weekStartDate, "yyyy-MM-dd"));
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Published ${result.publishedCount} shifts · ${result.notifiedUsers} staff notified`);
        router.refresh();
      }
    });
  }

  const hasDraftShifts = locationShifts.some((s) => s.status === "DRAFT");
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-800 flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Schedule</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {location.name} · {location.timezone}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Week navigator */}
          <div className="flex items-center bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
            <button
              onClick={() => navigateWeek("prev")}
              className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-white px-3 min-w-[170px] text-center">
              {format(weekStartDate, "MMM d")} – {format(addDays(weekStartDate, 6), "MMM d, yyyy")}
            </span>
            <button
              onClick={() => navigateWeek("next")}
              className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {hasDraftShifts && (
            <Button
              onClick={handlePublish}
              disabled={isPublishing}
              size="sm"
              className="bg-green-700 hover:bg-green-600 text-white gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {isPublishing ? "Publishing…" : "Publish Week"}
            </Button>
          )}

          <Button
            onClick={() => openCreate(today)}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Shift
          </Button>
        </div>
      </div>

      {/* ── Location tabs ── */}
      {locations.length > 1 && (
        <div className="shrink-0 px-6 pt-3 pb-0 border-b border-slate-800">
          <Tabs value={selectedLocation} onValueChange={setSelectedLocation}>
            <TabsList className="bg-slate-800/60 h-9">
              {locations.map((loc) => (
                <TabsTrigger
                  key={loc.id}
                  value={loc.id}
                  className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400"
                >
                  {loc.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* ── Calendar grid ── */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-2" style={{ minWidth: 840 }}>
          {/* Day headers */}
          {days.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const isToday = dateStr === today;
            return (
              <div key={i} className="text-center mb-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  {format(day, "EEE")}
                </p>
                <div
                  className={cn(
                    "mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
                    isToday ? "bg-blue-600 text-white" : "text-slate-400"
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}

          {/* Shift cells */}
          {days.map((day, dayIndex) => {
            const dayShifts = getShiftsForDay(dayIndex);
            const dateStr = format(day, "yyyy-MM-dd");

            return (
              <div key={dayIndex} className="space-y-1.5 min-h-[160px]">
                {dayShifts.map((shift) => (
                  <ShiftCard
                    key={shift.id}
                    shift={shift}
                    timezone={location.timezone}
                    onClick={() => setSelectedShift(shift)}
                  />
                ))}
                <button
                  onClick={() => openCreate(dateStr)}
                  className="w-full border border-dashed border-slate-800 rounded-lg py-2 text-[11px] text-slate-700 hover:text-slate-500 hover:border-slate-700 transition-colors flex items-center justify-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>
            );
          })}
        </div>

        {locationShifts.length === 0 && (
          <div className="text-center py-16 text-slate-600 text-sm">
            No shifts this week for {location.name}.
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <CreateShiftDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={createDefaultDate}
        locations={locations}
        defaultLocationId={selectedLocation}
        skills={skills}
        onSuccess={() => router.refresh()}
      />

      {selectedShift && (
        <AssignStaffDialog
          open
          onOpenChange={(open) => { if (!open) setSelectedShift(null); }}
          shift={selectedShift}
          staff={staff}
          timezone={location.timezone}
          onSuccess={() => { setSelectedShift(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ── Shift card ─────────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  timezone,
  onClick,
}: {
  shift: SerializedShift;
  timezone: string;
  onClick: () => void;
}) {
  const filled = shift.assignments.length;
  const total = shift.headcount;
  const full = filled >= total;
  const draft = shift.status === "DRAFT";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border p-2 text-xs transition-all hover:scale-[1.02]",
        draft
          ? "bg-slate-800/70 border-slate-700 hover:border-slate-600"
          : full
          ? "bg-blue-950/60 border-blue-700/40 hover:border-blue-600/60"
          : "bg-amber-950/40 border-amber-700/40 hover:border-amber-600/60"
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="font-semibold text-white leading-tight">
          {formatInTimeZone(parseISO(shift.startTime), timezone, "h:mm a")}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {shift.isPremium && <Sparkles className="h-3 w-3 text-amber-400" />}
          {draft && <span className="text-slate-600 text-[10px]">draft</span>}
        </div>
      </div>

      <p className="text-slate-400 text-[10px] mb-1.5 leading-tight">
        → {formatInTimeZone(parseISO(shift.endTime), timezone, "h:mm a")}
      </p>

      <Badge className="text-[10px] px-1 py-0 h-4 bg-slate-700/80 text-slate-300 font-normal border-0 mb-1.5">
        {shift.requiredSkillName}
      </Badge>

      <div
        className={cn(
          "flex items-center gap-1 text-[10px] font-medium",
          full ? "text-green-400" : "text-amber-400"
        )}
      >
        {full ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
        {filled}/{total}
      </div>
    </button>
  );
}
