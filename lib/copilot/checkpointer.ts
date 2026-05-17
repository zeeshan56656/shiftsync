import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const globalForSaver = globalThis as unknown as {
  copilotSaver?: PostgresSaver;
  copilotSaverReady?: Promise<void>;
};

export async function getCopilotCheckpointer(): Promise<PostgresSaver> {
  if (!globalForSaver.copilotSaver) {
    const saver = PostgresSaver.fromConnString(process.env.DATABASE_URL!);
    globalForSaver.copilotSaver = saver;
    globalForSaver.copilotSaverReady = saver.setup();
  }
  await globalForSaver.copilotSaverReady;
  return globalForSaver.copilotSaver!;
}
