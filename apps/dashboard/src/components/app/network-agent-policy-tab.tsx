import type { Network, RemoteAgentPolicy } from "@tunnet/api/management";
import { inheritRemoteAgentPolicy } from "@tunnet/api/management";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useCan } from "@/hooks/use-permission";
import { useNetworkMutations, useOrgSettings } from "@/lib/queries/management";

function InheritedHint({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-muted-foreground text-[11px]">
      Org default - {label}: {value}
    </p>
  );
}

function formatBool(value: boolean | undefined) {
  if (value === undefined) return "inherit";
  return value ? "ON" : "OFF";
}

function PolicyToggle({
  id,
  label,
  description,
  inherited,
  checked,
  override,
  onOverrideChange,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  inherited: boolean | undefined;
  checked: boolean;
  override: boolean;
  onOverrideChange: (override: boolean) => void;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 border-b border-border/50 py-3 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor={id}>{label}</Label>
          <p className="text-muted-foreground text-xs">{description}</p>
          <InheritedHint label={label} value={formatBool(inherited)} />
        </div>
        <Switch
          id={id}
          checked={override ? checked : (inherited ?? false)}
          onCheckedChange={onCheckedChange}
          disabled={disabled || !override}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={override}
          onChange={(e) => onOverrideChange(e.target.checked)}
          disabled={disabled}
          className="size-3.5 rounded border-border"
        />
        Override org default
      </label>
    </div>
  );
}

export function NetworkAgentPolicyTab({
  orgId,
  network,
}: {
  orgId: string;
  network: Network;
}) {
  const { data: orgSettings, isPending: orgPending } = useOrgSettings(orgId);
  const { data: canUpdate = false } = useCan(orgId, "network", "update");
  const mutations = useNetworkMutations(orgId);

  const orgPolicy = orgSettings?.agentPolicy ?? {};
  const networkOverrides = network.settings.agentPolicy;

  const [mdnsOverride, setMdnsOverride] = useState(false);
  const [mdns, setMdns] = useState(false);
  const [lanOverride, setLanOverride] = useState(false);
  const [lanDiscovery, setLanDiscovery] = useState(false);
  const [mtuOverride, setMtuOverride] = useState(false);
  const [tunnelMtu, setTunnelMtu] = useState("");
  const [autoUpdateOverride, setAutoUpdateOverride] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
  const [relayOverride, setRelayOverride] = useState(false);
  const [preferOrgRelays, setPreferOrgRelays] = useState(false);

  useEffect(() => {
    const policy = networkOverrides;
    setMdnsOverride(policy.mdns !== undefined);
    setMdns(policy.mdns ?? orgPolicy.mdns ?? false);
    setLanOverride(policy.lanDiscovery !== undefined);
    setLanDiscovery(policy.lanDiscovery ?? orgPolicy.lanDiscovery ?? false);
    setMtuOverride(policy.tunnelMtu !== undefined);
    setTunnelMtu(
      policy.tunnelMtu !== undefined ? String(policy.tunnelMtu) : "",
    );
    setAutoUpdateOverride(policy.autoUpdate?.enabled !== undefined);
    setAutoUpdateEnabled(
      policy.autoUpdate?.enabled ?? orgPolicy.autoUpdate?.enabled ?? false,
    );
    setRelayOverride(policy.relay?.preferOrgRelays !== undefined);
    setPreferOrgRelays(
      policy.relay?.preferOrgRelays ??
        orgPolicy.relay?.preferOrgRelays ??
        false,
    );
  }, [networkOverrides, orgPolicy]);

  if (orgPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  const effective = inheritRemoteAgentPolicy(orgPolicy, networkOverrides);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nextOverrides: RemoteAgentPolicy = { ...networkOverrides };
    if (mdnsOverride) nextOverrides.mdns = mdns;
    else delete nextOverrides.mdns;
    if (lanOverride) nextOverrides.lanDiscovery = lanDiscovery;
    else delete nextOverrides.lanDiscovery;
    if (mtuOverride) {
      const mtu = Number(tunnelMtu);
      if (Number.isNaN(mtu) || mtu < 576 || mtu > 9000) {
        toast.error("Tunnel MTU must be between 576 and 9000");
        return;
      }
      nextOverrides.tunnelMtu = mtu;
    } else {
      delete nextOverrides.tunnelMtu;
    }
    if (autoUpdateOverride) {
      nextOverrides.autoUpdate = {
        enabled: autoUpdateEnabled,
        checkIntervalHours:
          networkOverrides.autoUpdate?.checkIntervalHours ??
          orgPolicy.autoUpdate?.checkIntervalHours ??
          6,
      };
    } else {
      delete nextOverrides.autoUpdate;
    }
    if (relayOverride) {
      nextOverrides.relay = { preferOrgRelays };
    } else {
      delete nextOverrides.relay;
    }

    try {
      await mutations.update.mutateAsync({
        networkId: network.id,
        body: { settings: { agentPolicy: nextOverrides } },
      });
      toast.success("Network agent policy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border/70 bg-card/30 p-4">
        <h2 className="text-sm font-medium">Effective policy</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          What agents on this network receive after merging org defaults with
          network overrides.
        </p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">mDNS</dt>
            <dd>{formatBool(effective.mdns)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">LAN discovery</dt>
            <dd>{formatBool(effective.lanDiscovery)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tunnel MTU</dt>
            <dd>{effective.tunnelMtu ?? "default"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prefer org relays</dt>
            <dd>{formatBool(effective.relay?.preferOrgRelays)}</dd>
          </div>
        </dl>
      </div>

      <form className="space-y-2" onSubmit={(e) => void save(e)}>
        <PolicyToggle
          id="network-mdns"
          label="mDNS"
          description="Override org mDNS discovery for this network."
          inherited={orgPolicy.mdns}
          checked={mdns}
          override={mdnsOverride}
          onOverrideChange={setMdnsOverride}
          onCheckedChange={setMdns}
          disabled={!canUpdate}
        />
        <PolicyToggle
          id="network-lan"
          label="LAN discovery"
          description="Override org LAN peer discovery for this network."
          inherited={orgPolicy.lanDiscovery}
          checked={lanDiscovery}
          override={lanOverride}
          onOverrideChange={setLanOverride}
          onCheckedChange={setLanDiscovery}
          disabled={!canUpdate}
        />

        <div className="space-y-2 border-b border-border/50 py-3">
          <Label htmlFor="network-mtu">Tunnel MTU</Label>
          <InheritedHint
            label="Tunnel MTU"
            value={
              orgPolicy.tunnelMtu !== undefined
                ? String(orgPolicy.tunnelMtu)
                : "default"
            }
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={mtuOverride}
              onChange={(e) => setMtuOverride(e.target.checked)}
              disabled={!canUpdate}
              className="size-3.5 rounded border-border"
            />
            Override org default
          </label>
          <Input
            id="network-mtu"
            type="number"
            min={576}
            max={9000}
            placeholder="Org default"
            value={tunnelMtu}
            onChange={(e) => setTunnelMtu(e.target.value)}
            disabled={!canUpdate || !mtuOverride}
            className="max-w-xs"
          />
        </div>

        <PolicyToggle
          id="network-auto-update"
          label="Auto-update"
          description="Override org auto-update default for this network."
          inherited={orgPolicy.autoUpdate?.enabled}
          checked={autoUpdateEnabled}
          override={autoUpdateOverride}
          onOverrideChange={setAutoUpdateOverride}
          onCheckedChange={setAutoUpdateEnabled}
          disabled={!canUpdate}
        />

        <PolicyToggle
          id="network-relays"
          label="Prefer org relays"
          description="Override org relay preference for this network."
          inherited={orgPolicy.relay?.preferOrgRelays}
          checked={preferOrgRelays}
          override={relayOverride}
          onOverrideChange={setRelayOverride}
          onCheckedChange={setPreferOrgRelays}
          disabled={!canUpdate}
        />

        {canUpdate ? (
          <Button type="submit" size="sm" disabled={mutations.update.isPending}>
            {mutations.update.isPending
              ? "Saving..."
              : "Save network overrides"}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
