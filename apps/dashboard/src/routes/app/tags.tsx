import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { TagDefinition } from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { TagOwnerCombobox } from "@/components/app/tag-combobox";
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
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  usePolicyEntityMutations,
  useTagDefinitions,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/tags")({
  component: TagsPage,
});

function TagsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canManage = false } = useCan(orgId, "tag", "create");
  const { data: tags, isPending } = useTagDefinitions(orgId);
  const mutations = usePolicyEntityMutations(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<TagDefinition>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Tag",
        cell: ({ row }) => (
          <span className="font-mono text-sm">tag:{row.original.name}</span>
        ),
      },
      {
        id: "machines",
        header: "Machines",
        cell: ({ row }) => (
          <span className="tabular-nums text-sm">
            {row.original.machineCount ?? 0}
          </span>
        ),
      },
      {
        id: "owners",
        header: "Owners",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.owners.length > 0
              ? row.original.owners.join(", ")
              : "—"}
          </span>
        ),
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) =>
          formatDistanceToNow(new Date(row.original.createdAt), {
            addSuffix: true,
          }),
      },
      ...(canManage
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-10" },
              cell: ({ row }: { row: { original: TagDefinition } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(row.original.id)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<TagDefinition>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <>
      <PageHeader
        title="Tags"
        description="ACL identity for machines. Owners control who can assign each tag."
      />
      <div className="space-y-3 p-4 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Use tags in access rules (`tag:prod → tag:db`). Labels are separate
            metadata for search and filtering.
          </p>
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Add tag
            </Button>
          ) : null}
        </div>

        {isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (tags?.length ?? 0) === 0 ? (
          <EmptyState
            title="No tags"
            description="Create a tag definition, then assign it to machines."
            action={
              canManage ? (
                <Button onClick={() => setCreateOpen(true)}>Add tag</Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={tags ?? []}
            getRowId={(row) => row.id}
          />
        )}
      </div>

      <CreateTagDialog
        orgId={orgId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={mutations.createTagDefinition.isPending}
        onSubmit={async (body) => {
          try {
            await mutations.createTagDefinition.mutateAsync(body);
            toast.success("Tag created");
            setCreateOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create tag",
            );
          }
        }}
      />

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete tag"
        description="Removes the tag definition. Machines keep assignments until cleared."
        confirmLabel="Delete"
        destructive
        loading={mutations.deleteTagDefinition.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await mutations.deleteTagDefinition.mutateAsync(deleteId);
            toast.success("Tag deleted");
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

function CreateTagDialog({
  orgId,
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  orgId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (body: { name: string; owners: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [userOwners, setUserOwners] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const users = userOwners
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.startsWith("user:") ? s : `user:${s}`));
    await onSubmit({
      name: name.trim(),
      owners: [...owners, ...users],
    });
    setName("");
    setOwners([]);
    setUserOwners("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production"
                pattern="^[a-z0-9][a-z0-9-_]*$"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-owners">Tag owners (optional)</Label>
              <TagOwnerCombobox
                id="tag-owners"
                orgId={orgId}
                value={owners}
                onValueChange={setOwners}
                placeholder="Search tag:… or autogroup:admin"
                disabled={loading}
              />
              <p className="text-muted-foreground text-xs">
                Defaults to you if empty. Tag owners may assign this tag.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-user-owners">User owners (optional)</Label>
              <Input
                id="tag-user-owners"
                value={userOwners}
                onChange={(e) => setUserOwners(e.target.value)}
                placeholder="you@company.com"
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
            <Button type="submit" disabled={loading || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
