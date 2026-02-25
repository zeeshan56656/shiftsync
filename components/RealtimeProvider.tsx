"use client";

/**
 * RealtimeProvider
 *
 * Subscribes to Supabase broadcast channels and:
 *  - Refreshes the current page when schedule or swap data changes
 *  - Shows toast notifications when new notifications arrive
 *
 * Mount this once in the dashboard layout.
 */

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase-client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Props {
  userId: string;
}

export function RealtimeProvider({ userId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    // ── 1. Schedule channel (shifts created / updated / published) ────────────
    const scheduleChannel = supabase
      .channel("schedule")
      .on("broadcast", { event: "shift.created" }, () => {
        if (pathname.includes("/schedule")) router.refresh();
      })
      .on("broadcast", { event: "shift.updated" }, () => {
        router.refresh(); // refresh everywhere — My Shifts also affected
      })
      .on("broadcast", { event: "shift.published" }, () => {
        router.refresh();
        toast.info("A new schedule has been published");
      })
      .on("broadcast", { event: "shift.deleted" }, () => {
        if (pathname.includes("/schedule")) router.refresh();
      })
      .subscribe();

    // ── 2. Swaps channel ──────────────────────────────────────────────────────
    const swapsChannel = supabase
      .channel("swaps")
      .on("broadcast", { event: "swap.created" }, () => {
        if (pathname.includes("/swaps")) router.refresh();
      })
      .on("broadcast", { event: "swap.updated" }, () => {
        router.refresh();
      })
      .subscribe();

    // ── 3. Per-user notifications channel ────────────────────────────────────
    // Channel name is scoped to userId so each user only receives their own.
    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "broadcast",
        { event: "notification.new" },
        (msg: { payload: { title: string; message: string } }) => {
          const { title, message } = msg.payload;
          toast(title, { description: message });
          router.refresh(); // updates the bell badge
        }
      )
      .subscribe();

    channelsRef.current = [scheduleChannel, swapsChannel, notifChannel];

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [userId, router, pathname]);

  return null;
}
