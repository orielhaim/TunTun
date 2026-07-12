import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrganization } from "@/lib/auth-client";
import { useMachines, useNetworks } from "@/lib/queries/management";

export const Route = createFileRoute("/app/access")({
  component: AccessPage,
});

function AccessPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: networks, isPending } = useNetworks(orgId);
  const { data: machines } = useMachines(orgId);

  return (
    <>
      <PageHeader
        title="Access"
        description="Manage access control policies per network."
      />

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(networks ?? []).map((network) => {
            const machineCount =
              machines?.filter((m) => m.networkId === network.id).length ?? 0;
            return (
              <Card key={network.id}>
                <CardHeader>
                  <CardTitle className="text-base">{network.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    {machineCount} machines · {network.cidr}
                  </p>
                  <Link
                    to="/app/networks/$networkId/access"
                    params={{ networkId: network.id }}
                    className="text-primary inline-flex items-center text-sm hover:underline"
                  >
                    Manage policies
                    <ChevronRightIcon className="ml-1 size-4" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
