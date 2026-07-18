import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  DeviceGroup,
  TagDefinition,
  UserGroup,
} from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import {
  useDeviceGroups,
  usePolicyEntityMutations,
  useTagDefinitions,
  useUserGroups,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canManage = false } = useCan(orgId, "policy", "update");

  return (
    <>
      <PageHeader
        title="Groups"
        description="User groups, device groups, and tag definitions for policy selectors."
      />

      <Tabs defaultValue="users" className="gap-6">
        <TabsList>
          <TabsTrigger value="users">User groups</TabsTrigger>
          <TabsTrigger value="devices">Device groups</TabsTrigger>
          <TabsTrigger value="tags">Tag definitions</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UserGroupsPanel orgId={orgId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="devices">
          <DeviceGroupsPanel orgId={orgId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="tags">
          <TagDefinitionsPanel orgId={orgId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function UserGroupsPanel({
  orgId,
  canManage,
}: {
  orgId: string | undefined;
  canManage: boolean;
}) {
  const { data: groups, isPending } = useUserGroups(orgId);
  const mutations = usePolicyEntityMutations(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<UserGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.name}</span>
        ),
      },
      {
        id: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.description ?? "—"}
          </span>
        ),
      },
      {
        id: "members",
        header: "Members",
        cell: ({ row }) => row.original.members?.length ?? 0,
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
              cell: ({ row }: { row: { original: UserGroup } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(row.original.id)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<UserGroup>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Named sets of users for ACL source selectors.
        </p>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Add user group
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (groups?.length ?? 0) === 0 ? (
        <EmptyState
          title="No user groups"
          description="Create a group to reference users by name in policies."
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                Add user group
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={groups ?? []}
          getRowId={(row) => row.id}
        />
      )}

      <CreateUserGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={mutations.createUserGroup.isPending}
        onSubmit={async (body) => {
          try {
            await mutations.createUserGroup.mutateAsync(body);
            toast.success("User group created");
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
        title="Delete user group"
        description="Policies referencing this group name will no longer match."
        confirmLabel="Delete"
        destructive
        loading={mutations.deleteUserGroup.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await mutations.deleteUserGroup.mutateAsync(deleteId);
            toast.success("User group deleted");
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

function DeviceGroupsPanel({
  orgId,
  canManage,
}: {
  orgId: string | undefined;
  canManage: boolean;
}) {
  const { data: groups, isPending } = useDeviceGroups(orgId);
  const mutations = usePolicyEntityMutations(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<DeviceGroup>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.name}</span>
        ),
      },
      {
        id: "description",
        header: "Description",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.description ?? "—"}
          </span>
        ),
      },
      {
        id: "members",
        header: "Members",
        cell: ({ row }) => row.original.members?.length ?? 0,
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
              cell: ({ row }: { row: { original: DeviceGroup } }) => (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteId(row.original.id)}
                >
                  <TrashIcon className="size-4" />
                </Button>
              ),
            } satisfies ColumnDef<DeviceGroup>,
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Named sets of endpoints for ACL selectors.
        </p>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon className="mr-2 size-4" />
            Add device group
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : (groups?.length ?? 0) === 0 ? (
        <EmptyState
          title="No device groups"
          description="Create a group to reference devices by name in policies."
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                Add device group
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={groups ?? []}
          getRowId={(row) => row.id}
        />
      )}

      <CreateDeviceGroupDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={mutations.createDeviceGroup.isPending}
        onSubmit={async (body) => {
          try {
            await mutations.createDeviceGroup.mutateAsync(body);
            toast.success("Device group created");
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
        title="Delete device group"
        description="Policies referencing this group name will no longer match."
        confirmLabel="Delete"
        destructive
        loading={mutations.deleteDeviceGroup.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await mutations.deleteDeviceGroup.mutateAsync(deleteId);
            toast.success("Device group deleted");
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

function TagDefinitionsPanel({
  orgId,
  canManage,
}: {
  orgId: string | undefined;
  canManage: boolean;
}) {
  const { data: tags, isPending } = useTagDefinitions(orgId);
  const mutations = usePolicyEntityMutations(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<TagDefinition>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.name}</span>
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Owned tags usable in policy selectors and device labels.
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
          title="No tag definitions"
          description="Define tags before assigning them to devices or policies."
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

      <CreateTagDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        loading={mutations.createTagDefinition.isPending}
        onSubmit={async (body) => {
          try {
            await mutations.createTagDefinition.mutateAsync(body);
            toast.success("Tag definition created");
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
        title="Delete tag definition"
        description="This removes the tag definition; existing device labels are unchanged."
        confirmLabel="Delete"
        destructive
        loading={mutations.deleteTagDefinition.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await mutations.deleteTagDefinition.mutateAsync(deleteId);
            toast.success("Tag definition deleted");
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

function CreateUserGroupDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (body: {
    name: string;
    description?: string;
    members: { email?: string }[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const memberList = members
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((email) => ({ email }));
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      members: memberList,
    });
    setName("");
    setDescription("");
    setMembers("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add user group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ug-name">Name</Label>
              <Input
                id="ug-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="engineering"
                pattern="^[a-z0-9][a-z0-9-_]*$"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ug-desc">Description</Label>
              <Input
                id="ug-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ug-members">Members (emails)</Label>
              <Textarea
                id="ug-members"
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="alice@example.com, bob@example.com"
                rows={3}
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDeviceGroupDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (body: {
    name: string;
    description?: string;
    members: { endpointId: string }[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const memberList = members
      .split(/[,\n\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((endpointId) => ({ endpointId }));
    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      members: memberList,
    });
    setName("");
    setDescription("");
    setMembers("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add device group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dg-name">Name</Label>
              <Input
                id="dg-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="prod-servers"
                pattern="^[a-z0-9][a-z0-9-_]*$"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dg-desc">Description</Label>
              <Input
                id="dg-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dg-members">Members (endpoint IDs)</Label>
              <Textarea
                id="dg-members"
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder="endpoint-id-1, endpoint-id-2"
                rows={3}
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateTagDialog({
  open,
  onOpenChange,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onSubmit: (body: { name: string; owners: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [owners, setOwners] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ownerList = owners
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await onSubmit({ name: name.trim(), owners: ownerList });
    setName("");
    setOwners("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Add tag definition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="prod"
                pattern="^[a-z0-9][a-z0-9-_]*$"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag-owners">Owners</Label>
              <Input
                id="tag-owners"
                value={owners}
                onChange={(e) => setOwners(e.target.value)}
                placeholder="group:eng, user@example.com"
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
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
