import { auth } from "@/lib/auth";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { buildCopilotGraph } from "@/lib/copilot/graph";
import type { CopilotSession } from "@/lib/copilot/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatRequest {
  threadId?: string;
  message?: string;
  resume?: Record<string, unknown>;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return new Response("Forbidden", { status: 403 });
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const threadId = body.threadId?.trim();
  if (!threadId) return new Response("Missing threadId", { status: 400 });

  const hasMessage = typeof body.message === "string" && body.message.trim().length > 0;
  const hasResume = body.resume && typeof body.resume === "object";
  if (!hasMessage && !hasResume) {
    return new Response("Provide either `message` or `resume`", { status: 400 });
  }

  const copilotSession: CopilotSession = {
    userId: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(type: string, payload: Record<string, unknown> = {}) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, ...payload })}\n\n`)
        );
      }

      try {
        const graph = await buildCopilotGraph(copilotSession);
        const config = { configurable: { thread_id: threadId }, streamMode: "values" as const };

        // Establish baseline message count from prior checkpoint to detect ONLY new messages.
        const priorState = await graph.getState({ configurable: { thread_id: threadId } });
        let emittedIndex = priorState.values?.messages?.length ?? 0;

        const input = hasMessage
          ? { messages: [new HumanMessage(body.message!)] }
          : new Command({ resume: body.resume });

        // Cast widens Command's per-node generics that TS can't infer here.
        const iterator = await graph.stream(
          input as Parameters<typeof graph.stream>[0],
          config
        );

        for await (const snapshot of iterator) {
          const allMessages = snapshot.messages ?? [];
          const newMessages = allMessages.slice(emittedIndex);
          emittedIndex = allMessages.length;

          for (const msg of newMessages) {
            if (msg instanceof AIMessage) {
              if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                  emit("tool_call", { toolName: tc.name, args: tc.args, id: tc.id });
                }
              }
              const text =
                typeof msg.content === "string"
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content
                        .map((c) => (typeof c === "string" ? c : "text" in c ? c.text : ""))
                        .join("")
                    : "";
              if (text.trim()) emit("message", { content: text });
            } else if (msg instanceof ToolMessage) {
              const content = String(msg.content).slice(0, 1000);
              emit("tool_result", { toolName: msg.name ?? "tool", content });
            }
          }
        }

        // After stream ends, check if the graph paused on an interrupt() call.
        const finalState = await graph.getState({ configurable: { thread_id: threadId } });
        type PendingInterrupt = { value?: unknown; id?: string };
        const interrupts: PendingInterrupt[] =
          finalState.tasks?.flatMap((t: { interrupts?: PendingInterrupt[] }) => t.interrupts ?? []) ?? [];

        if (interrupts.length > 0) {
          for (const intr of interrupts) {
            emit("interrupt", { payload: intr.value, interruptId: intr.id });
          }
        } else {
          emit("done");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[copilot/stream] error:", err);
        emit("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
