import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { authClient, useActiveOrganization } from "@/lib/auth-client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings/")({
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const isOwner = role?.includes("owner") ?? false;
  const [name, setName] = useState(activeOrg?.name ?? "");
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setLoading(true);
    const { error } = await authClient.organization.update({
      organizationId: orgId,
      data: { name: name.trim() },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to update organization");
      return;
    }
    toast.success("Organization updated");
  }

  async function deleteOrg() {
    if (!orgId || deleteConfirm !== activeOrg?.name) return;
    const { error } = await authClient.organization.delete({
      organizationId: orgId,
    });
    if (error) {
      toast.error(error.message ?? "Failed to delete organization");
      return;
    }
    toast.success("Organization deleted");
    window.location.href = "/app/onboarding";
  }

  return (
    <>
      <PageHeader
        title="Organization settings"
        description="Manage your organization profile."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-md space-y-4"
            onSubmit={(e) => void saveName(e)}
          >
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={activeOrg?.slug ?? ""} disabled />
            </div>
            {isAdmin ? (
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {isOwner ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Deleting this organization removes all networks, machines, and
              members.
            </p>
            {!deleteOpen ? (
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete organization
              </Button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm">
                  Type <strong>{activeOrg?.name}</strong> to confirm.
                </p>
                <Input
                  placeholder={activeOrg?.name}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleteConfirm !== activeOrg?.name}
                    onClick={() => void deleteOrg()}
                  >
                    Delete organization
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
