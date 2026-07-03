import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveOrganization } from "@/lib/auth-client";
import { useDevices, useNetwork } from "@/lib/queries/management";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/networks/$networkId/")({
  component: NetworkOverviewPage,
});

function NetworkOverviewPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: network } = useNetwork(orgId, networkId);
  const { data: devices } = useDevices(orgId, networkId);

  if (!network) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">CIDR</span>
            <span className="font-mono">{network.cidr}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MTU</span>
            <span>{network.mtu}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span>{network.version}</span>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Machines</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold">{devices?.length ?? 0}</p>
          <p className="text-muted-foreground text-sm">
            machines enrolled in this network
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
