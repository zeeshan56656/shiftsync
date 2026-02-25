"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { requestSwap, requestDrop } from "@/actions/swaps";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeftRight, PackageOpen } from "lucide-react";

export function RequestSwapButton({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"swap" | "drop">("swap");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("assignmentId", assignmentId);

    startTransition(async () => {
      const result = mode === "drop" ? await requestDrop(fd) : await requestSwap(fd);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(mode === "drop" ? "Shift dropped — managers notified" : "Swap request sent");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 h-8"
      >
        <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
        Swap / Drop
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Swap or Drop Shift</DialogTitle>
          </DialogHeader>

          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("swap")}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                mode === "swap"
                  ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              <ArrowLeftRight className="h-4 w-4 mb-1" />
              <p className="font-medium">Swap</p>
              <p className="text-xs opacity-70 mt-0.5">Exchange with a colleague</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("drop")}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                mode === "drop"
                  ? "bg-teal-600/20 border-teal-500/50 text-teal-300"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
              }`}
            >
              <PackageOpen className="h-4 w-4 mb-1" />
              <p className="font-medium">Drop</p>
              <p className="text-xs opacity-70 mt-0.5">Open for anyone to claim</p>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Message (optional)</Label>
              <Textarea
                name="message"
                placeholder={
                  mode === "drop"
                    ? "Reason for dropping…"
                    : "Reason for swap request…"
                }
                className="bg-slate-800 border-slate-700 text-white text-sm resize-none"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className={
                  mode === "drop"
                    ? "bg-teal-700 hover:bg-teal-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }
              >
                {isPending ? "Sending…" : mode === "drop" ? "Drop shift" : "Request swap"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
