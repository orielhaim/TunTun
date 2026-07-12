import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyField } from "@/components/app/copy-field";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EntityStatus } from "@/components/app/entity-status";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  useRelay,
  useRelayHealth,
  useRelayMutations,
  useTunnels,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/relays/$relayId")({
  component: RelayDetailPage,
});

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border/50 py-3 last:border-0">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <div className="min-w-0 text-right text-sm">{children}</div>
    </div>
  );
}

function RelayDetailPage() {
  const { relayId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: relay, isPending, isError, error } = useRelay(orgId, relayId);
  const { data: health } = useRelayHealth(orgId, relayId);
  const { data: tunnels } = useTunnels(orgId);
  const mutations = useRelayMutations(orgId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [capacity, setCapacity] = useState("");

  useEffect(() => {
    if (!relay) return;
    setName(relay.name);
    setRegion(relay.region);
    setCapacity(String(relay.capacityLimit));
  }, [relay]);

  const relayTunnels = useMemo(
    () => (tunnels ?? []).filter((t) => t.relayId === relayId),
    [tunnels, relayId],
  );

  const heartbeats = useMemo(
    () => [...(health?.heartbeats ?? [])].reverse(),
    [health],
  );
  const maxActive = useMemo(
    () => Math.max(1, ...heartbeats.map((h) => h.activeTunnels)),
    [heartbeats],
  );

  const tunnelColumns = useMemo<ColumnDef<(typeof relayTunnels)[number]>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <EntityStatus status={row.original.status} />,
      },
      {
        id: "url",
        header: "URL",
        cell: ({ row }) => (
          <Link
            to="/app/tunnels/$tunnelId"
            params={{ tunnelId: row.original.id }}
            className="font-mono text-xs hover:underline"
          >
            https://{row.original.publicHostname}
          </Link>
        ),
      },
      {
        id: "machine",
        header: "Machine",
        cell: ({ row }) => row.original.hostname ?? "—",
      },
      {
        id: "port",
        header: "Port",
        accessorKey: "localPort",
      },
      {
        id: "protocol",
        header: "Protocol",
        cell: ({ row }) => row.original.protocol.toUpperCase(),
      },
    ],
    [],
  );

  if (!orgId || isPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (isError || !relay) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">
          {isError && error instanceof Error
            ? error.message
            : "Relay not found."}
        </p>
        <Button nativeButton={false} render={<Link to="/app/relays" />}>
          Back to relays
        </Button>
      </div>
    );
  }

  const capacityPct =
    relay.capacityLimit > 0
      ? Math.round((relay.activeTunnels / relay.capacityLimit) * 100)
      : 0;

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/app/relays" />}>
              Relays
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRightIcon className="size-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{relay.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader
        title={relay.name}
        description={`${relay.region} · ${relay.domain}`}
        actions={<EntityStatus status={relay.status} />}
      />

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tunnels">Tunnels</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="settings">Settings</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Relay info</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Status">
                  <EntityStatus status={relay.status} />
                </DetailRow>
                <DetailRow label="Kind">
                  {relay.kind.replace("_", " ")}
                </DetailRow>
                <DetailRow label="Region">{relay.region}</DetailRow>
                <DetailRow label="Capacity">
                  {relay.activeTunnels}/{relay.capacityLimit} ({capacityPct}%)
                </DetailRow>
                <DetailRow label="Last heartbeat">
                  {relay.lastHeartbeatAt
                    ? formatDistanceToNow(new Date(relay.lastHeartbeatAt), {
                        addSuffix: true,
                      })
                    : "—"}
                </DetailRow>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Endpoints</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CopyField label="Domain" value={relay.domain} />
                {relay.publicIp ? (
                  <CopyField label="Public IP" value={relay.publicIp} />
                ) : (
                  <DetailRow label="Public IP">Not set</DetailRow>
                )}
                <CopyField label="Relay ID" value={relay.id} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tunnels">
          {relayTunnels.length === 0 ? (
            <EmptyState
              title="No tunnels on this relay"
              description="Tunnels assigned to this relay will appear here."
            />
          ) : (
            <DataTable
              columns={tunnelColumns}
              data={relayTunnels}
              getRowId={(r) => r.id}
            />
          )}
        </TabsContent>

        <TabsContent value="health">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">TLS certificate</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Status">
                  <EntityStatus status={health?.status ?? relay.status} />
                </DetailRow>
                <DetailRow label="Active tunnels">
                  {health?.activeTunnels ?? relay.activeTunnels}
                </DetailRow>
                <DetailRow label="Cert valid until">
                  {health?.cert.validUntil
                    ? formatDistanceToNow(new Date(health.cert.validUntil), {
                        addSuffix: true,
                      })
                    : "Unknown"}
                </DetailRow>
                <DetailRow label="Last heartbeat">
                  {health?.lastHeartbeatAt
                    ? formatDistanceToNow(new Date(health.lastHeartbeatAt), {
                        addSuffix: true,
                      })
                    : "—"}
                </DetailRow>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Heartbeat history</CardTitle>
              </CardHeader>
              <CardContent>
                {heartbeats.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No heartbeats recorded yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex h-24 items-end gap-0.5">
                      {heartbeats.slice(-40).map((sample) => (
                        <div
                          key={sample.id}
                          className="bg-foreground/70 min-w-0 flex-1 rounded-t-sm"
                          style={{
                            height: `${Math.max(8, (sample.activeTunnels / maxActive) * 100)}%`,
                          }}
                          title={`${sample.activeTunnels} tunnels · ${new Date(sample.recordedAt).toLocaleString()}`}
                        />
                      ))}
                    </div>
                    <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto text-sm">
                      {[...(health?.heartbeats ?? [])].slice(0, 12).map((h) => (
                        <li
                          key={h.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="text-muted-foreground text-xs">
                            {formatDistanceToNow(new Date(h.recordedAt), {
                              addSuffix: true,
                            })}
                          </span>
                          <span className="font-mono text-xs">
                            {h.activeTunnels} tunnels
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="settings">
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">General</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutations.update
                        .mutateAsync({
                          relayId,
                          body: {
                            name: name.trim(),
                            region: region.trim(),
                            capacityLimit:
                              Number(capacity) || relay.capacityLimit,
                          },
                        })
                        .then(() => toast.success("Relay updated"))
                        .catch((err: Error) => toast.error(err.message));
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="relay-settings-name">Name</Label>
                      <Input
                        id="relay-settings-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="relay-settings-region">Region</Label>
                      <Input
                        id="relay-settings-region"
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="relay-settings-capacity">Capacity</Label>
                      <Input
                        id="relay-settings-capacity"
                        type="number"
                        min={1}
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Input value={relay.status} disabled />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        disabled={mutations.update.isPending}
                      >
                        {mutations.update.isPending
                          ? "Saving..."
                          : "Save changes"}
                      </Button>
                      {relay.status !== "disabled" ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setConfirmDisable(true)}
                        >
                          Disable relay
                        </Button>
                      ) : null}
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader>
                  <CardTitle className="text-base text-destructive">
                    Danger zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground text-sm">
                    Deleting this relay removes it from the organization. Active
                    tunnels on it will fail over or stop.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete relay
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>

      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title="Disable relay"
        description={`Disable ${relay.name}? New tunnels will not be assigned to it.`}
        confirmLabel="Disable"
        destructive
        loading={mutations.update.isPending}
        onConfirm={async () => {
          try {
            await mutations.update.mutateAsync({
              relayId,
              body: { status: "disabled" },
            });
            toast.success("Relay disabled");
            setConfirmDisable(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to disable",
            );
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete relay"
        description={`Delete ${relay.name}? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          try {
            await mutations.remove.mutateAsync(relayId);
            toast.success("Relay deleted");
            window.location.href = "/app/relays";
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />
    </>
  );
}
