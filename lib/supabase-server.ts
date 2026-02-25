/**
 * Supabase server-side broadcast via the Realtime HTTP API.
 *
 * Why HTTP and not the JS SDK channel.send()?
 * The JS SDK requires calling .subscribe() to open a WebSocket before .send()
 * works. Inside a Server Action there is no persistent connection, so we use
 * the documented REST endpoint instead — no WebSocket needed, fire-and-forget.
 *
 * Reference: https://supabase.com/docs/guides/realtime/broadcast#send-messages-using-rest-api
 */

/**
 * Broadcast a real-time event to all connected clients on a channel.
 * Call this after any important mutation from a server action.
 *
 * @param channel  - e.g. "schedule", "swaps", "notifications:userId"
 * @param event    - e.g. "shift.published", "swap.created"
 * @param payload  - any JSON-serializable data
 */
export async function broadcastEvent(
  channel: string,
  event: string,
  payload: Record<string, unknown> = {}
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) return;

    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `realtime:${channel}`,
            event,
            payload,
          },
        ],
      }),
    });
  } catch {
    // Real-time broadcast is non-critical; never let it crash a server action
  }
}
