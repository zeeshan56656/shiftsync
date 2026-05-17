import type { Role } from "@/app/generated/prisma/client";

export interface CopilotSession {
  userId: string;
  email: string;
  name: string;
  role: Role;
}
