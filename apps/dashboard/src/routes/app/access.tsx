import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreatePolicyBody, Policy } from "@tuntun/api/management";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { createManagementClient } from "@/lib/management-client";
import {
  useMachines,
  useNetworks,
  useOrganizationPolicies,
} from "@/lib/queries/management";
import { queryKeys } from "@/lib/query-keys";

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
        description="Organization-wide policies apply first; network policies refine per mesh."
      />

      <OrganizationPoliciesPanel />

      <div className="mt-8 space-y-3">
        <h2 className="text-sm font-medium">Networks</h2>
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
                      Manage network policies
                      <ChevronRightIcon className="ml-1 size-4" />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function OrganizationPoliciesPanel() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: policies, isPending } = useOrganizationPolicies(orgId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createPolicy = useMutation({
    mutationFn: async (body: CreatePolicyBody) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).createOrganizationPolicy(body);
    },
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.organizationPolicies(orgId),
        });
      }
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (policyId: string) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).deleteOrganizationPolicy(policyId);
    },
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.organizationPolicies(orgId),
        });
      }
    },
  });

  const columns = useMemo<ColumnDef<Policy>[]>(
    () => [
      {
        id: "action",
        header: "Action",
        cell: ({ row }) => (
          <span className="capitalize">{row.original.action}</span>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {formatSelector(row.original.srcSelector)}
          </span>
        ),
      },
      {
        id: "destination",
        header: "Destination",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {formatSelector(row.original.dstSelector)}
          </span>
        ),
      },
      {
        id: "protocol",
        header: "Protocol",
        cell: ({ row }) => row.original.protocol ?? "any",
      },
      {
        id: "priority",
        header: "Priority",
        accessorKey: "priority",
      },
      ...(isAdmin
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-10" },
              cell: ({ row }: { row: { original: Policy } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(row.original.id)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<Policy>,
          ]
        : []),
    ],
    [isAdmin],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">Organization policies</h2>
          <p className="text-muted-foreground text-sm">
            Evaluated before every network ACL. Deny here blocks across all
            meshes.
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Add org policy
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (policies?.length ?? 0) === 0 ? (
        <EmptyState
          title="No organization policies"
          description="Optional org-wide rules apply to every network in this tenant."
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>
                Add org policy
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={policies ?? []}
          getRowId={(row) => row.id}
        />
      )}

      <CreateOrgPolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={createPolicy.isPending}
        onSubmit={async (body) => {
          try {
            await createPolicy.mutateAsync(body);
            toast.success("Organization policy created");
            setCreateOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create",
            );
          }
        }}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete organization policy"
        description="This rule will no longer apply across networks."
        confirmLabel="Delete"
        destructive
        loading={deletePolicy.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deletePolicy.mutateAsync(deleteId);
            toast.success("Policy deleted");
            setDeleteId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />
    </div>
  );
}

function CreateOrgPolicyDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (body: CreatePolicyBody) => Promise<void>;
}) {
  const [action, setAction] = useState<"allow" | "deny">("deny");
  const [protocol, setProtocol] = useState("any");
  const [priority, setPriority] = useState("100");
  const [srcKind, setSrcKind] = useState("any");
  const [dstKind, setDstKind] = useState("any");
  const [srcValue, setSrcValue] = useState("");
  const [dstValue, setDstValue] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      action,
      srcSelector: buildSelector(srcKind, srcValue),
      dstSelector: buildSelector(dstKind, dstValue),
      ports: [],
      protocol:
        protocol === "any" ? null : (protocol as "tcp" | "udp" | "icmp"),
      priority: Number(priority) || 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add organization policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={action}
                onValueChange={(v) => setAction(v as "allow" | "deny")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow</SelectItem>
                  <SelectItem value="deny">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <SelectorFields
              label="Source"
              kind={srcKind}
              value={srcValue}
              onKindChange={setSrcKind}
              onValueChange={setSrcValue}
            />
            <SelectorFields
              label="Destination"
              kind={dstKind}
              value={dstValue}
              onKindChange={setDstKind}
              onValueChange={setDstValue}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select value={protocol} onValueChange={setProtocol}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="icmp">ICMP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-priority">Priority</Label>
                <Input
                  id="org-priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectorFields({
  label,
  kind,
  value,
  onKindChange,
  onValueChange,
}: {
  label: string;
  kind: string;
  value: string;
  onKindChange: (kind: string) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={kind} onValueChange={onKindChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any</SelectItem>
            <SelectItem value="tag">Tag</SelectItem>
            <SelectItem value="endpoint">Endpoint</SelectItem>
            <SelectItem value="cidr">CIDR</SelectItem>
          </SelectContent>
        </Select>
        {kind !== "any" ? (
          <Input
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={
              kind === "cidr"
                ? "10.0.0.0/8"
                : kind === "tag"
                  ? "prod"
                  : "endpoint id"
            }
            required
          />
        ) : null}
      </div>
    </div>
  );
}

function buildSelector(kind: string, value: string) {
  if (kind === "any") return { kind: "any" as const };
  if (kind === "tag") return { kind: "tag" as const, value };
  if (kind === "endpoint") return { kind: "endpoint" as const, value };
  return { kind: "cidr" as const, value };
}

function formatSelector(selector: Policy["srcSelector"]): string {
  if (selector.kind === "any") return "any";
  return `${selector.kind}:${selector.value}`;
}
