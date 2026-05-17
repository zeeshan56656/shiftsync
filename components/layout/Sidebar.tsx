"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Clock,
  ArrowLeftRight,
  BarChart2,
  Bell,
  Shield,
  MapPin,
  Settings,
  LogOut,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Role } from "@/app/generated/prisma/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    label: "AI Copilot",
    href: "/copilot",
    icon: Sparkles,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Schedule",
    href: "/schedule",
    icon: CalendarDays,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "My Shifts",
    href: "/shifts",
    icon: Clock,
    roles: ["STAFF"],
  },
  {
    label: "Staff",
    href: "/staff",
    icon: Users,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "My Availability",
    href: "/availability",
    icon: CalendarDays,
    roles: ["STAFF"],
  },
  {
    label: "Swaps & Drops",
    href: "/swaps",
    icon: ArrowLeftRight,
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart2,
    roles: ["ADMIN", "MANAGER"],
  },
  {
    label: "Notifications",
    href: "/notifications",
    icon: Bell,
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["ADMIN", "MANAGER", "STAFF"],
  },
  {
    label: "Audit Logs",
    href: "/admin/audit-logs",
    icon: Shield,
    roles: ["ADMIN"],
  },
  {
    label: "Locations",
    href: "/admin/locations",
    icon: MapPin,
    roles: ["ADMIN"],
  },
];

interface SidebarProps {
  userRole: Role;
  userName: string;
  userEmail: string;
  unreadCount?: number;
}

export function Sidebar({ userRole, userName, userEmail, unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.map((item) => ({
    ...item,
    badge: item.href === "/notifications" && unreadCount > 0 ? unreadCount : undefined,
  })).filter((item) => item.roles.includes(userRole));

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-slate-900 border-r border-slate-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
        <div className="bg-blue-600 rounded-lg p-1.5 shrink-0">
          <CalendarDays className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-white text-sm leading-tight">ShiftSync</p>
          <p className="text-slate-500 text-xs truncate">Coastal Eats</p>
        </div>
      </div>

      {/* Role badge */}
      <div className="px-5 pt-4 pb-2">
        <span
          className={cn(
            "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
            userRole === "ADMIN" && "bg-purple-500/15 text-purple-400",
            userRole === "MANAGER" && "bg-blue-500/15 text-blue-400",
            userRole === "STAFF" && "bg-green-500/15 text-green-400"
          )}
        >
          {userRole.charAt(0) + userRole.slice(1).toLowerCase()}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                isActive
                  ? "bg-blue-600/15 text-blue-400"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                )}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : isActive ? (
                <ChevronRight className="h-3 w-3 text-blue-500" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
            {userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-slate-500 text-xs truncate">{userEmail}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start text-slate-500 hover:text-red-400 hover:bg-red-400/10 text-xs px-2"
        >
          <LogOut className="h-3.5 w-3.5 mr-2" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
