import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AuthorizeCliDialog } from "@/components/app/device-authorize";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, signOut, useSession } from "@/lib/auth-client";

export const Route = createFileRoute("/app/settings/account")({
  validateSearch: (search: Record<string, unknown>) => ({
    user_code:
      typeof search.user_code === "string" ? search.user_code : undefined,
  }),
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const navigate = useNavigate();
  const { user_code: userCodeFromUrl } = Route.useSearch();
  const { data: session } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [cliOpen, setCliOpen] = useState(Boolean(userCodeFromUrl));
  const [cliInitialCode, setCliInitialCode] = useState(userCodeFromUrl);

  useEffect(() => {
    if (!userCodeFromUrl) return;
    setCliInitialCode(userCodeFromUrl);
    setCliOpen(true);
  }, [userCodeFromUrl]);

  function handleCliOpenChange(open: boolean) {
    setCliOpen(open);
    if (!open && userCodeFromUrl) {
      setCliInitialCode(undefined);
      void navigate({
        to: "/app/settings/account",
        search: {},
        replace: true,
      });
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: false,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Failed to change password");
      return;
    }
    toast.success("Password updated");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function handleSignOut() {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/login";
        },
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Account"
        description="Manage your personal account settings."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span>{session?.user.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{session?.user.email}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CLI access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Link the TunTun CLI to this account with a device code from{" "}
            <code className="text-foreground">tuntun login</code>.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setCliInitialCode(undefined);
              setCliOpen(true);
            }}
          >
            Authorize CLI
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="max-w-md space-y-4"
            onSubmit={(e) => void changePassword(e)}
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      <AuthorizeCliDialog
        open={cliOpen}
        onOpenChange={handleCliOpenChange}
        initialCode={cliInitialCode}
      />
    </>
  );
}
