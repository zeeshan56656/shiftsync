"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search } from "lucide-react";

interface Props {
  locations: { id: string; name: string }[];
}

const ENTITY_TYPES = [
  { value: "all", label: "All types" },
  { value: "shift", label: "Shift" },
  { value: "assignment", label: "Assignment" },
  { value: "swap_request", label: "Swap Request" },
  { value: "user", label: "User" },
  { value: "location", label: "Location" },
];

export function AuditFilters({ locations }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [from, setFrom]             = useState(params.get("from") ?? "");
  const [to, setTo]                 = useState(params.get("to") ?? "");
  const [entityType, setEntityType] = useState(params.get("entityType") ?? "all");
  const [locationId, setLocationId] = useState(params.get("locationId") ?? "all");

  function applyFilters() {
    startTransition(() => {
      const q = new URLSearchParams();
      if (from)                         q.set("from", from);
      if (to)                           q.set("to", to);
      if (entityType && entityType !== "all") q.set("entityType", entityType);
      if (locationId && locationId !== "all") q.set("locationId", locationId);
      router.push(`/admin/audit-logs?${q.toString()}`);
    });
  }

  function buildExportUrl() {
    const q = new URLSearchParams();
    if (from)                         q.set("from", from);
    if (to)                           q.set("to", to);
    if (entityType && entityType !== "all") q.set("entityType", entityType);
    if (locationId && locationId !== "all") q.set("locationId", locationId);
    return `/api/admin/audit-logs?${q.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-end gap-3 bg-slate-800/40 border border-slate-700 rounded-xl p-4">
      {/* Date range */}
      <div className="flex items-center gap-2">
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">From</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs bg-slate-900 border-slate-600 text-white w-36"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">To</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs bg-slate-900 border-slate-600 text-white w-36"
          />
        </div>
      </div>

      {/* Entity type */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Type</label>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="h-8 text-xs bg-slate-900 border-slate-600 text-white w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-white">
            {ENTITY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div>
        <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-1">Location</label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="h-8 text-xs bg-slate-900 border-slate-600 text-white w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-700 text-white">
            <SelectItem value="all" className="text-xs">All locations</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-end gap-2 ml-auto">
        <Button
          size="sm"
          onClick={applyFilters}
          disabled={isPending}
          className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
        >
          <Search className="h-3 w-3" />
          Filter
        </Button>
        <a href={buildExportUrl()} download>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 gap-1.5"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>
        </a>
      </div>
    </div>
  );
}
