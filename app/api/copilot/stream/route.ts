import { auth } from "@/lib/auth";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { buildCopilotGraph } from "@/lib/copilot/graph";
import type { CopilotSession } from "@/lib/copilot/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatRequest {
  threadId?: string;
  message?: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
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
  const message = body.message?.trim();
  if (!threadId || !message) {
    return new Response("Missing threadId or message", { status: 400 });
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

        let lastEmittedIndex = 0;
        const iterator = await graph.stream(
          { messages: [new HumanMessage(message)] },
          { configurable: { thread_id: threadId }, streamMode: "values" }
        );

        for await (const snapshot of iterator) {
          const newMessages = snapshot.messages.slice(lastEmittedIndex);
          lastEmittedIndex = snapshot.messages.length;

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
              const content = String(msg.content).slice(0, 800);
              emit("tool_result", { toolName: msg.name ?? "tool", content });
            }
          }
        }

        emit("done");
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
