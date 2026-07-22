import type {
  ConfigSource,
  EffectiveAgentConfig,
} from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeviceEffectiveConfig,
  useNetworks,
} from "@/lib/queries/management";
import { cn } from "@/lib/utils";

type ResolvedSetting<T> = {
  value: T;
  source: ConfigSource;
  remoteValue?: T;
};

function formatBool(value: boolean) {
  return value ? "ON" : "OFF";
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return formatBool(value);
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "—";
  }
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function sourceBadgeLabel(source: ConfigSource) {
  switch (source) {
    case "default":
      return "default";
    case "remote":
      return "remote policy";
    case "local":
      return "local override";
  }
}

function sourceBadgeVariant(
  source: ConfigSource,
): "default" | "secondary" | "outline" {
  switch (source) {
    case "default":
      return "secondary";
    case "remote":
      return "default";
    case "local":
      return "outline";
  }
}

function ConfigRow<T>({
  label,
  setting,
}: {
  label: string;
  setting: ResolvedSetting<T>;
}) {
  const isLocal = setting.source === "local";
  const hasRemote =
    isLocal &&
    setting.remoteValue !== undefined &&
    setting.remoteValue !== null;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <div className="min-w-0 text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              isLocal && "font-mono text-xs",
            )}
          >
            {isLocal ? "🔒 " : null}
            {formatValue(setting.value)}
          </span>
          <Badge
            variant={sourceBadgeVariant(setting.source)}
            className="text-[10px]"
          >
            {sourceBadgeLabel(setting.source)}
          </Badge>
        </div>
        {hasRemote ? (
          <p className="text-muted-foreground mt-1 text-[11px]">
            remote policy: {formatValue(setting.remoteValue)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LocalRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className="min-w-0 text-right font-mono text-xs break-all">
        {formatValue(value)}
      </span>
    </div>
  );
}

function ConfigSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">{children}</CardContent>
    </Card>
  );
}

function EffectiveConfigView({ config }: { config: EffectiveAgentConfig }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ConfigSection title="Discovery & networking">
        <ConfigRow label="mDNS" setting={config.mdns} />
        <ConfigRow label="LAN discovery" setting={config.lanDiscovery} />
        <ConfigRow label="Tunnel MTU" setting={config.tunnelMtu} />
        <ConfigRow label="Prefer org relays" setting={config.preferOrgRelays} />
      </ConfigSection>

      <ConfigSection title="Auto-update">
        <ConfigRow
          label="Auto-update enabled"
          setting={config.autoUpdateEnabled}
        />
        <ConfigRow
          label="Check interval (hours)"
          setting={config.autoUpdateCheckIntervalHours}
        />
      </ConfigSection>

      <ConfigSection title="Exit nodes">
        <ConfigRow
          label="Allow advertise"
          setting={config.exitNodesAllowAdvertise}
        />
        <ConfigRow label="Allow use" setting={config.exitNodesAllowUse} />
      </ConfigSection>

      <ConfigSection title="Posture">
        <ConfigRow
          label="Collector interval (seconds)"
          setting={config.postureIntervalSecs}
        />
        <ConfigRow
          label="Enabled collectors"
          setting={config.postureEnabledCollectors}
        />
      </ConfigSection>

      <ConfigSection title="DNS">
        <ConfigRow label="DNS suffix" setting={config.dnsSuffix} />
        <ConfigRow label="DNS upstream" setting={config.dnsUpstream} />
      </ConfigSection>

      <ConfigSection title="Local only">
        <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
          These settings come from the agent&apos;s local{" "}
          <span className="font-mono">tunnet.toml</span> and are not controlled
          by org policy.
        </p>
        <LocalRow label="Logging level" value={config.local.loggingLevel} />
        <LocalRow label="Logging format" value={config.local.loggingFormat} />
        <LocalRow label="Control URL" value={config.local.controlUrl} />
        <LocalRow label="Listen port" value={config.local.listenPort} />
      </ConfigSection>
    </div>
  );
}

export function MachineConfigTab({
  orgId,
  endpointId,
}: {
  orgId: string;
  endpointId: string;
}) {
  const { data, isPending, isError, error } = useDeviceEffectiveConfig(
    orgId,
    endpointId,
  );
  const { data: networks } = useNetworks(orgId);
  const networkName =
    data?.networkId && networks
      ? networks.find((n) => n.id === data.networkId)?.name
      : undefined;

  if (isPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Failed to load config"
        description={
          error instanceof Error
            ? error.message
            : "Could not load effective config"
        }
      />
    );
  }

  if (!data?.config) {
    return (
      <EmptyState
        title="No config reported"
        description="Waiting for agent to report effective config"
      />
    );
  }

  return (
    <div className="space-y-4">
      {data.networkId ? (
        <p className="text-muted-foreground text-sm">
          Remote policy from network{" "}
          <span className="text-foreground font-medium">
            {networkName ?? data.networkId}
          </span>
        </p>
      ) : null}
      {data.reportedAt ? (
        <p className="text-muted-foreground text-sm">
          Last reported{" "}
          {formatDistanceToNow(new Date(data.reportedAt), { addSuffix: true })}
        </p>
      ) : null}
      <EffectiveConfigView config={data.config} />
    </div>
  );
}
