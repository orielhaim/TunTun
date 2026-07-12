import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { CreatePolicyBody, Policy } from "@tuntun/api/management";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { usePolicies } from "@/lib/queries/management";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/app/networks/$networkId/access")({
  component: NetworkAccessPage,
});

function NetworkAccessPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: policies, isPending } = usePolicies(orgId, networkId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const createPolicy = useMutation({
    mutationFn: async (body: CreatePolicyBody) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).createPolicy(networkId, body);
    },
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.policies(orgId, networkId),
        });
      }
    },
  });

  const deletePolicy = useMutation({
    mutationFn: async (policyId: string) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).deletePolicy(networkId, policyId);
    },
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.policies(orgId, networkId),
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
    <>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Access control policies for this network.
        </p>
        {isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Add policy
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (policies?.length ?? 0) === 0 ? (
        <EmptyState
          title="No policies"
          description="Add policies to control traffic between machines."
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>Add policy</Button>
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

      <CreatePolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={createPolicy.isPending}
        onSubmit={async (body) => {
          try {
            await createPolicy.mutateAsync(body);
            toast.success("Policy created");
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
        title="Delete policy"
        description="This policy will be removed from the network."
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
    </>
  );
}

function formatSelector(selector: { kind: string; value?: string }) {
  if (selector.kind === "any") return "any";
  return `${selector.kind}:${selector.value ?? ""}`;
}

function CreatePolicyDialog({
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
  const [action, setAction] = useState<"allow" | "deny">("allow");
  const [srcKind, setSrcKind] = useState("any");
  const [dstKind, setDstKind] = useState("any");
  const [srcValue, setSrcValue] = useState("");
  const [dstValue, setDstValue] = useState("");
  const [protocol, setProtocol] = useState<string>("any");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      action,
      srcSelector: buildSelector(srcKind, srcValue),
      dstSelector: buildSelector(dstKind, dstValue),
      protocol: protocol as "tcp" | "udp" | "icmp" | "any",
      ports: [],
      priority: 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add policy</DialogTitle>
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
              {loading ? "Creating..." : "Create policy"}
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
  onKindChange: (v: string) => void;
  onValueChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={kind} onValueChange={onKindChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any</SelectItem>
          <SelectItem value="endpoint">Endpoint</SelectItem>
          <SelectItem value="tag">Tag</SelectItem>
          <SelectItem value="cidr">CIDR</SelectItem>
        </SelectContent>
      </Select>
      {kind !== "any" ? (
        <input
          className="border-input bg-background flex h-9 w-full rounded-md border px-3 text-sm"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={`${kind} value`}
          required
        />
      ) : null}
    </div>
  );
}

function buildSelector(kind: string, value: string) {
  if (kind === "any") return { kind: "any" as const };
  return { kind: kind as "endpoint" | "tag" | "cidr", value };
}
