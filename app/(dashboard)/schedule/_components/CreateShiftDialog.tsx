"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createShift } from "@/actions/shifts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SerializedLocation, SerializedSkill } from "../page";

interface CreateShiftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  locations: SerializedLocation[];
  defaultLocationId: string;
  skills: SerializedSkill[];
  onSuccess: () => void;
}

export function CreateShiftDialog({
  open,
  onOpenChange,
  defaultDate,
  locations,
  defaultLocationId,
  skills,
  onSuccess,
}: CreateShiftDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [skillId, setSkillId] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!skillId) {
      setError("Please select a required skill.");
      return;
    }

    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("locationId", locationId);
    fd.set("requiredSkillId", skillId);

    startTransition(async () => {
      const result = await createShift(fd);
      if (result.error) {
        setError(result.error);
      } else {
        toast.success("Shift created");
        setSkillId("");
        onOpenChange(false);
        onSuccess();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Create New Shift</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {locations.map((loc) => (
                  <SelectItem
                    key={loc.id}
                    value={loc.id}
                    className="text-white focus:bg-slate-700"
                  >
                    {loc.name}
                    <span className="text-slate-500 ml-1.5 text-xs">({loc.timezone})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Date</Label>
            <Input
              type="date"
              name="date"
              defaultValue={defaultDate}
              required
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Start</Label>
              <Input
                type="time"
                name="startTime"
                defaultValue="09:00"
                required
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">End</Label>
              <Input
                type="time"
                name="endTime"
                defaultValue="17:00"
                required
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          {/* Skill */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Required Skill</Label>
            <Select value={skillId} onValueChange={setSkillId}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue placeholder="Select skill…" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {skills.map((skill) => (
                  <SelectItem
                    key={skill.id}
                    value={skill.id}
                    className="text-white focus:bg-slate-700"
                  >
                    {skill.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Headcount */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Headcount</Label>
            <Input
              type="number"
              name="headcount"
              min="1"
              max="20"
              defaultValue="1"
              required
              className="bg-slate-800 border-slate-700 text-white w-24"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Notes (optional)</Label>
            <Textarea
              name="notes"
              placeholder="Special requirements…"
              className="bg-slate-800 border-slate-700 text-white text-sm resize-none"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending ? "Creating…" : "Create Shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
