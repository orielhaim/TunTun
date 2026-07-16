import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  DEFAULT_DYNAMIC_ROLE_POSITION,
  STATIC_ROLE_NAMES,
  STATIC_ROLE_POSITIONS,
  type StaticRoleName,
  statement,
} from "@tunnet/api/auth";
import { LockIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { authClient, useActiveOrganization } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { tableHeaderClassName } from "@/lib/user-utils";

export const Route = createFileRoute("/app/roles")({
  component: RolesPage,
});

type RoleRow = {
  id: string;
  role: string;
  position: number;
  color?: string | null;
  permission: Record<string, string[]>;
  locked: boolean;
};

const RESOURCE_ACTIONS = Object.entries(statement) as Array<
  [keyof typeof statement, readonly string[]]
>;

function RolesPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canManage = false } = useCan(orgId, "ac", "create");
  const { data: canUpdate = false } = useCan(orgId, "ac", "update");
  const { data: canDelete = false } = useCan(orgId, "ac", "delete");
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [deleteRoleName, setDeleteRoleName] = useState<string | null>(null);

  const { data: dynamicRoles, isPending } = useQuery({
    queryKey: orgId ? [...queryKeys.org(orgId), "roles"] : ["roles"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await authClient.organization.listRoles({
        query: { organizationId: orgId! },
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = useMemo<RoleRow[]>(() => {
    const staticRows: RoleRow[] = STATIC_ROLE_NAMES.map((name) => ({
      id: `static:${name}`,
      role: name,
      position: STATIC_ROLE_POSITIONS[name as StaticRoleName],
      permission: {},
      locked: true,
    }));

    const dynamicRows: RoleRow[] = (dynamicRoles ?? []).map((role) => {
      const permission =
        typeof role.permission === "string"
          ? (JSON.parse(role.permission) as Record<string, string[]>)
          : ((role.permission as Record<string, string[]>) ?? {});
      return {
        id: role.id,
        role: role.role,
        position:
          typeof (role as { position?: number }).position === "number"
            ? (role as { position: number }).position
            : DEFAULT_DYNAMIC_ROLE_POSITION,
        color: (role as { color?: string | null }).color,
        permission,
        locked: false,
      };
    });

    return [...staticRows, ...dynamicRows].sort(
      (a, b) => b.position - a.position,
    );
  }, [dynamicRoles]);

  function invalidate() {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(orgId), "roles"],
      });
    }
  }

  const columns = useMemo<ColumnDef<RoleRow>[]>(
    () => [
      {
        id: "role",
        header: "Role",
        meta: { headerClassName: tableHeaderClassName },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.color ? (
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: row.original.color }}
              />
            ) : null}
            <span className="font-medium capitalize">{row.original.role}</span>
            {row.original.locked ? (
              <LockIcon className="text-muted-foreground size-3.5" />
            ) : null}
          </div>
        ),
      },
      {
        id: "position",
        header: "Position",
        meta: { headerClassName: tableHeaderClassName },
        cell: ({ row }) => row.original.position,
      },
      {
        id: "permissions",
        header: "Permissions",
        meta: { headerClassName: tableHeaderClassName },
        cell: ({ row }) => {
          if (row.original.locked) {
            return (
              <span className="text-muted-foreground text-sm">System role</span>
            );
          }
          const count = Object.values(row.original.permission).reduce(
            (sum, actions) => sum + actions.length,
            0,
          );
          return (
            <span className="text-muted-foreground text-sm">
              {count} permission{count === 1 ? "" : "s"}
            </span>
          );
        },
      },
      ...(canUpdate || canDelete
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-10" },
              cell: ({ row }: { row: { original: RoleRow } }) => {
                if (row.original.locked) return null;
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                        />
                      }
                    >
                      <MoreHorizontalIcon className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        {canUpdate ? (
                          <DropdownMenuItem
                            onClick={() => setEditRole(row.original)}
                          >
                            Edit role
                          </DropdownMenuItem>
                        ) : null}
                        {canDelete ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteRoleName(row.original.role)}
                          >
                            Delete role
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            } satisfies ColumnDef<RoleRow>,
          ]
        : []),
    ],
    [canDelete, canUpdate],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Roles"
        description="Static system roles and custom organization roles with Discord-style hierarchy."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" />
              Create role
            </Button>
          ) : undefined
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No roles"
          description="Create a custom role to get started."
        />
      ) : (
        <DataTable columns={columns} data={rows} getRowId={(row) => row.id} />
      )}

      <RoleEditorDialog
        orgId={orgId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={invalidate}
        mode="create"
      />

      <RoleEditorDialog
        orgId={orgId}
        open={editRole !== null}
        onOpenChange={(open) => !open && setEditRole(null)}
        onSuccess={invalidate}
        mode="edit"
        initial={editRole}
      />

      <ConfirmDialog
        open={deleteRoleName !== null}
        onOpenChange={(open) => !open && setDeleteRoleName(null)}
        title="Delete role"
        description="Members with this role must be reassigned before deletion succeeds."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!orgId || !deleteRoleName) return;
          const { error } = await authClient.organization.deleteRole({
            roleName: deleteRoleName,
            organizationId: orgId,
          });
          if (error) {
            toast.error(error.message);
            return;
          }
          toast.success("Role deleted");
          setDeleteRoleName(null);
          invalidate();
        }}
      />
    </div>
  );
}

function RoleEditorDialog({
  orgId,
  open,
  onOpenChange,
  onSuccess,
  mode,
  initial,
}: {
  orgId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  mode: "create" | "edit";
  initial?: RoleRow | null;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState(
    String(DEFAULT_DYNAMIC_ROLE_POSITION),
  );
  const [color, setColor] = useState("#64748b");
  const [permission, setPermission] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.role);
      setPosition(String(initial.position));
      setColor(initial.color ?? "#64748b");
      setPermission(initial.permission);
    } else {
      setName("");
      setPosition(String(DEFAULT_DYNAMIC_ROLE_POSITION));
      setColor("#64748b");
      setPermission({});
    }
  }, [open, mode, initial]);

  function toggleAction(resource: string, action: string) {
    setPermission((prev) => {
      const current = new Set(prev[resource] ?? []);
      if (current.has(action)) current.delete(action);
      else current.add(action);
      const next = { ...prev };
      if (current.size === 0) delete next[resource];
      else next[resource] = [...current];
      return next;
    });
  }

  async function submit() {
    if (!orgId) return;
    const roleName = name.trim().toLowerCase();
    if (!roleName) {
      toast.error("Role name is required");
      return;
    }
    const positionNum = Number(position);
    if (!Number.isFinite(positionNum)) {
      toast.error("Position must be a number");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        const { error } = await authClient.organization.createRole({
          role: roleName,
          permission,
          organizationId: orgId,
          additionalFields: {
            position: positionNum,
            color,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Role created");
      } else {
        const { error } = await authClient.organization.updateRole({
          roleName: initial?.role,
          organizationId: orgId,
          data: {
            roleName,
            permission,
            position: positionNum,
            color,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Role updated");
      }
      onOpenChange(false);
      onSuccess();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create role" : "Edit role"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="moderator"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="role-position">Position</Label>
              <Input
                id="role-position"
                type="number"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-color">Color</Label>
              <Input
                id="role-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3">
            <Label>Permissions</Label>
            <div className="flex max-h-64 flex-col gap-3 overflow-y-auto rounded-md border p-3">
              {RESOURCE_ACTIONS.map(([resource, actions]) => (
                <div key={resource} className="space-y-1.5">
                  <div className="text-sm font-medium capitalize">
                    {resource}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {actions.map((action) => {
                      const checked = (permission[resource] ?? []).includes(
                        action,
                      );
                      return (
                        <Button
                          key={action}
                          type="button"
                          size="sm"
                          variant={checked ? "default" : "outline"}
                          onClick={() => toggleAction(resource, action)}
                        >
                          {action}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
