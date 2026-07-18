import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreatePolicyBody, Policy } from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import {
  applyPolicyExtraFields,
  buildPolicySelector,
  formatPolicySelector,
  PolicySelectorFields,
} from "@/components/app/policy-selector-fields";
import { Badge } from "@/components/ui/badge";
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
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import { createManagementClient } from "@/lib/management-client";
import {
  useMachines,
  useNetworks,
  useOrganizationPolicies,
  usePolicyHistory,
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

      <div className="mt-8">
        <PolicyRevisionsPanel />
      </div>

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
  const { data: canManage = false } = useCan(orgId, "policy", "update");
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
        id: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.slug ?? "—"}</span>
        ),
      },
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
            {formatPolicySelector(row.original.srcSelector)}
          </span>
        ),
      },
      {
        id: "destination",
        header: "Destination",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {formatPolicySelector(row.original.dstSelector)}
          </span>
        ),
      },
      {
        id: "srcPosture",
        header: "Src posture",
        cell: ({ row }) => {
          const posture = row.original.srcPosture;
          if (!posture?.length) return "—";
          return (
            <span className="font-mono text-xs">{posture.join(", ")}</span>
          );
        },
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
      ...(canManage
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
    [canManage],
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
        {canManage ? (
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
            canManage ? (
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

function PolicyRevisionsPanel() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: revisions, isPending } = usePolicyHistory(orgId);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-medium">Policy revisions</h2>
        <p className="text-muted-foreground text-sm">
          Recent applies from the dashboard, API, GitOps, or Terraform.
        </p>
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (revisions?.length ?? 0) === 0 ? (
        <p className="text-muted-foreground text-sm">
          No revisions yet. GitOps apply writes a revision on success; use drift
          checks and --force when reconciling conflicts.
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {(revisions ?? []).slice(0, 10).map((rev) => (
            <li
              key={rev.id}
              className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
            >
              <Badge variant="secondary" className="capitalize">
                {rev.source}
              </Badge>
              <span className="text-muted-foreground">v{rev.version}</span>
              <span className="font-mono text-xs">
                {rev.contentHash.slice(0, 12)}
                {rev.contentHash.length > 12 ? "…" : ""}
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                {formatDistanceToNow(new Date(rev.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
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
  const [slug, setSlug] = useState("");
  const [srcPosture, setSrcPosture] = useState("");
  const [srcKind, setSrcKind] = useState("any");
  const [dstKind, setDstKind] = useState("any");
  const [srcValue, setSrcValue] = useState("");
  const [dstValue, setDstValue] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(
      applyPolicyExtraFields(
        {
          action,
          srcSelector: buildPolicySelector(srcKind, srcValue),
          dstSelector: buildPolicySelector(dstKind, dstValue),
          ports: [],
          protocol:
            protocol === "any" ? null : (protocol as "tcp" | "udp" | "icmp"),
          priority: Number(priority) || 0,
        },
        { slug, srcPosture },
      ),
    );
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
              <Label htmlFor="org-slug">Slug</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="deny-untrusted"
              />
            </div>
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
            <PolicySelectorFields
              label="Source"
              kind={srcKind}
              value={srcValue}
              onKindChange={setSrcKind}
              onValueChange={setSrcValue}
            />
            <PolicySelectorFields
              label="Destination"
              kind={dstKind}
              value={dstValue}
              onKindChange={setDstKind}
              onValueChange={setDstValue}
            />
            <div className="space-y-2">
              <Label htmlFor="org-src-posture">Src posture</Label>
              <Input
                id="org-src-posture"
                value={srcPosture}
                onChange={(e) => setSrcPosture(e.target.value)}
                placeholder="compliant, mdm-enrolled"
              />
              <p className="text-muted-foreground text-xs">
                Comma-separated posture definition names (OR).
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select
                  value={protocol}
                  onValueChange={(v) => setProtocol(v ?? "any")}
                >
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
