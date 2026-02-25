import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { RealtimeProvider } from "@/components/RealtimeProvider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Get unread notification count for the badge
  const unreadCount = await prisma.notification.count({
    where: { userId: session.user.id, isRead: false },
  });

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar
        userRole={session.user.role}
        userName={session.user.name ?? ""}
        userEmail={session.user.email ?? ""}
        unreadCount={unreadCount}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <RealtimeProvider userId={session.user.id} />
      <Toaster position="top-right" richColors />
    </div>
  );
}
