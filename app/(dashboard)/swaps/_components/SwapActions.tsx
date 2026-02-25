"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Check, X, ThumbsUp, ThumbsDown, Package } from "lucide-react";
import { acceptSwap, rejectSwap, approveSwap, denySwap, claimDrop } from "@/actions/swaps";

type ViewAs = "manager" | "target" | "requester" | "claimer";

interface SwapActionsProps {
  swapId: string;
  type: string;
  status: string;
  viewAs: ViewAs;
}

export function SwapActions({ swapId, type, status, viewAs }: SwapActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Done");
        router.refresh();
      }
    });
  }

  // Staff target: can accept/reject a swap directed at them
  if (viewAs === "target" && status === "PENDING") {
    return (
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          onClick={() => run(() => acceptSwap(swapId))}
          disabled={isPending}
          className="h-8 text-xs gap-1 bg-green-700 hover:bg-green-600 text-white"
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run(() => rejectSwap(swapId))}
          disabled={isPending}
          className="h-8 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <X className="h-3.5 w-3.5" />
          Decline
        </Button>
      </div>
    );
  }

  // Staff claiming an open drop
  if (viewAs === "claimer" && type === "DROP" && status === "PENDING") {
    return (
      <Button
        size="sm"
        onClick={() => run(() => claimDrop(swapId))}
        disabled={isPending}
        className="h-8 text-xs gap-1 bg-teal-700 hover:bg-teal-600 text-white shrink-0"
      >
        <Package className="h-3.5 w-3.5" />
        Pick up shift
      </Button>
    );
  }

  // Manager: approve or deny
  if (viewAs === "manager" && (status === "PENDING" || status === "ACCEPTED")) {
    return (
      <div className="flex gap-2 shrink-0">
        <Button
          size="sm"
          onClick={() => run(() => approveSwap(swapId))}
          disabled={isPending}
          className="h-8 text-xs gap-1 bg-blue-700 hover:bg-blue-600 text-white"
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run(() => denySwap(swapId, "Request denied by manager."))}
          disabled={isPending}
          className="h-8 text-xs gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          Deny
        </Button>
      </div>
    );
  }

  return null;
}
