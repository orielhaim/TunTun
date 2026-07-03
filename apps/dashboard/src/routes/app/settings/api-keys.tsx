import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import type { ApiKey } from "@tuntun/api/management";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyField } from "@/components/app/copy-field";
import { DataTable } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { createManagementClient } from "@/lib/management-client";
import { useApiKeys } from "@/lib/queries/management";
import { queryKeys } from "@/lib/query-keys";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings/api-keys")({
  component: ApiKeysPage,
});

function ApiKeysPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: apiKeys, isPending } = useApiKeys(orgId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const revoke = useMutation({
    mutationFn: async (keyId: string) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).revokeApiKey(keyId);
    },
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.apiKeys(orgId),
        });
      }
    },
  });

  const columns = useMemo<ColumnDef<ApiKey>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => row.original.name,
      },
      {
        id: "scopes",
        header: "Scopes",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.scopes.length > 0
              ? row.original.scopes.join(", ")
              : "—"}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {new Date(row.original.createdAt).toLocaleDateString()}
          </span>
        ),
      },
      ...(isAdmin
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-10" },
              cell: ({ row }: { row: { original: ApiKey } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRevokeId(row.original.id)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<ApiKey>,
          ]
        : []),
    ],
    [isAdmin],
  );

  return (
    <>
      <PageHeader
        title="API keys"
        description="Programmatic access to the management API."
        actions={
          isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Create key
            </Button>
          ) : null
        }
      />

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <DataTable
          columns={columns}
          data={apiKeys ?? []}
          getRowId={(row) => row.id}
        />
      )}

      <CreateApiKeyDialog
        orgId={orgId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(secret) => {
          setNewSecret(secret);
          if (orgId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.apiKeys(orgId),
            });
          }
        }}
      />

      <Dialog open={newSecret !== null} onOpenChange={() => setNewSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
          </DialogHeader>
          {newSecret ? <CopyField label="Secret" value={newSecret} /> : null}
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeId !== null}
        onOpenChange={(open) => !open && setRevokeId(null)}
        title="Revoke API key"
        description="This key will stop working immediately."
        confirmLabel="Revoke"
        destructive
        loading={revoke.isPending}
        onConfirm={async () => {
          if (!revokeId) return;
          try {
            await revoke.mutateAsync(revokeId);
            toast.success("API key revoked");
            setRevokeId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to revoke",
            );
          }
        }}
      />
    </>
  );
}

function CreateApiKeyDialog({
  orgId,
  open,
  onOpenChange,
  onCreated,
}: {
  orgId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (secret: string) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setLoading(true);
    try {
      const result = await createManagementClient(orgId).createApiKey({
        name: name.trim(),
      });
      toast.success("API key created");
      setName("");
      onOpenChange(false);
      onCreated(result.secret);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
              {loading ? "Creating..." : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
