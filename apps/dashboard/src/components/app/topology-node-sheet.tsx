import { Link } from "@tanstack/react-router";
import type { TopologyNode } from "@tunnet/api/management";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deviceKindLabel, deviceTypeLabel } from "@/lib/device-type";
import { cn } from "@/lib/utils";

export function TopologyNodeSheet({
  node,
  open,
  onOpenChange,
}: {
  node: TopologyNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-4 sm:max-w-md">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle className="text-[15px] font-medium tracking-tight">
                {node.label}
              </SheetTitle>
              {node.secondary ? (
                <p className="text-muted-foreground font-mono text-[12px]">
                  {node.secondary}
                </p>
              ) : null}
            </SheetHeader>
            <div className="mt-5 space-y-0 px-1">
              <MetaRow label="Kind" value={node.kind} mono />
              {node.kind === "machine" && node.deviceType ? (
                <MetaRow
                  label="Type"
                  value={deviceTypeLabel(node.deviceType)}
                />
              ) : null}
              {node.kind === "machine" && node.nodeKind ? (
                <MetaRow
                  label="Node kind"
                  value={deviceKindLabel(node.nodeKind) ?? node.nodeKind}
                  mono
                />
              ) : null}
              {node.assignedIp ? (
                <MetaRow label="Mesh IP" value={node.assignedIp} mono />
              ) : null}
              {node.cidr ? (
                <MetaRow label="CIDR" value={node.cidr} mono />
              ) : null}
              {node.kind === "machine" ? (
                <MetaRow
                  label="Presence"
                  value={node.online ? "Online" : "Offline"}
                  tone={node.online ? "ok" : "muted"}
                />
              ) : null}
              {node.endpointId ? (
                <MetaRow label="Machine">
                  <Link
                    to="/app/machines/$endpointId"
                    params={{ endpointId: node.endpointId }}
                    className="text-foreground hover:underline"
                  >
                    Open detail
                  </Link>
                </MetaRow>
              ) : null}
              {node.viaEndpointId && node.kind !== "machine" ? (
                <MetaRow label="Via">
                  <Link
                    to="/app/machines/$endpointId"
                    params={{ endpointId: node.viaEndpointId }}
                    className="font-mono text-[12px] hover:underline"
                  >
                    {node.viaEndpointId.slice(0, 16)}…
                  </Link>
                </MetaRow>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function MetaRow({
  label,
  value,
  mono,
  tone,
  children,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  tone?: "ok" | "muted";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-[12px] last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      {children ?? (
        <span
          className={cn(
            "min-w-0 truncate text-right",
            mono && "font-mono text-[11px]",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
