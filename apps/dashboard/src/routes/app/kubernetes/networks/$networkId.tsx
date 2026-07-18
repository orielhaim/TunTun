import { createFileRoute, Link } from "@tanstack/react-router";
import type { KubernetesHubNode } from "@tunnet/api/management";
import { ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { KubernetesForceGraph } from "@/components/app/kubernetes-force-graph";
import { KubernetesNodeSheet } from "@/components/app/kubernetes-node-sheet";
import { PageHeader } from "@/components/app/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrganization } from "@/lib/auth-client";
import { useKubernetes, useNetwork } from "@/lib/queries/management";

export const Route = createFileRoute("/app/kubernetes/networks/$networkId")({
  component: KubernetesNetworkPage,
});

function KubernetesNetworkPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: network, isPending: networkPending } = useNetwork(
    orgId,
    networkId,
  );
  const { data, isPending } = useKubernetes(orgId);
  const [selected, setSelected] = useState<KubernetesHubNode | null>(null);

  const nodes = useMemo(
    () => (data?.nodes ?? []).filter((n) => n.networkId === networkId),
    [data?.nodes, networkId],
  );

  if (isPending || networkPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/app/kubernetes" />}>
              Kubernetes
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRightIcon className="size-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{network?.name ?? networkId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={network?.name ?? "Network"}
        description="Kubernetes nodes and subnet routes they advertise into this mesh."
        actions={
          <Button
            nativeButton={false}
            size="sm"
            variant="outline"
            render={
              <Link
                to="/app/networks/$networkId"
                params={{ networkId }}
                search={{ kind: "k8s" }}
              />
            }
          >
            Open Mesh
          </Button>
        }
      />

      {nodes.length === 0 ? (
        <EmptyState
          title="No Kubernetes nodes on this network"
          description="Enroll a TunnetConnector (or other k8s CRD) into this network to see topology here."
          action={
            <Button nativeButton={false} render={<Link to="/app/kubernetes" />}>
              Back to Kubernetes
            </Button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
            <div>
              <span className="text-[13px] font-medium tracking-tight">
                Cluster topology
              </span>
              <p className="text-muted-foreground text-[11px]">
                {nodes.filter((n) => n.online).length} online · {nodes.length}{" "}
                nodes · {nodes.reduce((sum, n) => sum + n.subnetRouteCount, 0)}{" "}
                routes
              </p>
            </div>
          </div>
          <KubernetesForceGraph
            nodes={nodes}
            networkName={network?.name ?? "Network"}
            onSelect={setSelected}
            className="rounded-none border-0"
          />
        </div>
      )}

      <KubernetesNodeSheet
        node={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
