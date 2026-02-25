"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";

export function MarkAllReadButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await fetch("/api/notifications/mark-read", { method: "POST" });
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="text-slate-400 hover:text-white gap-1.5 text-xs"
    >
      <CheckCheck className="h-3.5 w-3.5" />
      Mark all read
    </Button>
  );
}
