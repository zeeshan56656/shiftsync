"use client";

import { useTransition, useState } from "react";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { toast } from "sonner";
import {
  assignStaffToShift,
  removeAssignment,
  deleteShift,
  checkAssignmentPreview,
} from "@/actions/shifts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  UserPlus,
  Trash2,
  X,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  ArrowLeft,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SerializedShift, SerializedStaff } from "../page";

interface AssignStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: SerializedShift;
  staff: SerializedStaff[];
  timezone: string;
  onSuccess: () => void;
}

type PreviewData = Exclude<Awaited<ReturnType<typeof checkAssignmentPreview>>, { error: string }>;

export function AssignStaffDialog({
  open,
  onOpenChange,
  shift,
  staff,
  timezone,
  onSuccess,
}: AssignStaffDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [actionId, setActionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ userId: string; data: PreviewData } | null>(null);

  const assignedIds = new Set(shift.assignments.map((a) => a.userId));
  const qualifiedStaff = staff.filter((u) => u.skills.includes(shift.requiredSkillId));
  const unassignedQualified = qualifiedStaff.filter((u) => !assignedIds.has(u.id));
  const full = shift.assignments.length >= shift.headcount;

  // Step 1 — fetch what-if preview (no DB write)
  function handlePreviewRequest(userId: string) {
    setActionId(userId);
    startTransition(async () => {
      const result = await checkAssignmentPreview(shift.id, userId);
      setActionId(null);
      if (!result || "error" in result) {
        toast.error(("error" in result ? result.error : null) ?? "Preview failed");
        return;
      }
      setPreview({ userId, data: result });
    });
  }

  // Step 2 — confirm and actually create the assignment
  function handleConfirmAssign() {
    if (!preview) return;
    const userId = preview.userId;
    setActionId(userId);
    const fd = new FormData();
    fd.set("shiftId", shift.id);
    fd.set("userId", userId);
    startTransition(async () => {
      const result = await assignStaffToShift(fd);
      setActionId(null);
      setPreview(null);
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.warnings?.length) toast.warning("Assigned with warnings");
        else toast.success("Staff assigned");
        onSuccess();
      }
    });
  }

  function handleRemove(assignmentId: string) {
    setActionId(assignmentId);
    startTransition(async () => {
      const result = await removeAssignment(assignmentId);
      setActionId(null);
      if (result.error) toast.error(result.error);
      else { toast.success("Assignment removed"); onSuccess(); }
    });
  }

  function handleDelete() {
    setActionId("delete");
    startTransition(async () => {
      const result = await deleteShift(shift.id);
      setActionId(null);
      if (result.error) toast.error(result.error);
      else { toast.success("Shift deleted"); onSuccess(); }
    });
  }

  function handleClose() {
    setPreview(null);
    onOpenChange(false);
  }

  const start = parseISO(shift.startTime);
  const end = parseISO(shift.endTime);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-white text-base">
                {formatInTimeZone(start, timezone, "EEEE, MMM d")}
              </DialogTitle>
              <p className="text-slate-400 text-sm mt-0.5">
                {formatInTimeZone(start, timezone, "h:mm a")} –{" "}
                {formatInTimeZone(end, timezone, "h:mm a zzz")}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {shift.isPremium && (
                <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[11px] gap-1">
                  <Sparkles className="h-2.5 w-2.5" /> Premium
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px]",
                  shift.status === "DRAFT"
                    ? "border-slate-600 text-slate-500"
                    : "border-blue-500/40 text-blue-400 bg-blue-500/10"
                )}
              >
                {shift.status}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-slate-700 text-slate-300 text-[11px] border-0">
              {shift.requiredSkillName}
            </Badge>
            <span className={cn("text-[11px] font-medium flex items-center gap-1", full ? "text-green-400" : "text-amber-400")}>
              {full && <CheckCircle2 className="h-3 w-3" />}
              {shift.assignments.length}/{shift.headcount} filled
            </span>
          </div>
          {shift.notes && (
            <p className="text-xs text-slate-500 mt-1 bg-slate-800/50 rounded px-2 py-1">{shift.notes}</p>
          )}
        </DialogHeader>

        {/* ── WHAT-IF PREVIEW PANEL ── */}
        {preview ? (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-2">
              <button onClick={() => setPreview(null)} className="text-slate-500 hover:text-white transition-colors">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <p className="text-slate-300 text-sm font-medium">
                Assigning <span className="text-white">{preview.data.userName}</span>
              </p>
            </div>

            {/* Hours impact */}
            <div className="bg-slate-800/60 rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3" /> Weekly Hours Impact
              </p>
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <p className="text-slate-500 text-[10px]">Current</p>
                  <p className="text-slate-300 font-semibold tabular-nums">{preview.data.currentWeeklyHours}h</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600" />
                <div className="text-center">
                  <p className="text-slate-500 text-[10px]">+ Shift</p>
                  <p className="text-blue-400 font-semibold tabular-nums">+{preview.data.shiftHours}h</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-600" />
                <div className="text-center">
                  <p className="text-slate-500 text-[10px]">Projected</p>
                  <p className={cn(
                    "font-semibold tabular-nums",
                    preview.data.projectedWeeklyHours >= 40 ? "text-red-400"
                      : preview.data.projectedWeeklyHours >= 35 ? "text-amber-400"
                      : "text-green-400"
                  )}>
                    {preview.data.projectedWeeklyHours}h
                  </p>
                </div>
              </div>

              {preview.data.overtimeWarnings.map((w, i) => (
                <div key={i} className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                  w.level === "hard_block"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                )}>
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{w.message}</span>
                </div>
              ))}
            </div>

            {/* Constraint violations */}
            {preview.data.violations.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Ban className="h-3 w-3 text-red-400" /> Constraint Violations
                </p>
                {preview.data.violations.map((v, i) => (
                  <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-300">
                    <p className="font-semibold text-red-400">{v.rule.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 opacity-80">{v.message}</p>
                    {v.details && <p className="mt-0.5 opacity-60 italic">{v.details}</p>}
                  </div>
                ))}
                {preview.data.suggestions?.map((s, i) => (
                  <p key={i} className="text-xs text-slate-500 pl-2">💡 {s}</p>
                ))}
              </div>
            )}

            {preview.data.violations.length === 0 && preview.data.overtimeWarnings.length === 0 && (
              <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 rounded-lg px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                No issues — safe to assign
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPreview(null)}
                className="flex-1 border-slate-600 text-slate-400 hover:text-white text-xs">
                Back
              </Button>
              {preview.data.hasHardBlock ? (
                <Button size="sm" disabled className="flex-1 bg-slate-700 text-slate-500 text-xs cursor-not-allowed">
                  Cannot Assign
                </Button>
              ) : (
                <Button size="sm" onClick={handleConfirmAssign} disabled={isPending}
                  className={cn("flex-1 text-xs",
                    preview.data.violations.length > 0
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  )}>
                  {isPending ? "Assigning…" : preview.data.violations.length > 0 ? "Assign Anyway" : "Confirm & Assign"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── NORMAL STAFF LIST ── */
          <div className="space-y-4 mt-2">
            {shift.assignments.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Assigned Staff</p>
                <div className="space-y-1.5">
                  {shift.assignments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-blue-600/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
                          {a.userName.charAt(0)}
                        </div>
                        <span className="text-sm text-white">{a.userName}</span>
                      </div>
                      <button onClick={() => handleRemove(a.id)} disabled={isPending}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!full && (
              <>
                {shift.assignments.length > 0 && unassignedQualified.length > 0 && <Separator className="bg-slate-800" />}
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
                    Available ({shift.requiredSkillName}) — preview impact before assigning
                  </p>
                  {unassignedQualified.length === 0 ? (
                    <div className="flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 rounded-lg px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> No other qualified staff available
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {unassignedQualified.map((member) => (
                        <div key={member.id} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
                              {member.name.charAt(0)}
                            </div>
                            <span className="text-sm text-white">{member.name}</span>
                          </div>
                          <Button size="sm" onClick={() => handlePreviewRequest(member.id)}
                            disabled={isPending && actionId === member.id}
                            className="h-7 text-xs gap-1 bg-blue-600/15 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-600/30 hover:border-transparent">
                            <UserPlus className="h-3 w-3" />
                            {isPending && actionId === member.id ? "…" : "Assign"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {shift.status === "DRAFT" && (
              <>
                <Separator className="bg-slate-800 mt-2" />
                <div className="flex justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending}
                    className="text-red-500/80 hover:text-red-400 hover:bg-red-500/10 text-xs gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Delete Shift
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClose} className="text-slate-500 hover:text-white text-xs">
                    Close
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
