import { Link } from "@tanstack/react-router";
import type { KubernetesHubNode } from "@tunnet/api/management";
import { ChevronRightIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { deviceKindLabel } from "@/lib/device-type";
import { cn } from "@/lib/utils";

export function KubernetesNodeSheet({
  node,
  open,
  onOpenChange,
}: {
  node: KubernetesHubNode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-4 sm:max-w-md">
        {node ? (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="text-[15px] font-medium tracking-tight">
                {node.name}
              </SheetTitle>
              <p className="text-muted-foreground font-mono text-[12px]">
                {node.hostname}
              </p>
            </SheetHeader>

            <div className="mt-5 space-y-0 px-1">
              <MetaRow
                label="Kind"
                value={deviceKindLabel(String(node.kind)) ?? String(node.kind)}
              />
              <MetaRow
                label="Presence"
                value={node.online ? "Online" : "Offline"}
                tone={node.online ? "ok" : "muted"}
              />
              <MetaRow label="Network" value={node.networkName} />
              <MetaRow label="Mesh IP" value={node.meshIp} mono />
              <MetaRow label="Routes" value={String(node.subnetRouteCount)} />
              <MetaRow label="Serves" value={String(node.serveCount)} />
              <MetaRow label="Tunnels" value={String(node.tunnelCount)} />
            </div>

            {node.subnetRoutes.length > 0 ? (
              <div className="mt-4 space-y-2 px-1">
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  Advertised routes
                </p>
                <ul className="space-y-1.5">
                  {node.subnetRoutes.map((route) => (
                    <li
                      key={route.id}
                      className="flex items-center justify-between gap-3 text-[12px]"
                    >
                      <span className="font-mono">{route.cidr}</span>
                      <span className="text-muted-foreground">
                        {route.enabled ? "Enabled" : "Off"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-6 space-y-2 px-1">
              <Link
                to="/app/machines/$endpointId"
                params={{ endpointId: node.endpointId }}
                className="panel hover:border-border group flex items-start gap-3 p-3 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    Open machine
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[12px] leading-snug">
                    Full detail, routes, tunnels, and settings
                  </span>
                </span>
                <ChevronRightIcon className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/app/kubernetes/networks/$networkId"
                params={{ networkId: node.networkId }}
                className="panel hover:border-border group flex items-start gap-3 p-3 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    Cluster graph
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[12px] leading-snug">
                    Kubernetes topology on {node.networkName}
                  </span>
                </span>
                <ChevronRightIcon className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/app/networks/$networkId"
                params={{ networkId: node.networkId }}
                search={{ kind: "k8s" }}
                className="panel hover:border-border group flex items-start gap-3 p-3 transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">
                    Network Mesh
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-[12px] leading-snug">
                    Full mesh for this network
                  </span>
                </span>
                <ChevronRightIcon className="text-muted-foreground mt-0.5 size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
              </Link>
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
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "ok" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-[12px] last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
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
    </div>
  );
}
