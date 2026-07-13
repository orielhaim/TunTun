import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyField } from "@/components/app/copy-field";
import { EntityStatus } from "@/components/app/entity-status";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { authClient } from "@/lib/auth-client";
import {
  useInternalCa,
  useInternalCaMutations,
  useRelays,
  useSsoSettings,
  useSsoSettingsMutations,
  useTunnelSettings,
  useTunnelSettingsMutations,
} from "@/lib/queries/management";

export const Route = createFileRoute("/app/settings/")({
  component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
  const { data: activeOrg } = authClient.useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const isOwner = role?.includes("owner") ?? false;
  const [name, setName] = useState(activeOrg?.name ?? "");
  const [quickEnrollEnabled, setQuickEnrollEnabled] = useState(
    activeOrg?.quickEnrollEnabled ?? true,
  );
  const [loading, setLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [rotateOpen, setRotateOpen] = useState(false);

  const { data: ca, isPending: caPending } = useInternalCa(orgId);
  const { data: tunnelSettings, isPending: settingsPending } =
    useTunnelSettings(orgId);
  const { data: ssoProvider, isPending: ssoPending } = useSsoSettings(orgId);
  const { data: relays } = useRelays(orgId);
  const caMutations = useInternalCaMutations(orgId);
  const settingsMutations = useTunnelSettingsMutations(orgId);
  const ssoMutations = useSsoSettingsMutations(orgId);

  const [defaultRelayId, setDefaultRelayId] = useState("auto");
  const [defaultTtl, setDefaultTtl] = useState("");
  const [maxTunnels, setMaxTunnels] = useState("10");
  const [customDomain, setCustomDomain] = useState("");
  const [peerDnsSuffix, setPeerDnsSuffix] = useState("");

  const [ssoDomain, setSsoDomain] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [discoveryUrl, setDiscoveryUrl] = useState("");
  const [scopes, setScopes] = useState("openid profile email");
  const [removeSsoOpen, setRemoveSsoOpen] = useState(false);

  useEffect(() => {
    if (!tunnelSettings) return;
    setDefaultRelayId(tunnelSettings.defaultRelayId ?? "auto");
    setDefaultTtl(
      tunnelSettings.defaultTtlSeconds
        ? String(tunnelSettings.defaultTtlSeconds)
        : "",
    );
    setMaxTunnels(String(tunnelSettings.maxTunnelsPerMachine));
    setCustomDomain(tunnelSettings.customTunnelDomain ?? "");
    setPeerDnsSuffix(tunnelSettings.peerDnsSuffix ?? "");
  }, [tunnelSettings]);

  useEffect(() => {
    if (!ssoProvider) {
      setSsoDomain("");
      setIssuerUrl("");
      setClientId("");
      setDiscoveryUrl("");
      setScopes("openid profile email");
      setClientSecret("");
      return;
    }
    setSsoDomain(ssoProvider.domain);
    setIssuerUrl(ssoProvider.issuer);
    setClientId(ssoProvider.clientId ?? "");
    setDiscoveryUrl(ssoProvider.discoveryEndpoint ?? "");
    setScopes(ssoProvider.scopes.join(" ") || "openid profile email");
    setClientSecret("");
  }, [ssoProvider]);

  useEffect(() => {
    if (!activeOrg) return;
    setName(activeOrg.name);
    setQuickEnrollEnabled(activeOrg.quickEnrollEnabled ?? true);
  }, [activeOrg]);

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setLoading(true);
    const { error } = await authClient.organization.update({
      organizationId: orgId,
      data: {
        name: name.trim(),
        quickEnrollEnabled,
      },
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

  async function saveTunnelSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await settingsMutations.update.mutateAsync({
        defaultRelayId: defaultRelayId === "auto" ? null : defaultRelayId,
        defaultTtlSeconds: defaultTtl.trim() ? Number(defaultTtl) : null,
        maxTunnelsPerMachine: Number(maxTunnels) || 10,
        customTunnelDomain: customDomain.trim() || null,
        peerDnsSuffix: peerDnsSuffix.trim() || null,
      });
      toast.success("Tunnel settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function saveSsoSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      await ssoMutations.upsert.mutateAsync({
        issuer: issuerUrl.trim(),
        domain: ssoDomain.trim(),
        clientId: clientId.trim(),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        discoveryEndpoint: discoveryUrl.trim() || null,
        scopes: scopes.trim().split(/\s+/).filter(Boolean),
      });
      toast.success("SSO settings saved");
      setClientSecret("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function removeSsoSettings() {
    try {
      await ssoMutations.remove.mutateAsync();
      toast.success("SSO provider removed");
      setRemoveSsoOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
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
            onSubmit={(e) => void saveGeneral(e)}
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
            <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
              <div className="space-y-1">
                <Label htmlFor="quick-enroll">Quick enroll</Label>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Allow machines to join without a token. They stay pending
                  until an admin approves.
                </p>
              </div>
              <Switch
                id="quick-enroll"
                checked={quickEnrollEnabled}
                onCheckedChange={setQuickEnrollEnabled}
                disabled={!isAdmin}
              />
            </div>
            {isAdmin ? (
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Internal CA</CardTitle>
        </CardHeader>
        <CardContent className="max-w-2xl space-y-4">
          <p className="text-muted-foreground text-sm leading-relaxed">
            TunTun issues short-lived certificates from an organization internal
            CA when you create HTTPS serves. Agents trust this CA so peers can
            connect to mesh hostnames without public DNS.
          </p>
          {caPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">Status</span>
                <EntityStatus
                  status={ca?.status ?? "missing"}
                  label={
                    ca?.status === "missing"
                      ? "Missing"
                      : ca?.status === "expired"
                        ? "Expired"
                        : undefined
                  }
                />
              </div>
              {ca?.fingerprintSha256 ? (
                <CopyField
                  label="Fingerprint (SHA-256)"
                  value={ca.fingerprintSha256}
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No CA issued yet. Creating a serve will provision one.
                </p>
              )}
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-xs">Not before</p>
                  <p>
                    {ca?.notBefore
                      ? new Date(ca.notBefore).toLocaleString()
                      : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Not after</p>
                  <p>
                    {ca?.notAfter
                      ? `${new Date(ca.notAfter).toLocaleString()} (${formatDistanceToNow(new Date(ca.notAfter), { addSuffix: true })})`
                      : "-"}
                  </p>
                </div>
              </div>
              {isAdmin ? (
                <Button variant="outline" onClick={() => setRotateOpen(true)}>
                  Rotate CA
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tunnel defaults</CardTitle>
        </CardHeader>
        <CardContent className="max-w-2xl">
          {settingsPending ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => void saveTunnelSettings(e)}
            >
              <p className="text-muted-foreground text-xs leading-relaxed">
                Point wildcard DNS{" "}
                <span className="font-mono">*.your-domain</span> at the relay
                IP. Provide TLS via{" "}
                <span className="font-mono">--cert/--key</span> or{" "}
                <span className="font-mono">--acme-domain</span> (HTTP-01,
                non-wildcard).
              </p>
              <div className="space-y-2">
                <Label>Default relay</Label>
                <Select
                  value={defaultRelayId}
                  onValueChange={(value) => setDefaultRelayId(value ?? "auto")}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (closest healthy)</SelectItem>
                    {(relays ?? []).map((relay) => (
                      <SelectItem key={relay.id} value={relay.id}>
                        {relay.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="default-ttl">Default TTL (seconds)</Label>
                  <Input
                    id="default-ttl"
                    type="number"
                    min={1}
                    placeholder="Never"
                    value={defaultTtl}
                    onChange={(e) => setDefaultTtl(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-tunnels">Max tunnels per machine</Label>
                  <Input
                    id="max-tunnels"
                    type="number"
                    min={1}
                    max={1000}
                    value={maxTunnels}
                    onChange={(e) => setMaxTunnels(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-domain">Custom tunnel domain</Label>
                <Input
                  id="custom-domain"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="tunnels.example.com"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="peer-dns">Peer DNS suffix</Label>
                <Input
                  id="peer-dns"
                  value={peerDnsSuffix}
                  onChange={(e) => setPeerDnsSuffix(e.target.value)}
                  placeholder="tuntun"
                  disabled={!isAdmin}
                />
                <p className="text-muted-foreground text-xs">
                  Mesh hostnames resolve as{" "}
                  <span className="font-mono">
                    hostname.{peerDnsSuffix.trim() || "tuntun"}
                  </span>
                  .
                </p>
              </div>
              {isAdmin ? (
                <Button
                  type="submit"
                  disabled={settingsMutations.update.isPending}
                >
                  {settingsMutations.update.isPending
                    ? "Saving..."
                    : "Save tunnel settings"}
                </Button>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SSO / SSH check-mode</CardTitle>
        </CardHeader>
        <CardContent className="max-w-2xl">
          {ssoPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => void saveSsoSettings(e)}
            >
              <p className="text-muted-foreground text-sm leading-relaxed">
                Register an external OIDC identity provider for this
                organization. Dashboard login and SSH check-mode re-auth use
                Better Auth SSO. Without a provider, SSH check-mode falls back
                to the TunTun session.
              </p>
              {ssoProvider ? (
                <p className="text-muted-foreground text-xs">
                  Provider ID: <code>{ssoProvider.providerId}</code>
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="sso-domain">Email domain</Label>
                <Input
                  id="sso-domain"
                  value={ssoDomain}
                  onChange={(e) => setSsoDomain(e.target.value)}
                  placeholder="company.com"
                  disabled={!isAdmin}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issuer-url">Issuer URL</Label>
                <Input
                  id="issuer-url"
                  value={issuerUrl}
                  onChange={(e) => setIssuerUrl(e.target.value)}
                  placeholder="https://accounts.example.com"
                  disabled={!isAdmin}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="client-id">Client ID</Label>
                  <Input
                    id="client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    disabled={!isAdmin}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-secret">Client secret</Label>
                  <Input
                    id="client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={
                      ssoProvider?.clientSecretSet
                        ? "Leave blank to keep current"
                        : "Secret"
                    }
                    disabled={!isAdmin}
                    autoComplete="new-password"
                    required={!ssoProvider?.clientSecretSet}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discovery-url">Discovery URL (optional)</Label>
                <Input
                  id="discovery-url"
                  value={discoveryUrl}
                  onChange={(e) => setDiscoveryUrl(e.target.value)}
                  placeholder="Defaults to /.well-known/openid-configuration"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sso-scopes">Scopes</Label>
                <Input
                  id="sso-scopes"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>
              {isAdmin ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={ssoMutations.upsert.isPending}
                  >
                    {ssoMutations.upsert.isPending
                      ? "Saving..."
                      : ssoProvider
                        ? "Update SSO provider"
                        : "Register SSO provider"}
                  </Button>
                  {ssoProvider ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRemoveSsoOpen(true)}
                      disabled={ssoMutations.remove.isPending}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">DNS / Tunnel domains</CardTitle>
        </CardHeader>
        <CardContent className="max-w-2xl space-y-3 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            Self-hosted relays need a wildcard A/AAAA record so public tunnels
            resolve:{" "}
            <span className="font-mono text-foreground">
              *.
              {customDomain.trim() ||
                relays?.[0]?.domain ||
                "relay.example.com"}
            </span>{" "}
            → your relay&apos;s public IP.
          </p>
          <p className="text-muted-foreground">
            Custom tunnel domain is editable above (
            <span className="font-mono text-foreground">
              customTunnelDomain
            </span>
            ). Public hostnames become{" "}
            <span className="font-mono text-foreground">
              subdomain.
              {customDomain.trim() || "your-domain"}
            </span>
            .
          </p>
          <p className="text-muted-foreground">
            PeerDNS suffix (
            <span className="font-mono text-foreground">
              {peerDnsSuffix.trim() || "tuntun"}
            </span>
            ) is used for mesh name resolution on agents - peers reach each
            other as{" "}
            <span className="font-mono text-foreground">
              hostname.{peerDnsSuffix.trim() || "tuntun"}
            </span>{" "}
            without public DNS.
          </p>
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

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Rotate internal CA"
        description="Rotating the CA invalidates all existing serve certificates. Agents will need fresh certs on next serve start."
        confirmLabel="Rotate CA"
        destructive
        loading={caMutations.rotate.isPending}
        onConfirm={async () => {
          try {
            await caMutations.rotate.mutateAsync();
            toast.success("Internal CA rotated");
            setRotateOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to rotate CA",
            );
          }
        }}
      />

      <ConfirmDialog
        open={removeSsoOpen}
        onOpenChange={setRemoveSsoOpen}
        title="Remove SSO provider"
        description="SSH check-mode will fall back to TunTun session authentication. Dashboard SSO login for this org domain will stop working."
        confirmLabel="Remove SSO"
        destructive
        loading={ssoMutations.remove.isPending}
        onConfirm={() => void removeSsoSettings()}
      />
    </>
  );
}
