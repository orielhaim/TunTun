import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { NetworkAgentPolicyTab } from "@/components/app/network-agent-policy-tab";
import { DefinitionFormSheet } from "@/components/app/posture/definition-form-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  describeAssertion,
  describeAssertionsSummary,
  type PostureDefinition,
} from "@/lib/posture-types";
import {
  useNetwork,
  useOrgPostures,
  usePostureMutations,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/networks/$networkId/policy")({
  component: NetworkPolicyPage,
});

function NetworkPolicyPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: network, isPending: networkPending } = useNetwork(
    orgId,
    networkId,
  );
  const { data: postures, isPending: posturesPending } = useOrgPostures(
    orgId,
    networkId,
  );
  const { data: canCreate = false } = useCan(orgId, "posture", "create");
  const { data: canUpdate = false } = useCan(orgId, "posture", "update");
  const { data: canDelete = false } = useCan(orgId, "posture", "delete");
  const mutations = usePostureMutations(orgId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PostureDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PostureDefinition | null>(
    null,
  );

  if (!orgId || networkPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!network) {
    return <p className="text-muted-foreground text-sm">Network not found.</p>;
  }

  const networkPostures =
    postures?.filter((def) => def.networkId === networkId) ?? [];
  const orgPostures = postures?.filter((def) => def.networkId === null) ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Agent policy</h2>
          <p className="text-muted-foreground text-sm">
            Override organization defaults for devices on this network. Unset
            fields inherit from organization settings.
          </p>
        </div>
        <NetworkAgentPolicyTab orgId={orgId} network={network} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Posture definitions</h2>
            <p className="text-muted-foreground text-sm">
              Organization definitions apply everywhere. Network definitions add
              or replace rules for this network only.
            </p>
          </div>
          {canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon className="mr-1.5 size-3.5" />
              Add network definition
            </Button>
          ) : null}
        </div>

        {posturesPending ? (
          <Skeleton className="h-32 w-full" />
        ) : networkPostures.length === 0 && orgPostures.length === 0 ? (
          <EmptyState
            icon={<ShieldCheckIcon className="size-8" />}
            title="No posture definitions"
            description="Create a network-scoped definition or use organization-level definitions from the Posture page."
          />
        ) : (
          <ul className="space-y-3">
            {orgPostures.map((def) => (
              <DefinitionCard
                key={def.id}
                definition={def}
                scopeLabel="Organization"
                canUpdate={false}
                canDelete={false}
              />
            ))}
            {networkPostures.map((def) => (
              <DefinitionCard
                key={def.id}
                definition={def}
                scopeLabel={network.name}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onEdit={() => {
                  setEditing(def);
                  setDialogOpen(true);
                }}
                onDelete={() => setDeleteTarget(def)}
              />
            ))}
          </ul>
        )}
      </section>

      <DefinitionFormSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        loading={mutations.create.isPending || mutations.update.isPending}
        onSubmit={async (values) => {
          try {
            if (editing) {
              await mutations.update.mutateAsync({
                name: editing.name,
                networkId: editing.networkId,
                body: {
                  description: values.description ?? null,
                  assertions: values.assertions,
                },
              });
              toast.success("Posture updated");
            } else {
              await mutations.create.mutateAsync({
                ...values,
                networkId,
              });
              toast.success("Posture created");
            }
            setDialogOpen(false);
            setEditing(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save");
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete posture definition"
        description={`Delete "${deleteTarget?.name}"? Devices using this posture in policies may fail evaluation.`}
        confirmLabel="Delete"
        destructive
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await mutations.remove.mutateAsync({
              name: deleteTarget.name,
              networkId: deleteTarget.networkId,
            });
            toast.success("Posture deleted");
            setDeleteTarget(null);
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

function DefinitionCard({
  definition,
  scopeLabel,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  definition: PostureDefinition;
  scopeLabel: string;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const preview = definition.assertions.slice(0, 2);
  const remaining = definition.assertions.length - preview.length;

  return (
    <li className="rounded-lg border border-border/70 bg-card/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-medium">{definition.name}</h3>
            <Badge variant="secondary">{scopeLabel}</Badge>
            <Badge variant="outline">
              {definition.assertions.length}{" "}
              {definition.assertions.length === 1 ? "rule" : "rules"}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {definition.description ??
              describeAssertionsSummary(definition.assertions)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {canUpdate && onEdit ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${definition.name}`}
              onClick={onEdit}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          ) : null}
          {canDelete && onDelete ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Delete ${definition.name}`}
              onClick={onDelete}
            >
              <TrashIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-border/50 pt-3">
        {preview.map((assertion) => (
          <li key={assertion} className="text-muted-foreground text-xs">
            {describeAssertion(assertion)}
          </li>
        ))}
        {remaining > 0 ? (
          <li className="text-muted-foreground text-xs">+{remaining} more</li>
        ) : null}
      </ul>
    </li>
  );
}
