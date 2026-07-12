import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { EnrollmentToken } from "@tuntun/api/management";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EnrollmentTokenDialog } from "@/components/app/enrollment-token-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { createManagementClient } from "@/lib/management-client";
import { useEnrollmentTokens } from "@/lib/queries/management";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/app/networks/$networkId/enrollment")({
  component: NetworkEnrollmentPage,
});

function NetworkEnrollmentPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: tokens, isPending } = useEnrollmentTokens(orgId, networkId);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeHash, setRevokeHash] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const columns = useMemo<ColumnDef<EnrollmentToken>[]>(
    () => [
      {
        id: "tokenHash",
        header: "Token hash",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.tokenHash.slice(0, 16)}…
          </span>
        ),
      },
      {
        id: "expires",
        header: "Expires",
        cell: ({ row }) => (
          <span className="text-sm">
            {formatDistanceToNow(new Date(row.original.expiresAt), {
              addSuffix: true,
            })}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDistanceToNow(new Date(row.original.createdAt), {
              addSuffix: true,
            })}
          </span>
        ),
      },
      ...(isAdmin
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-10" },
              cell: ({ row }: { row: { original: EnrollmentToken } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRevokeHash(row.original.tokenHash)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<EnrollmentToken>,
          ]
        : []),
    ],
    [isAdmin],
  );

  async function revoke() {
    if (!orgId || !revokeHash) return;
    setRevoking(true);
    try {
      await createManagementClient(orgId).revokeEnrollmentToken(
        networkId,
        revokeHash,
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.enrollmentTokens(orgId, networkId),
      });
      toast.success("Token revoked");
      setRevokeHash(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Active enrollment tokens for this network.
        </p>
        {isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            New token
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : (tokens?.length ?? 0) === 0 ? (
        <EmptyState
          title="No active tokens"
          description="Generate a token to enroll a new machine."
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>New token</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={tokens ?? []}
          getRowId={(row) => row.tokenHash}
        />
      )}

      {orgId ? (
        <EnrollmentTokenDialog
          orgId={orgId}
          defaultNetworkId={networkId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}

      <ConfirmDialog
        open={revokeHash !== null}
        onOpenChange={(open) => !open && setRevokeHash(null)}
        title="Revoke token"
        description="This token will no longer be usable for enrollment."
        confirmLabel="Revoke"
        destructive
        loading={revoking}
        onConfirm={revoke}
      />
    </>
  );
}
