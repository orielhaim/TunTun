import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type EntityStatusTone =
  | "healthy"
  | "active"
  | "online"
  | "pending"
  | "connecting"
  | "starting"
  | "degraded"
  | "stale"
  | "error"
  | "offline"
  | "stopped"
  | "expired"
  | "disabled"
  | "suspended"
  | "unknown";

const TONE_FROM_STATUS: Record<string, EntityStatusTone> = {
  healthy: "healthy",
  active: "active",
  online: "online",
  pending: "pending",
  connecting: "connecting",
  starting: "starting",
  degraded: "degraded",
  stale: "stale",
  error: "error",
  offline: "offline",
  stopped: "stopped",
  expired: "expired",
  disabled: "disabled",
  suspended: "suspended",
  missing: "offline",
};

const labels: Record<EntityStatusTone, string> = {
  healthy: "Healthy",
  active: "Active",
  online: "Online",
  pending: "Pending",
  connecting: "Connecting",
  starting: "Starting",
  degraded: "Degraded",
  stale: "Stale",
  error: "Error",
  offline: "Offline",
  stopped: "Stopped",
  expired: "Expired",
  disabled: "Disabled",
  suspended: "Suspended",
  unknown: "Unknown",
};

const variants: Record<
  EntityStatusTone,
  "default" | "secondary" | "destructive" | "outline"
> = {
  healthy: "default",
  active: "default",
  online: "default",
  pending: "secondary",
  connecting: "secondary",
  starting: "secondary",
  degraded: "secondary",
  stale: "secondary",
  error: "destructive",
  offline: "outline",
  stopped: "outline",
  expired: "outline",
  disabled: "outline",
  suspended: "destructive",
  unknown: "outline",
};

const dotClass: Record<EntityStatusTone, string> = {
  healthy: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  active: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  online: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  pending: "bg-amber-400",
  connecting: "bg-amber-400",
  starting: "bg-amber-400",
  degraded: "bg-amber-400",
  stale: "bg-amber-400",
  error: "bg-destructive",
  offline: "bg-muted-foreground/40",
  stopped: "bg-muted-foreground/40",
  expired: "bg-muted-foreground/40",
  disabled: "bg-muted-foreground/40",
  suspended: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

function resolveTone(status: string): EntityStatusTone {
  return TONE_FROM_STATUS[status.toLowerCase()] ?? "unknown";
}

export function EntityStatus({
  status,
  label,
  showDot = true,
  className,
}: {
  status: string;
  label?: string;
  showDot?: boolean;
  className?: string;
}) {
  const tone = resolveTone(status);

  return (
    <Badge
      variant={variants[tone]}
      className={cn("gap-1.5 capitalize", className)}
    >
      {showDot ? (
        <span
          className={cn("size-1.5 rounded-full", dotClass[tone])}
          aria-hidden
        />
      ) : null}
      {label ?? labels[tone]}
    </Badge>
  );
}
