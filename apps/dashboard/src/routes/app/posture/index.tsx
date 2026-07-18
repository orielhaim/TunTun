import { createFileRoute } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, ShieldCheckIcon, TrashIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { DefinitionFormSheet } from "@/components/app/posture/definition-form-sheet";
import { PosturePageShell } from "@/components/app/posture/posture-page-shell";
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
import { useOrgPostures, usePostureMutations } from "@/lib/queries/management";

export const Route = createFileRoute("/app/posture/")({
  component: PostureDefinitionsPage,
});

function PostureDefinitionsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: postures, isPending } = useOrgPostures(orgId);
  const { data: canCreate = false } = useCan(orgId, "posture", "create");
  const { data: canUpdate = false } = useCan(orgId, "posture", "update");
  const { data: canDelete = false } = useCan(orgId, "posture", "delete");
  const mutations = usePostureMutations(orgId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PostureDefinition | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);

  if (!orgId) {
    return (
      <PosturePageShell>
        <DefinitionsSkeleton />
      </PosturePageShell>
    );
  }

  return (
    <PosturePageShell
      actions={
        canCreate ? (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <PlusIcon className="mr-1.5 size-3.5" />
            Create definition
          </Button>
        ) : undefined
      }
    >
      {isPending ? (
        <DefinitionsSkeleton />
      ) : !postures?.length ? (
        <EmptyState
          icon={<ShieldCheckIcon className="size-8" />}
          title="No posture definitions yet"
          description="A definition is a named set of security rules evaluated on every device - for example requiring disk encryption and an up-to-date antivirus."
          steps={[
            "Create a definition with the rules your fleet must meet",
            "Reference it from access policies to gate network access",
            "Track pass/fail rates on the Compliance tab",
          ]}
          action={
            canCreate ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                Create definition
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Posture definitions">
          {postures.map((def) => (
            <DefinitionCard
              key={def.id}
              definition={def}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onEdit={() => {
                setEditing(def);
                setDialogOpen(true);
              }}
              onDelete={() => setDeleteName(def.name)}
            />
          ))}
        </ul>
      )}

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
                body: {
                  description: values.description ?? null,
                  assertions: values.assertions,
                },
              });
              toast.success("Posture updated");
            } else {
              await mutations.create.mutateAsync(values);
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
        open={deleteName !== null}
        onOpenChange={(open) => !open && setDeleteName(null)}
        title="Delete posture definition"
        description={`Delete "${deleteName}"? Devices using this posture in policies may fail evaluation.`}
        confirmLabel="Delete"
        destructive
        loading={mutations.remove.isPending}
        onConfirm={async () => {
          if (!deleteName) return;
          try {
            await mutations.remove.mutateAsync(deleteName);
            toast.success("Posture deleted");
            setDeleteName(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />
    </PosturePageShell>
  );
}

function DefinitionCard({
  definition,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
}: {
  definition: PostureDefinition;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preview = definition.assertions.slice(0, 3);
  const remaining = definition.assertions.length - preview.length;

  return (
    <li className="rounded-lg border border-border/70 bg-card/30 p-4 transition-colors hover:border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-medium">{definition.name}</h2>
            <Badge variant="secondary">
              {definition.assertions.length}{" "}
              {definition.assertions.length === 1 ? "rule" : "rules"}
            </Badge>
          </div>
          {definition.description ? (
            <p className="text-muted-foreground text-sm">
              {definition.description}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {describeAssertionsSummary(definition.assertions)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {canUpdate ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={`Edit ${definition.name}`}
              onClick={onEdit}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          ) : null}
          {canDelete ? (
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

      <ul className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
        {preview.map((assertion) => (
          <li
            key={assertion}
            className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed"
          >
            <span
              className="bg-foreground/40 mt-1.5 size-1 shrink-0 rounded-full"
              aria-hidden
            />
            <span>{describeAssertion(assertion)}</span>
          </li>
        ))}
        {remaining > 0 ? (
          <li className="text-muted-foreground pl-3 text-xs">
            +{remaining} more
          </li>
        ) : null}
      </ul>
    </li>
  );
}

function DefinitionsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  );
}
