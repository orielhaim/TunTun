import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PosturePageShell } from "@/components/app/posture/posture-page-shell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrganization } from "@/lib/auth-client";
import { usePostureCompliance } from "@/lib/queries/management";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/posture/compliance")({
  component: PostureCompliancePage,
});

type StatusFilter = "all" | "compliant" | "non_compliant" | "unknown";

function deviceStatus(entry: {
  passing: number;
  failing: number;
  total: number;
}): StatusFilter {
  if (entry.total === 0) return "unknown";
  if (entry.failing === 0 && entry.passing > 0) return "compliant";
  if (entry.failing > 0) return "non_compliant";
  return "unknown";
}

function PostureCompliancePage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: compliance, isPending, isError } = usePostureCompliance(orgId);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const devices = useMemo(() => {
    const list = compliance?.devices ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((entry) => {
      const status = deviceStatus(entry);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.endpointId.toLowerCase().includes(q)
      );
    });
  }, [compliance?.devices, query, statusFilter]);

  if (!orgId || isPending) {
    return (
      <PosturePageShell>
        <ComplianceSkeleton />
      </PosturePageShell>
    );
  }

  const total = compliance?.totalDevices ?? 0;
  const compliant = compliance?.compliant ?? 0;
  const nonCompliant = compliance?.nonCompliant ?? 0;
  const unknown = compliance?.unknown ?? 0;
  const rate = Math.round(compliance?.complianceRate ?? 0);
  const compliantPct = total > 0 ? Math.round((compliant / total) * 100) : 0;
  const nonCompliantPct =
    total > 0 ? Math.round((nonCompliant / total) * 100) : 0;
  const unknownPct = total > 0 ? Math.round((unknown / total) * 100) : 0;

  return (
    <PosturePageShell>
      {isError || !compliance ? (
        <div className="rounded-lg border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium">Compliance data unavailable</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Posture evaluation appears once devices report attributes and
            definitions exist.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section
            className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] lg:items-center"
            aria-label="Compliance overview"
          >
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Compliance rate
              </p>
              <p
                className="text-4xl font-semibold tracking-tight tabular-nums"
                aria-live="polite"
              >
                {rate}
                <span className="text-muted-foreground text-xl font-medium">
                  %
                </span>
              </p>
              <p className="text-muted-foreground text-sm">
                {compliant} of {total} devices fully compliant
              </p>
            </div>

            <div className="space-y-3">
              <div
                className="flex h-3 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`Fleet breakdown: ${compliantPct}% compliant, ${nonCompliantPct}% non-compliant, ${unknownPct}% unknown`}
              >
                {compliantPct > 0 ? (
                  <div
                    className="bg-emerald-600 transition-[width] duration-200 dark:bg-emerald-500"
                    style={{ width: `${compliantPct}%` }}
                  />
                ) : null}
                {nonCompliantPct > 0 ? (
                  <div
                    className="bg-destructive transition-[width] duration-200"
                    style={{ width: `${nonCompliantPct}%` }}
                  />
                ) : null}
                {unknownPct > 0 ? (
                  <div
                    className="bg-muted-foreground/35 transition-[width] duration-200"
                    style={{ width: `${unknownPct}%` }}
                  />
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <BreakdownStat
                  color="bg-emerald-600 dark:bg-emerald-500"
                  label="Compliant"
                  value={compliant}
                />
                <BreakdownStat
                  color="bg-destructive"
                  label="Non-compliant"
                  value={nonCompliant}
                />
                <BreakdownStat
                  color="bg-muted-foreground/35"
                  label="Unknown"
                  value={unknown}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3" aria-label="Devices">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-medium">Devices</h2>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name…"
                  className="h-8 w-full sm:w-52"
                  aria-label="Filter devices"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    if (v) setStatusFilter(v as StatusFilter);
                  }}
                >
                  <SelectTrigger
                    className="h-8 w-[10.5rem]"
                    aria-label="Status filter"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="compliant">Compliant</SelectItem>
                    <SelectItem value="non_compliant">Non-compliant</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {devices.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
                No devices match this filter.
              </p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
                {devices.map((entry) => {
                  const status = deviceStatus(entry);
                  return (
                    <li key={entry.endpointId}>
                      <Link
                        to="/app/machines/$endpointId"
                        params={{ endpointId: entry.endpointId }}
                        className="hover:bg-muted/40 flex items-center justify-between gap-4 px-3 py-2.5 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {entry.name || entry.endpointId.slice(0, 12)}
                          </p>
                          <p className="text-muted-foreground text-xs tabular-nums">
                            {entry.passing} passing · {entry.failing} failing
                            {entry.overallScore != null
                              ? ` · score ${entry.overallScore}`
                              : ""}
                          </p>
                        </div>
                        <StatusChip status={status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </PosturePageShell>
  );
}

function BreakdownStat({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", color)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </span>
  );
}

function StatusChip({ status }: { status: StatusFilter }) {
  if (status === "compliant") {
    return <Badge variant="default">Compliant</Badge>;
  }
  if (status === "non_compliant") {
    return <Badge variant="destructive">Non-compliant</Badge>;
  }
  if (status === "unknown") {
    return <Badge variant="outline">Unknown</Badge>;
  }
  return null;
}

function ComplianceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
