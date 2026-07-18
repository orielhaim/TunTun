import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  HelpCircleIcon,
  RefreshCwIcon,
  ShieldIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import {
  deriveOverallStatus,
  formatPostureAttributeKey,
  formatPostureValue,
} from "@/lib/posture-types";
import {
  useDevicePosture,
  useDevicePostureStatus,
  usePostureMutations,
} from "@/lib/queries/management";
import { cn } from "@/lib/utils";

type OverallStatus = ReturnType<typeof deriveOverallStatus>;

function postureStatusTone(
  status: OverallStatus,
): "success" | "warning" | "danger" | "muted" {
  switch (status) {
    case "compliant":
      return "success";
    case "partial":
      return "warning";
    case "non_compliant":
      return "danger";
    default:
      return "muted";
  }
}

const toneClasses = {
  success: {
    ring: "border-emerald-500/30 bg-emerald-500/5",
    icon: "text-emerald-600 dark:text-emerald-400",
    badge: "default" as const,
  },
  warning: {
    ring: "border-amber-500/30 bg-amber-500/5",
    icon: "text-amber-600 dark:text-amber-400",
    badge: "secondary" as const,
  },
  danger: {
    ring: "border-destructive/30 bg-destructive/5",
    icon: "text-destructive",
    badge: "destructive" as const,
  },
  muted: {
    ring: "border-border bg-muted/20",
    icon: "text-muted-foreground",
    badge: "secondary" as const,
  },
};

function StatusIcon({
  status,
  className,
}: {
  status: OverallStatus;
  className?: string;
}) {
  const tone = postureStatusTone(status);
  const Icon =
    status === "compliant"
      ? CheckCircle2Icon
      : status === "non_compliant"
        ? XCircleIcon
        : status === "partial"
          ? AlertTriangleIcon
          : HelpCircleIcon;
  return <Icon className={cn("size-8", toneClasses[tone].icon, className)} />;
}

function formatOverallStatus(status: OverallStatus) {
  switch (status) {
    case "compliant":
      return "Compliant";
    case "non_compliant":
      return "Non-compliant";
    case "partial":
      return "Partially compliant";
    default:
      return "Unknown";
  }
}

export function MachinePostureTab({
  orgId,
  endpointId,
}: {
  orgId: string;
  endpointId: string;
}) {
  const { data: posture, isPending: posturePending } = useDevicePosture(
    orgId,
    endpointId,
  );
  const { data: status, isPending: statusPending } = useDevicePostureStatus(
    orgId,
    endpointId,
  );
  const { data: canRecheckPosture = false } = useCan(
    orgId,
    "posture",
    "recheck",
  );
  const { data: canUpdateDevice = false } = useCan(orgId, "device", "update");
  const postureMutations = usePostureMutations(orgId);
  const canRecheck = canRecheckPosture || canUpdateDevice;

  const isPending = posturePending || statusPending;
  const overall = deriveOverallStatus(status);
  const tone = postureStatusTone(overall);
  const score = status?.overallScore ?? null;

  if (isPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Card
          className={cn(
            "min-w-[min(100%,280px)] flex-1 border-2",
            toneClasses[tone].ring,
          )}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background">
              <StatusIcon status={overall} />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Overall compliance
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold tracking-tight">
                  {formatOverallStatus(overall)}
                </p>
                <Badge variant={toneClasses[tone].badge}>
                  {overall.replace("_", " ")}
                </Badge>
              </div>
              {typeof score === "number" ? (
                <p className="text-muted-foreground text-sm">
                  Posture score{" "}
                  <span className="text-foreground font-medium tabular-nums">
                    {Math.round(score)}
                  </span>
                  /100
                </p>
              ) : null}
              {status?.evaluatedAt ? (
                <p className="text-muted-foreground text-xs">
                  Evaluated{" "}
                  {formatDistanceToNow(new Date(status.evaluatedAt), {
                    addSuffix: true,
                  })}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {canRecheck ? (
          <Button
            variant="outline"
            size="sm"
            disabled={postureMutations.recheck.isPending}
            onClick={() =>
              void postureMutations.recheck
                .mutateAsync(endpointId)
                .then(() => toast.success("Posture recheck requested"))
                .catch((err: Error) => toast.error(err.message))
            }
          >
            <RefreshCwIcon
              className={cn(
                "mr-2 size-4",
                postureMutations.recheck.isPending && "animate-spin",
              )}
            />
            Recheck now
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attributes</CardTitle>
          </CardHeader>
          <CardContent>
            {!posture?.attributes.length ? (
              <p className="text-muted-foreground text-sm">
                No posture attributes reported yet. The agent will send
                attributes after the first collection cycle.
              </p>
            ) : (
              <div className="max-h-96 space-y-0 overflow-y-auto">
                {posture.attributes.map((attr) => (
                  <div
                    key={`${attr.namespace}:${attr.key}`}
                    className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0"
                  >
                    <span className="text-muted-foreground font-mono text-xs">
                      {formatPostureAttributeKey(attr)}
                    </span>
                    <div className="min-w-0 text-right">
                      <p className="font-mono text-xs break-all">
                        {formatPostureValue(attr.value)}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {attr.source}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Posture definitions</CardTitle>
          </CardHeader>
          <CardContent>
            {!status?.postures.length ? (
              <p className="text-muted-foreground text-sm">
                No posture definitions evaluated for this machine.
              </p>
            ) : (
              <div className="space-y-3">
                {status.postures.map((entry) => (
                  <div
                    key={entry.name}
                    className={cn(
                      "rounded-lg border px-3 py-2.5",
                      entry.passed
                        ? "border-border/60"
                        : "border-destructive/30 bg-destructive/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <ShieldIcon
                          className={cn(
                            "size-4 shrink-0",
                            entry.passed
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-destructive",
                          )}
                        />
                        <span className="truncate text-sm font-medium">
                          {entry.name}
                        </span>
                      </div>
                      <Badge variant={entry.passed ? "default" : "destructive"}>
                        {entry.passed ? "Pass" : "Fail"}
                      </Badge>
                    </div>
                    {!entry.passed && entry.failingAssertions.length > 0 ? (
                      <ul className="text-muted-foreground mt-2 space-y-1 border-t border-border/50 pt-2 text-xs">
                        {entry.failingAssertions.map((assertion) => (
                          <li
                            key={`${entry.name}-${assertion}`}
                            className="font-mono text-destructive/90"
                          >
                            {assertion}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
