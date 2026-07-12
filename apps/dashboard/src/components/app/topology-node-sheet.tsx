import { Link } from "@tanstack/react-router";
import type { TopologyNode } from "@tuntun/api/management";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
      <SheetContent side="right" className="w-full sm:max-w-md p-4">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-base">
                {node.label}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4 px-1">
              <Row label="Kind">
                <Badge variant="outline" className="capitalize">
                  {node.kind}
                </Badge>
              </Row>
              {node.secondary ? (
                <Row label="Detail">
                  <span className="font-mono text-sm">{node.secondary}</span>
                </Row>
              ) : null}
              {node.assignedIp ? (
                <Row label="IP">
                  <span className="font-mono text-sm">{node.assignedIp}</span>
                </Row>
              ) : null}
              {node.cidr ? (
                <Row label="CIDR">
                  <span className="font-mono text-sm">{node.cidr}</span>
                </Row>
              ) : null}
              {node.kind === "machine" ? (
                <Row label="Status">
                  <Badge variant={node.online ? "default" : "outline"}>
                    {node.online ? "Online" : "Offline"}
                  </Badge>
                </Row>
              ) : null}
              {node.endpointId ? (
                <Row label="Endpoint">
                  <Link
                    to="/app/machines/$endpointId"
                    params={{ endpointId: node.endpointId }}
                    className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {node.endpointId.slice(0, 16)}…
                  </Link>
                </Row>
              ) : null}
              {node.viaEndpointId && node.kind !== "machine" ? (
                <Row label="Via">
                  <Link
                    to="/app/machines/$endpointId"
                    params={{ endpointId: node.viaEndpointId }}
                    className="text-primary font-mono text-xs underline-offset-4 hover:underline"
                  >
                    {node.viaEndpointId.slice(0, 16)}…
                  </Link>
                </Row>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}
